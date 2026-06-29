import type { ChatMessage, WordOutlineV1 } from '../types'
import {
  PDF_SPEC_JSON_END,
  PDF_SPEC_JSON_START,
  WORD_SPEC_JSON_END,
  WORD_SPEC_JSON_START,
} from '../constants/documentExportIntent'
import {
  coalesceMarkdownTablesAcrossBlocks,
  expandWordOutlineTables,
  parseWordOutlineTableBlock,
} from './wordOutlineTables'

export type { WordOutlineV1 }

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

function isHeadingLevel(n: number): n is HeadingLevel {
  return n >= 1 && n <= 6
}

function resolveHeadingLevelField(b: Record<string, unknown>): number {
  if (typeof b.level === 'number') {
    return b.level
  }
  if (typeof b.depth === 'number') {
    return b.depth
  }
  const fromLevel = Number(b.level)
  if (Number.isFinite(fromLevel)) {
    return fromLevel
  }
  return Number(b.depth)
}

/** Gleiche Validierung wie Edge `generate-word-from-outline`. */
export function parseWordOutlineV1(raw: unknown): WordOutlineV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const o = raw as Record<string, unknown>
  if (o.version !== 1) {
    return null
  }
  if (!Array.isArray(o.blocks)) {
    return null
  }
  const blocks: WordOutlineV1['blocks'] = []
  for (const item of o.blocks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }
    const b = item as Record<string, unknown>
    const t = typeof b.type === 'string' ? b.type.trim().toLowerCase() : ''
    if (t === 'heading') {
      const lv = resolveHeadingLevelField(b)
      const text = typeof b.text === 'string' ? b.text : ''
      if (!isHeadingLevel(lv)) {
        return null
      }
      blocks.push({ type: 'heading', level: lv, text })
    } else if (t === 'paragraph') {
      const text = typeof b.text === 'string' ? b.text : ''
      blocks.push({ type: 'paragraph', text })
    } else if (t === 'list') {
      if (!Array.isArray(b.items)) {
        return null
      }
      const items = b.items
        .map((it) => (typeof it === 'string' ? it : String(it ?? '')))
        .map((it) => it.trim())
        .filter(Boolean)
      if (items.length === 0) {
        return null
      }
      blocks.push({ type: 'list', ordered: b.ordered === true, items })
    } else if (t === 'table') {
      const table = parseWordOutlineTableBlock(b)
      if (!table) {
        return null
      }
      blocks.push(table)
    } else {
      return null
    }
  }
  if (blocks.length === 0) {
    return null
  }
  return {
    version: 1,
    fileName: typeof o.fileName === 'string' ? o.fileName : undefined,
    title: typeof o.title === 'string' ? o.title : undefined,
    date: typeof o.date === 'string' ? o.date : undefined,
    blocks: expandWordOutlineTables(blocks),
  }
}

export function tryParseWordOutlineJson(text: string): WordOutlineV1 | null {
  const t = text.trim()
  if (!t) {
    return null
  }
  try {
    const j = JSON.parse(t) as unknown
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const o = j as Record<string, unknown>
      if (o.version === undefined && Array.isArray(o.blocks)) {
        return parseWordOutlineV1({ ...o, version: 1 })
      }
    }
    return parseWordOutlineV1(j)
  } catch {
    return null
  }
}

/**
 * Erster ```json```-Block, der ein gültiges WordOutlineV1 ist — für Chat-Papier-Ansicht
 * (Einleitung vor / Nachwort nach dem Block bleiben normales Markdown).
 */
export function splitContentAroundFirstWordOutlineFence(content: string): {
  outline: WordOutlineV1
  before: string
  after: string
} | null {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const inner = m[1]?.trim()
    if (!inner) {
      continue
    }
    const parsed = tryParseWordOutlineJson(inner)
    if (!parsed) {
      continue
    }
    const full = m[0]
    const start = m.index ?? 0
    const before = content.slice(0, start).trimEnd()
    const after = content.slice(start + full.length).trimStart()
    return { outline: parsed, before, after }
  }
  return null
}

