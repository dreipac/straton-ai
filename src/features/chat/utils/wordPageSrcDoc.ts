import type { WordOutlineV1 } from '../types'
import { buildWordPageCss } from '../constants/wordDocStyle'

export type WordBlock = WordOutlineV1['blocks'][number]

/** Eine paginierte Seite — Blöcke ggf. an Seitengrenzen geteilt (siehe `paginateWordOutline`). */
export type WordPage = {
  blocks: WordBlock[]
  /** `cover` = Titelblatt (eigenes Layout, keine Kopfzeile); sonst Inhaltsseite. */
  kind?: 'cover' | 'content'
  /** Dokumenttitel — auf der Inhaltsseite für die Kopfzeile, auf der Cover-Seite als grosser Titel. */
  title?: string
  /** Untertitel fürs Titelblatt (nur Cover-Seite). */
  subtitle?: string
  /** Autor fürs Titelblatt (nur Cover-Seite). */
  author?: string
  /** Datum fürs Titelblatt (nur Cover-Seite). */
  date?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimaler Inline-Parser: HTML escapen, dann `**fett**` → `<strong>`. Gleiche Regel wie der Python-Renderer. */
export function wordInlineToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** Überschrift-Ebene → Tag (Spec stylt h1/h2; Ebene ≥3 fällt auf h3 = fetter Fliesstext). */
function headingTag(level: number): 'h1' | 'h2' | 'h3' {
  if (level <= 1) {
    return 'h1'
  }
  if (level === 2) {
    return 'h2'
  }
  return 'h3'
}

export function wordBlockToHtml(block: WordBlock): string {
  if (block.type === 'heading') {
    const tag = headingTag(block.level)
    return `<${tag}>${wordInlineToHtml(block.text)}</${tag}>`
  }
  if (block.type === 'paragraph') {
    return `<p>${wordInlineToHtml(block.text)}</p>`
  }
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul'
    const items = block.items.map((it) => `<li>${wordInlineToHtml(it)}</li>`).join('')
    return items ? `<${tag}>${items}</${tag}>` : ''
  }
  // table
  const rows = block.rows ?? []
  if (rows.length === 0) {
    return ''
  }
  const hasHeader = block.header === true
  const parts: string[] = ['<table>']
  rows.forEach((row, rowIndex) => {
    const cellTag = hasHeader && rowIndex === 0 ? 'th' : 'td'
    const cells = row.map((cell) => `<${cellTag}>${wordInlineToHtml(cell)}</${cellTag}>`).join('')
    parts.push(`<tr>${cells}</tr>`)
  })
  parts.push('</table>')
  return parts.join('')
}

export function wordBlocksToHtml(blocks: WordBlock[]): string {
  return blocks.map(wordBlockToHtml).join('')
}

/** Titelblatt-Markup: linksbündiger Titel + Untertitel oben, Autor + Datum unten (keine Linie). */
function wordCoverToHtml(page: WordPage): string {
  const title = page.title ? wordInlineToHtml(page.title) : ''
  const subtitle = page.subtitle ? wordInlineToHtml(page.subtitle) : ''
  const author = page.author ? wordInlineToHtml(page.author) : ''
  const date = page.date ? wordInlineToHtml(page.date) : ''
  const meta =
    author || date
      ? [
          '<div class="word-cover__meta">',
          author ? `<div class="word-cover__author">${author}</div>` : '',
          date ? `<div class="word-cover__date">${date}</div>` : '',
          '</div>',
        ].join('')
      : ''
  return [
    '<div class="word-cover">',
    title ? `<div class="word-cover__title">${title}</div>` : '',
    subtitle ? `<div class="word-cover__subtitle">${subtitle}</div>` : '',
    '</div>',
    meta,
  ].join('')
}

/** Laufende Kopfzeile (Titel grau + Unterlinie), sitzt im oberen Seitenrand. */
function wordHeaderToHtml(title: string): string {
  return `<div class="word-header"><div class="word-header__title">${wordInlineToHtml(title)}</div><div class="word-header__rule"></div></div>`
}

/** Vollständiges `srcDoc` für eine A4-Seite (`index` nur zur Symmetrie mit `buildPptxSlideSrcDoc`). */
export function buildWordPageSrcDoc(page: WordPage, index = 0): string {
  const body =
    page.kind === 'cover'
      ? wordCoverToHtml(page)
      : `${page.title ? wordHeaderToHtml(page.title) : ''}<div class="word-flow">${wordBlocksToHtml(page.blocks)}</div>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${buildWordPageCss()}</style></head><body class="word-page" data-page-index="${index}">${body}</body></html>`
}
