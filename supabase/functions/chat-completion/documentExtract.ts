import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { geminiReconcilePdfText } from './geminiClient.ts'

export type DocumentExtractionMethod =
  | 'text_layer'
  | 'ocr'
  | 'hybrid'
  | 'docx'
  | 'xlsx'
  | 'plain'

export type ExtractedDocument = {
  fileName: string
  mimeType: string
  charCount: number
  text: string
  extractionMethod: DocumentExtractionMethod
  pageCount?: number
  warnings?: string[]
}

const MAX_OUTPUT_CHARS = 200_000
const PDF_OCR_RECONCILE_MIN_PAGES = 1
const PDF_SPARSE_CHARS_PER_PAGE = 80
const PDF_RECONCILE_MAX_BYTES = 8 * 1024 * 1024

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) {
    return ''
  }
  return fileName.slice(dot + 1).toLowerCase()
}

function looksLikeRawPdfPayload(text: string): boolean {
  const head = text.trimStart().slice(0, 512)
  if (head.startsWith('%PDF-')) {
    return true
  }
  return /\/Type\s*\/Catalog|endobj/i.test(head)
}

function clampDocumentText(raw: string): string {
  const normalized = raw
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (normalized.length <= MAX_OUTPUT_CHARS) {
    return normalized
  }
  return `${normalized.slice(0, MAX_OUTPUT_CHARS)}\n\n[… Dokument gekürzt …]`
}

function htmlToStructuredPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function mergePageTexts(textLayerPages: string[], ocrSupplement: string): string {
  const layerJoined = textLayerPages
    .map((p, i) => {
      const t = p.trim()
      return t ? `[Seite ${i + 1}]\n${t}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  const ocr = ocrSupplement.trim()
  if (!ocr) {
    return layerJoined.trim()
  }
  if (!layerJoined) {
    return ocr
  }
  return `${layerJoined}\n\n[OCR-Ergänzung]\n${ocr}`.trim()
}

async function extractPdf(bytes: Uint8Array, fileName: string): Promise<ExtractedDocument> {
  const warnings: string[] = []
  if (bytes.byteLength > PDF_RECONCILE_MAX_BYTES) {
    warnings.push('PDF sehr gross — OCR-Abgleich eventuell ausgelassen.')
  }

  const pdf = await getDocumentProxy(bytes)
  const pageCount = pdf.numPages ?? 0
  const { text: pageTexts } = await extractText(pdf, { mergePages: false })
  const pages = Array.isArray(pageTexts)
    ? pageTexts.map((p) => (typeof p === 'string' ? p : String(p ?? '')))
    : [typeof pageTexts === 'string' ? pageTexts : '']

  const layerJoined = pages.join('\n').trim()
  let method: DocumentExtractionMethod = 'text_layer'
  let supplement = ''

  const charsPerPage =
    pageCount > 0 ? layerJoined.replace(/\s+/g, '').length / pageCount : layerJoined.length
  const needsReconcile =
    pageCount >= PDF_OCR_RECONCILE_MIN_PAGES &&
    (charsPerPage < PDF_SPARSE_CHARS_PER_PAGE || !layerJoined || looksLikeRawPdfPayload(layerJoined))

  if (needsReconcile && bytes.byteLength <= PDF_RECONCILE_MAX_BYTES) {
    try {
      supplement = await geminiReconcilePdfText(bytes, layerJoined || '(leer)')
      if (supplement) {
        method = layerJoined ? 'hybrid' : 'ocr'
      }
    } catch (err) {
      warnings.push(
        `OCR-Abgleich fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const merged = mergePageTexts(pages, supplement)
  const text = clampDocumentText(merged)
  if (!text) {
    warnings.push('Kein lesbarer Text im PDF gefunden.')
  }

  return {
    fileName,
    mimeType: 'application/pdf',
    charCount: text.length,
    text,
    extractionMethod: method,
    pageCount: pageCount || undefined,
    ...(warnings.length ? { warnings } : {}),
  }
}

/** Node/Deno mammoth (`lib/unzip.js`) akzeptiert `buffer`, nicht `arrayBuffer` (nur Browser-Build). */
function mammothInputFromBytes(bytes: Uint8Array): { buffer: ArrayBuffer } {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return { buffer: bytes.buffer as ArrayBuffer }
  }
  return {
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

async function extractDocx(bytes: Uint8Array, fileName: string): Promise<ExtractedDocument> {
  const mammothInput = mammothInputFromBytes(bytes)
  const result = await mammoth.extractRawText(mammothInput)
  let raw = (result.value ?? '').trim()
  if (!raw) {
    const htmlResult = await mammoth.convertToHtml(mammothInput)
    raw = htmlToStructuredPlain(htmlResult.value ?? '').trim()
  }
  const text = clampDocumentText(raw)
  return {
    fileName,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    charCount: text.length,
    text,
    extractionMethod: 'docx',
    ...(!text ? { warnings: ['Kein lesbarer Text in der Word-Datei.'] } : {}),
  }
}

async function extractSpreadsheet(bytes: Uint8Array, fileName: string): Promise<ExtractedDocument> {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      return ''
    }
    const asCsv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    return `Sheet: ${sheetName}\n${asCsv}`
  })
  const text = clampDocumentText(sheets.filter(Boolean).join('\n\n'))
  return {
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    charCount: text.length,
    text,
    extractionMethod: 'xlsx',
    ...(!text ? { warnings: ['Keine Tabellendaten gefunden.'] } : {}),
  }
}

async function extractPlain(bytes: Uint8Array, fileName: string, mimeType: string): Promise<ExtractedDocument> {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const text = looksLikeRawPdfPayload(decoded) ? '' : clampDocumentText(decoded)
  return {
    fileName,
    mimeType: mimeType || 'text/plain',
    charCount: text.length,
    text,
    extractionMethod: 'plain',
    ...(!text ? { warnings: ['Kein lesbarer Text.'] } : {}),
  }
}

export async function extractDocumentFromBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<ExtractedDocument> {
  const ext = getExtension(fileName)
  const mime = (mimeType ?? '').toLowerCase()

  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPdf(bytes, fileName)
  }
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(bytes, fileName)
  }
  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'csv' ||
    mime.includes('spreadsheet') ||
    mime === 'text/csv'
  ) {
    return extractSpreadsheet(bytes, fileName)
  }

  return extractPlain(bytes, fileName, mimeType)
}

export function buildDateiBlock(fileName: string, text: string): string {
  const body = text.trim()
  if (!body) {
    return `[Datei: ${fileName}] (Kein auslesbarer Text gefunden)\n[/Datei]`
  }
  return `[Datei: ${fileName}]\n${body}\n[/Datei]`
}