export function isLikelyDocumentOutlinePayload(content: string): boolean {
  const t = content.trim()
  if (!t) {
    return false
  }
  if (
    t.includes(WORD_SPEC_JSON_START) ||
    t.includes(PDF_SPEC_JSON_START)
  ) {
    return true
  }
  if (/```(?:json)?/i.test(t)) {
    return true
  }
  if (t.startsWith('{') && /"version"\s*:\s*1/.test(t) && /"blocks"\s*:/.test(t)) {
    return true
  }
  if (t.startsWith('{') && /"blocks"\s*:/.test(t)) {
    return true
  }
  return false
}

/** Rohes `{ "version": 1, "blocks": … }` ohne ```json``` — manche Modelle liefern nur JSON. */
export function tryParseBareWordOutlineFromContent(content: string): {
  outline: WordOutlineV1
  before: string
  after: string
} | null {
  const trimmed = content.trim()
  const direct = tryParseWordOutlineJson(trimmed)
  if (direct) {
    return { outline: direct, before: '', after: '' }
  }

  const start = trimmed.indexOf('{')
  if (start === -1) {
    return null
  }
  let end = trimmed.lastIndexOf('}')
  while (end > start) {
    const slice = trimmed.slice(start, end + 1)
    const parsed = tryParseWordOutlineJson(slice)
    if (parsed) {
      return {
        outline: parsed,
        before: trimmed.slice(0, start).trimEnd(),
        after: trimmed.slice(end + 1).trimStart(),
      }
    }
    end = trimmed.lastIndexOf('}', end - 1)
  }
  return null
}

function splitContentAroundOutlineMarkerBlock(
  content: string,
  startMarker: string,
  endMarker: string,
): {
  outline: WordOutlineV1
  before: string
  after: string
} | null {
  const i = content.indexOf(startMarker)
  const j = content.indexOf(endMarker)
  if (i === -1 || j === -1 || j <= i) {
    return null
  }
  const inner = content.slice(i + startMarker.length, j).trim()
  const parsed = tryParseWordOutlineJson(inner)
  if (!parsed) {
    return null
  }
  return {
    outline: parsed,
    before: content.slice(0, i).trimEnd(),
    after: content.slice(j + endMarker.length).trimStart(),
  }
}

export function resolveWordOutlinePresentation(content: string): {
  outline: WordOutlineV1
  before: string
  after: string
} | null {
  return (
    splitContentAroundOutlineMarkerBlock(content, WORD_SPEC_JSON_START, WORD_SPEC_JSON_END) ??
    splitContentAroundOutlineMarkerBlock(content, PDF_SPEC_JSON_START, PDF_SPEC_JSON_END) ??
    splitContentAroundFirstWordOutlineFence(content) ??
    tryParseBareWordOutlineFromContent(content)
  )
}

export function stripWordSpecMarkerBlock(content: string): string {
  const i = content.indexOf(WORD_SPEC_JSON_START)
  const j = content.indexOf(WORD_SPEC_JSON_END)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  return `${content.slice(0, i).trimEnd()}\n\n${content.slice(j + WORD_SPEC_JSON_END.length).trimStart()}`.trim()
}

/** `kind` schränkt die Marker-Suche auf Word ODER PDF ein — sonst matcht z. B. ein reiner PDF-Block fälschlich auch als Word-Outline. */
function parseWordOutlineFromMarkerBlock(
  content: string,
  kind?: 'word' | 'pdf',
): WordOutlineV1 | null {
  const markerPairs =
    kind === 'word'
      ? ([[WORD_SPEC_JSON_START, WORD_SPEC_JSON_END]] as const)
      : kind === 'pdf'
        ? ([[PDF_SPEC_JSON_START, PDF_SPEC_JSON_END]] as const)
        : ([
            [WORD_SPEC_JSON_START, WORD_SPEC_JSON_END],
            [PDF_SPEC_JSON_START, PDF_SPEC_JSON_END],
          ] as const)
  for (const [start, end] of markerPairs) {
    const i = content.indexOf(start)
    const j = content.indexOf(end)
    if (i === -1 || j === -1 || j <= i) {
      continue
    }
    const inner = content.slice(i + start.length, j).trim()
    const parsed = tryParseWordOutlineJson(inner)
    if (parsed) {
      return parsed
    }
  }
  return null
}

/** Letzter ```json-Block im Text (KI-Antwort). */
export function parseWordOutlineFromAssistantContent(
  content: string,
  kind?: 'word' | 'pdf',
): WordOutlineV1 | null {
  const fromMarkers = parseWordOutlineFromMarkerBlock(content, kind)
  if (fromMarkers) {
    return fromMarkers
  }
  const re = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  let lastFence: string | null = null
  while ((match = re.exec(content)) !== null) {
    const inner = match[1]?.trim()
    if (inner) {
      lastFence = inner
    }
  }
  if (!lastFence) {
    return tryParseBareWordOutlineFromContent(content)?.outline ?? null
  }
  return tryParseWordOutlineJson(lastFence)
}

/**
 * Wenn die KI kein ```json liefert, versuchen wir eine einfache Struktur aus
 * Überschriften / «Kapitel n:» / Markdown-# zu erkennen (kein vollständiges Layout-Parsing).
 */
/** Meta-Sätze der KI am Ende (nicht ins Word übernehmen). */
function isLikelyAssistantClosingBlurb(line: string): boolean {
  const t = line.trim()
  if (t.length < 20) {
    return false
  }
  const lower = t.toLowerCase()
  return (
    lower.startsWith('wenn du willst') ||
    lower.startsWith('if you want') ||
    lower.includes('saubere word-gliederung') ||
    lower.includes('word-vorlage mit') ||
    lower.includes('unterkapitel machen')
  )
}

/**
 * Erste Zeile wie «## Titel» oder «**Titel**» = Dokumentüberschrift für die Anzeige **oberhalb**
 * der Papier-Karte (Inhalt im Papier = später Word-Körper).
 */
export function extractLeadingBannerTitleFromOutlineText(text: string): {
  bannerTitle: string | null
  bodyWithoutBanner: string
} {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && !lines[i]?.trim()) {
    i++
  }
  if (i >= lines.length) {
    return { bannerTitle: null, bodyWithoutBanner: text }
  }
  const rawFirst = lines[i]!.trim()
  const md = rawFirst.match(/^(#{1,6})\s+(.+)$/)
  if (md) {
    const title = md[2]!.trim()
    const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').replace(/^\n+/u, '')
    return { bannerTitle: title, bodyWithoutBanner: rest }
  }
  const boldOnly = rawFirst.match(/^\*\*([^*]+)\*\*\s*$/)
  if (boldOnly && rawFirst.length < 240) {
    const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').replace(/^\n+/u, '')
    return { bannerTitle: boldOnly[1]!.trim(), bodyWithoutBanner: rest }
  }
  /** Doppelte Dokumentbezeichnung: Banner steht schon draussen / in ##, erste Zeile nur «Testprotokoll». */
  if (/^Testprotokoll\s*$/iu.test(rawFirst)) {
    const next = lines[i + 1]?.trim() ?? ''
    if (/^Projekt\s*:/iu.test(next) || /^Version\s*\//iu.test(next) || /^Testdatum\s*:/iu.test(next)) {
      const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').replace(/^\n+/u, '')
      return { bannerTitle: null, bodyWithoutBanner: rest }
    }
  }
  return { bannerTitle: null, bodyWithoutBanner: text }
}

/** Gleiche Bereinigung wie für die Papier-Vorschau — Word-Export darf keine KI-Banner-Zeile aus dem Rohtext übernehmen. */
export function assistantContentForWordOutlineExtraction(rawAssistantContent: string): string {
  if (usesStratonWordMarkdownConvention(rawAssistantContent)) {
    return rawAssistantContent
  }
  return extractLeadingBannerTitleFromOutlineText(rawAssistantContent).bodyWithoutBanner
}

/**
 * Straton Word-Konvention (trennt normales Markdown von Word-Gliederung):
 * - `#### ` = Fließtext/Absatz → Word-Absatzstil
 * - `##### ` = Überschrift 1
 * - `###### ` = Überschrift 2
 * Normale KI-Antworten nutzen weiter `#`–`###` (Standard-Markdown); diese Konvention nur für Word-Dokumente.
 */
const RE_WORD_BODY = /^####(?![#])\s+(.*)$/
const RE_WORD_H1 = /^#####(?![#])\s+(.*)$/
const RE_WORD_H2 = /^######(?![#])\s+(.*)$/

function countStratonWordMarkdownConventionLines(text: string): number {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '\n')
  let n = 0
  for (const raw of withoutFences.split('\n')) {
    const t = raw.trim()
    if (RE_WORD_BODY.test(t) || RE_WORD_H1.test(t) || RE_WORD_H2.test(t)) {
      n += 1
    }
  }
  return n
}

/** Mindestens zwei Kennzeilen — vermeidet false positives bei einzelner «####»-Zeile. */
export function usesStratonWordMarkdownConvention(text: string): boolean {
  return countStratonWordMarkdownConventionLines(text) >= 2
}

/**
 * Parst die #### / ##### / ######-Konvention zu WordOutlineV1.
 * Fortsetzungszeilen ohne Präfix werden an den zuletzt geöffneten Absatz angehängt.
 */
export function tryParseWordMarkdownConvention(text: string): WordOutlineV1 | null {
  if (!usesStratonWordMarkdownConvention(text)) {
    return null
  }
  const withoutFences = text.replace(/```[\s\S]*?```/g, '\n')
  const rawLines = withoutFences.split('\n')
  const blocks: WordOutlineV1['blocks'] = []
  let pendingIntro: string[] = []

  function flushIntro() {
    if (pendingIntro.length === 0) {
      return
    }
    const t = pendingIntro.join('\n').trim()
    pendingIntro = []
    if (t) {
      blocks.push({ type: 'paragraph', text: t })
    }
  }

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      continue
    }

    if (isLikelyAssistantClosingBlurb(trimmed)) {
      continue
    }

    let m = trimmed.match(RE_WORD_H2)
    if (m?.[1]) {
      flushIntro()
      blocks.push({ type: 'heading', level: 2, text: sanitizeHeadingTextForTemplate(m[1].trim()) })
      continue
    }
    m = trimmed.match(RE_WORD_H1)
    if (m?.[1]) {
      flushIntro()
      blocks.push({ type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(m[1].trim()) })
      continue
    }
    m = trimmed.match(RE_WORD_BODY)
    if (m?.[1]) {
      flushIntro()
      blocks.push({ type: 'paragraph', text: m[1].trim() })
      continue
    }

    if (blocks.length > 0 && blocks[blocks.length - 1]!.type === 'paragraph') {
      const last = blocks[blocks.length - 1]!
      if (last.type === 'paragraph') {
        last.text = `${last.text}\n${trimmed}`
      }
      continue
    }

    pendingIntro.push(trimmed)
  }

  flushIntro()

  if (blocks.length === 0) {
    return null
  }

  return { version: 1, blocks: expandWordOutlineTables(blocks) }
}

