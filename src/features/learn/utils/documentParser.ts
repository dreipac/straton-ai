import mammoth from 'mammoth'
import {
  getDocument,
  GlobalWorkerOptions,
  OPS,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Max. gespeicherter Text pro Lernmaterial (Upload + Persistenz).
 *  Hoch genug, dass die Map-Reduce-Ingestion ein ganzes Dokument abdeckt (kein früher Verlust). */
export const LEARN_MATERIAL_EXCERPT_MAX_CHARS = 80_000

const MAX_EXCERPT_LENGTH = LEARN_MATERIAL_EXCERPT_MAX_CHARS
/** OCR-Fallback: max. Seiten (Performance im Browser). Hoch genug, dass auch längere Scans vollständig
 *  erfasst werden — Seiten jenseits davon würden sonst spurlos fehlen. */
const PDF_OCR_MAX_PAGES = 30
const PDF_OCR_RENDER_SCALE = 2
/** Wie Chat documentExtract: dünn befüllter Textlayer → OCR auslösen. */
const PDF_SPARSE_CHARS_PER_PAGE = 80

/**
 * Wie viele Seiten mit BILDINHALT zusätzlich durch die Texterkennung gehen.
 *
 * Getrennt von `PDF_OCR_MAX_PAGES`, weil es ein anderer Fall ist: dort geht es um ein Dokument
 * ohne brauchbaren Textlayer (ein Scan), hier um einzelne Seiten eines sonst lesbaren Dokuments.
 * Die Grenze schützt die Wartezeit beim Hochladen — jede Seite kostet ein bis drei Sekunden.
 */
const PDF_IMAGE_OCR_MAX_PAGES = 20

/**
 * Zeichenoperationen, die ein Rasterbild auf die Seite bringen.
 *
 * Vektorgrafik (Linien, Rahmen, Tabellenraster) steht bewusst nicht dabei: sie trägt keinen Text
 * und würde jede zweite Seite unnötig durch die Texterkennung schicken.
 */
const IMAGE_PAINT_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectRepeat,
])

