import type { ReactNode } from 'react'
import { tryParseMarkdownTable } from '../../chat/utils/renderAssistantRichContent'
import { renderInlineMarkdown } from '../../chat/utils/markdownInline'

/** Erklärungs-/Recap-Content: Fließtext-Absätze, optional durchsetzt mit GFM-Pipe-Tabellen (Rechenweg/Vergleich). */
export function renderLearnStepContent(content: string): ReactNode {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let blockIndex = 0

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (!text) {
      return
    }
    blocks.push(<p key={`p-${blockIndex++}`}>{renderInlineMarkdown(text)}</p>)
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      flushParagraph()
      i += 1
      continue
    }

    const table = tryParseMarkdownTable(lines, i)
    if (table) {
      flushParagraph()
      const [header, ...rows] = table.rows
      blocks.push(
        <div key={`table-${blockIndex++}`} className="learn-md-table-wrap">
          <table className="learn-md-table">
            {header ? (
              <thead>
                <tr>
                  {header.map((cell, cellIndex) => (
                    <th key={`th-${cellIndex}`} className="learn-md-th">
                      {renderInlineMarkdown(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`td-${cellIndex}`} className="learn-md-td">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      i = table.end
      continue
    }

    paragraph.push(line.trim())
    i += 1
  }
  flushParagraph()

  return <>{blocks}</>
}
