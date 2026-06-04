import type { WordOutlineV1 } from '../types'
import {
  PDF_SPEC_JSON_END,
  PDF_SPEC_JSON_START,
} from '../constants/documentExportIntent'
import {
  parseWordOutlineFromAssistantContent,
  parseWordOutlineV1,
  tryParseWordOutlineJson,
} from '../utils/wordOutline'

/** PDF-Gliederung v1 — gleiches Block-Schema wie Word (`heading`, `paragraph`, `table`). */
export type PdfOutlineV1 = WordOutlineV1

export { PDF_SPEC_JSON_END, PDF_SPEC_JSON_START }

export function parsePdfOutlineV1(raw: unknown): PdfOutlineV1 | null {
  return parseWordOutlineV1(raw)
}

export function stripPdfSpecBlock(content: string): string {
  const start = PDF_SPEC_JSON_START
  const end = PDF_SPEC_JSON_END
  const i = content.indexOf(start)
  const j = content.indexOf(end)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  return `${content.slice(0, i).trimEnd()}\n\n${content.slice(j + end.length).trimStart()}`.trim()
}

export function parsePdfOutlineFromContent(content: string): PdfOutlineV1 | null {
  const marked = stripPdfSpecBlock(content)
  const start = PDF_SPEC_JSON_START
  const end = PDF_SPEC_JSON_END
  const i = content.indexOf(start)
  const j = content.indexOf(end)
  if (i !== -1 && j !== -1 && j > i) {
    const inner = content.slice(i + start.length, j).trim()
    const parsed = tryParseWordOutlineJson(inner)
    if (parsed) {
      return parsed
    }
  }
  return parseWordOutlineFromAssistantContent(marked)
}

export function sanitizePdfFileName(raw: string | undefined): string {
  const base = (raw?.trim() || 'dokument').replace(/[^\wäöüÄÖÜß\- ]+/gi, '').trim() || 'dokument'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}
