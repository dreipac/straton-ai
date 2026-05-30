import type { ChatMessage, WordOutlineV1 } from '../types'
import { expandWordOutlineTables, parseWordOutlineTableBlock } from './wordOutlineTables'

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
  if (/```(?:json)?/i.test(t)) {
    return true
  }
  if (t.startsWith('{') && /"version"\s*:\s*1/.test(t) && /"blocks"\s*:/.test(t)) {
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

export function resolveWordOutlinePresentation(content: string): {
  outline: WordOutlineV1
  before: string
  after: string
} | null {
  return splitContentAroundFirstWordOutlineFence(content) ?? tryParseBareWordOutlineFromContent(content)
}

/** Letzter ```json-Block im Text (KI-Antwort). */
export function parseWordOutlineFromAssistantContent(content: string): WordOutlineV1 | null {
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
      blocks.push({ type: 'heading', level: 2, text: m[1].trim() })
      continue
    }
    m = trimmed.match(RE_WORD_H1)
    if (m?.[1]) {
      flushIntro()
      blocks.push({ type: 'heading', level: 1, text: m[1].trim() })
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
 * «##» zählt wie Hauptteil (H1), «###» wie Unterkapitel (H2), usw.
 */
function markdownHashesToOutlineLevel(hashCount: number): HeadingLevel {
  if (hashCount <= 2) {
    return 1
  }
  return Math.min(6, hashCount - 1) as HeadingLevel
}

function tryMarkdownHeadingLine(line: string): HeadingLevel | null {
  const m = line.match(/^(#{1,6})\s+(.+)$/)
  if (!m) {
    return null
  }
  const hashes = m[1]!.length
  return markdownHashesToOutlineLevel(hashes)
}

/** «1.1 Titel» / «2.3.1 Detail» als Unterkapitel (H2 / H3). */
function tryDecimalSubsectionHeadingLine(line: string): HeadingLevel | null {
  const t = line.trim()
  if (t.length > 200) {
    return null
  }
  const three = t.match(/^(\d+)\.(\d+)\.(\d+)\s+(\S.*)$/)
  if (three) {
    return 3
  }
  const two = t.match(/^(\d+)\.(\d+)\s+(\S.*)$/)
  if (two) {
    return 2
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

  /**
   * «Kapitel 1» / «Kapitel 1: Titel» / «Chapter 2» — viele KI-Texte nutzen keine Doppelpunkte.
   */
  const kapitelWithSepRe = /^Kapitel\s+(\d+)\s*[:：.\-–—]\s*(.*)$/i
  const kapitelStandaloneRe = /^Kapitel\s+(\d+)\s*$/i
  const chapterWithSepRe = /^Chapter\s+(\d+)\s*[:：.\-–—]\s*(.*)$/i
  const chapterStandaloneRe = /^Chapter\s+(\d+)\s*$/i

  function stripBoldMarkers(s: string): string {
    return s
      .replace(/\*\*/g, '')
      .replace(/^\*+\s*/, '')
      .replace(/\s*\*+$/, '')
      .trim()
  }

  for (const rawLine of lines) {
    const line = stripBoldMarkers(rawLine)
    if (!line) {
      continue
    }

    if (isLikelyAssistantClosingBlurb(line)) {
      continue
    }

    const mdLevel = tryMarkdownHeadingLine(line)
    if (mdLevel !== null) {
      const textOnly = line.replace(/^#{1,6}\s+/, '').trim()
      blocks.push({
        type: 'heading',
        level: mdLevel,
        text: textOnly || line,
      })
      continue
    }

    const subLv = tryDecimalSubsectionHeadingLine(line)
    if (subLv !== null) {
      blocks.push({
        type: 'heading',
        level: subLv,
        text: line,
      })
      continue
    }

    const { rest } = stripLeadingOrderedListMarker(line)
    const isChapterHeading =
      kapitelWithSepRe.test(rest) ||
      kapitelStandaloneRe.test(rest) ||
      chapterWithSepRe.test(rest) ||
      chapterStandaloneRe.test(rest)

    if (isChapterHeading) {
      blocks.push({
        type: 'heading',
        level: 1,
        text: line,
      })
      continue
    }

    if (trySectionKeywordHeadingLine(rest)) {
      blocks.push({
        type: 'heading',
        level: 1,
        text: line,
      })
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
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

function outlineForExport(stripTitle: WordOutlineV1): WordOutlineV1 {
  const { title: _d, ...rest } = stripTitle
  return normalizeHeadingLevelsForWord({ ...rest, title: undefined })
}

export function extractWordOutlineFromThread(messages: ChatMessage[]): WordOutlineV1 | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (!m || m.role !== 'assistant') {
      continue
    }
    const source = assistantContentForWordOutlineExtraction(m.content)
    const parsed = parseWordOutlineFromAssistantContent(source)
    if (parsed) {
      return outlineForExport(parsed)
    }
    const heuristic = tryHeuristicWordOutlineFromPlainText(source)
    if (heuristic) {
      return outlineForExport(heuristic)
    }
  }
  return null
}

/** Word-Datei noch nicht erzeugt, aber Vorschau parsebar und /Word wurde im Thread genutzt. */
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
  if (!messages.some((m) => m.role === 'user' && m.metadata?.userWordCommand === true)) {
    return false
  }
  return extractWordOutlineFromThread(messages) !== null
}