/** Entfernt «Kapitel 1:» / «1.» / «1.1» — nummerierte Word-Vorlagen nummerieren selbst. */
export function sanitizeHeadingTextForTemplate(text: string): string {
  let t = text.trim()
  t = t.replace(/^Kapitel\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Chapter\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Kapitel\s+\d+\s*$/i, '')
  t = t.replace(/^Chapter\s+\d+\s*$/i, '')
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^(\d+(?:\.\d+)*)(?:\.\s+|\s+)/, '').trim()
    if (next === t) {
      break
    }
    t = next
  }
  return t.trim()
}

function pushSanitizedHeading(
  out: WordOutlineV1['blocks'],
  level: HeadingLevel,
  text: string,
): void {
  const clean = sanitizeHeadingTextForTemplate(text)
  if (clean) {
    out.push({ type: 'heading', level, text: clean })
  }
}

/** Entfernt «1. » / «2) » am Zeilenanfang — die KI nummeriert oft die gesamte Gliederung. */
function stripLeadingOrderedListMarker(line: string): { rest: string; hadPrefix: boolean } {
  const m = line.match(/^(\d+)[.)]\s+(.*)$/)
  if (m?.[2]) {
    return { rest: m[2]!.trim(), hadPrefix: true }
  }
  return { rest: line.trim(), hadPrefix: false }
}

