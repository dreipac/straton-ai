import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { AssistantSourceBadges } from '../components/AssistantSourceBadges'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { splitAssistantContentSources } from './assistantSourceBadges'
import {
  ASSISTANT_SECTION_REPLY_MOBILE_MQ,
  useAssistantSectionReplySwipe,
} from '../hooks/useAssistantSectionReplySwipe'
import {
  blockToReferenceExcerpt,
  type AssistantSectionReference,
} from './assistantSectionReply'
import {
  renderAssistantInline,
  stripGeneratedImageModelFooter,
  type AssistantInlineImageOptions,
} from './markdownInline'
import {
  ChatMathDisplay,
  splitTextWithDisplayMath,
  tryParseDisplayMathBlock,
} from './renderMath'

export type AssistantRichContentOptions = AssistantInlineImageOptions & {
  /** Abschnitts-Referenz (Antwort auf Teil der KI-Nachricht). */
  sectionReply?: {
    messageId: string
    onReference: (ref: AssistantSectionReference) => void
  }
}

type Block =
  | { type: 'hr' }
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'h5'; text: string }
  | { type: 'h6'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: OlListItem[] }
  /** Markdown-Zeilen mit > — Bibel/Quran nur bei erkennbarer Stellenangabe; sonst normales Zitat */
  | { type: 'blockquote'; lines: string[]; quoteKind: 'bible' | 'quran' | 'plain' }
  /** Markdown-Codeblock mit ``` */
  | { type: 'code'; language: string; code: string }
  /** E-Mail-/Briefentwurf: ```email oder erkannter Fließtext mit Betreff: */
  | { type: 'emailDraft'; body: string }
  /** GFM-Pipe-Tabelle: erste Zeile = Kopfzeile, weitere = Daten */
  | { type: 'table'; rows: string[][] }
  /** Konzept-Karten (```cards … ```) */
  | { type: 'cards'; cards: ChatVisualCard[] }
  /** Einleitung mit Akzent-Rand (`> ! …`) */
  | { type: 'callout'; lines: string[] }
  /** Erklärung/Definition — Karte mit Badge «Definition» */
  | { type: 'definition'; title: string; body: string }
  /** Multiple-Choice (Frage + A–D), getrennt von Standard-Listen */
  | { type: 'mcq'; title?: string; questionNumber: number; prompt: string; options: McqOption[] }
  /** LaTeX/KaTeX: `\[ … \]` oder `$$ … $$` */
  | { type: 'math'; latex: string }

type McqOption = { letter: string; text: string }

export type ChatVisualCard = {
  label: string
  title: string
  body: string
  badges: Array<{ text: string; variant: ChatBadgeVariant }>
}

export type ChatBadgeVariant = 'blue' | 'green' | 'orange' | 'gray' | 'teal'

const BADGE_VARIANTS: ChatBadgeVariant[] = ['blue', 'green', 'orange', 'teal', 'gray']

function normalizeBadgeVariant(raw: string | undefined): ChatBadgeVariant {
  const v = (raw ?? 'blue').trim().toLowerCase()
  if (v === 'green' || v === 'orange' || v === 'gray' || v === 'teal' || v === 'blue') {
    return v
  }
  return 'blue'
}

/** ```cards`-Block: Karten durch `---`, Felder label/title/body/badges. */
export function parseChatCardsBlock(raw: string): ChatVisualCard[] {
  const sections = raw
    .replace(/\r\n/g, '\n')
    .split(/\n---\n/)
    .map((section) => section.trim())
    .filter(Boolean)

  const cards: ChatVisualCard[] = []
  for (const section of sections) {
    const card: ChatVisualCard = { label: '', title: '', body: '', badges: [] }
    const bodyLines: string[] = []
    let inBody = false

    for (const line of section.split('\n')) {
      const trimmed = line.trim()
      const field = trimmed.match(/^(label|title|body|badges):\s*(.*)$/i)
      if (field) {
        inBody = field[1]!.toLowerCase() === 'body'
        const value = field[2]!.trim()
        if (field[1]!.toLowerCase() === 'label') {
          card.label = value
        } else if (field[1]!.toLowerCase() === 'title') {
          card.title = value
        } else if (field[1]!.toLowerCase() === 'body') {
          if (value) {
            bodyLines.push(value)
          }
        } else if (field[1]!.toLowerCase() === 'badges') {
          card.badges = value
            .split('|')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part, index) => {
              const tagged = part.match(/^(blue|green|orange|gray|teal):\s*(.+)$/i)
              if (tagged) {
                return {
                  variant: normalizeBadgeVariant(tagged[1]),
                  text: tagged[2]!.trim(),
                }
              }
              return {
                variant: BADGE_VARIANTS[index % BADGE_VARIANTS.length] ?? 'blue',
                text: part,
              }
            })
        }
        continue
      }
      if (inBody && trimmed) {
        bodyLines.push(trimmed)
      }
    }

    card.body = bodyLines.join('\n').trim()
    if (card.title || card.body || card.label) {
      cards.push(card)
    }
  }

  return cards
}

