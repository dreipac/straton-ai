import mammoth from 'mammoth'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as XLSX from 'xlsx'

const MAX_EXCERPT_LENGTH = 2500

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
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    const chunks = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter((entry): entry is string => Boolean(entry))
    pages.push(chunks.join(' '))
  }
  return pages.join('\n')
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
    return normalizeExtractedText(await file.text())
  } catch {
    return normalizeExtractedText(await file.text().catch(() => ''))
  }
}