/**
 * Heuristik für Fließtext-Gliederungen: «Kapitel n», Markdown-# und typische Dokument-Abschnitte
 * (Testprotokoll, Ziel, Testumfang, …). Kein Ersatz für sauberes ```json```.
 */
const SECTION_HEADING_KEYWORDS =
  'Ziel|Testumfang|Testumgebung|Testfälle|Testfall|Ergebnis|Bemerkungen|Einleitung|Hauptteil|Schluss|Fazit|Zusammenfassung|Methodik|Anhang|Voraussetzungen|Definitionen|Projektübersicht|Referenzen|Testvorgehen|Ausgangslage|Rahmenbedingungen|Materialien|Termine|Teilnehmer|Signatur|Freigabe|Übersicht|Maßnahmen|Feststellung'

/**
 * Word: Hauptabschnitte = Überschrift 1, Unterpunkte wie 1.1 = Überschrift 2.
 * «#»/«##»/«###» zählen als H1 (Hauptkapitel), «####» als H2 (Unterkapitel), usw.
 */
function markdownHashesToOutlineLevel(hashCount: number): HeadingLevel {
  if (hashCount <= 3) {
    return 1
  }
  return Math.min(6, hashCount - 2) as HeadingLevel
}

function tryMarkdownHeadingLine(line: string): HeadingLevel | null {
  const m = line.match(/^(#{1,6})\s+(.+)$/)
  if (!m) {
    return null
  }
  const hashes = m[1]!.length
  return markdownHashesToOutlineLevel(hashes)
}

/** «1.1 Titel» / «2.3.1 Detail» als Unterkapitel (H2 / H3). Funktioniert auch mit führendem Bullet-Zeichen («• 1.1 …», «- 1.1 …»). */
function tryDecimalSubsectionHeading(line: string): { level: HeadingLevel; text: string } | null {
  const t = line.trim().replace(/\*\*/g, '').replace(/^[•·▪▸\-–]\s+/, '').trim()
  if (t.length > 200) {
    return null
  }
  const three = t.match(/^(\d+)\.(\d+)\.(\d+)\s+(\S.*)$/)
  if (three?.[4]) {
    return { level: 3, text: three[4].trim() }
  }
  const two = t.match(/^(\d+)\.(\d+)\s+(\S.*)$/)
  if (two?.[3]) {
    return { level: 2, text: two[3].trim() }
  }
  return null
}

function trySectionKeywordHeadingLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0 || t.length > 160) {
    return false
  }
  const re = new RegExp(`^(${SECTION_HEADING_KEYWORDS})(?:\\s*:\\s*|\\s+$|$)`, 'iu')
  return re.test(t)
}

const KAPITEL_WITH_SEP_RE = /^Kapitel\s+(\d+)\s*[:：.\-–—]\s*(.*)$/i
const KAPITEL_STANDALONE_RE = /^Kapitel\s+(\d+)\s*$/i
const CHAPTER_WITH_SEP_RE = /^Chapter\s+(\d+)\s*[:：.\-–—]\s*(.*)$/i
const CHAPTER_STANDALONE_RE = /^Chapter\s+(\d+)\s*$/i