function ChatVisualCardGrid({
  cards,
  options,
}: {
  cards: ChatVisualCard[]
  options?: AssistantRichContentOptions
}) {
  if (cards.length === 0) {
    return null
  }
  return (
    <div className="chat-md-cards">
      {cards.map((card, index) => (
        <article key={`card-${index}`} className="chat-md-card">
          {card.label ? <p className="chat-md-card-label">{card.label}</p> : null}
          {card.title ? (
            <h4 className="chat-md-card-title">{renderAssistantInline(card.title, options)}</h4>
          ) : null}
          {card.body ? (
            <div className="chat-md-card-body">
              {card.body.split('\n').map((line, lineIndex) => (
                <p key={`card-${index}-ln-${lineIndex}`} className="chat-md-card-body-line">
                  {renderAssistantInline(line, options)}
                </p>
              ))}
            </div>
          ) : null}
          {card.badges.length > 0 ? (
            <div className="chat-md-card-badges">
              {card.badges.map((badge, badgeIndex) => (
                <span
                  key={`card-${index}-badge-${badgeIndex}`}
                  className={`chat-md-badge chat-md-badge--${badge.variant}`}
                >
                  {badge.text}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function CalloutBlock({
  lines,
  options,
}: {
  lines: string[]
  options?: AssistantRichContentOptions
}) {
  return (
    <aside className="chat-md-callout">
      {lines.map((line, index) => (
        <p key={`callout-${index}`} className="chat-md-callout-line">
          {renderAssistantInline(line, options)}
        </p>
      ))}
    </aside>
  )
}

const DEFINITION_TITLE_RE = /^(?:Erklärung|Definition|Was ist|Was bedeutet)\b/i

function parseDefinitionBlockRaw(raw: string): { title: string; body: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  let title = ''
  const bodyLines: string[] = []
  for (const line of trimmed.split('\n')) {
    const t = line.trim()
    const titleField = t.match(/^title:\s*(.+)$/i)
    if (titleField) {
      title = titleField[1]!.trim()
      continue
    }
    if (t.match(/^body:\s*/i)) {
      bodyLines.push(t.replace(/^body:\s*/i, ''))
      continue
    }
    bodyLines.push(line)
  }
  if (!title) {
    const first = bodyLines[0]?.trim() ?? ''
    if (first) {
      title = first.replace(/^\*\*(.+)\*\*$/, '$1').trim()
      bodyLines.shift()
    }
  }
  const body = bodyLines.join('\n').trim()
  if (!title && !body) {
    return null
  }
  return { title: title || 'Erklärung', body }
}

function extractDefinitionTitleFromText(text: string): { title: string; bodyRemainder: string } {
  const trimmed = text.trim()
  const boldLine = trimmed.match(/^\*\*(.+?)\*\*:?\s*(.*)$/s)
  if (boldLine && DEFINITION_TITLE_RE.test(boldLine[1]!.trim())) {
    return {
      title: boldLine[1]!.replace(/:$/, '').trim(),
      bodyRemainder: boldLine[2]?.trim() ?? '',
    }
  }
  if (DEFINITION_TITLE_RE.test(stripBoldMarkers(trimmed))) {
    const plain = stripBoldMarkers(trimmed)
    const colon = plain.indexOf(':')
    if (colon > 0 && colon < 140) {
      return {
        title: plain.slice(0, colon).trim(),
        bodyRemainder: plain.slice(colon + 1).trim(),
      }
    }
    return { title: plain, bodyRemainder: '' }
  }
  return { title: '', bodyRemainder: '' }
}

function blockIsDefinitionLead(block: Block): boolean {
  if (block.type === 'h3' || block.type === 'h4' || block.type === 'h5' || block.type === 'h6') {
    return DEFINITION_TITLE_RE.test(stripBoldMarkers(block.text))
  }
  if (block.type === 'p') {
    return DEFINITION_TITLE_RE.test(stripBoldMarkers(block.text.split('\n')[0] ?? ''))
  }
  return false
}

function blockStopsDefinitionBody(block: Block): boolean {
  return (
    block.type === 'hr' ||
    block.type === 'h1' ||
    block.type === 'h2' ||
    block.type === 'definition' ||
    block.type === 'cards' ||
    block.type === 'callout' ||
    block.type === 'table' ||
    block.type === 'code' ||
    block.type === 'math' ||
    block.type === 'mcq' ||
    block.type === 'emailDraft' ||
    block.type === 'ul' ||
    block.type === 'ol' ||
    block.type === 'blockquote'
  )
}

/** «Erklärung …» / «Definition …» + folgende Absätze → Definition-Karte. */
function coalesceDefinitionBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]!
    if (!blockIsDefinitionLead(block)) {
      out.push(block)
      index += 1
      continue
    }

    let sourceText = ''
    if (block.type === 'p') {
      sourceText = block.text
    } else if (
      block.type === 'h3' ||
      block.type === 'h4' ||
      block.type === 'h5' ||
      block.type === 'h6'
    ) {
      sourceText = block.text
    }
    const { title, bodyRemainder } = extractDefinitionTitleFromText(sourceText)
    const bodyParts: string[] = []
    if (bodyRemainder) {
      bodyParts.push(bodyRemainder)
    }
    index += 1

    while (index < blocks.length) {
      const next = blocks[index]!
      if (blockStopsDefinitionBody(next)) {
        break
      }
      if (blockIsDefinitionLead(next)) {
        break
      }
      if (next.type === 'h3' || next.type === 'h4' || next.type === 'h5' || next.type === 'h6') {
        break
      }
      if (next.type === 'p') {
        bodyParts.push(next.text)
        index += 1
        continue
      }
      break
    }

    out.push({
      type: 'definition',
      title: title || 'Erklärung',
      body: bodyParts.join('\n\n').trim(),
    })
  }
  return out
}

function DefinitionCard({
  title,
  body,
  options,
}: {
  title: string
  body: string
  options?: AssistantRichContentOptions
}) {
  const paragraphs = body ? body.split(/\n\n+/).filter(Boolean) : []
  return (
    <article className="chat-md-definition-card">
      <span className="chat-md-definition-badge">Definition</span>
      <h4 className="chat-md-definition-title">{renderAssistantInline(title, options)}</h4>
      {paragraphs.length > 0 ? (
        <div className="chat-md-definition-body">
          {paragraphs.map((paragraph, paragraphIndex) => (
            <p key={`def-body-${paragraphIndex}`} className="chat-md-definition-body-line">
              {renderAssistantInline(paragraph, options)}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  )
}

const HEADING_BLOCK_TYPES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
type HeadingBlockType = (typeof HEADING_BLOCK_TYPES)[number]

function tryParseMarkdownHeading(trimmed: string): { type: HeadingBlockType; text: string } | null {
  const m = trimmed.match(/^(#{1,6})\s+(.+)$/)
  if (!m?.[1] || !m[2]?.trim()) {
    return null
  }
  const level = m[1].length
  if (level < 1 || level > 6) {
    return null
  }
  return { type: `h${level}` as HeadingBlockType, text: m[2].trim() }
}

function stripBoldMarkers(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
}

type OlTrailingCode = { language: string; code: string }

/** Eintrag in `<ol>`: Standard (1,2,3…), Unterpunkte (1.1), Bullets oder Code direkt danach. */
export type OlListItem =
  | string
  | { text: string; marker?: string; bullets?: string[]; trailingCode?: OlTrailingCode }

function olItemPlainText(item: OlListItem): string {
  return typeof item === 'string' ? item : item.text
}

function olItemBullets(item: OlListItem): string[] {
  return typeof item === 'object' && item.bullets?.length ? item.bullets : []
}

function appendBulletToLastOlItem(items: OlListItem[], bullet: string): OlListItem[] {
  if (items.length === 0) {
    return items
  }
  const next = [...items]
  const last = next[next.length - 1]!
  if (typeof last === 'string') {
    next[next.length - 1] = { text: last, bullets: [bullet] }
  } else {
    next[next.length - 1] = { ...last, bullets: [...(last.bullets ?? []), bullet] }
  }
  return next
}

function mergeOlItemWithBullets(item: OlListItem, bullets: string[]): OlListItem {
  if (typeof item === 'string') {
    return { text: item, bullets: [...bullets] }
  }
  return { ...item, bullets: [...(item.bullets ?? []), ...bullets] }
}

function olItemTrailingCode(item: OlListItem): OlTrailingCode | null {
  return typeof item === 'object' && item.trailingCode ? item.trailingCode : null
}

function attachCodeAfterOlItem(item: OlListItem, code: OlTrailingCode): OlListItem {
  if (typeof item === 'string') {
    return { text: item, trailingCode: code }
  }
  return { ...item, trailingCode: code }
}

function olItemsAsPlainStrings(items: OlListItem[]): string[] {
  return items.map(olItemPlainText)
}

function parseOrderedListLine(
  trimmed: string,
): { kind: 'decimal'; text: string } | { kind: 'outline'; marker: string; text: string } | null {
  const plain = stripBoldMarkers(trimmed)
  const outline = plain.match(/^(\d+)\.(\d+)\s+(.+)$/)
  if (outline) {
    return {
      kind: 'outline',
      marker: `${outline[1]}.${outline[2]}`,
      text: outline[3]!.trim(),
    }
  }
  const decimal = plain.match(/^(\d{1,2})[.)]\s+(.*)$/)
  if (decimal) {
    return { kind: 'decimal', text: decimal[2]!.trim() }
  }
  return null
}

function mergeAdjacentOrderedListBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    const prev = out[out.length - 1]
    if (block.type === 'ol' && prev?.type === 'ol') {
      out[out.length - 1] = { type: 'ol', items: [...prev.items, ...block.items] }
      continue
    }
    out.push(block)
  }
  return out
}

/** `1.` + Bullets + `2.` → eine `<ol>` (KI trennt oft mit `-` Zeilen dazwischen). */
function coalesceOrderedListBlocks(blocks: Block[]): Block[] {
  const merged = mergeAdjacentOrderedListBlocks(blocks)
  const out: Block[] = []
  for (let i = 0; i < merged.length; i += 1) {
    const block = merged[i]!
    if (block.type !== 'ol') {
      out.push(block)
      continue
    }
    let items = [...block.items]
    let j = i + 1
    while (j < merged.length) {
      const next = merged[j]!
      if (next.type === 'ul') {
        if (items.length > 0) {
          items[items.length - 1] = mergeOlItemWithBullets(items[items.length - 1]!, next.items)
        } else {
          out.push(next)
        }
        j += 1
        continue
      }
      if (next.type === 'code') {
        if (items.length > 0) {
          items[items.length - 1] = attachCodeAfterOlItem(items[items.length - 1]!, {
            language: next.language,
            code: next.code,
          })
        } else {
          out.push(next)
        }
        j += 1
        continue
      }
      if (next.type === 'emailDraft') {
        if (items.length > 0) {
          items[items.length - 1] = attachCodeAfterOlItem(items[items.length - 1]!, {
            language: 'email',
            code: next.body,
          })
        } else {
          out.push({ type: 'emailDraft', body: next.body })
        }
        j += 1
        continue
      }
      if (next.type === 'ol') {
        items.push(...next.items)
        j += 1
        continue
      }
      break
    }
    out.push({ type: 'ol', items })
    i = j - 1
  }
  return out
}

/** Erste Zeile wirkt wie eine deutschsprachige Bibelstellenangabe (Buch + Kap.,Vers o. Ä.). */
function looksLikeGermanBibleVerseHeading(line: string): boolean {
  const t = stripBoldMarkers(line)
  if (!t) {
    return false
  }
  if (/^(sure|sura)\s*\d+/i.test(t)) {
    return false
  }

  const hasChapterVerse =
    /\b\d{1,3}\s*[,.]\s*\d{1,3}\b/.test(t) ||
    /\b\d{1,3}\s*:\s*\d{1,3}\b/.test(t) ||
    /^Psalm(?:en)?\s+\d{1,3}(?:\s*[,.]\s*\d{1,3})?$/i.test(t)

  const bookAtStart =
    /^(?:[12]\s*)?(?:Mose|Exodus|Levitikus|Numeri|Deuteronomium|5\.\s*Mose|Josua|Richter|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Könige|(?:1|2)\s*Chronik|Esra|Nehemia|Esther|Hiob|Psalm|Psalmen|Sprüche|Prediger|Hohelied|Jesaja|Jeremia|Klagelieder|Hesekiel|Daniel|Hosea|Joel|Amos|Obadja|Jona|Micha|Nahum|Habakuk|Sephaja|Haggai|Sacharja|Maleachi|Johannes|Matthäus|Markus|Lukas|Apostelgeschichte|Apg\.|Römer|Röm\.|Galater|Epheser|Philipper|Kolosser|(?:1|2)\.\s*Korinther|(?:1|2)\.\s*Thessalonicher|(?:1|2)\.\s*Timotheus|Titus|Philemon|Hebräer|Jakobus|(?:1|2)\.\s*Petrus|(?:1|3)\.\s*Johannes|(?:2|3)\.\s*Johannes|Judas|Offenbarung|Offb\.)\b/i.test(
      t,
    )

  return Boolean(bookAtStart && hasChapterVerse)
}

function isQuranReferenceLine(line: string): boolean {
  const t = stripBoldMarkers(line).trim()
  if (!t) {
    return false
  }
  return /^(sure|sura)\s*\d+(?:\s*[,.:]\s*\d+)?$/i.test(t)
}

function classifyScriptureBlockquote(lines: string[], _contextBefore: string): 'bible' | 'quran' | 'plain' {
  const firstLine = lines.map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const head = stripBoldMarkers(firstLine)

  // Sure-/Sura-Zeile ist eindeutig — keine «Bibel»-Box
  if (isQuranReferenceLine(head)) {
    return 'quran'
  }

  if (looksLikeGermanBibleVerseHeading(firstLine)) {
    return 'bible'
  }

  return 'plain'
}

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

const MATH_CODE_LANGS = new Set(['math', 'latex', 'tex', 'katex'])

function expandEmbeddedDisplayMath(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    if (block.type === 'code' && MATH_CODE_LANGS.has(block.language.trim().toLowerCase())) {
      out.push({ type: 'math', latex: block.code.trim() })
      continue
    }
    if (block.type !== 'p') {
      out.push(block)
      continue
    }
    const parts = splitTextWithDisplayMath(block.text)
    if (parts.length === 1 && parts[0].type === 'text') {
      out.push(block)
      continue
    }
    for (const part of parts) {
      if (part.type === 'math') {
        out.push({ type: 'math', latex: part.latex })
      } else if (part.value.trim()) {
        out.push({ type: 'p', text: part.value })
      }
    }
  }
  return out
}

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const para: string[] = []
  let listItems: string[] | null = null
  let orderedItems: OlListItem[] | null = null
  let quoteLines: string[] | null = null
  /** Kontext vor dem ersten `>` — zur Klassifikation Bibel / Quran / normales Zitat */
  let quoteParseContext = ''
  let codeLines: string[] | null = null
  let codeLanguage = ''

  function recentContextText(currentLine: string): string {
    const fromPara = para.slice(-2).join(' ')
    const fromList = [...(listItems ?? []), ...(orderedItems ?? []).map(olItemPlainText)]
      .slice(-2)
      .join(' ')
    const fromBlocks = blocks
      .slice(-3)
      .map((b) => {
        switch (b.type) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
          case 'p':
            return b.text
          case 'ul':
            return b.items.slice(-2).join(' ')
          case 'ol':
            return olItemsAsPlainStrings(b.items).slice(-2).join(' ')
          default:
            return ''
        }
      })
      .join(' ')
    return [fromPara, fromList, fromBlocks, currentLine].filter(Boolean).join(' ')
  }

  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join('\n') })
      para.length = 0
    }
  }

  function flushUlOnly() {
    if (listItems && listItems.length) {
      blocks.push({ type: 'ul', items: [...listItems] })
      listItems = null
    }
  }

  function flushOlOnly() {
    if (orderedItems && orderedItems.length) {
      blocks.push({ type: 'ol', items: [...orderedItems] })
      orderedItems = null
    }
  }

  function flushList() {
    flushUlOnly()
    flushOlOnly()
  }

  function flushQuote() {
    if (quoteLines && quoteLines.length) {
      const firstLine = quoteLines[0]?.trim() ?? ''
      if (firstLine.startsWith('!')) {
        const lines = [...quoteLines]
        lines[0] = firstLine.replace(/^!\s*/, '')
        blocks.push({ type: 'callout', lines })
      } else {
        const kind = classifyScriptureBlockquote(quoteLines, quoteParseContext)
        blocks.push({ type: 'blockquote', lines: [...quoteLines], quoteKind: kind })
      }
      quoteLines = null
      quoteParseContext = ''
    }
  }

  function flushCode() {
    if (codeLines) {
      const raw = codeLines.join('\n')
      const lang = codeLanguage.trim().toLowerCase()
      if (lang === 'email' || lang === 'mail' || lang === 'e-mail') {
        blocks.push({ type: 'emailDraft', body: raw })
      } else if (lang === 'cards' || lang === 'card') {
        blocks.push({ type: 'cards', cards: parseChatCardsBlock(raw) })
      } else if (lang === 'definition' || lang === 'def') {
        const parsed = parseDefinitionBlockRaw(raw)
        if (parsed) {
          blocks.push({ type: 'definition', title: parsed.title, body: parsed.body })
        }
      } else {
        blocks.push({ type: 'code', language: normalizeCodeLanguage(codeLanguage), code: raw })
      }
      codeLines = null
      codeLanguage = ''
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const t = line.trimEnd()
    const trimmed = t.trim()

    if (codeLines) {
      if (trimmed.startsWith('```')) {
        flushCode()
      } else {
        codeLines.push(line)
      }
      continue
    }

    if (trimmed.startsWith('```')) {
      flushQuote()
      flushList()
      flushPara()
      codeLines = []
      codeLanguage = trimmed.replace(/^```/, '').trim().toLowerCase()
      continue
    }

    const tableTry = tryParseMarkdownTable(lines, lineIndex)
    if (tableTry) {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'table', rows: tableTry.rows })
      lineIndex = tableTry.end - 1
      continue
    }

    const mathTry = tryParseDisplayMathBlock(lines, lineIndex)
    if (mathTry) {
      flushQuote()
      flushList()
      flushPara()
      blocks.push({ type: 'math', latex: mathTry.latex })
      lineIndex = mathTry.end - 1
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
      if (!quoteLines) {
        const paraTail = para.length > 0 ? para[para.length - 1].trim() : ''
        const ctxCombined = `${recentContextText(trimmed)} ${paraTail}`.trim()
        let carriedHeading: string | null = null
        if (paraTail && isQuranReferenceLine(paraTail)) {
          para.pop()
          carriedHeading = paraTail
        }

        flushList()
        flushPara()

        quoteLines = []
        quoteParseContext = ctxCombined
        if (carriedHeading) {
          quoteLines.push(`**${carriedHeading}**`)
        }
      }
      quoteLines.push(bq[1])
      continue
    }

    if (trimmed === '') {
      flushQuote()
      flushPara()
      let j = lineIndex + 1
      while (j < lines.length && lines[j]!.trim() === '') {
        j += 1
      }
      const nextTrimmed = j < lines.length ? lines[j]!.trim() : ''
      if (orderedItems?.length && parseOrderedListLine(nextTrimmed)) {
        flushUlOnly()
        continue
      }
      flushList()
      continue
    }

    const heading = tryParseMarkdownHeading(trimmed)
    if (heading) {
      flushQuote()
      flushList()
      flushPara()
      blocks.push(heading)
      continue
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/)
    if (ul) {
      flushQuote()
      flushPara()
      if (orderedItems?.length) {
        orderedItems = appendBulletToLastOlItem(orderedItems, ul[1])
        continue
      }
      if (!listItems) {
        listItems = []
      }
      listItems.push(ul[1])
      continue
    }

    /** MCQ-Optionen ohne Listen-Bindestrich: `A) …` (häufige KI-Ausgabe) */
    const mcqOptionLine = trimmed.match(/^([A-Da-d])\)\s+(.+)$/)
    if (mcqOptionLine) {
      flushQuote()
      flushPara()
      if (!listItems) {
        listItems = []
      }
      listItems.push(`${mcqOptionLine[1].toUpperCase()}) ${mcqOptionLine[2].trim()}`)
      continue
    }

    const olParsed = parseOrderedListLine(trimmed)
    if (olParsed) {
      flushQuote()
      flushPara()
      flushUlOnly()
      if (!orderedItems) {
        orderedItems = []
      }
      if (olParsed.kind === 'outline') {
        orderedItems.push({ text: olParsed.text, marker: olParsed.marker })
      } else {
        orderedItems.push(olParsed.text)
      }
      continue
    }

    flushQuote()
    flushList()
    para.push(t)
  }

  flushQuote()
  flushCode()
  flushList()
  flushPara()
  return promoteShellCommandsToCodeBlocks(
    transformBlocksWithMcq(
      promotePlainParagraphEmailDrafts(
        coalesceDefinitionBlocks(coalesceOrderedListBlocks(expandEmbeddedDisplayMath(blocks))),
      ),
    ),
  )
}

const SHELL_COMMAND_VERB_RE =
  /^(?:sudo\s+)?(?:ping|ip|ifconfig|nmcli|systemctl|journalctl|cat|nano|vim|vi|curl|wget|ssh|scp|traceroute|tracepath|arp|netstat|ss|dig|nslookup|host|grep|egrep|awk|sed|tail|head|less|dmesg|ls|cd|pwd|mkdir|rm|cp|mv|chmod|chown|touch|find|df|du|mount|umount|lsblk|fdisk|bridge|brctl|iptables|nft|ufw|firewall-cmd|apt|apt-get|dnf|yum|pacman|docker|podman|kubectl|qm|pct|pvesh|pvecm|pvesm|lxc|virsh|hostnamectl|timedatectl|crontab|echo|export|source)\b/i

function looksLikeShellCommand(command: string): boolean {
  const c = command.trim()
  if (!c || c.length > 800 || /\n/.test(c)) {
    return false
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/.test(c)) {
    return false
  }
  if (SHELL_COMMAND_VERB_RE.test(c)) {
    return true
  }
  if (/^[\w./-]+(?:\s+[-\w./:=@*?[\]"']+)+/.test(c)) {
    return true
  }
  return false
}

function splitShellCommandFromText(text: string): { labelText: string; command: string } | null {
  const match = text.match(/`([^`\n]+)`/)
  if (!match) {
    return null
  }
  const command = match[1]?.trim() ?? ''
  if (!looksLikeShellCommand(command)) {
    return null
  }
  const labelText = text.replace(/`[^`\n]+`/, '').replace(/\s{2,}/g, ' ').trim()
  return { labelText, command }
}

function normalizeCodeLanguage(language: string): string {
  const lang = language.trim().toLowerCase()
  if (lang === 'sh' || lang === 'shell' || lang === 'zsh' || lang === 'console') {
    return 'bash'
  }
  return language.trim() || 'text'
}

function promoteShellCommandsInUlBlock(block: Extract<Block, { type: 'ul' }>): Block[] {
  const out: Block[] = []
  let pendingUl: string[] = []

  function flushUl() {
    if (pendingUl.length === 0) {
      return
    }
    out.push({ type: 'ul', items: [...pendingUl] })
    pendingUl = []
  }

  for (const item of block.items) {
    const split = splitShellCommandFromText(item)
    if (split) {
      flushUl()
      if (split.labelText) {
        pendingUl.push(split.labelText)
        flushUl()
      }
      out.push({ type: 'code', language: 'bash', code: split.command })
      continue
    }
    pendingUl.push(item)
  }

  flushUl()
  return out
}

function promoteShellCommandsInOlBlock(block: Extract<Block, { type: 'ol' }>): Block[] {
  const out: Block[] = []
  let pendingOl: OlListItem[] = []

  function flushOl() {
    if (pendingOl.length === 0) {
      return
    }
    out.push({ type: 'ol', items: [...pendingOl] })
    pendingOl = []
  }

  for (const item of block.items) {
    const split = splitShellCommandFromText(olItemPlainText(item))
    if (split) {
      flushOl()
      if (split.labelText) {
        pendingOl.push(split.labelText)
        flushOl()
      }
      out.push({ type: 'code', language: 'bash', code: split.command })
      continue
    }
    pendingOl.push(item)
  }

  flushOl()
  return out
}

function promoteShellCommandsInListBlock(block: Extract<Block, { type: 'ul' | 'ol' }>): Block[] {
  return block.type === 'ul'
    ? promoteShellCommandsInUlBlock(block)
    : promoteShellCommandsInOlBlock(block)
}

function promoteShellCommandsToCodeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []

  for (const block of blocks) {
    if (block.type === 'ul' || block.type === 'ol') {
      out.push(...promoteShellCommandsInListBlock(block))
      continue
    }
    if (block.type === 'p') {
      const split = splitShellCommandFromText(block.text)
      if (split) {
        if (split.labelText) {
          out.push({ type: 'p', text: split.labelText })
        }
        out.push({ type: 'code', language: 'bash', code: split.command })
        continue
      }
    }
    if (block.type === 'code') {
      out.push({
        ...block,
        language: normalizeCodeLanguage(block.language),
      })
      continue
    }
    out.push(block)
  }

  return out
}

function isFragenHeading(text: string): boolean {
  const t = stripBoldMarkers(text).trim().replace(/:$/, '').trim()
  return /^(fragen|übungsfragen|verständnisfragen|prüfungsfragen|wissensfragen)$/i.test(t)
}

function parseMcqQuestionFromText(
  text: string,
): { questionNumber: number; prompt: string } | null {
  const plain = stripBoldMarkers(text.trim())
  const qm = plain.match(/^(\d{1,2})[.)]\s+(.+)$/s)
  if (!qm) {
    return null
  }
  return {
    questionNumber: Math.max(1, Number.parseInt(qm[1], 10) || 1),
    prompt: qm[2].trim(),
  }
}

function tryParseMcqFromOlItem(
  item: OlListItem,
  fallbackQuestionNumber: number,
): Extract<Block, { type: 'mcq' }> | null {
  const bullets = olItemBullets(item)
  if (bullets.length < 2 || !isMcqOptionsList(bullets)) {
    return null
  }
  const options = parseMcqOptions(bullets)
  if (options.length < 2) {
    return null
  }
  const plain = olItemPlainText(item).trim()
  const parsedQuestion = parseMcqQuestionFromText(plain)
  const prompt = parsedQuestion?.prompt ?? plain
  if (!prompt) {
    return null
  }
  return {
    type: 'mcq',
    questionNumber: parsedQuestion?.questionNumber ?? fallbackQuestionNumber,
    prompt,
    options,
  }
}

function tryParseMcqBatchFromOlBlock(
  block: Extract<Block, { type: 'ol' }>,
  questionOffset: number,
): Extract<Block, { type: 'mcq' }>[] | null {
  const mcqs: Extract<Block, { type: 'mcq' }>[] = []
  for (let itemIndex = 0; itemIndex < block.items.length; itemIndex += 1) {
    const mcq = tryParseMcqFromOlItem(block.items[itemIndex]!, questionOffset + mcqs.length + 1)
    if (!mcq) {
      break
    }
    mcqs.push(mcq)
  }
  return mcqs.length > 0 ? mcqs : null
}

function tryParseMcqFromParagraphOptions(
  blocks: Block[],
  index: number,
): { block: Extract<Block, { type: 'mcq' }>; end: number } | null {
  const p = blocks[index]
  if (p?.type !== 'p') {
    return null
  }
  const parsedQuestion = parseMcqQuestionFromText(p.text)
  if (!parsedQuestion) {
    return null
  }
  const options: McqOption[] = []
  let j = index + 1
  while (j < blocks.length) {
    const next = blocks[j]
    if (next?.type !== 'p') {
      break
    }
    const opt = parseMcqOptionLine(next.text)
    if (!opt) {
      break
    }
    options.push(opt)
    j += 1
  }
  if (options.length < 2) {
    return null
  }
  return {
    block: {
      type: 'mcq',
      questionNumber: parsedQuestion.questionNumber,
      prompt: parsedQuestion.prompt,
      options,
    },
    end: j,
  }
}

function parseMcqOptionLine(raw: string): McqOption | null {
  const t = stripBoldMarkers(raw.trim())
  const m = t.match(/^([A-Da-d])\)\s+(.+)$/s)
  if (!m) {
    return null
  }
  return { letter: m[1].toUpperCase(), text: m[2].trim() }
}

function isMcqOptionsList(items: string[]): boolean {
  if (items.length < 2) {
    return false
  }
  const parsed = items.map(parseMcqOptionLine).filter((x): x is McqOption => x !== null)
  return parsed.length >= 2 && parsed.length >= Math.ceil(items.length * 0.75)
}

function parseMcqOptions(items: string[]): McqOption[] {
  return items.map(parseMcqOptionLine).filter((x): x is McqOption => x !== null)
}

function tryParseSingleMcqBlock(
  blocks: Block[],
  index: number,
): { block: Extract<Block, { type: 'mcq' }>; end: number } | null {
  const ol = blocks[index]
  const ul = blocks[index + 1]

  /** `- A) …` wird beim Lexen oft in die nummerierte Frage eingebettet — ein `ol`-Block ohne separates `ul`. */
  if (ol?.type === 'ol' && ol.items.length === 1) {
    const embedded = tryParseMcqFromOlItem(ol.items[0]!, 1)
    if (embedded) {
      return { block: embedded, end: index + 1 }
    }
  }

  /** Selten: Optionen-`ul` steht vor der nummerierten Frage. */
  const maybeUl = blocks[index]
  const maybeOl = blocks[index + 1]
  if (
    maybeUl?.type === 'ul' &&
    isMcqOptionsList(maybeUl.items) &&
    maybeOl?.type === 'ol' &&
    maybeOl.items.length === 1
  ) {
    const options = parseMcqOptions(maybeUl.items)
    const prompt = olItemPlainText(maybeOl.items[0] ?? '').trim()
    if (options.length >= 2 && prompt) {
      const parsedQuestion = parseMcqQuestionFromText(prompt)
      return {
        block: {
          type: 'mcq',
          questionNumber: parsedQuestion?.questionNumber ?? 1,
          prompt: parsedQuestion?.prompt ?? prompt,
          options,
        },
        end: index + 2,
      }
    }
  }

  const paragraphMcq = tryParseMcqFromParagraphOptions(blocks, index)
  if (paragraphMcq) {
    return paragraphMcq
  }

  if (ol?.type === 'ol' && ol.items.length === 1 && ul?.type === 'ul' && isMcqOptionsList(ul.items)) {
    const options = parseMcqOptions(ul.items)
    if (options.length < 2) {
      return null
    }
    const prompt = olItemPlainText(ol.items[0] ?? '').trim()
    if (!prompt) {
      return null
    }
    return {
      block: { type: 'mcq', questionNumber: 1, prompt, options },
      end: index + 2,
    }
  }

  const p = blocks[index]
  if (p?.type === 'p' && ul?.type === 'ul' && isMcqOptionsList(ul.items)) {
    const plain = stripBoldMarkers(p.text.trim())
    const qm = plain.match(/^(\d{1,2})[.)]\s+(.+)$/s)
    if (qm) {
      const options = parseMcqOptions(ul.items)
      if (options.length < 2) {
        return null
      }
      return {
        block: {
          type: 'mcq',
          questionNumber: Math.max(1, Number.parseInt(qm[1], 10) || 1),
          prompt: qm[2].trim(),
          options,
        },
        end: index + 2,
      }
    }
  }

  /**
   * Häufiger Modell-Fail: eine Zeile nur `1.` / `1)` (oder `2.` …), dann erst der Prompt als eigener Absatz,
   * danach Optionen als Liste.
   */
  const pNum = blocks[index]
  const pPrompt = blocks[index + 1]
  const ulAfter = blocks[index + 2]
  if (pNum?.type === 'p' && pPrompt?.type === 'p' && ulAfter?.type === 'ul' && isMcqOptionsList(ulAfter.items)) {
    const numOnly = stripBoldMarkers(pNum.text.trim()).match(/^(\d{1,2})[.)]$/)
    if (numOnly) {
      const prompt = stripBoldMarkers(pPrompt.text.trim())
      if (!prompt) {
        return null
      }
      const options = parseMcqOptions(ulAfter.items)
      if (options.length < 2) {
        return null
      }
      return {
        block: {
          type: 'mcq',
          questionNumber: Math.max(1, Number.parseInt(numOnly[1], 10) || 1),
          prompt,
          options,
        },
        end: index + 3,
      }
    }
  }

  return null
}

function transformBlocksWithMcq(blocks: Block[]): Block[] {
  const out: Block[] = []
  let i = 0
  let questionCounter = 0

  while (i < blocks.length) {
    let title: string | undefined
    let scan = i
    const head = blocks[scan]
    if (
      head &&
      (head.type === 'p' || head.type === 'h2' || head.type === 'h3') &&
      isFragenHeading(head.type === 'p' ? head.text : head.text)
    ) {
      title = 'Fragen'
      scan++
    }

    /**
     * Manche Antworten listen nach `Fragen:` fälschlich erst `A) … B) …` ohne Prompt.
     * Das ist für die UI wertlos und verwirrt (doppelte Frage-Listen). Wenn direkt nach dem
     * Fragen-Heading eine reine Optionsliste kommt, überspringen wir sie.
     */
    if (title && blocks[scan]?.type === 'ul' && isMcqOptionsList((blocks[scan] as Extract<Block, { type: 'ul' }>).items)) {
      scan++
    }

    const mcqBatch: Extract<Block, { type: 'mcq' }>[] = []
    let cursor = scan
    while (cursor < blocks.length) {
      const olCandidate = blocks[cursor]
      if (olCandidate?.type === 'ol' && olCandidate.items.length > 1) {
        const batch = tryParseMcqBatchFromOlBlock(olCandidate, questionCounter)
        if (batch) {
          batch.forEach((mcq) => {
            questionCounter += 1
            mcqBatch.push({
              ...mcq,
              questionNumber: mcq.questionNumber > 1 ? mcq.questionNumber : questionCounter,
            })
          })
          cursor += 1
          continue
        }
      }

      const parsed = tryParseSingleMcqBlock(blocks, cursor)
      if (!parsed) {
        break
      }
      questionCounter += 1
      mcqBatch.push({
        ...parsed.block,
        questionNumber: parsed.block.questionNumber > 1 ? parsed.block.questionNumber : questionCounter,
      })
      cursor = parsed.end
    }

    if (mcqBatch.length > 0) {
      mcqBatch.forEach((mcq, idx) => {
        out.push({
          ...mcq,
          title: idx === 0 ? title : undefined,
        })
      })
      /**
       * Häufiges Tail-Artifact nach MCQ: eine einzelne nummerierte Frage ohne Optionen (z. B. „1. …?“).
       * Das kommt aus der Modell-Antwort, ist aber für MCQ-UI wertlos → nicht als nackte Liste rendern.
       */
      const tail = blocks[cursor]
      const tailNext = blocks[cursor + 1]
      const isOrphanedNumberedQuestion =
        tail?.type === 'ol' &&
        tail.items.length === 1 &&
        /[?？]\s*$/.test(stripBoldMarkers(olItemPlainText(tail.items[0] ?? '').trim())) &&
        !(tailNext?.type === 'ul' && isMcqOptionsList(tailNext.items))

      i = cursor + (isOrphanedNumberedQuestion ? 1 : 0)
      continue
    }

    out.push(blocks[i])
    i++
  }

  return out
}

function splitBetreffFromEmailBody(body: string): { subject?: string; rest: string } {
  const trimmed = body.trim()
  const nlPos = trimmed.search(/\r?\n/)
  if (nlPos === -1) {
    return { rest: trimmed }
  }
  const firstLine = stripBoldMarkers(trimmed.slice(0, nlPos)).trim()
  const m = /^betreff\s*:\s*(.+)$/i.exec(firstLine)
  if (!m) {
    return { rest: trimmed }
  }
  const rest = trimmed.slice(nlPos + 1).replace(/^\r?\n+/, '').trimStart()
  return { subject: m[1].trim(), rest }
}

/** Fließtext mit «Betreff:» und typischer Mail (Fallback, wenn das Modell keinen ```email-Block nutzt). */
function promotePlainParagraphEmailDrafts(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type !== 'p') {
      return b
    }
    const t = b.text.trim()
    if (t.length < 28) {
      return b
    }
    const firstLine = stripBoldMarkers(t.split(/\r?\n/, 1)[0] ?? '').trim()
    if (!/^betreff\s*:/i.test(firstLine)) {
      return b
    }
    if (!/\r?\n/.test(t)) {
      return b
    }
    if (
      !/\b(hallo|sehr geehrte|guten tag|liebe |mit freundlichen grüßen|freundliche grüße|viele grüße|\bvg\b)/i.test(
        t,
      )
    ) {
      return b
    }
    return { type: 'emailDraft', body: t }
  })
}

