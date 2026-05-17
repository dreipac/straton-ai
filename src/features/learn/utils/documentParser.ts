import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_EXCERPT_LENGTH = 2500

/** Ergebnis von `file.text()` auf einer PDF — kein lesbarer Dokumenttext. */
function looksLikeRawPdfPayload(text: string): boolean {
  const head = text.trimStart().slice(0, 512)
  if (head.startsWith('%PDF-')) {
    return true
  }
  if (/\/Type\s*\/Catalog|\/FlateDecode|endobj|stream\r?\n/i.test(head)) {
    return true
  }
  const sample = head.slice(0, 2000)
  let nonPrintable = 0
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i)
    if (c < 9 || (c > 13 && c < 32)) {
      nonPrintable += 1
    }
  }
  return sample.length > 80 && nonPrintable / sample.length > 0.12
}

/** Raster-Bilder: OCR (kein SVG — das ist Vektor/Markup) */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'])

function normalizeExtractedText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_LENGTH)
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === filename.length - 1) {
    return ''
  }
  return filename.slice(dotIndex + 1).toLowerCase()
}

async function parsePdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const pages: string[] = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const chunks = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter((entry): entry is string => Boolean(entry))
    pages.push(chunks.join(' '))
  }
  const joined = pages.join('\n').trim()
  if (!joined || looksLikeRawPdfPayload(joined)) {
    return ''
  }
  return joined
}

async function parseDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value ?? ''
}

async function parseSpreadsheet(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      return ''
    }
    const asCsv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    return `Sheet: ${sheetName}\n${asCsv}`
  })
  return sheets.join('\n\n')
}

function isRasterImageFile(file: File, ext: string): boolean {
  if (ext === 'svg') {
    return false
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return true
  }
  const t = file.type
  if (t.startsWith('image/') && t !== 'image/svg+xml') {
    return true
  }
  return false
}

/** Chat: gleiche Heuristik wie Lernmaterial — für Vision (`BildData`) statt nur OCR-`Datei`. */
export function isChatVisionImageFile(file: File): boolean {
  return isRasterImageFile(file, getExtension(file.name))
}

/** OCR im Browser (Tesseract.js), Deutsch + Englisch — wird nur bei Bild-Uploads dynamisch importiert. */
async function parseImageWithOcr(file: File): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['deu', 'eng'], 1, {})
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    return typeof text === 'string' ? text : ''
  } finally {
    await worker.terminate()
  }
}

export async function extractLearningMaterialText(file: File): Promise<string> {
  const ext = getExtension(file.name)
  try {
    if (ext === 'pdf') {
      return normalizeExtractedText(await parsePdf(file))
    }
    if (ext === 'docx') {
      return normalizeExtractedText(await parseDocx(file))
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      return normalizeExtractedText(await parseSpreadsheet(file))
    }
    if (isRasterImageFile(file, ext)) {
      return normalizeExtractedText(await parseImageWithOcr(file))
    }
    return normalizeExtractedText(await file.text())
  } catch {
    if (isRasterImageFile(file, ext) || ext === 'pdf') {
      return ''
    }
    const fallback = await file.text().catch(() => '')
    if (looksLikeRawPdfPayload(fallback)) {
      return ''
    }
    return normalizeExtractedText(fallback)
  }
}