function stripBoldMarkers(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/^\*+\s*/, '')
    .replace(/\s*\*+$/, '')
    .trim()
}

type WordBlock = WordOutlineV1['blocks'][number]

/** Eine Textzeile → Überschrift oder Fließtext (Word-Export / Heuristik). */
function classifyPlainLineToBlock(rawLine: string, lastHeadingLevel = 0): WordBlock | null {
  const line = stripBoldMarkers(rawLine)
  if (!line || isLikelyAssistantClosingBlurb(line)) {
    return null
  }

  const mdLevel = tryMarkdownHeadingLine(line)
  if (mdLevel !== null) {
    const textOnly = line.replace(/^#{1,6}\s+/, '').trim()
    return { type: 'heading', level: mdLevel, text: sanitizeHeadingTextForTemplate(textOnly || line) }
  }

  const sub = tryDecimalSubsectionHeading(line)
  if (sub) {
    return { type: 'heading', level: sub.level, text: sanitizeHeadingTextForTemplate(sub.text) }
  }

  const kapitelMatch = line.match(KAPITEL_WITH_SEP_RE)
  if (kapitelMatch) {
    const title = (kapitelMatch[2] ?? '').trim()
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(title || line) }
  }
  if (KAPITEL_STANDALONE_RE.test(line)) {
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(line) }
  }
  const chapterMatch = line.match(CHAPTER_WITH_SEP_RE)
  if (chapterMatch) {
    const title = (chapterMatch[2] ?? '').trim()
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(title || line) }
  }
  if (CHAPTER_STANDALONE_RE.test(line)) {
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(line) }
  }

  const { rest } = stripLeadingOrderedListMarker(line)
  if (trySectionKeywordHeadingLine(rest)) {
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(line) }
  }

  const singleNum = line.match(/^(\d+)\.\s+(.+)$/)
  if (singleNum?.[2] && !/^\d+\.\d+/.test(line)) {
    const n = parseInt(singleNum[1]!, 10)
    const title = stripBoldMarkers(singleNum[2]!)
    const wasBold = /^\*\*[^*]+\*\*/.test(rawLine.trim())
    // Kapitel → Ebene 1 («1. Überschrift»), Unterkapitel → Ebene 2 («1.1 …»)
    let level: HeadingLevel = 1
    if (wasBold || n >= 2 || lastHeadingLevel === 0) {
      level = 1
    } else {
      level = 2
    }
    return { type: 'heading', level, text: sanitizeHeadingTextForTemplate(title) }
  }

  /** Kurze fett markierte Zeilen: Kapitel wenn noch keine, sonst Unterkapitel. */
  const boldOnly = rawLine.trim().match(/^\*\*([^*]+)\*\*\s*$/)
  if (boldOnly?.[1] && boldOnly[1].length <= 120) {
    const lv: HeadingLevel = lastHeadingLevel >= 1 ? 2 : 1
    return { type: 'heading', level: lv, text: sanitizeHeadingTextForTemplate(boldOnly[1].trim()) }
  }

  // Absatz/Bullet: Originaltext (inkl. `**fett**`-Inline) erhalten — `line` ist nur für die
  // Überschriften-Erkennung bold-bereinigt; der Renderer wertet Inline-Fett im Fliesstext aus.
  return { type: 'paragraph', text: rawLine.trim() }
}

/**
 * Paragraphen mit eingebetteten Zeilenumbrüchen («Kapitel 1: …» in einem Block)
 * in echte heading/paragraph-Blöcke zerlegen — damit Word-Formatvorlagen greifen.
 */
export function refineWordOutlineBlocksForExport(
  blocks: WordOutlineV1['blocks'],
): WordOutlineV1['blocks'] {
  const out: WordOutlineV1['blocks'] = []
  let lastHeadingLevel = 0
  for (const b of blocks) {
    if (b.type === 'table' || b.type === 'list') {
      out.push(b)
      continue
    }
    if (b.type === 'heading') {
      pushSanitizedHeading(out, b.level, b.text)
      lastHeadingLevel = b.level
      continue
    }
    const chunks = b.text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (chunks.length === 0) {
      continue
    }
    for (const chunk of chunks) {
      const kapitelSplit = chunk.match(/^(Kapitel\s+\d+\s*[:：.\-–—]\s*[^.!?]{3,80})([.!?].+)$/i)
      if (kapitelSplit?.[1] && kapitelSplit[2]) {
        pushSanitizedHeading(out, 1, kapitelSplit[1].trim())
        lastHeadingLevel = 1
        out.push({ type: 'paragraph', text: kapitelSplit[2].trim() })
        continue
      }
      const classified = classifyPlainLineToBlock(chunk, lastHeadingLevel)
      if (classified) {
        out.push(classified)
        if (classified.type === 'heading') {
          lastHeadingLevel = classified.level
        }
      }
    }
  }
  return out.length > 0 ? out : blocks
}

