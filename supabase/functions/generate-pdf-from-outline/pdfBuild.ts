import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

export type PdfBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; rows: string[][]; header?: boolean }

export type PdfOutlineV1 = {
  version: 1
  fileName?: string
  title?: string
  blocks: PdfBlock[]
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 50
const MARGIN_BOTTOM = 56
const MARGIN_TOP = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const HEADING_SIZES: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 22,
  2: 18,
  3: 16,
  4: 14,
  5: 12,
  6: 11,
}

const BODY_SIZE = 11
const LINE_GAP = 4
const BLOCK_GAP = 10
const TABLE_CELL_PAD = 4
const TABLE_FONT_SIZE = 10

type LayoutCtx = {
  doc: PDFDocument
  page: PDFPage
  y: number
  fontRegular: PDFFont
  fontBold: PDFFont
}

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['']
  const words = normalized.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function ensureSpace(ctx: LayoutCtx, needed: number): LayoutCtx {
  if (ctx.y - needed >= MARGIN_BOTTOM) return ctx
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { ...ctx, page, y: PAGE_HEIGHT - MARGIN_TOP }
}

function drawLines(
  ctx: LayoutCtx,
  lines: string[],
  size: number,
  font: PDFFont,
  color = rgb(0.08, 0.1, 0.14),
  lineHeight = size * 1.35,
): LayoutCtx {
  let next = ctx
  for (const line of lines) {
    next = ensureSpace(next, lineHeight + LINE_GAP)
    next.page.drawText(line, { x: MARGIN_X, y: next.y - size, size, font, color })
    next = { ...next, y: next.y - lineHeight - LINE_GAP }
  }
  return { ...next, y: next.y - BLOCK_GAP }
}

function drawTable(ctx: LayoutCtx, rows: string[][], header: boolean): LayoutCtx {
  if (rows.length === 0) return ctx
  const colCount = Math.max(...rows.map((r) => r.length))
  const colWidth = CONTENT_WIDTH / colCount
  let next = ctx
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx]
    const isHeaderRow = header && rowIdx === 0
    const cellLines = row.map((cell) =>
      wrapText(cell, colWidth - TABLE_CELL_PAD * 2, next.fontRegular, TABLE_FONT_SIZE),
    )
    const rowLineCount = Math.max(1, ...cellLines.map((l) => l.length))
    const rowHeight = rowLineCount * (TABLE_FONT_SIZE * 1.25) + TABLE_CELL_PAD * 2
    next = ensureSpace(next, rowHeight + 4)
    for (let col = 0; col < colCount; col += 1) {
      const x = MARGIN_X + col * colWidth
      const yTop = next.y
      next.page.drawRectangle({
        x,
        y: yTop - rowHeight,
        width: colWidth,
        height: rowHeight,
        borderColor: rgb(0.75, 0.78, 0.84),
        borderWidth: 0.6,
        color: isHeaderRow ? rgb(0.94, 0.96, 0.98) : undefined,
      })
      const lines = cellLines[col] ?? ['']
      let textY = yTop - TABLE_CELL_PAD - TABLE_FONT_SIZE
      for (const line of lines) {
        next.page.drawText(line, {
          x: x + TABLE_CELL_PAD,
          y: textY,
          size: TABLE_FONT_SIZE,
          font: isHeaderRow ? next.fontBold : next.fontRegular,
          color: rgb(0.1, 0.12, 0.16),
        })
        textY -= TABLE_FONT_SIZE * 1.25
      }
    }
    next = { ...next, y: next.y - rowHeight - 4 }
  }
  return { ...next, y: next.y - BLOCK_GAP }
}

export async function buildPdfFromOutline(outline: PdfOutlineV1): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(outline.title?.trim() || outline.fileName || 'Dokument')
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let ctx: LayoutCtx = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
    fontRegular,
    fontBold,
  }
  if (outline.title?.trim()) {
    ctx = drawLines(ctx, wrapText(outline.title.trim(), CONTENT_WIDTH, fontBold, 20), 20, fontBold)
  }
  for (const block of outline.blocks) {
    if (block.type === 'heading') {
      const size = HEADING_SIZES[block.level]
      ctx = drawLines(ctx, wrapText(block.text, CONTENT_WIDTH, fontBold, size), size, fontBold)
    } else if (block.type === 'paragraph') {
      ctx = drawLines(
        ctx,
        wrapText(block.text, CONTENT_WIDTH, fontRegular, BODY_SIZE),
        BODY_SIZE,
        fontRegular,
        rgb(0.12, 0.14, 0.18),
      )
    } else if (block.type === 'table') {
      ctx = drawTable(ctx, block.rows, block.header === true)
    }
  }
  return doc.save()
}

export function sanitizePdfFileName(raw: string | undefined): string {
  const base = (raw?.trim() || 'dokument').replace(/[^\wäöüÄÖÜß\- ]+/gi, '').trim() || 'dokument'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}
