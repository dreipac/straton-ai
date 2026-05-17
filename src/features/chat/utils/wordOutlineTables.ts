import type { WordOutlineV1 } from '../types'

export type WordOutlineTableBlock = Extract<WordOutlineV1['blocks'][number], { type: 'table' }>

function parsePipeTableRow(line: string): string[] | null {
  const t = line.trim()
  if (!t.startsWith('|')) {
    return null
  }
  const parts = t.split('|')
  if (parts.length < 3) {
    return null
  }
  const cells = parts.slice(1, -1).map((c) => c.trim())
  return cells.length ? cells : null
}

function isTableSeparatorLine(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|') || !t.includes('-')) {
    return false
  }
  const parts = t.split('|')
  if (parts.length < 3) {
    return false
  }
  const cells = parts
    .slice(1, -1)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
  if (cells.length === 0) {
    return false
  }
  return cells.every((c) => /^:?-{3,}:?$/.test(c))
}

function tryParseMarkdownTableLines(
  lines: string[],
  start: number,
): { rows: string[][]; end: number } | null {
  if (start + 1 >= lines.length) {
    return null
  }
  const header = parsePipeTableRow(lines[start] ?? '')
  if (!header || !isTableSeparatorLine(lines[start + 1] ?? '')) {
    return null
  }
  const colCount = header.length
  const rows: string[][] = [header]
  let i = start + 2
  while (i < lines.length) {
    const row = parsePipeTableRow(lines[i] ?? '')
    if (!row) {
      break
    }
    const normalized = row.slice(0, colCount)
    while (normalized.length < colCount) {
      normalized.push('')
    }
    rows.push(normalized)
    i += 1
  }
  if (rows.length < 2) {
    return null
  }
  return { rows, end: i }
}

export function parseWordOutlineTableBlock(raw: unknown): WordOutlineTableBlock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const o = raw as Record<string, unknown>
  if (o.type !== 'table') {
    return null
  }
  if (!Array.isArray(o.rows) || o.rows.length === 0) {
    return null
  }
  const rows: string[][] = []
  for (const row of o.rows) {
    if (!Array.isArray(row) || row.length === 0) {
      return null
    }
    const cells = row.map((c) => (typeof c === 'string' ? c : String(c ?? '')))
    rows.push(cells)
  }
  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = r.slice(0, colCount)
    while (copy.length < colCount) {
      copy.push('')
    }
    return copy
  })
  return {
    type: 'table',
    header: o.header === true,
    rows: normalized,
  }
}

/** Markdown-Pipe-Tabellen in `paragraph`-Blöcken in eigene `table`-Blöcke aufteilen. */
export function expandWordOutlineTables(blocks: WordOutlineV1['blocks']): WordOutlineV1['blocks'] {
  const out: WordOutlineV1['blocks'] = []
  for (const block of blocks) {
    if (block.type !== 'paragraph') {
      out.push(block)
      continue
    }
    const lines = block.text.split('\n')
    let lineIndex = 0
    let textBuf: string[] = []
    const flushText = () => {
      const t = textBuf.join('\n').trim()
      textBuf = []
      if (t) {
        out.push({ type: 'paragraph', text: t })
      }
    }
    while (lineIndex < lines.length) {
      const tableTry = tryParseMarkdownTableLines(lines, lineIndex)
      if (tableTry) {
        flushText()
        out.push({ type: 'table', header: true, rows: tableTry.rows })
        lineIndex = tableTry.end
        continue
      }
      const line = lines[lineIndex] ?? ''
      if (line.trim()) {
        textBuf.push(line)
      } else if (textBuf.length > 0) {
        textBuf.push('')
      }
      lineIndex += 1
    }
    flushText()
  }
  return out
}