export function tryHeuristicWordOutlineFromPlainText(text: string): WordOutlineV1 | null {
  const fromConvention = tryParseWordMarkdownConvention(text)
  if (fromConvention) {
    return fromConvention
  }

  const withoutFences = text.replace(/```[\s\S]*?```/g, '\n')
  const lines = withoutFences
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return null
  }

  const blocks: WordOutlineV1['blocks'] = []

  for (const rawLine of lines) {
    const classified = classifyPlainLineToBlock(rawLine)
    if (classified) {
      blocks.push(classified)
    }
  }

  if (blocks.length === 0) {
    return null
  }

  return {
    version: 1,
    blocks: expandWordOutlineTables(blocks),
  }
}

/**
 * Wenn die KI nur mit «Überschrift 2» beginnt (ohne H1), eine Ebene anheben — Word-H1/H2 passt dann zur Erwartung.
 */
export function normalizeHeadingLevelsForWord(outline: WordOutlineV1): WordOutlineV1 {
  const headingLevels = outline.blocks
    .filter((b): b is { type: 'heading'; level: HeadingLevel; text: string } => b.type === 'heading')
    .map((b) => b.level)
  if (headingLevels.length === 0) {
    return outline
  }
  const minLv = Math.min(...headingLevels)
  if (minLv >= 2) {
    const delta = minLv - 1
    return {
      ...outline,
      blocks: outline.blocks.map((b) =>
        b.type === 'heading'
          ? { ...b, level: Math.max(1, Math.min(6, b.level - delta)) as HeadingLevel }
          : b,
      ),
    }
  }
  return outline
}

/** Aufzählungszeichen am Zeilenanfang: «- », «• », «* », «‣ », «▪ », «· » → ungeordnetes Listenelement. */
const UNORDERED_BULLET_RE = /^[-•*‣▪·–]\s+(.+)$/
/** «1. » / «1) » → geordnetes Listenelement (nur als Listenkontext, Kapitelnummern sind hier schon Überschriften). */
const ORDERED_BULLET_RE = /^\d+[.)]\s+(.+)$/

type BulletItem = { ordered: boolean; text: string }

function matchBullet(text: string): BulletItem | null {
  const t = text.trim()
  const u = t.match(UNORDERED_BULLET_RE)
  if (u?.[1]) {
    return { ordered: false, text: u[1].trim() }
  }
  const o = t.match(ORDERED_BULLET_RE)
  if (o?.[1]) {
    return { ordered: true, text: o[1].trim() }
  }
  return null
}

/**
 * Aufeinanderfolgende Bullet-Absätze («- …» / «• …») zu **einem** `list`-Block bündeln (statt N
 * Einzel-Absätze) — Voraussetzung für echte Word-Listen mit Aufzählungszeichen und hängendem Einzug.
 * Ein Lauf bricht, sobald sich geordnet↔ungeordnet ändert oder ein Nicht-Bullet-Block kommt.
 */
function coalesceListBlocks(blocks: WordOutlineV1['blocks']): WordOutlineV1['blocks'] {
  const out: WordOutlineV1['blocks'] = []
  let buf: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (buf && buf.items.length > 0) {
      // Einzelnes Bullet bleibt ein normaler Absatz (keine „Liste" mit nur einem Punkt).
      if (buf.items.length === 1) {
        out.push({ type: 'paragraph', text: buf.items[0]! })
      } else {
        out.push({ type: 'list', ordered: buf.ordered, items: buf.items })
      }
    }
    buf = null
  }
  for (const block of blocks) {
    if (block.type !== 'paragraph') {
      flush()
      out.push(block)
      continue
    }
    const bullet = matchBullet(block.text)
    if (!bullet) {
      flush()
      out.push(block)
      continue
    }
    if (buf && buf.ordered !== bullet.ordered) {
      flush()
    }
    if (!buf) {
      buf = { ordered: bullet.ordered, items: [] }
    }
    buf.items.push(bullet.text)
  }
  flush()
  return out
}

/** Kurzes Doppelpunkt-Label («Kernpunkte:») direkt vor einer Liste → echte Unterüberschrift (H3). */
function promoteLabelParagraphsToSubheadings(
  blocks: WordOutlineV1['blocks'],
): WordOutlineV1['blocks'] {
  return blocks.map((block, i) => {
    if (block.type !== 'paragraph') {
      return block
    }
    const t = block.text.trim()
    const next = blocks[i + 1]
    const followedByList = next?.type === 'list' || next?.type === 'table'
    const looksLikeLabel =
      t.length > 0 &&
      t.length <= 64 &&
      /[:：]$/.test(t) &&
      !/[.!?]/.test(t.slice(0, -1)) // kein vollständiger Satz davor
    if (followedByList && looksLikeLabel) {
      return { type: 'heading', level: 3, text: t.replace(/[:：]\s*$/, '').trim() }
    }
    return block
  })
}

