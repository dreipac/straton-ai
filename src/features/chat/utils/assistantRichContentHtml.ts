import { parseAssistantRichBlocks, type AssistantRichBlock, type OlListItem } from './renderAssistantRichContent'
import { buildTableClipboardHtml } from './tableClipboard'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragraphHtml(text: string): string {
  const t = text.trim()
  return t ? `<p>${escapeHtml(t)}</p>` : ''
}

function olItemPlainText(item: OlListItem): string {
  return typeof item === 'string' ? item : item.text
}

function blockToHtml(block: AssistantRichBlock): string {
  switch (block.type) {
    case 'hr':
      return '<hr>'
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = block.type.slice(1)
      return `<h${level}>${escapeHtml(block.text)}</h${level}>`
    }
    case 'p':
      return paragraphHtml(block.text)
    case 'ul':
      return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    case 'ol':
      return `<ol>${block.items.map((item) => `<li>${escapeHtml(olItemPlainText(item))}</li>`).join('')}</ol>`
    case 'blockquote':
      return `<blockquote>${block.lines.map(paragraphHtml).join('')}</blockquote>`
    case 'code':
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`
    case 'emailDraft':
      return block.body.split('\n').map(paragraphHtml).join('')
    case 'table':
      return buildTableClipboardHtml(block.rows)
    case 'cards':
      return block.cards.map((card) => `${paragraphHtml(card.title)}${paragraphHtml(card.body)}`).join('')
    case 'callout':
      return `<blockquote>${block.lines.map(paragraphHtml).join('')}</blockquote>`
    case 'dividedList':
      return `${block.title ? paragraphHtml(block.title) : ''}<ul>${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    case 'definition':
      return `${paragraphHtml(block.title)}${paragraphHtml(block.body)}`
    case 'mcq': {
      const optionsHtml = block.options
        .map((option) => `<li>${escapeHtml(option.letter)}) ${escapeHtml(option.text)}</li>`)
        .join('')
      return `${paragraphHtml(block.prompt)}<ul>${optionsHtml}</ul>`
    }
    case 'math':
      return paragraphHtml(block.latex)
    default:
      return ''
  }
}

/**
 * Baut aus Assistententext dasselbe strukturierte HTML wie die Anzeige — Tabellen als echte
 * `<table>`, Listen als `<ul>`/`<ol>` usw. — fürs Kopieren in die Zwischenablage. Word (und andere
 * Office-/Mail-Apps) lesen beim Einfügen den HTML-MIME-Typ, wenn vorhanden, und bauen daraus
 * echte Tabellen statt der reinen Zeichenkette mit sichtbaren `|`-Zeichen zu übernehmen (siehe
 * `copyRichTextToClipboard`, das diesen HTML-String zusätzlich zum Klartext auf die Zwischenablage
 * schreibt).
 */
export function buildAssistantRichContentClipboardHtml(content: string): string {
  return parseAssistantRichBlocks(content).map(blockToHtml).join('')
}
