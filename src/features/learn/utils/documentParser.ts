import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_EXCERPT_LENGTH = 2500
/** OCR-Fallback: max. Seiten (Performance im Browser). */
const PDF_OCR_MAX_PAGES = 12
const PDF_OCR_RENDER_SCALE = 2

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
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
])

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

function isPdfFile(file: File, ext: string): boolean {
  return ext === 'pdf' || file.type === 'application/pdf'
}

function isDocxFile(file: File, ext: string): boolean {
  return (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

async function loadPdfFromFile(file: File): Promise<PDFDocumentProxy> {
  const buffer = await file.arrayBuffer()
  return getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
}

async function extractPdfTextLayer(pdf: PDFDocumentProxy): Promise<string> {
  const pages: string[] = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const chunks = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter((entry): entry is string => Boolean(entry))
    pages.push(chunks.join(' '))
  }
  return pages.join('\n').trim()
}

async function ocrPdfPages(pdf: PDFDocumentProxy): Promise<string> {
  if (typeof document === 'undefined') {
    return ''
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['deu', 'eng'], 1, {})
  const pageTexts: string[] = []
  const maxPages = Math.min(pdf.numPages, PDF_OCR_MAX_PAGES)

  try {
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo)
      const viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        continue
      }
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvasContext: context, viewport, canvas }).promise

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      })
      if (!blob) {
        continue
      }

      const {
        data: { text },
      } = await worker.recognize(blob)
      const trimmed = typeof text === 'string' ? text.trim() : ''
      if (trimmed) {
        pageTexts.push(trimmed)
      }
    }
  } finally {
    await worker.terminate()
  }

  const joined = pageTexts.join('\n\n').trim()
  if (!joined || looksLikeRawPdfPayload(joined)) {
    return ''
  }
  return joined
}

async function parsePdf(file: File): Promise<string> {
  const pdf = await loadPdfFromFile(file)
  const textLayer = await extractPdfTextLayer(pdf)
  if (textLayer && !looksLikeRawPdfPayload(textLayer)) {
    return textLayer
  }
  return ocrPdfPages(pdf)
}

async function parseDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  const raw = (result.value ?? '').trim()
  if (raw) {
    return raw
  }
  /** Leerer Fliesstext: manche DOCX liefern nur über HTML-Extraktion Text. */
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const plain = (htmlResult.value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain
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
    if (isPdfFile(file, ext)) {
      return normalizeExtractedText(await parsePdf(file))
    }
    if (isDocxFile(file, ext)) {
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
    if (isRasterImageFile(file, ext)) {
      return ''
    }
    if (isPdfFile(file, ext)) {
      try {
        const pdf = await loadPdfFromFile(file)
        return normalizeExtractedText(await ocrPdfPages(pdf))
      } catch {
        return ''
      }
    }
    if (isDocxFile(file, ext)) {
      try {
        return normalizeExtractedText(await parseDocx(file))
      } catch {
        return ''
      }
    }
    const fallback = await file.text().catch(() => '')
    if (looksLikeRawPdfPayload(fallback)) {
      return ''
    }
    return normalizeExtractedText(fallback)
  }
}