/** Kürzer als das ist kein Satz, sondern Erkennungsrauschen (Seitenzahlen, Striche, Artefakte). */
const OCR_MIN_LINE_CHARS = 12

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
  const normalized = raw
    .split('\u0000').join('')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (normalized.length <= MAX_EXCERPT_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, MAX_EXCERPT_LENGTH)}\n\n[… Auszug gekürzt …]`
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

/**
 * Den Textlayer SEITENWEISE holen.
 *
 * Seitenweise statt am Stück, weil die Entscheidung „braucht diese Seite Texterkennung?" pro Seite
 * fällt und nicht fürs ganze Dokument. Ein Arbeitsheft hat beides nebeneinander: Seiten mit
 * sauberem Textlayer und Seiten, deren eigentlicher Inhalt ein eingescanntes Bild ist.
 */
async function extractPdfTextLayerPages(pdf: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const chunks = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter((entry): entry is string => Boolean(entry))
    pages.push(chunks.join(' '))
  }
  return pages
}

/** Trägt diese Seite ein Rasterbild? */
async function pageHasRasterImage(page: PDFPageProxy): Promise<boolean> {
  try {
    const operatorList = await page.getOperatorList()
    return operatorList.fnArray.some((fn: number) => IMAGE_PAINT_OPS.has(fn))
  } catch {
    // Kann die Operatorliste nicht gelesen werden, gilt die Seite als bildfrei: lieber kein
    // zusätzlicher Erkennungslauf als ein Absturz beim Hochladen.
    return false
  }
}

/**
 * Texterkennung auf bestimmten Seiten.
 *
 * Gibt eine Zuordnung Seitennummer -> erkannter Text zurueck statt eines zusammengefuegten
 * Textes: der Aufrufer muss das Ergebnis seitenweise mit dem Textlayer verrechnen koennen.
 */
async function ocrPdfPages(pdf: PDFDocumentProxy, pageNumbers: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (typeof document === 'undefined' || pageNumbers.length === 0) {
    return result
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['deu', 'eng'], 1, {})

  try {
    for (const pageNo of pageNumbers) {
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
      if (trimmed && !looksLikeRawPdfPayload(trimmed)) {
        result.set(pageNo, trimmed)
      }
    }
  } finally {
    await worker.terminate()
  }

  return result
}

/** Vergleichsform fuer den Abgleich zwischen Textlayer und Erkennung: nur Buchstaben und Ziffern. */
function comparableForm(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Aus dem Erkennungsergebnis einer Seite das behalten, was im Textlayer NICHT vorkommt.
 *
 * Der Grund: Auf einer Seite mit Text und Bild erkennt die Texterkennung beides — den bereits
 * vorhandenen Text noch einmal und zusaetzlich den Bildinhalt. Wuerde man alles anhaengen, stuende
 * der halbe Auszug doppelt da; die Materialsuche zaehlt Begriffe, und Verdopplung verschiebt jede
 * Gewichtung. Verglichen wird auf Buchstaben und Ziffern reduziert, weil die Erkennung bei
 * Satzzeichen und Umbruechen zuverlaessig abweicht, ohne dass der Inhalt ein anderer waere.
 */
export function ocrLinesBeyondTextLayer(ocrText: string, textLayer: string): string {
  const haystack = comparableForm(textLayer)
  const kept: string[] = []
  for (const rawLine of ocrText.split('\n')) {
    const line = rawLine.trim()
    if (line.length < OCR_MIN_LINE_CHARS) {
      continue
    }
    const needle = comparableForm(line)
    if (needle.length < OCR_MIN_LINE_CHARS || haystack.includes(needle)) {
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

/**
 * Welche Seiten muessen durch die Texterkennung?
 *
 * Zwei verschiedene Gruende, die frueher zu einem verschmolzen waren:
 *
 *  1. Die Seite hat kaum Textlayer — ein Scan. Ohne Erkennung ist sie leer.
 *  2. Die Seite hat einen brauchbaren Textlayer UND ein Rasterbild. Der Text kommt an, der
 *     Bildinhalt nicht.
 *
 * Der zweite Fall war nicht abgedeckt, weil die Schwelle ueber das GANZE Dokument gemittelt wurde:
 * ein Arbeitsheft mit rund 900 Zeichen Aufgabentext je Seite liegt weit ueber der Schwelle von 80
 * und loeste nie eine Erkennung aus — obwohl der eigentliche Lehrstoff darin als eingescannter
 * Text im Bild steckte (Gesetzesauszuege, Tabellen, abfotografierte Buchseiten). Fuer das Gehirn
 * existierte dieser Stoff schlicht nicht, und der Generator bekam nur die Arbeitsauftraege
 * ringsherum zu sehen.
 */
async function pagesNeedingOcr(
  pdf: PDFDocumentProxy,
  textLayerPages: string[],
): Promise<{ sparse: number[]; withImages: number[] }> {
  const sparse: number[] = []
  const withImages: number[] = []

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const pageText = textLayerPages[pageNo - 1] ?? ''
    const compact = pageText.replace(/\s+/g, '').length
    if (compact < PDF_SPARSE_CHARS_PER_PAGE) {
      sparse.push(pageNo)
      continue
    }
    if (withImages.length >= PDF_IMAGE_OCR_MAX_PAGES) {
      continue
    }
    const page = await pdf.getPage(pageNo)
    if (await pageHasRasterImage(page)) {
      withImages.push(pageNo)
    }
  }

  return { sparse: sparse.slice(0, PDF_OCR_MAX_PAGES), withImages }
}

async function parsePdf(file: File): Promise<string> {
  const pdf = await loadPdfFromFile(file)
  const textLayerPages = await extractPdfTextLayerPages(pdf)
  const textLayer = textLayerPages.join('\n\n').trim()
  const layerUsable = Boolean(textLayer) && !looksLikeRawPdfPayload(textLayer)

  if (!layerUsable) {
    // Kein brauchbarer Textlayer im ganzen Dokument: der klassische Scan-Fall.
    const allPages = Array.from({ length: Math.min(pdf.numPages, PDF_OCR_MAX_PAGES) }, (_, i) => i + 1)
    const recognised = await ocrPdfPages(pdf, allPages)
    return [...recognised.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, text]) => text)
      .join('\n\n')
      .trim()
  }

  const { sparse, withImages } = await pagesNeedingOcr(pdf, textLayerPages)
  const targets = [...new Set([...sparse, ...withImages])].sort((a, b) => a - b)
  if (targets.length === 0) {
    return textLayer
  }

  const recognised = await ocrPdfPages(pdf, targets)
  if (recognised.size === 0) {
    return textLayer
  }

  /*
   * Seitenweise zusammensetzen statt einen Erkennungsblock anzuhaengen.
   *
   * Die Reihenfolge im Auszug ist die Reihenfolge im Dokument, und das ist keine Formsache: die
   * Materialsuche schneidet den Text in ueberlappende Fenster. Stuende der Bildinhalt gesammelt am
   * Ende, laege er im Fenster neben fremden Seiten statt neben seiner eigenen Aufgabe — und der
   * Kontrolleur bekaeme Bildinhalt und Frage nie gemeinsam zu sehen.
   */
  const merged: string[] = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const layerText = (textLayerPages[pageNo - 1] ?? '').trim()
    const ocrText = recognised.get(pageNo) ?? ''
    if (!ocrText) {
      if (layerText) {
        merged.push(layerText)
      }
      continue
    }
    if (!layerText) {
      merged.push(ocrText)
      continue
    }
    const extra = ocrLinesBeyondTextLayer(ocrText, layerText)
    merged.push(extra ? `${layerText}\n\n[Bildinhalt Seite ${pageNo}]\n${extra}` : layerText)
  }

  return merged.join('\n\n').trim()
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
    .replace(/<\/(?:p|div|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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
        return normalizeExtractedText(await parsePdf(file))
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