function outlineForExport(outline: WordOutlineV1): WordOutlineV1 {
  const refined = refineWordOutlineBlocksForExport(outline.blocks)
  const withTables = coalesceMarkdownTablesAcrossBlocks(refined)
  const withLists = coalesceListBlocks(withTables)
  const blocks = promoteLabelParagraphsToSubheadings(withLists)
  // Titel wird in `extractWordOutlineFromAssistantContent` separat aufgelöst (eigene Titelzeile/Banner).
  return normalizeHeadingLevelsForWord({ ...outline, title: undefined, blocks })
}

/**
 * Nur die **letzte** Assistenten-Nachricht zählt — nicht der gesamte Thread-Verlauf.
 * Sonst hält ein alter Word/PDF-Spec-Block aus einer früheren Antwort den Finalize-Button
 * für spätere, unabhängige Chat-Antworten künstlich am Leben.
 */
/** Einleitungs-Geplauder der KI vor dem ersten Kapitel («Hier ist eine Gliederung für …:»). */
function isLikelyIntroChatter(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length === 0 || t.length > 200) {
    return false
  }
  return (
    /[:：]\s*$/.test(t) ||
    /^(hier ist|hier sind|gerne|klar|natürlich|sehr gerne|im folgenden|nachfolgend|nachstehend|anbei|untenstehend|folgend)/.test(t) ||
    t.includes('kapitelstruktur') ||
    t.includes('folgende struktur') ||
    t.includes('professionelle struktur')
  )
}

/** Abschluss-Meta-Frage der KI («Soll ich das als Word-Datei für dich exportieren?»). */
function isExportMetaQuestion(text: string): boolean {
  const t = text.trim()
  const lower = t.toLowerCase()
  const startsTrigger = /^(soll ich|möchtest du|willst du|wünschst du|brauchst du|kann ich|sag mir|lass mich wissen)/.test(lower)
  const exportMention = /(als|ins?)\s+(word|pdf|docx|datei)|exportier|herunterladen|generier|word-datei|pdf-datei/.test(lower)
  return (t.endsWith('?') && (startsTrigger || exportMention)) || (startsTrigger && exportMention)
}

/**
 * Reine KI-Chat-Sätze aus dem Dokument entfernen: führendes Einleitungs-Geplauder **vor** dem ersten
 * Kapitel und abschliessende Export-Rückfragen am Ende. Die .docx/PDF und die Vorschau enthalten so nur
 * den verlangten Inhalt, nicht die Meta-Sätze der KI.
 */
/** Markdown-Trennlinie («---», «***», «___») — Struktur-Rauschen, kein Dokumentinhalt. */
function isHorizontalRuleParagraph(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  return /^[-*_]{3,}$/.test(compact)
}

function stripChatterBlocks(outline: WordOutlineV1): WordOutlineV1 {
  // Trennlinien überall entfernen (die KI setzt «---» zwischen Kapiteln).
  const blocks = outline.blocks.filter(
    (b) => !(b.type === 'paragraph' && isHorizontalRuleParagraph(b.text)),
  )
  // Führendes Einleitungs-Geplauder (nur wenn danach noch eine Überschrift kommt → echtes Dokument).
  while (
    blocks.length > 0 &&
    blocks[0]!.type === 'paragraph' &&
    isLikelyIntroChatter((blocks[0] as { text: string }).text) &&
    blocks.slice(1).some((b) => b.type === 'heading')
  ) {
    blocks.shift()
  }
  // Abschliessende Export-Rückfrage(n).
  while (
    blocks.length > 0 &&
    blocks[blocks.length - 1]!.type === 'paragraph' &&
    isExportMetaQuestion((blocks[blocks.length - 1] as { text: string }).text)
  ) {
    blocks.pop()
  }
  return blocks.length > 0 ? { ...outline, blocks } : outline
}

/**
 * Export-fertiges Outline aus **einer** Assistenten-Nachricht — gleiche Pipeline wie
 * {@link extractWordOutlineFromThread}, aber für eine bestimmte Nachricht (z. B. die Chat-Vorschau-Karte,
 * die nicht nur die letzte Nachricht betrachtet). So ist die Karten-/Modal-Vorschau identisch zum Export.
 */
/**
 * Führende **Dokument-Titelzeile** (einfaches `# Titel` oder `**Titel**`) — der vom Modell gelieferte
 * Dokumenttitel fürs Titelblatt und die Kopfzeile. Nur ein einzelnes `#` zählt (nicht `#####` der
 * Word-Konvention), damit ein erstes Kapitel nicht fälschlich als Titel verschluckt wird.
 */
