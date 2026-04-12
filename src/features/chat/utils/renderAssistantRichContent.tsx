import type { ReactNode } from 'react'
import { renderAssistantInline } from './markdownInline'

type Block =
  | { type: 'hr' }
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  /** Markdown-Zeilen mit > — für Bibelverse (siehe System-Prompt) */
  | { type: 'blockquote'; lines: string[] }
  /** GFM-Pipe-Tabelle: erste Zeile = Kopfzeile, weitere = Daten */
  | { type: 'table'; rows: string[][] }

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

function normalizeTableRow(cells: string[], colCount: number): string[] {
  const out = cells.slice(0, colCount)
  while (out.length < colCount) {
    out.push('')
  }
  return out
}

function tryParseMarkdownTable(
  lines: string[],
  start: number,
): { rows: string[][]; end: number } | null {
  if (start + 1 >= lines.length) {
    return null
  }
  const headerLine = lines[start].trimEnd()
  const sepLine = lines[start + 1].trimEnd()
  const header = parsePipeTableRow(headerLine)
  if (!header || header.length === 0) {
    return null
  }
  if (!isTableSeparatorLine(sepLine)) {
    return null
  }

  const colCount = header.length
  const rows: string[][] = [normalizeTableRow(header, colCount)]
  let i = start + 2
  while (i < lines.length) {
    const raw = lines[i].trimEnd()
    if (raw.trim() === '') {
      break
    }
    const row = parsePipeTableRow(raw)
    if (!row) {
      break
    }
    rows.push(normalizeTableRow(row, colCount))
    i++
  }

  return { rows, end: i }
}

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const para: string[] = []
  let listItems: string[] | null = null
  let orderedItems: string[] | null = null
  let quoteLines: string[] | null = null

  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join('\n') })
      para.length = 0
    }
  }

  function flushList() {
    if (listItems && listItems.length) {
      blocks.push({ type: 'ul', items: [...listItems] })
      listItems = null
    }
    if (orderedItems && orderedItems.length) {
      blocks.push({ type: 'ol', items: [...orderedItems] })
      orderedItems = null
    }
  }

  function flushQuote() {
    if (quoteLines && quoteLines.length) {
      blocks.push({ type: 'blockquote', lines: [...quoteLines] })
      quoteLines = null
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const t = line.trimEnd()
    const trimmed = t.trim()

    const tableTry = tryParseMarkdownTable(lines, lineIndex)
    if (tableTry) {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'table', rows: tableTry.rows })
      lineIndex = tableTry.end - 1
      continue
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'hr' })
      continue
    }

    const bq = trimmed.match(/^>\s*(.*)$/)
    if (bq) {
      flushList()
      flushPara()
      if (!quoteLines) {
        quoteLines = []
      }
      quoteLines.push(bq[1])
      continue
    }

    if (trimmed === '') {
      flushQuote()
      flushList()
      flushPara()
      continue
    }

    if (trimmed.startsWith('###')) {
      const m = trimmed.match(/^###\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h3', text: m[1] })
        continue
      }
    }

    if (trimmed.startsWith('##') && !trimmed.startsWith('###')) {
      const m = trimmed.match(/^##\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h2', text: m[1] })
        continue
      }
    }

    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      const m = trimmed.match(/^#\s+(.*)$/)
      if (m) {
        flushQuote()
        flushList()
        flushPara()
        blocks.push({ type: 'h1', text: m[1] })
        continue
      }
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/)
    if (ul) {
      flushQuote()
      flushPara()
      if (orderedItems?.length) {
        flushList()
      }
      if (!listItems) {
        listItems = []
      }
      listItems.push(ul[1])
      continue
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/)
    if (ol) {
      flushQuote()
      flushPara()
      if (listItems?.length) {
        flushList()
      }
      if (!orderedItems) {
        orderedItems = []
      }
      orderedItems.push(ol[1])
      continue
    }

    flushQuote()
    flushList()
    para.push(t)
  }

  flushQuote()
  flushList()
  flushPara()
  return blocks
}

function renderBlock(block: Block, i: number): ReactNode {
  const key = `blk-${i}`
  switch (block.type) {
    case 'hr':
      return <hr key={key} className="chat-md-hr" />
    case 'h1':
      return (
        <h2 key={key} className="chat-md-h chat-md-h1">
          {renderAssistantInline(block.text)}
        </h2>
      )
    case 'h2':
      return (
        <h3 key={key} className="chat-md-h chat-md-h2">
          {renderAssistantInline(block.text)}
        </h3>
      )
    case 'h3':
      return (
        <h4 key={key} className="chat-md-h chat-md-h3">
          {renderAssistantInline(block.text)}
        </h4>
      )
    case 'p':
      return (
        <p key={key} className="chat-md-p">
          {renderAssistantInline(block.text)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} className="chat-md-ul">
          {block.items.map((item, j) => (
            <li key={`${key}-li-${j}`} className="chat-md-li">
              {renderAssistantInline(item)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="chat-md-ol">
          {block.items.map((item, j) => (
            <li key={`${key}-li-${j}`} className="chat-md-li">
              {renderAssistantInline(item)}
            </li>
          ))}
        </ol>
      )
    case 'blockquote':
      return (
        <blockquote key={key} className="chat-bible-verse">
          <span className="chat-bible-verse-label">Bibel</span>
          <div className="chat-bible-verse-body">
            {block.lines.map((line, j) => (
              <p key={`${key}-ln-${j}`} className="chat-bible-verse-line">
                {renderAssistantInline(line)}
              </p>
            ))}
          </div>
        </blockquote>
      )
    case 'table': {
      const [headerRow, ...bodyRows] = block.rows
      if (!headerRow?.length) {
        return null
      }
      return (
        <div key={key} className="chat-md-table-wrap">
          <table className="chat-md-table">
            <thead>
              <tr>
                {headerRow.map((cell, j) => (
                  <th key={`${key}-th-${j}`} className="chat-md-th">
                    {renderAssistantInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            {bodyRows.length > 0 ? (
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={`${key}-tr-${ri}`}>
                    {row.map((cell, ci) => (
                      <td key={`${key}-td-${ri}-${ci}`} className="chat-md-td">
                        {renderAssistantInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      )
    }
    default:
      return null
  }
}

/** Strukturierter Assistententext: Markdown-ähnliche Blöcke (Überschriften, Listen, ---, Links). */
export function renderAssistantRichContent(content: string): ReactNode {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  const blocks = parseBlocks(trimmed)
  if (blocks.length === 0) {
    return <p className="chat-md-p">{renderAssistantInline(trimmed)}</p>
  }

  /** Ein einzelner Absatz ohne Struktur-Marker → weiterhin ein p */
  if (blocks.length === 1 && blocks[0].type === 'p') {
    return <p className="chat-md-p">{renderAssistantInline(blocks[0].text)}</p>
  }

  return (
    <div className="chat-md-root">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}