function buildEmailDraftClipboardText(subject: string, letter: string): string {
  const s = subject.trim()
  const l = letter.trim()
  if (s && l) {
    return `Betreff: ${s}\n\n${l}`
  }
  if (s) {
    return `Betreff: ${s}`
  }
  return l
}

function EmailDraftBlock({ body }: { body: string }) {
  const betreffFieldId = useId()
  const letterFieldId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const { subject: parsedSubject, rest: parsedRest } = splitBetreffFromEmailBody(body)
  const initialLetter = (parsedSubject ? parsedRest : body).trim()

  const [editedSubject, setEditedSubject] = useState(() => parsedSubject ?? '')
  const [editedLetter, setEditedLetter] = useState(() => initialLetter)

  useEffect(() => {
    const { subject: s, rest: r } = splitBetreffFromEmailBody(body)
    setEditedSubject(s ?? '')
    setEditedLetter((s ? r : body).trim())
  }, [body])

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopyState('idle'), 1400)
    return () => window.clearTimeout(timer)
  }, [copyState])

  function openInSystemMailApp() {
    // Kein URLSearchParams.toString(): das wandelt Leerzeichen in "+" um;
    // Outlook (und andere Clients) zeigen "+" in mailto oft wörtlich statt als Leerzeichen.
    const parts: string[] = []
    const subj = editedSubject.trim()
    const bod = editedLetter.trim()
    if (subj) {
      parts.push(`subject=${encodeURIComponent(subj)}`)
    }
    if (bod) {
      parts.push(`body=${encodeURIComponent(bod)}`)
    }
    const q = parts.join('&')
    window.location.assign(q ? `mailto:?${q}` : 'mailto:')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildEmailDraftClipboardText(editedSubject, editedLetter))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const copyLabel = copyState === 'copied' ? 'Kopiert' : copyState === 'failed' ? 'Fehler' : 'Kopieren'

  return (
    <div className="chat-email-draft">
      <div className="chat-email-draft-head">
        <span className="chat-email-draft-badge">E-Mail</span>
        <div className="chat-email-draft-actions">
          <button
            type="button"
            className="chat-email-draft-mailto"
            onClick={openInSystemMailApp}
            title="Öffnet dein Mailprogramm mit diesem Text und Betreff — dort kannst du weiterbearbeiten, als Entwurf speichern oder senden."
          >
            E-Mail senden
          </button>
          <button
            type="button"
            className="chat-email-draft-copy"
            onClick={() => void handleCopy()}
            title="Aktuellen Text (Betreff + Nachricht) kopieren"
          >
            {copyLabel}
          </button>
        </div>
      </div>
      <div className="chat-email-draft-subject-row chat-email-draft-subject-edit">
        <label className="chat-email-draft-subject-k" htmlFor={betreffFieldId}>
          Betreff
        </label>
        <input
          id={betreffFieldId}
          type="text"
          className="chat-email-draft-subject-input"
          value={editedSubject}
          onChange={(e) => setEditedSubject(e.target.value)}
          placeholder="z. B. Krankmeldung"
          autoComplete="off"
        />
      </div>
      <div className="chat-email-draft-letter">
        <label className="chat-email-draft-letter-label" htmlFor={letterFieldId}>
          Nachricht
        </label>
        <textarea
          id={letterFieldId}
          className="chat-email-draft-textarea"
          value={editedLetter}
          onChange={(e) => setEditedLetter(e.target.value)}
          spellCheck={true}
          rows={12}
        />
      </div>
    </div>
  )
}