/** Titel ohne Bindestrich-Trenner: «A – B» / «A - B» → Titel «A», Rest als Untertitel; Strich-Reste entfernen. */
function sanitizeCoverTitle(raw: string): { title: string; subtitleFromDash: string | null } {
  let t = raw.trim().replace(/^["«»“”']+|["«»“”']+$/g, '').trim()
  let subtitleFromDash: string | null = null
  const dashSplit = t.split(/\s+[–—-]\s+/)
  if (dashSplit.length >= 2) {
    t = (dashSplit[0] ?? '').trim()
    subtitleFromDash = dashSplit.slice(1).join(' ').trim() || null
  }
  // verbliebene führende/abschliessende Bindestriche entfernen
  t = t.replace(/^[–—-]+\s*/u, '').replace(/\s*[–—-]+$/u, '').trim()
  return { title: t, subtitleFromDash }
}

export function extractLeadingDocumentTitleLine(content: string): {
  title: string | null
  subtitle: string | null
  body: string
} {
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length && !lines[i]?.trim()) {
    i++
  }
  if (i >= lines.length) {
    return { title: null, subtitle: null, body: content }
  }
  const first = lines[i]!.trim()
  const hash = first.match(/^#(?!#)\s+(.+)$/)
  const bold = first.match(/^\*\*([^*]+)\*\*\s*$/)
  const rawTitle = (hash?.[1] ?? bold?.[1] ?? '').trim()
  if (!rawTitle) {
    return { title: null, subtitle: null, body: content }
  }
  // Optionale Untertitelzeile: nächste nicht-leere Zeile als «## Untertitel» (genau zwei `#`).
  let consumedUpto = i + 1
  let explicitSubtitle: string | null = null
  let j = i + 1
  while (j < lines.length && !lines[j]?.trim()) {
    j++
  }
  const subMatch = j < lines.length ? lines[j]!.trim().match(/^##(?!#)\s+(.+)$/) : null
  if (subMatch?.[1]) {
    explicitSubtitle = subMatch[1].trim()
    consumedUpto = j + 1
  }
  const { title, subtitleFromDash } = sanitizeCoverTitle(rawTitle)
  const subtitle = explicitSubtitle || subtitleFromDash
  const body = [...lines.slice(0, i), ...lines.slice(consumedUpto)].join('\n').replace(/^\n+/u, '')
  return { title: title || null, subtitle: subtitle || null, body }
}

/** Heutiges Datum in Schweizer Langform («29. Juni 2026») — einmal gesetzt, damit Vorschau = .docx. */
function germanDocumentDate(): string {
  return new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(),
  )
}

export function extractWordOutlineFromAssistantContent(
  content: string,
  kind: 'word' | 'pdf' = 'word',
): WordOutlineV1 | null {
  // Eigene Titelzeile (vom Modell) zuerst herauslösen, damit sie nicht im Dokumentkörper landet.
  const {
    title: explicitTitle,
    subtitle: explicitSubtitle,
    body: contentWithoutTitle,
  } = extractLeadingDocumentTitleLine(content)
  const source = assistantContentForWordOutlineExtraction(contentWithoutTitle)
  const parsed = parseWordOutlineFromAssistantContent(source, kind)
  const base = parsed
    ? stripChatterBlocks(outlineForExport(parsed))
    : (() => {
        const heuristic = tryHeuristicWordOutlineFromPlainText(source)
        return heuristic ? stripChatterBlocks(outlineForExport(heuristic)) : null
      })()
  if (!base) {
    return null
  }
  // Titel: explizite Titelzeile → Banner (nur ausserhalb der ####-Konvention) → keiner.
  const bannerFallback = usesStratonWordMarkdownConvention(content)
    ? null
    : extractLeadingBannerTitleFromOutlineText(content).bannerTitle
  const title = (explicitTitle || base.title || bannerFallback || '').trim()
  if (!title) {
    return base
  }
  // Titelblatt nur bei PDF/Word-Vorschau relevant; Datum/Untertitel nur setzen, wenn ein Titel existiert.
  return {
    ...base,
    title,
    subtitle: explicitSubtitle || base.subtitle || undefined,
    date: kind === 'word' ? germanDocumentDate() : base.date,
  }
}

export function extractWordOutlineFromThread(
  messages: ChatMessage[],
  kind: 'word' | 'pdf' = 'word',
): WordOutlineV1 | null {
  const m = messages[messages.length - 1]
  if (!m || m.role !== 'assistant') {
    return null
  }
  return extractWordOutlineFromAssistantContent(m.content, kind)
}

function findLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return messages[i]
    }
  }
  return undefined
}

/** Word-Datei noch nicht erzeugt, aber Vorschau parsebar und /Word wurde für **diese** Antwort genutzt. */
export function canFinalizeWordExportFromThread(messages: ChatMessage[]): boolean {
  if (messages.length < 2) {
    return false
  }
  const last = messages[messages.length - 1]
  if (last?.role !== 'assistant' || last.metadata?.wordExport) {
    return false
  }
  if (last.metadata?.liveStream) {
    return false
  }
  const lastUser = findLastUserMessage(messages)
  if (!lastUser?.metadata?.userWordCommand && !lastUser?.metadata?.userPdfCommand) {
    return false
  }
  return extractWordOutlineFromThread(messages, 'word') !== null
}