function McqBlock({
  title,
  questionNumber,
  prompt,
  options,
  richOptions,
}: {
  title?: string
  questionNumber: number
  prompt: string
  options: McqOption[]
  richOptions?: AssistantRichContentOptions
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  function toggleOption(letter: string) {
    setChecked((prev) => ({ ...prev, [letter]: !prev[letter] }))
  }

  return (
    <section className="chat-mcq-block" aria-label={title ?? 'Multiple Choice'}>
      {title ? <p className="chat-mcq-heading">{title}</p> : null}
      <div className="chat-mcq-question">
        <span className="chat-mcq-number" aria-hidden="true">
          {questionNumber}
        </span>
        <p className="chat-mcq-prompt">{renderAssistantInline(prompt, richOptions)}</p>
      </div>
      <ul className="chat-mcq-options" role="group" aria-label="Antwortmöglichkeiten">
        {options.map((option) => {
          const isChecked = Boolean(checked[option.letter])
          return (
            <li key={option.letter} className="chat-mcq-option-item">
              <button
                type="button"
                className={`chat-mcq-option${isChecked ? ' is-checked' : ''}`}
                aria-pressed={isChecked}
                onClick={() => toggleOption(option.letter)}
              >
                <span className="chat-mcq-checkbox" aria-hidden="true" />
                <span className="chat-mcq-option-letter">{option.letter}</span>
                <span className="chat-mcq-option-text">{renderAssistantInline(option.text, richOptions)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopyState('idle'), 1400)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const buttonLabel = copyState === 'copied' ? 'Kopiert' : copyState === 'failed' ? 'Fehler' : 'Copy'

  return (
    <div className="chat-md-code-wrap">
      <div className="chat-md-code-head">
        <span className="chat-md-code-lang">{language || 'text'}</span>
        <button type="button" className="chat-md-code-copy" onClick={() => void handleCopy()}>
          {buttonLabel}
        </button>
      </div>
      <pre className="chat-md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function AssistantSectionShell({
  block,
  blockIndex,
  options,
  children,
}: {
  block: Block
  blockIndex: number
  options?: AssistantRichContentOptions
  children: ReactNode
}) {
  const sectionReply = options?.sectionReply
  const isMobileSectionReply = useMediaQuery(ASSISTANT_SECTION_REPLY_MOBILE_MQ)

  const fireReference = useCallback(() => {
    if (!sectionReply) {
      return
    }
    const { excerpt, previewTitle } = blockToReferenceExcerpt(block)
    sectionReply.onReference({
      messageId: sectionReply.messageId,
      blockIndex,
      blockKind: block.type,
      excerpt,
      previewTitle,
    })
  }, [block, blockIndex, sectionReply])

  const { sectionRef } = useAssistantSectionReplySwipe(
    Boolean(sectionReply && block.type !== 'hr' && isMobileSectionReply),
    fireReference,
  )

  if (!sectionReply || block.type === 'hr') {
    return <>{children}</>
  }

  if (!isMobileSectionReply) {
    return (
      <div className="chat-md-section">
        <button
          type="button"
          className="chat-md-section-ref-btn"
          aria-label="Auf diesen Abschnitt antworten"
          title="Referenz"
          onClick={fireReference}
        >
          <span className="chat-md-section-ref-icon" aria-hidden="true">
            ↩
          </span>
          <span className="chat-md-section-ref-label">Referenz</span>
        </button>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={sectionRef}
      className="chat-md-section chat-md-section--mobile-reply chat-md-section--swipe-host"
    >
      <div className="chat-md-section-swipe-slot" aria-hidden="true">
        <span className="chat-md-section-swipe-slot-bar" />
        <span className="chat-md-section-swipe-slot-icon">↩</span>
      </div>
      <div className="chat-md-section-swipe-body">{children}</div>
    </div>
  )
}

function renderBlock(
  block: Block,
  i: number,
  options?: AssistantRichContentOptions,
): ReactNode {
  const key = `blk-${i}`
  switch (block.type) {
    case 'hr':
      return <hr key={key} className="chat-md-hr" />
    case 'h1':
      return (
        <h2 key={key} className="chat-md-h chat-md-h1">
          {renderAssistantInline(block.text, options)}
        </h2>
      )
    case 'h2':
      return (
        <h3 key={key} className="chat-md-h chat-md-h2">
          {renderAssistantInline(block.text, options)}
        </h3>
      )
    case 'h3':
      return (
        <h4 key={key} className="chat-md-h chat-md-h3">
          {renderAssistantInline(block.text, options)}
        </h4>
      )
    case 'h4':
      return (
        <h5 key={key} className="chat-md-h chat-md-h4">
          {renderAssistantInline(block.text, options)}
        </h5>
      )
    case 'h5':
      return (
        <h6 key={key} className="chat-md-h chat-md-h5">
          {renderAssistantInline(block.text, options)}
        </h6>
      )
    case 'h6':
      return (
        <p key={key} className="chat-md-h chat-md-h6" role="heading" aria-level={6}>
          {renderAssistantInline(block.text, options)}
        </p>
      )
    case 'p':
      return (
        <p key={key} className="chat-md-p">
          {renderAssistantInline(block.text, options)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} className="chat-md-ul">
          {block.items.map((item, j) => (
            <li key={`${key}-li-${j}`} className="chat-md-li">
              {renderAssistantInline(item, options)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="chat-md-ol">
          {block.items.map((item, j) => {
            const customMarker =
              typeof item === 'object' && item.marker ? item.marker : null
            const text = olItemPlainText(item)
            const bullets = olItemBullets(item)
            const trailingCode = olItemTrailingCode(item)
            return (
              <li
                key={`${key}-li-${j}`}
                className={customMarker ? 'chat-md-li chat-md-li--ol-custom' : 'chat-md-li'}
              >
                {customMarker ? (
                  <span className="chat-md-ol-marker" aria-hidden="true">
                    {customMarker}
                  </span>
                ) : null}
                {renderAssistantInline(text, options)}
                {bullets.length > 0 ? (
                  <ul className="chat-md-ul chat-md-ul--nested">
                    {bullets.map((bullet, k) => (
                      <li key={`${key}-li-${j}-ul-${k}`} className="chat-md-li">
                        {renderAssistantInline(bullet, options)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {trailingCode ? (
                  <div className="chat-md-ol-embedded-code">
                    <CodeBlock code={trailingCode.code} language={trailingCode.language} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )
    case 'blockquote':
      if (block.quoteKind === 'plain') {
        return (
          <blockquote key={key} className="chat-md-blockquote">
            <div className="chat-md-blockquote-body">
              {block.lines.map((line, j) => (
                <p key={`${key}-ln-${j}`} className="chat-md-blockquote-line">
                  {renderAssistantInline(line, options)}
                </p>
              ))}
            </div>
          </blockquote>
        )
      }
      return (
        <blockquote
          key={key}
          className={`chat-bible-verse${block.quoteKind === 'quran' ? ' chat-bible-verse--quran' : ''}`}
        >
          <span className="chat-bible-verse-label">{block.quoteKind === 'quran' ? 'Quran' : 'Bibel'}</span>
          <div className="chat-bible-verse-body">
            {block.lines.map((line, j) => (
              <p key={`${key}-ln-${j}`} className="chat-bible-verse-line">
                {renderAssistantInline(line, options)}
              </p>
            ))}
          </div>
        </blockquote>
      )
    case 'math':
      return <ChatMathDisplay key={key} latex={block.latex} />
    case 'code':
      return <CodeBlock key={key} code={block.code} language={block.language} />
    case 'emailDraft':
      return <EmailDraftBlock key={key} body={block.body} />
    case 'mcq':
      return (
        <McqBlock
          key={key}
          title={block.title}
          questionNumber={block.questionNumber}
          prompt={block.prompt}
          options={block.options}
          richOptions={options}
        />
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
                    {renderAssistantInline(cell, options)}
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
                        {renderAssistantInline(cell, options)}
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
    case 'cards':
      return <ChatVisualCardGrid key={key} cards={block.cards} options={options} />
    case 'callout':
      return <CalloutBlock key={key} lines={block.lines} options={options} />
    case 'definition':
      return (
        <DefinitionCard key={key} title={block.title} body={block.body} options={options} />
      )
    default:
      return null
  }
}

function wrapAssistantRichWithSourceBadges(
  main: ReactNode,
  sources: ReturnType<typeof splitAssistantContentSources>['sources'],
  leadText?: string,
): ReactNode {
  if (!sources.length) {
    return main
  }
  return (
    <>
      {main}
      <AssistantSourceBadges sources={sources} leadText={leadText} />
    </>
  )
}

/** Strukturierter Assistententext: Markdown-ähnliche Blöcke (Überschriften, Listen, ---, Links). */
export function renderAssistantRichContent(
  content: string,
  options?: AssistantRichContentOptions,
): ReactNode {
  const trimmed = stripGeneratedImageModelFooter(content).trim()
  if (!trimmed) {
    return null
  }

  const { body, sources, leadText } = splitAssistantContentSources(trimmed)
  const bodyTrimmed = body.trim()
  if (!bodyTrimmed) {
    return wrapAssistantRichWithSourceBadges(null, sources, leadText)
  }

  const blocks = parseBlocks(bodyTrimmed)
  if (blocks.length === 0) {
    return wrapAssistantRichWithSourceBadges(
      <p className="chat-md-p">{renderAssistantInline(bodyTrimmed, options)}</p>,
      sources,
      leadText,
    )
  }

  /** Ein einzelner Absatz ohne Struktur-Marker → weiterhin ein p */
  if (blocks.length === 1 && blocks[0].type === 'p') {
    return wrapAssistantRichWithSourceBadges(
      <AssistantSectionShell block={blocks[0]} blockIndex={0} options={options}>
        <p className="chat-md-p">{renderAssistantInline(blocks[0].text, options)}</p>
      </AssistantSectionShell>,
      sources,
      leadText,
    )
  }

  return wrapAssistantRichWithSourceBadges(
    <div className="chat-md-root">
      {blocks.map((b, i) => (
        <AssistantSectionShell key={`sec-${i}`} block={b} blockIndex={i} options={options}>
          {renderBlock(b, i, options)}
        </AssistantSectionShell>
      ))}
    </div>,
    sources,
    leadText,
  )
}
