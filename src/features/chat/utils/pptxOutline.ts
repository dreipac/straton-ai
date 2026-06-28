import type { ChatMessage } from '../types'
import {
  PPTX_ALIGN_KEYS,
  PPTX_BOOL_ATTR_VALUE,
  PPTX_HTML_END,
  PPTX_HTML_START,
  PPTX_PATCH_END,
  PPTX_PATCH_START,
  PPTX_PRESET_KEYS,
  PPTX_RADIUS_KEYS,
  PPTX_SIZE_KEYS,
  PPTX_SLIDE_LAYOUTS,
  PPTX_THEME_KEYS,
  PPTX_VALIGN_KEYS,
  type PptxPresetKey,
  type PptxSlideLayout,
  type PptxThemeKey,
  type PptxValignKey,
} from '../constants/pptxExportPrompt'

const PPTX_DEFAULT_THEME: PptxThemeKey = 'blue'

export type PptxSlide = {
  layout: PptxSlideLayout
  /** Sanitiertes Inner-HTML der Folie (nur Whitelist-Tags) — direkt für `srcDoc` geeignet. */
  html: string
  /**
   * Akzentfarben-Palette der gesamten Präsentation (vom Wrapper-`data-theme` übernommen) — bei
   * NEUEN, Preset-basierten Decks nur noch ein defensiver Fallback-Wert (siehe `preset`), bei
   * ALTEN Decks (vor diesem Feature) weiterhin die einzige Design-Quelle.
   */
  theme: PptxThemeKey
  /**
   * Nutzer-gewähltes Design (Preset-Modal vor der Generierung) — sobald gesetzt, ist DAS die
   * massgebliche Design-Quelle (`buildPptxSlideThemeCss`/Python-Renderer lesen `preset` zuerst,
   * `theme` nur als Fallback für Code-Pfade, die `preset` noch nicht kennen). Fehlt `preset`
   * (alte, vor diesem Feature erzeugte Präsentationen), gilt weiterhin das alte KI-gewählte
   * `theme`-System unverändert — keine Migration.
   */
  preset?: PptxPresetKey
  /** `data-valign` direkt vom `<section>`-Tag (nur bei `title`/`section` wirksam) — vertikale Position des Titels/Trenners. */
  valign?: PptxValignKey
}

export type PptxPresentationV1 = {
  slides: PptxSlide[]
}

/** Zeilenumbrüche / unsichtbare Zeichen vereinheitlichen (Marker sonst nicht gefunden). */
export function normalizeContentForPptxHtml(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
}

export function hasPptxHtmlMarkers(content: string): boolean {
  const n = normalizeContentForPptxHtml(content)
  if (n.includes(PPTX_HTML_START) && n.includes(PPTX_HTML_END)) {
    return true
  }
  return /```html\s*[\s\S]*?<section[^>]*class=["'][^"']*\bslide\b/i.test(n)
}

/**
 * Solange der End-Marker/das schliessende ``` noch nicht gestreamt ist, NICHT unverändert
 * zurückgeben (sonst sieht man kurz den rohen `<<<STRATON_PPTX_HTML>>>`-Block + Teil-HTML) —
 * stattdessen ab dem Start-Marker/Fence ausblenden, bis der Block vollständig ist.
 */
export function stripPptxHtmlBlock(content: string): string {
  const normalized = normalizeContentForPptxHtml(content)
  const i = normalized.indexOf(PPTX_HTML_START)
  if (i !== -1) {
    const j = normalized.indexOf(PPTX_HTML_END)
    if (j === -1) {
      return normalized.slice(0, i).trimEnd()
    }
    if (j > i) {
      return `${normalized.slice(0, i).trimEnd()}\n\n${normalized.slice(j + PPTX_HTML_END.length).trimStart()}`.trim()
    }
  }
  const fenceMatch = /```html\s*([\s\S]*?)```/i.exec(normalized)
  if (fenceMatch && /<section[^>]*class=["'][^"']*\bslide\b/i.test(fenceMatch[1] ?? '')) {
    return `${normalized.slice(0, fenceMatch.index).trimEnd()}\n\n${normalized
      .slice(fenceMatch.index + fenceMatch[0].length)
      .trimStart()}`.trim()
  }
  const openFenceMatch = /```html\s*([\s\S]*)$/i.exec(normalized)
  if (openFenceMatch && /<section[^>]*data-layout=/i.test(openFenceMatch[1] ?? '')) {
    return normalized.slice(0, openFenceMatch.index).trimEnd()
  }
  return content
}

const ALLOWED_SLIDE_TAGS = new Set([
  'h1',
  'h2',
  'subtitle',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'stats',
  'stat',
  'statvalue',
  'statlabel',
  'columns',
  'column',
  'agenda',
  'agendaitem',
  'agendanum',
  'agendatitle',
  'callout',
  'boxes',
  'box',
  'boxtitle',
  'boxtext',
  'icon',
])

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const TEXT_STYLE_TAGS = ['h1', 'h2', 'subtitle', 'p', 'li', 'boxtitle', 'boxtext', 'statvalue', 'statlabel', 'agendatitle']
const BOOL_ATTR_VALUES: readonly string[] = [PPTX_BOOL_ATTR_VALUE]

/**
 * Pro Tag NUR diese Attributnamen mit NUR diesen Werten — alles andere wird verworfen (siehe
 * `sanitizeSlideNode`). Ersetzt die vorherige Blanko-Regel "alle Attribute weg" durch ein eng
 * gefasstes Default-Deny: jeder erlaubte Wert ist ein kurzes, selbst definiertes Wort aus einer
 * geschlossenen Liste (siehe `pptxExportPrompt.ts`, `PPTX_DESIGN_ATTRIBUTE_RULES`) — kein Hex, kein
 * Pixel-Wert, keine Anführungszeichen/Klammern möglich, daher strukturell injection-sicher.
 */
const ALLOWED_ELEMENT_STYLE_ATTRS: Record<string, Record<string, readonly string[]>> = {}
for (const tag of TEXT_STYLE_TAGS) {
  ALLOWED_ELEMENT_STYLE_ATTRS[tag] = {
    'data-textcolor': PPTX_THEME_KEYS,
    'data-size': PPTX_SIZE_KEYS,
    'data-bold': BOOL_ATTR_VALUES,
    'data-italic': BOOL_ATTR_VALUES,
    'data-underline': BOOL_ATTR_VALUES,
    'data-align': PPTX_ALIGN_KEYS,
  }
}
for (const tag of ['box', 'stat', 'column']) {
  ALLOWED_ELEMENT_STYLE_ATTRS[tag] = {
    'data-color': PPTX_THEME_KEYS,
    'data-radius': PPTX_RADIUS_KEYS,
    'data-align': PPTX_ALIGN_KEYS,
    'data-valign': PPTX_VALIGN_KEYS,
  }
}
for (const tag of ['callout', 'agendaitem']) {
  ALLOWED_ELEMENT_STYLE_ATTRS[tag] = {
    'data-color': PPTX_THEME_KEYS,
    'data-radius': PPTX_RADIUS_KEYS,
    'data-align': PPTX_ALIGN_KEYS,
  }
}
/** `<h1>` einer `title`-Folie darf zusätzlich als farbige Box dargestellt werden (siehe `buildPptxElementStyleOverrideCss`) — auf `section`s `<h1>` ohne Wirkung (eigene feste Box). */
ALLOWED_ELEMENT_STYLE_ATTRS.h1 = {
  ...ALLOWED_ELEMENT_STYLE_ATTRS.h1,
  'data-color': PPTX_THEME_KEYS,
  'data-radius': PPTX_RADIUS_KEYS,
}
for (const tag of ['stats', 'boxes', 'agenda', 'columns']) {
  ALLOWED_ELEMENT_STYLE_ATTRS[tag] = { 'data-valign': PPTX_VALIGN_KEYS }
}

/** Nur Whitelist-Tags, optional mit eng begrenzten Design-Attributen — verhindert Style/Script/Event-Handler im Folien-HTML. */
function sanitizeSlideNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtmlText(node.textContent ?? '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const innerHtml = Array.from(el.childNodes).map(sanitizeSlideNode).join('')
  if (!ALLOWED_SLIDE_TAGS.has(tag)) {
    return innerHtml
  }
  const allowedAttrs = ALLOWED_ELEMENT_STYLE_ATTRS[tag]
  let attrsHtml = ''
  if (allowedAttrs) {
    for (const [name, allowedValues] of Object.entries(allowedAttrs)) {
      const value = el.getAttribute(name)
      if (value && allowedValues.includes(value)) {
        attrsHtml += ` ${name}="${value}"`
      }
    }
  }
  return `<${tag}${attrsHtml}>${innerHtml}</${tag}>`
}

function isPptxSlideLayout(value: string): value is PptxSlideLayout {
  return (PPTX_SLIDE_LAYOUTS as readonly string[]).includes(value)
}

function isPptxThemeKey(value: string): value is PptxThemeKey {
  return (PPTX_THEME_KEYS as readonly string[]).includes(value)
}

function isPptxPresetKey(value: string): value is PptxPresetKey {
  return (PPTX_PRESET_KEYS as readonly string[]).includes(value)
}

function isPptxValignKey(value: string): value is PptxValignKey {
  return (PPTX_VALIGN_KEYS as readonly string[]).includes(value)
}

/**
 * Defensiver Fallback-Wert für das alte `theme`-Feld bei NEUEN, Preset-basierten Decks — rein für
 * Code-Pfade, die (noch) nur `theme` statt `preset` lesen (z.B. die Element-Override-CSS, die den
 * `PptxThemeKey`-Typ teilt). Bewusst KEINE Aufweichung der `theme`-Pflichtprüfung beim Reload
 * (`chat.persistence.ts`) — stattdessen wird `theme` auf neuen Decks immer mitgeschrieben.
 */
export const PPTX_PRESET_LEGACY_THEME_FALLBACK: Record<PptxPresetKey, PptxThemeKey> = {
  tech: 'teal',
  soft: 'pink',
  professional: 'slate',
  bold: 'orange',
  minimal: 'slate',
}

/** `<div data-theme="…"><section class="slide" data-layout="…">…</section>…</div>` → sanitierte Folien-Liste. */
export function parsePptxSlidesFromHtmlFragment(htmlFragment: string): PptxSlide[] {
  if (typeof DOMParser === 'undefined') {
    return []
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${htmlFragment}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return []
  }
  const themeRaw = (root.querySelector('[data-theme]')?.getAttribute('data-theme') ?? '').trim().toLowerCase()
  const preset = isPptxPresetKey(themeRaw) ? themeRaw : undefined
  const theme = preset
    ? PPTX_PRESET_LEGACY_THEME_FALLBACK[preset]
    : isPptxThemeKey(themeRaw)
      ? themeRaw
      : PPTX_DEFAULT_THEME
  const sections = Array.from(root.querySelectorAll('section'))
  const slides: PptxSlide[] = []
  for (const section of sections) {
    const layoutRaw = (section.getAttribute('data-layout') ?? '').trim().toLowerCase()
    const layout = isPptxSlideLayout(layoutRaw) ? layoutRaw : 'content'
    const html = Array.from(section.childNodes).map(sanitizeSlideNode).join('').trim()
    if (!html) {
      continue
    }
    const valignRaw = (section.getAttribute('data-valign') ?? '').trim().toLowerCase()
    const valign = isPptxValignKey(valignRaw) ? valignRaw : undefined
    slides.push({ layout, html, theme, ...(preset ? { preset } : {}), ...(valign ? { valign } : {}) })
  }
  return slides
}

function tryParsePptxHtmlFragmentFromInner(inner: string): PptxPresentationV1 | null {
  const slides = parsePptxSlidesFromHtmlFragment(inner)
  if (slides.length === 0) {
    return null
  }
  return { slides }
}

/**
 * Erster gültiger HTML-Foliensatz im Content — Marker zuerst, danach ```html```-Fence
 * (gleiche Doppel-Strategie wie der Word-Outline-Parser).
 */
export function resolvePptxPresentationFromContent(content: string): {
  presentation: PptxPresentationV1
  before: string
  after: string
} | null {
  const normalized = normalizeContentForPptxHtml(content)

  const i = normalized.indexOf(PPTX_HTML_START)
  const j = normalized.indexOf(PPTX_HTML_END)
  if (i !== -1 && j !== -1 && j > i) {
    const inner = normalized.slice(i + PPTX_HTML_START.length, j).trim()
    const presentation = tryParsePptxHtmlFragmentFromInner(inner)
    if (presentation) {
      return {
        presentation,
        before: normalized.slice(0, i).trimEnd(),
        after: normalized.slice(j + PPTX_HTML_END.length).trimStart(),
      }
    }
  }

  const re = /```html\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
    const inner = match[1]?.trim()
    if (!inner) {
      continue
    }
    const presentation = tryParsePptxHtmlFragmentFromInner(inner)
    if (!presentation) {
      continue
    }
    const start = match.index
    const end = start + match[0].length
    return {
      presentation,
      before: normalized.slice(0, start).trimEnd(),
      after: normalized.slice(end).trimStart(),
    }
  }

  return null
}

export function parsePptxSlidesFromAssistantContent(content: string): PptxSlide[] {
  return resolvePptxPresentationFromContent(content)?.presentation.slides ?? []
}

export type PptxPatchOperation =
  | { type: 'theme'; theme: PptxThemeKey }
  | { type: 'replace'; index: number; slide: PptxSlide }
  | { type: 'insert-after'; index: number; slide: PptxSlide }
  | { type: 'insert-before'; index: number; slide: PptxSlide }
  | { type: 'delete'; index: number }

export function hasPptxPatchMarkers(content: string): boolean {
  const n = normalizeContentForPptxHtml(content)
  return n.includes(PPTX_PATCH_START) && n.includes(PPTX_PATCH_END)
}

/** Analog zu `stripPptxHtmlBlock` — blendet den rohen Patch-Block aus der sichtbaren Chat-Antwort aus. */
export function stripPptxPatchBlock(content: string): string {
  const normalized = normalizeContentForPptxHtml(content)
  const i = normalized.indexOf(PPTX_PATCH_START)
  if (i === -1) {
    return content
  }
  const j = normalized.indexOf(PPTX_PATCH_END)
  if (j === -1) {
    return normalized.slice(0, i).trimEnd()
  }
  if (j > i) {
    return `${normalized.slice(0, i).trimEnd()}\n\n${normalized.slice(j + PPTX_PATCH_END.length).trimStart()}`.trim()
  }
  return content
}

const PPTX_PATCH_OP_LINE_RE = /^\[\[(THEME|REPLACE|INSERT_AFTER|INSERT_BEFORE|DELETE):([^\]]+)\]\]$/

/** Einzelnes `<section>…</section>`-Fragment (Patch-Operation) sanitiert in eine `PptxSlide` parsen. */
function parsePatchSlideFragment(html: string, fallbackTheme: PptxThemeKey): PptxSlide | null {
  const slides = parsePptxSlidesFromHtmlFragment(html)
  if (slides.length === 0) {
    return null
  }
  return { ...slides[0], theme: fallbackTheme }
}

/** `<<<STRATON_PPTX_PATCH>>>…<<<END_STRATON_PPTX_PATCH>>>` → Liste von Operationen (fehlerhafte Operationen werden übersprungen, nicht die ganze Antwort verworfen). */
export function parsePptxPatchFromContent(
  content: string,
  fallbackTheme: PptxThemeKey = PPTX_DEFAULT_THEME,
): PptxPatchOperation[] | null {
  const normalized = normalizeContentForPptxHtml(content)
  const i = normalized.indexOf(PPTX_PATCH_START)
  const j = normalized.indexOf(PPTX_PATCH_END)
  if (i === -1 || j === -1 || j <= i) {
    return null
  }
  const inner = normalized.slice(i + PPTX_PATCH_START.length, j).trim()
  if (!inner) {
    return null
  }
  const lines = inner.split('\n')
  const operations: PptxPatchOperation[] = []
  let pendingOp: { kind: 'REPLACE' | 'INSERT_AFTER' | 'INSERT_BEFORE'; index: number } | null = null
  let pendingHtml: string[] = []

  const flushPending = () => {
    if (!pendingOp) {
      return
    }
    const slide = parsePatchSlideFragment(pendingHtml.join('\n'), fallbackTheme)
    if (slide) {
      const index = pendingOp.index
      if (pendingOp.kind === 'REPLACE') {
        operations.push({ type: 'replace', index, slide })
      } else if (pendingOp.kind === 'INSERT_AFTER') {
        operations.push({ type: 'insert-after', index, slide })
      } else {
        operations.push({ type: 'insert-before', index, slide })
      }
    }
    pendingOp = null
    pendingHtml = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const match = PPTX_PATCH_OP_LINE_RE.exec(line)
    if (!match) {
      if (pendingOp) {
        pendingHtml.push(rawLine)
      }
      continue
    }
    flushPending()
    const [, kind, arg] = match
    if (kind === 'THEME') {
      const themeRaw = arg.trim().toLowerCase()
      if (isPptxThemeKey(themeRaw)) {
        operations.push({ type: 'theme', theme: themeRaw })
      }
      continue
    }
    const index = Number.parseInt(arg.trim(), 10)
    if (!Number.isFinite(index) || index < 0) {
      continue
    }
    if (kind === 'DELETE') {
      operations.push({ type: 'delete', index })
      continue
    }
    if (kind === 'REPLACE' || kind === 'INSERT_AFTER' || kind === 'INSERT_BEFORE') {
      pendingOp = { kind, index }
      pendingHtml = []
    }
  }
  flushPending()

  return operations.length > 0 ? operations : null
}

/** Wendet eine Patch-Operationsliste auf den aktuellen Foliensatz an — reine Funktion, keine Server-Abhängigkeit. */
export function applyPptxPatchToSlides(
  currentSlides: PptxSlide[],
  operations: PptxPatchOperation[],
): PptxSlide[] {
  let theme: PptxThemeKey | null = null
  const deletes = new Set<number>()
  const replacements = new Map<number, PptxSlide>()
  const insertsAfter = new Map<number, PptxSlide[]>()
  const insertsBefore = new Map<number, PptxSlide[]>()

  for (const op of operations) {
    if (op.type === 'theme') {
      theme = op.theme
    } else if (op.type === 'delete') {
      deletes.add(op.index)
    } else if (op.type === 'replace') {
      replacements.set(op.index, op.slide)
    } else if (op.type === 'insert-after') {
      insertsAfter.set(op.index, [...(insertsAfter.get(op.index) ?? []), op.slide])
    } else {
      insertsBefore.set(op.index, [...(insertsBefore.get(op.index) ?? []), op.slide])
    }
  }

  const body: PptxSlide[] = []
  currentSlides.forEach((slide, arrIndex) => {
    const oneBased = arrIndex + 1
    const before = insertsBefore.get(oneBased)
    if (before) {
      body.push(...before)
    }
    if (!deletes.has(oneBased)) {
      body.push(replacements.get(oneBased) ?? slide)
    }
    const after = insertsAfter.get(oneBased)
    if (after) {
      body.push(...after)
    }
  })

  const headInserts = insertsAfter.get(0)
  const result = headInserts ? [...headInserts, ...body] : body
  if (result.length === 0) {
    return currentSlides
  }
  return theme ? result.map((slide) => ({ ...slide, theme: theme as PptxThemeKey })) : result
}

/**
 * Text-only-Patch — Pendant zu `PptxPatchOperation` für NEUE (Preset-basierte) Decks: erlaubt
 * NUR Text ändern/hinzufügen/entfernen, nie Design/Layout/Theme/Foliengliederung (siehe
 * `PPTX_EDIT_CHAT_HINT_TEXT_ONLY`). `slideIndex`/`occurrence`/`item` sind 1-basiert, wie beim
 * bestehenden Patch-System.
 */
export type PptxTextPatchOperation =
  | { type: 'set-text'; slideIndex: number; tag: string; occurrence: number; text: string }
  | { type: 'add-item'; slideIndex: number; container: string; containerOccurrence: number; itemHtml: string }
  | { type: 'delete-item'; slideIndex: number; container: string; containerOccurrence: number; itemOccurrence: number }

const PPTX_TEXT_PATCH_ALLOWED_TAGS = new Set([
  'h1', 'h2', 'subtitle', 'p', 'li', 'statvalue', 'statlabel', 'boxtitle', 'boxtext', 'agendatitle', 'agendanum', 'td', 'th',
])
const PPTX_TEXT_PATCH_ALLOWED_CONTAINERS = new Set(['ul', 'ol', 'stats', 'boxes', 'agenda'])
/** Item-Tag je Container — für `add-item`-Validierung (Element muss diesem Tag entsprechen) und `delete-item` (welche Kinder zählen). */
const PPTX_TEXT_PATCH_ITEM_TAG_FOR_CONTAINER: Record<string, string> = {
  ul: 'li',
  ol: 'li',
  stats: 'stat',
  boxes: 'box',
  agenda: 'agendaitem',
}

const PPTX_TEXT_PATCH_OP_LINE_RE = /^\[\[(SET_TEXT|ADD_ITEM|DELETE_ITEM)\s+([^\]]+)\]\]$/

function parsePptxTextPatchArgs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)=(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = m[2]
  }
  return out
}

/** `<<<STRATON_PPTX_PATCH>>>…<<<END_STRATON_PPTX_PATCH>>>` (Text-only-Syntax) → Liste von Operationen. */
export function parsePptxTextPatchFromContent(content: string): PptxTextPatchOperation[] | null {
  const normalized = normalizeContentForPptxHtml(content)
  const i = normalized.indexOf(PPTX_PATCH_START)
  const j = normalized.indexOf(PPTX_PATCH_END)
  if (i === -1 || j === -1 || j <= i) {
    return null
  }
  const inner = normalized.slice(i + PPTX_PATCH_START.length, j).trim()
  if (!inner) {
    return null
  }
  const lines = inner.split('\n')
  const operations: PptxTextPatchOperation[] = []
  let pending: { kind: 'SET_TEXT' | 'ADD_ITEM'; args: Record<string, string> } | null = null
  let pendingLines: string[] = []

  const flushPending = () => {
    if (!pending) {
      return
    }
    const text = pendingLines.join('\n').trim()
    const slideIndex = Number.parseInt(pending.args.slide ?? '', 10)
    if (Number.isFinite(slideIndex) && slideIndex > 0 && text) {
      if (pending.kind === 'SET_TEXT') {
        const tag = (pending.args.tag ?? '').toLowerCase()
        const occurrence = Number.parseInt(pending.args.occurrence ?? '1', 10) || 1
        if (PPTX_TEXT_PATCH_ALLOWED_TAGS.has(tag)) {
          operations.push({ type: 'set-text', slideIndex, tag, occurrence, text })
        }
      } else {
        const container = (pending.args.container ?? '').toLowerCase()
        const containerOccurrence = Number.parseInt(pending.args.occurrence ?? '1', 10) || 1
        if (PPTX_TEXT_PATCH_ALLOWED_CONTAINERS.has(container)) {
          operations.push({ type: 'add-item', slideIndex, container, containerOccurrence, itemHtml: text })
        }
      }
    }
    pending = null
    pendingLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const match = PPTX_TEXT_PATCH_OP_LINE_RE.exec(line)
    if (!match) {
      if (pending) {
        pendingLines.push(rawLine)
      }
      continue
    }
    flushPending()
    const [, kind, argsRaw] = match
    const args = parsePptxTextPatchArgs(argsRaw)
    if (kind === 'DELETE_ITEM') {
      const slideIndex = Number.parseInt(args.slide ?? '', 10)
      const container = (args.container ?? '').toLowerCase()
      const itemOccurrence = Number.parseInt(args.item ?? '', 10)
      const containerOccurrence = Number.parseInt(args.occurrence ?? '1', 10) || 1
      if (
        Number.isFinite(slideIndex) &&
        slideIndex > 0 &&
        PPTX_TEXT_PATCH_ALLOWED_CONTAINERS.has(container) &&
        Number.isFinite(itemOccurrence) &&
        itemOccurrence > 0
      ) {
        operations.push({ type: 'delete-item', slideIndex, container, containerOccurrence, itemOccurrence })
      }
      continue
    }
    pending = { kind: kind as 'SET_TEXT' | 'ADD_ITEM', args }
    pendingLines = []
  }
  flushPending()

  return operations.length > 0 ? operations : null
}

/** Wie `parsePptxSlidesFromHtmlFragment`, aber liefert das Root-Element statt der fertigen `PptxSlide[]` — für die Item-Sanitierung in `applyPptxTextOnlyPatchToSlides`. */
function parseFragmentRootElement(html: string): Element | null {
  if (typeof DOMParser === 'undefined') {
    return null
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  return doc.getElementById('root')
}

/**
 * Wendet eine Text-only-Patch-Operationsliste auf den aktuellen Foliensatz an (NEUE,
 * Preset-basierte Decks) — reine Funktion, keine Server-Abhängigkeit. Jede Operation parst die
 * betroffene Folien-HTML neu (DOMParser auf bereits sanitiertem Inhalt — inert, führt keine
 * Skripte aus), mutiert NUR Text/Kind-Elemente und serialisiert anschliessend wieder durch den
 * bestehenden `sanitizeSlideNode`-Filter (Verteidigung gegen ein die Anweisung ignorierendes
 * Modell bleibt bestehen). `set-text` nutzt `textContent` (kein `innerHTML`) — Design/Struktur
 * können dadurch strukturell gar nicht eingeschleust werden.
 */
export function applyPptxTextOnlyPatchToSlides(
  currentSlides: PptxSlide[],
  operations: ReadonlyArray<PptxTextPatchOperation>,
): PptxSlide[] {
  if (typeof DOMParser === 'undefined') {
    return currentSlides
  }
  const slides = currentSlides.map((s) => ({ ...s }))
  for (const op of operations) {
    const slide = slides[op.slideIndex - 1]
    if (!slide) {
      continue
    }
    const root = parseFragmentRootElement(slide.html)
    if (!root) {
      continue
    }
    if (op.type === 'set-text') {
      const targets = Array.from(root.querySelectorAll(op.tag))
      const target = targets[op.occurrence - 1]
      if (target) {
        target.textContent = op.text
      }
    } else if (op.type === 'add-item') {
      const containers = Array.from(root.querySelectorAll(op.container))
      const container = containers[op.containerOccurrence - 1]
      const itemTag = PPTX_TEXT_PATCH_ITEM_TAG_FOR_CONTAINER[op.container]
      const fragRoot = parseFragmentRootElement(op.itemHtml)
      const sanitizedItemHtml = fragRoot
        ? Array.from(fragRoot.childNodes).map(sanitizeSlideNode).join('').trim()
        : ''
      if (container && itemTag && sanitizedItemHtml.startsWith(`<${itemTag}`)) {
        container.insertAdjacentHTML('beforeend', sanitizedItemHtml)
      }
    } else {
      const containers = Array.from(root.querySelectorAll(op.container))
      const container = containers[op.containerOccurrence - 1]
      const itemTag = PPTX_TEXT_PATCH_ITEM_TAG_FOR_CONTAINER[op.container]
      if (container && itemTag) {
        const items = Array.from(container.children).filter(
          (c) => c.tagName.toLowerCase() === itemTag,
        )
        items[op.itemOccurrence - 1]?.remove()
      }
    }
    slide.html = Array.from(root.childNodes).map(sanitizeSlideNode).join('').trim()
  }
  return slides
}

/** Nummerierter Foliensatz als Turn-Kontext für die Editier-Box — das Modell referenziert Folien per Nummer in seinem Patch. */
export function buildPptxEditContextBlock(slides: PptxSlide[]): string {
  const theme = slides[0]?.theme ?? PPTX_DEFAULT_THEME
  const lines = [
    `Aktuelle Präsentation (Theme: ${theme}, ${slides.length} ${slides.length === 1 ? 'Folie' : 'Folien'}) — du bearbeitest diese, gib NUR einen Patch-Block zurück:`,
  ]
  slides.forEach((slide, i) => {
    lines.push(`--- Folie ${i + 1} (${slide.layout}) ---`)
    lines.push(slide.html)
  })
  return lines.join('\n')
}

function unescapeSanitizedSlideText(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Titel-Text für Folien-Übersicht (Karte/Inhaltsverzeichnis) — `<h1>`/`<h2>` der Folie ohne Tags. */
export function extractPptxSlideTitle(slide: PptxSlide): string {
  const headingMatch = /<h[12]>([\s\S]*?)<\/h[12]>/i.exec(slide.html)
  const source = headingMatch?.[1] ?? slide.html
  const text = unescapeSanitizedSlideText(
    source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  )
  if (text.length <= 80) {
    return text
  }
  return `${text.slice(0, 79).trimEnd()}…`
}

/** Sanitierte Folien zurück in das kanonische `<div data-theme>`/`<section>`-HTML serialisieren — für den PPTX-Export-Aufruf (gleiches Format wie vom Modell geliefert, siehe `pptxExportPrompt.ts`). */
export function buildPptxExportHtml(slides: PptxSlide[]): string {
  /** Preset (neue Decks) hat Vorrang vor `theme` — reist im selben `data-theme`-Attribut, daher
   * keine Schema-Änderung am Python-Renderer/Edge-Function-Passthrough nötig. */
  const themeOrPreset = slides[0]?.preset ?? slides[0]?.theme ?? PPTX_DEFAULT_THEME
  const sectionsHtml = slides
    .map((slide) => `<section class="slide" data-layout="${slide.layout}">${slide.html}</section>`)
    .join('')
  return `<div data-theme="${themeOrPreset}">${sectionsHtml}</div>`
}

/**
 * Editier-Turns (`metadata.pptxEditAnchorMessageId` gesetzt) sind aus dem normalen Chatverlauf
 * ausgeblendet (siehe `ChatMessageList.tsx`) — für Karte/Export/Finalize-Button zählt deshalb NICHT
 * die literal letzte Nachricht im Thread, sondern die letzte SICHTBARE Präsentations-Nachricht
 * (der Anker). Findet zusätzlich die direkt vorangehende User-Nachricht (für die `/PowerPoint`-Prüfung).
 */
function findLastVisiblePptxAssistantMessage(
  messages: ChatMessage[],
): { message: ChatMessage; precedingUser?: ChatMessage } | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'assistant' || message.metadata?.pptxEditAnchorMessageId) {
      continue
    }
    let precedingUser: ChatMessage | undefined
    for (let j = i - 1; j >= 0; j -= 1) {
      if (messages[j].role === 'user') {
        precedingUser = messages[j]
        break
      }
    }
    return { message, precedingUser }
  }
  return undefined
}

/**
 * Aktueller Folien-Stand einer Präsentation — durchsucht alle Editier-Turns dieses Ankers
 * (`pptxEditAnchorMessageId === anchorMessageId`) nach dem ZULETZT aufgelösten Stand; nur wenn es
 * noch keine Edits gibt, fällt es auf die Ursprungs-Nachricht selbst zurück (Export-Snapshot →
 * `pptxSlides` → Live-Parse, siehe Kommentar bei `ChatMessagePptxExport.slides`). `hasEdits` zeigt
 * an, ob seit einem eventuell vorhandenen `pptxExport` der Anker-Nachricht bereits editiert wurde —
 * ein "alter" Export gilt dann als veraltet (siehe `canFinalizePptxExportFromThread`).
 */
export function resolvePptxPresentationState(
  messages: ChatMessage[],
  anchorMessageId: string,
): { slides: PptxSlide[]; hasEdits: boolean } | null {
  let latestEditSlides: PptxSlide[] | null = null
  let hasEdits = false
  for (const message of messages) {
    if (message.role !== 'assistant' || message.metadata?.pptxEditAnchorMessageId !== anchorMessageId) {
      continue
    }
    hasEdits = true
    const slides =
      message.metadata?.pptxSlides && message.metadata.pptxSlides.length > 0
        ? message.metadata.pptxSlides
        : parsePptxSlidesFromAssistantContent(message.content)
    if (slides.length > 0) {
      latestEditSlides = slides
    }
  }
  if (latestEditSlides) {
    return { slides: latestEditSlides, hasEdits: true }
  }
  const anchor = messages.find((m) => m.id === anchorMessageId)
  if (!anchor) {
    return null
  }
  const anchorSlides =
    anchor.metadata?.pptxExport?.slides && anchor.metadata.pptxExport.slides.length > 0
      ? anchor.metadata.pptxExport.slides
      : anchor.metadata?.pptxSlides && anchor.metadata.pptxSlides.length > 0
        ? anchor.metadata.pptxSlides
        : parsePptxSlidesFromAssistantContent(anchor.content)
  return anchorSlides.length > 0 ? { slides: anchorSlides, hasEdits } : null
}

/** PowerPoint noch nicht erzeugt (oder seit dem Export bereits editiert), aber Vorschau parsebar und /PowerPoint wurde für **diese** Präsentation genutzt. */
export function canFinalizePptxExportFromThread(messages: ChatMessage[]): boolean {
  if (messages.length < 2) {
    return false
  }
  const found = findLastVisiblePptxAssistantMessage(messages)
  if (!found) {
    return false
  }
  const { message: last, precedingUser } = found
  if (last.metadata?.liveStream) {
    return false
  }
  if (precedingUser?.metadata?.userPptxCommand !== true) {
    return false
  }
  const state = resolvePptxPresentationState(messages, last.id)
  if (!state || state.slides.length === 0) {
    return false
  }
  if (last.metadata?.pptxExport && !state.hasEdits) {
    return false
  }
  return true
}

/**
 * Folien der aktuellen Präsentation — für den finalen PPTX-Export-Aufruf. Siehe
 * `resolvePptxPresentationState`: berücksichtigt bereits erfolgte Edits, nicht nur die
 * Ursprungs-Nachricht.
 */
export function extractPptxSlidesFromThread(messages: ChatMessage[]): PptxSlide[] | null {
  const found = findLastVisiblePptxAssistantMessage(messages)
  if (!found) {
    return null
  }
  const state = resolvePptxPresentationState(messages, found.message.id)
  return state && state.slides.length > 0 ? state.slides : null
}

/** Für `finalizePptxDocumentExport` (useChat.ts) — Nachricht, auf die der Export-Pointer geschrieben wird (immer der Anker, nie ein versteckter Editier-Turn). */
export function findPptxExportTargetMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return findLastVisiblePptxAssistantMessage(messages)?.message
}

/**
 * Festes Theme (16:9, 1280×720) — Farbe/Schrift/Layout-Maße kommen ausschliesslich von hier,
 * nicht vom Modell-HTML (siehe Design-Entscheidung im Plan: ein gemeinsames Theme für
 * Vorschau und späteren python-pptx-Export, `Inches(13.333)`×`Inches(7.5)` serverseitig).
 */
export const PPTX_SLIDE_NATIVE_WIDTH = 1280
export const PPTX_SLIDE_NATIVE_HEIGHT = 720

type PptxThemePalette = {
  /** Akzentfarbe auf weissem Grund — h2-Farbe, Bullet-Marker, Tabellen-/Box-Akzente. */
  accent: string
  /** Helle Akzent-Variante für dunklen Grund (title-Gradient). */
  accentOnDark: string
  gradientFrom: string
  gradientTo: string
  /** 3 harmonische Töne für zyklische Mehrfarbigkeit (z.B. `boxes`-Karten) — vom Renderer durchgewechselt, nicht von der KI frei gewählt. */
  boxColors: readonly [string, string, string]
}

/**
 * 5 kuratierte Paletten (siehe `PPTX_THEME_KEYS`) — die KI wählt eine davon passend zum Thema.
 * Kein freies Hex vom Modell, damit jede Kombination garantiert gut aussieht.
 */
const PPTX_THEME_PALETTES: Record<PptxThemeKey, PptxThemePalette> = {
  blue: {
    accent: '#1d4ed8',
    accentOnDark: '#bfdbfe',
    gradientFrom: '#0f172a',
    gradientTo: '#1e3a8a',
    boxColors: ['#1d4ed8', '#0ea5e9', '#4f46e5'],
  },
  green: {
    accent: '#15803d',
    accentOnDark: '#bbf7d0',
    gradientFrom: '#052e1f',
    gradientTo: '#15803d',
    boxColors: ['#15803d', '#0d9488', '#65a30d'],
  },
  violet: {
    accent: '#7c3aed',
    accentOnDark: '#ddd6fe',
    gradientFrom: '#2e1065',
    gradientTo: '#6d28d9',
    boxColors: ['#7c3aed', '#c026d3', '#4338ca'],
  },
  orange: {
    accent: '#c2410c',
    accentOnDark: '#fed7aa',
    gradientFrom: '#431407',
    gradientTo: '#c2410c',
    boxColors: ['#c2410c', '#d97706', '#be123c'],
  },
  slate: {
    accent: '#334155',
    accentOnDark: '#cbd5e1',
    gradientFrom: '#0f172a',
    gradientTo: '#334155',
    boxColors: ['#334155', '#0f766e', '#b45309'],
  },
  red: {
    accent: '#b91c1c',
    accentOnDark: '#fecaca',
    gradientFrom: '#450a0a',
    gradientTo: '#b91c1c',
    boxColors: ['#b91c1c', '#ea580c', '#db2777'],
  },
  pink: {
    accent: '#be185d',
    accentOnDark: '#fbcfe8',
    gradientFrom: '#500724',
    gradientTo: '#be185d',
    boxColors: ['#be185d', '#c026d3', '#e11d48'],
  },
  teal: {
    accent: '#0f766e',
    accentOnDark: '#99f6e4',
    gradientFrom: '#042f2e',
    gradientTo: '#0f766e',
    boxColors: ['#0f766e', '#0891b2', '#059669'],
  },
  amber: {
    accent: '#b45309',
    accentOnDark: '#fde68a',
    gradientFrom: '#451a03',
    gradientTo: '#b45309',
    boxColors: ['#b45309', '#ca8a04', '#c2410c'],
  },
  indigo: {
    accent: '#4338ca',
    accentOnDark: '#c7d2fe',
    gradientFrom: '#1e1b4b',
    gradientTo: '#4338ca',
    boxColors: ['#4338ca', '#4f46e5', '#6366f1'],
  },
}

const PPTX_SANS_FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
const PPTX_ROUNDED_FONT_STACK = "'Segoe UI Rounded','SF Pro Rounded','Segoe UI',sans-serif"
const PPTX_SERIF_FONT_STACK = "Georgia,Cambria,'Times New Roman',serif"

/**
 * Ein Preset ist ein eigenständiges, kuratiertes Design (Farbe + Typografie + Eckenstil +
 * Titel-Behandlung) — keine reine Farbvariante wie die 10 `PPTX_THEME_KEYS`. Der NUTZER wählt
 * eines über das Preset-Modal vor der Generierung; die KI wählt hier nichts mehr selbst.
 */
export type PptxPresetSpec = PptxThemePalette & {
  /** Schrift-Stack für `h1`/`h2` — Fliesstext bleibt immer die Sans-Schrift (Lesbarkeit bei Listen/Tabellen). */
  headingFontFamily: string
  /** Skaliert alle Eckenradien (Karten/Boxen/Badges) relativ zu den bisherigen Festwerten (1 = unverändert). */
  cornerScale: number
  /** Skaliert Innenabstände/Lücken relativ zu den bisherigen Festwerten (1 = unverändert). */
  densityScale: number
  /** `gradient-cover`: dunkler Grossflächen-Verlauf + helle Schrift (bisheriges Titel-Aussehen). `editorial-light`: heller Hintergrund + dunkle Schrift, kein Verlauf/Deko-Kreis. */
  titleTreatment: 'gradient-cover' | 'editorial-light'
  /** Marken-Akzent-Rand am linken Folienrand (alle Layouts ausser Titelfolie) — manche Presets wirken bewusst ruhiger ohne ihn. */
  accentSpine: boolean
  /**
   * Deko-Element der Titelfolie bei `gradient-cover` (ohne Wirkung bei `editorial-light`):
   * `circle` — bisheriger schlichter, einzelner Kreis. `blob` — organische, glasige Tropfenform mit
   * hellem Rand-Glanzlicht (Tech-Preset, an ein Referenzbild angelehnt). Fehlt das Feld → `circle`.
   */
  decorationStyle?: 'circle' | 'blob'
  /**
   * `dark`: das GESAMTE Deck (alle Layouts, nicht nur die Titelfolie) ist dunkel — heller Text,
   * dunkel-transluzente Karten, Teal-Akzente und Deko-Muster (Punktraster/Dot-Wave/Glow-Ring).
   * Nur das Tech-Preset nutzt das. Fehlt das Feld → `light` (bisheriges Verhalten: nur die Titelfolie
   * dunkel, alle anderen Layouts weiss). Strikt gegated, damit die übrigen Presets unverändert bleiben.
   */
  surface?: 'light' | 'dark'
}

/** Exportiert für das Preset-Auswahl-Modal (`PptxPresetPickerModal.tsx`) — Mini-Vorschau pro Karte aus denselben Werten wie das echte Rendering, keine zweite Farbquelle. */
export const PPTX_PRESET_SPECS: Record<PptxPresetKey, PptxPresetSpec> = {
  tech: {
    /** Werte 1:1 aus dem Referenzbild gepixelt (Logo-Punkt/Überschrift ≈ rgb(0,195,198), Tropfen-Glanzlicht ≈ rgb(21,157,179), Hintergrund ≈ rgb(6,12,28)). */
    accent: '#06c2c2',
    accentOnDark: '#7eecec',
    gradientFrom: '#05070d',
    gradientTo: '#0a1626',
    boxColors: ['#06c2c2', '#0891b2', '#0e7490'],
    headingFontFamily: PPTX_SANS_FONT_STACK,
    cornerScale: 0.7,
    densityScale: 0.9,
    titleTreatment: 'gradient-cover',
    accentSpine: true,
    decorationStyle: 'blob',
    surface: 'dark',
  },
  soft: {
    accent: '#ec4899',
    accentOnDark: '#fbcfe8',
    gradientFrom: '#fdf2f8',
    gradientTo: '#ede9fe',
    boxColors: ['#ec4899', '#f472b6', '#a78bfa'],
    headingFontFamily: PPTX_ROUNDED_FONT_STACK,
    cornerScale: 1.5,
    densityScale: 1.2,
    titleTreatment: 'editorial-light',
    accentSpine: false,
  },
  professional: {
    accent: '#1e3a5f',
    accentOnDark: '#cbd5e1',
    gradientFrom: '#0b1220',
    gradientTo: '#1e3a5f',
    boxColors: ['#1e3a5f', '#334155', '#475569'],
    headingFontFamily: PPTX_SANS_FONT_STACK,
    cornerScale: 0.7,
    densityScale: 1,
    titleTreatment: 'gradient-cover',
    accentSpine: true,
  },
  bold: {
    accent: '#f97316',
    accentOnDark: '#fed7aa',
    gradientFrom: '#1a0b2e',
    gradientTo: '#be185d',
    boxColors: ['#f97316', '#db2777', '#7c3aed'],
    headingFontFamily: PPTX_SANS_FONT_STACK,
    cornerScale: 1.15,
    densityScale: 0.9,
    titleTreatment: 'gradient-cover',
    accentSpine: true,
  },
  minimal: {
    accent: '#111827',
    accentOnDark: '#9ca3af',
    gradientFrom: '#f8fafc',
    gradientTo: '#f1f5f9',
    boxColors: ['#111827', '#374151', '#6b7280'],
    headingFontFamily: PPTX_SERIF_FONT_STACK,
    cornerScale: 0.4,
    densityScale: 1.35,
    titleTreatment: 'editorial-light',
    accentSpine: false,
  },
}

/** Design-Spec für ein altes, reines `theme`-Deck — identisch zu den bisherigen Festwerten (Bestandsschutz). */
const PPTX_LEGACY_THEME_DESIGN_DEFAULTS = {
  headingFontFamily: PPTX_SANS_FONT_STACK,
  cornerScale: 1,
  densityScale: 1,
  titleTreatment: 'gradient-cover' as const,
  accentSpine: true,
}

/** Liest `preset` zuerst (neue Decks), fällt sonst auf das alte `theme`-System zurück (alte Decks, unverändert). */
function resolvePptxSlideDesign(slide: Pick<PptxSlide, 'theme' | 'preset'>): PptxPresetSpec {
  if (slide.preset) {
    return PPTX_PRESET_SPECS[slide.preset]
  }
  return { ...PPTX_THEME_PALETTES[slide.theme], ...PPTX_LEGACY_THEME_DESIGN_DEFAULTS }
}

/**
 * CSS-Regeln für die `data-*`-Design-Attribute (siehe `ALLOWED_ELEMENT_STYLE_ATTRS`) — unabhängig
 * vom Deck-Theme der jeweiligen Folie, daher einmalig statt pro `theme` generiert. `data-size`
 * nutzt eine CSS-Variable (`--fsm`), weil `em`/`rem` sich auf die VERERBTE Schriftgrösse bezieht,
 * nicht auf die eigene `font-size`-Deklaration des Tags — `calc(var(--fs) * var(--fsm,1))` ist der
 * einzige Weg, "Standardgrösse des Tags × Faktor" ohne eine feste px-Matrix pro Tag/Stufe zu bauen.
 */
function buildPptxElementStyleOverrideCss(): string {
  const rules: string[] = []
  for (const value of PPTX_SIZE_KEYS) {
    if (value === 'md') {
      continue
    }
    const factor = value === 'sm' ? 0.75 : value === 'lg' ? 1.3 : 1.6
    rules.push(`[data-size="${value}"]{--fsm:${factor};}`)
  }
  rules.push('[data-bold="true"]{font-weight:700;}')
  rules.push('[data-italic="true"]{font-style:italic;}')
  rules.push('[data-underline="true"]{text-decoration:underline;}')
  for (const value of PPTX_ALIGN_KEYS) {
    rules.push(`[data-align="${value}"]{text-align:${value};}`)
  }
  for (const value of PPTX_RADIUS_KEYS) {
    const px = value === 'none' ? '0' : value === 'sm' ? '8px' : value === 'md' ? '14px' : value === 'lg' ? '22px' : '999px'
    rules.push(`[data-radius="${value}"]{border-radius:${px};}`)
  }
  const cardValignSelector = (value: string) =>
    ['box', 'stat', 'column'].map((tag) => `${tag}[data-valign="${value}"]`).join(',')
  rules.push(`${cardValignSelector('middle')}{justify-content:center;}`)
  rules.push(`${cardValignSelector('bottom')}{justify-content:flex-end;}`)
  const groupValignSelector = (value: string) =>
    ['stats', 'boxes', 'agenda', 'columns'].map((tag) => `${tag}[data-valign="${value}"]`).join(',')
  rules.push(`${groupValignSelector('middle')}{margin-top:auto;margin-bottom:auto;}`)
  rules.push(`${groupValignSelector('bottom')}{margin-top:auto;}`)
  // `data-valign` direkt auf `<section>` (→ `<body data-valign>`) — nur bei `title`/`section` wirksam,
  // `middle` ist dort bereits der Standard (siehe Basis-Regel `body[data-layout="title"],...{justify-content:center}`).
  const slideValignSelector = (value: string) =>
    ['title', 'section'].map((layout) => `body[data-layout="${layout}"][data-valign="${value}"]`).join(',')
  rules.push(`${slideValignSelector('top')}{justify-content:flex-start;}`)
  rules.push(`${slideValignSelector('bottom')}{justify-content:flex-end;}`)
  for (const theme of PPTX_THEME_KEYS) {
    const hex = PPTX_THEME_PALETTES[theme].accent
    const textcolorSelector = TEXT_STYLE_TAGS.map((tag) => `${tag}[data-textcolor="${theme}"]`).join(',')
    rules.push(`${textcolorSelector}{color:${hex};}`)
    const solidColorSelector = ['box', 'callout'].map((tag) => `${tag}[data-color="${theme}"]`).join(',')
    rules.push(`${solidColorSelector}{background:${hex};}`)
    rules.push(`stat[data-color="${theme}"]{background:color-mix(in srgb,${hex} 10%,white);}`)
    rules.push(`column[data-color="${theme}"]{background:color-mix(in srgb,${hex} 6%,white);}`)
    rules.push(`agendaitem[data-color="${theme}"]{background:color-mix(in srgb,${hex} 5%,white);}`)
    rules.push(`stat[data-color="${theme}"] statvalue{color:${hex};}`)
    // `<h1>` einer `title`-Folie mit `data-color` → Titel+Untertitel als farbige Box statt freiem Text
    // (gleiches Muster wie `section`s fest-akzentuierter Titel, nur mit wählbarer Override-Farbe).
    rules.push(
      `body[data-layout="title"] h1[data-color="${theme}"]{background:${hex};color:#ffffff;padding:28px 36px;display:inline-block;border-bottom:none;}`,
    )
  }
  return rules.join('')
}

const PPTX_ELEMENT_STYLE_OVERRIDE_CSS = buildPptxElementStyleOverrideCss()

/** Theme-CSS für den sandboxed `<iframe>` — Farben aus der Palette, Struktur/Schrift fest. */
/** Rundet auf ganze px — vermeidet Sub-Pixel-Werte in generiertem CSS. */
function scalePx(base: number, scale: number): string {
  return `${Math.round(base * scale)}px`
}

/**
 * Deko-Platzierungen für das dunkle Tech-Deck — ein Dot-Band pro Folie, dessen Position über den
 * Folien-Index rotiert (kein Muster bleibt „immer gleich"). `variant = Folien-Index % LÄNGE`; der
 * Index ist der gemeinsame Schlüssel zwischen Preview (`buildPptxSlideSrcDoc`) und Export (`app.py`,
 * `DOT_BAND_PLACEMENTS`), damit beide für dieselbe Folie dieselbe Position zeigen.
 * `vertical` kippt das Band hochkant (Mask entsprechend gedreht).
 */
const PPTX_DARK_BAND_PLACEMENTS: ReadonlyArray<{ pos: string; w: number; h: number; vertical?: boolean }> = [
  { pos: 'right:56px;bottom:50px', w: 430, h: 80 },
  { pos: 'right:64px;top:38px', w: 330, h: 70 },
  { pos: 'right:34px;top:150px', w: 80, h: 360, vertical: true },
  { pos: 'left:56px;bottom:46px', w: 360, h: 80 },
  { pos: 'left:380px;bottom:38px', w: 430, h: 80 },
  { pos: 'left:40px;top:150px', w: 80, h: 340, vertical: true },
]

/** Theme-CSS für den sandboxed `<iframe>` — Farben/Typografie/Eckenstil aus `design`, Struktur fest.
 * `variant` (Folien-Index) steuert nur die Deko-Position des dunklen Decks; sonst ohne Wirkung. */
function buildPptxSlideThemeCss(design: PptxPresetSpec, variant = 0): string {
  const p = design
  const r = (base: number) => scalePx(base, p.cornerScale)
  const d = (base: number) => scalePx(base, p.densityScale)
  const isLightTitle = p.titleTreatment === 'editorial-light'
  // Dunkles Tech-Deck: jede Folie dunkel (nicht nur Titel), heller Text, dunkel-transluzente
  // Karten, Teal-Akzente, Deko-Muster. Pendant zur `dark`-Verzweigung im Python-Renderer (`app.py`).
  const isDark = p.surface === 'dark'
  const bodyBg = isDark ? `linear-gradient(135deg,${p.gradientFrom},${p.gradientTo})` : '#ffffff'
  const bodyText = isDark ? '#f8fafc' : '#0f172a'
  // Überschriften/Akzente: auf Dunkel die helle Teal-Variante, sonst der normale Akzent.
  const headAccent = isDark ? p.accentOnDark : p.accent
  const mutedText = isDark ? '#94a3b8' : '#475569'
  // Karten-/Band-/Rahmenfarbe: hell = bisheriges `color-mix(accent X%, white)`; dunkel = einheitlich
  // wenig Akzent in den dunklen Grund gemischt (deckt sich mit `dark_card_fill` in app.py).
  const card = (lightPct: number) =>
    isDark ? `color-mix(in srgb,${p.accent} 12%,${p.gradientTo})` : `color-mix(in srgb,${p.accent} ${lightPct}%,white)`
  const band = isDark ? `color-mix(in srgb,${p.accent} 7%,${p.gradientTo})` : `color-mix(in srgb,${p.accent} 6%,white)`
  const cellBorder = isDark ? `color-mix(in srgb,${p.accentOnDark} 18%,transparent)` : '#cbd5e1'
  return [
    '*{box-sizing:border-box;}',
    'html,body{margin:0;padding:0;}',
    `body{width:${PPTX_SLIDE_NATIVE_WIDTH}px;height:${PPTX_SLIDE_NATIVE_HEIGHT}px;overflow:hidden;display:flex;flex-direction:column;`,
    `position:relative;padding:${d(72)} ${d(96)};background:${bodyBg};color:${bodyText};`,
    `font-family:${PPTX_SANS_FONT_STACK};}`,
    // Titel/Trenner bleiben vertikal zentriert — alle anderen Layouts ordnen Titel oben,
    // Inhalt darunter an (Flexbox-Default `flex-start`, kein expliziter Wert nötig).
    'body[data-layout="title"],body[data-layout="section"]{justify-content:center;}',
    // Section bekommt seine flache Akzent-Box horizontal zentriert (statt volle Breite/stretch).
    'body[data-layout="section"]{align-items:center;}',
    // Marken-Akzent am linken Rand — nur die Titelfolie hat keinen (sie hat ihren eigenen
    // grossflächigen Akzent-Hintergrund); manche Presets (z.B. Soft/Minimal) verzichten bewusst
    // auch auf den restlichen Layouts darauf. Das dunkle Deck verzichtet ebenfalls darauf und nutzt
    // stattdessen Deko-Muster (siehe unten) — ein Vollflächen-Streifen würde dort fehl wirken.
    ...(p.accentSpine && !isDark
      ? [
          'body:not([data-layout="title"])::before{',
          `content:"";position:absolute;left:0;top:0;width:8px;height:100%;background:${p.accent};}`,
        ]
      : []),
    // Dunkles Deck — EIN Dot-Band pro Inhalts-Folie, Position rotiert über den Folien-Index
    // (Pendant zu `add_dot_band` + `DOT_BAND_PLACEMENTS` in app.py). Kein Muster bleibt „immer gleich".
    ...(isDark
      ? (() => {
          const b = PPTX_DARK_BAND_PLACEMENTS[variant % PPTX_DARK_BAND_PLACEMENTS.length]
          const maskAngle = b.vertical ? '180deg' : '90deg'
          return [
            'body:not([data-layout="title"])::after{content:"";position:absolute;z-index:0;',
            `${b.pos};width:${b.w}px;height:${b.h}px;opacity:0.7;`,
            `background-image:radial-gradient(circle,${p.accentOnDark} 1.5px,transparent 2px);background-size:16px 16px;`,
            `-webkit-mask:linear-gradient(${maskAngle},transparent,#000 26%,#000 74%,transparent);`,
            `mask:linear-gradient(${maskAngle},transparent,#000 26%,#000 74%,transparent);}`,
          ]
        })()
      : []),
    // Titelfolie: entweder dunkler Gradient-Cover-Look (Tech/Professional/Bold) oder heller,
    // "editorial" Look ohne Verlauf/Deko-Kreis (Soft/Minimal) — siehe `titleTreatment`.
    isLightTitle
      ? `body[data-layout="title"]{background:linear-gradient(135deg,${p.gradientFrom},${p.gradientTo});color:#0f172a;}`
      : `body[data-layout="title"]{background:linear-gradient(135deg,${p.gradientFrom},${p.gradientTo});color:#f8fafc;}`,
    ...(isLightTitle
      ? []
      : p.decorationStyle === 'blob'
        ? [
            // Tech-Preset: organische, glasige Tropfenform mit hellem Rand-Glanzlicht statt eines
            // schlichten Kreises — zwei Tropfen (gross unten rechts, klein separat darüber), an ein
            // Referenzbild angelehnt (Logo-Punkt/Glanzlicht-Farbe ≈ `accentOnDark`/`accent`).
            'body[data-layout="title"]::after{content:"";position:absolute;width:460px;height:460px;',
            'border-radius:62% 38% 55% 45% / 48% 60% 40% 52%;right:-90px;bottom:-130px;',
            `background:radial-gradient(circle at 32% 28%,${p.accentOnDark},${p.accent} 42%,color-mix(in srgb,${p.accent} 35%,${p.gradientTo}) 100%);z-index:0;}`,
            'body[data-layout="title"]::before{content:"";position:absolute;width:130px;height:130px;',
            'border-radius:55% 45% 60% 40% / 50% 58% 42% 50%;right:170px;top:80px;',
            `background:radial-gradient(circle at 35% 30%,${p.accentOnDark},${p.accent} 50%,color-mix(in srgb,${p.accent} 35%,${p.gradientTo}) 100%);z-index:0;}`,
          ]
        : [
            'body[data-layout="title"]::after{content:"";position:absolute;width:420px;height:420px;border-radius:50%;',
            `right:-120px;bottom:-120px;background:color-mix(in srgb,${p.accentOnDark} 30%,${p.gradientTo});z-index:0;}`,
          ]),
    // `border-radius` hier (statt in der `[data-color]`-Regel oben) gesetzt, damit die generische
    // `[data-radius="…"]`-Regel (niedrigere Spezifität als ein scoped `body[data-layout]`-Selektor)
    // einen individuellen Wert weiterhin überschreiben kann — ohne Hintergrund unsichtbar, harmlos.
    `h1{--fs:56px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:800;margin:0 0 16px;line-height:1.15;border-radius:${r(18)};font-family:${p.headingFontFamily};}`,
    // Titel: schmalere, linksbündige Box statt voller Breite — Editorial-Look statt Plain-Text-Block.
    'body[data-layout="title"] h1,body[data-layout="title"] subtitle{max-width:720px;align-self:flex-start;position:relative;z-index:1;}',
    'body[data-layout="title"] h1{font-weight:300;}',
    // Überschrift: helles Deck behält den Akzent-Unterstrich; das dunkle Tech-Deck OHNE Unterstrich
    // (bewusst, auf Nutzerwunsch) — nur farbige, klare Teal-Überschrift.
    isDark
      ? `h2{--fs:36px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:700;margin:0 0 26px;color:${headAccent};display:inline-block;font-family:${p.headingFontFamily};position:relative;z-index:1;}`
      : `h2{--fs:36px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:700;margin:0 0 28px;color:${headAccent};padding-bottom:10px;border-bottom:4px solid ${headAccent};display:inline-block;font-family:${p.headingFontFamily};position:relative;z-index:1;}`,
    // Titel-h1-Unterstrich: nur auf den hellen Presets; dunkles Tech-Deck bleibt unterstrichfrei.
    isDark
      ? ''
      : isLightTitle
        ? `body[data-layout="title"] h1{padding-bottom:14px;border-bottom:4px solid ${p.accent};display:inline-block;}`
        : `body[data-layout="title"] h1{padding-bottom:14px;border-bottom:4px solid ${p.accentOnDark};display:inline-block;}`,
    // Kapitel-Trenner: Titel als flache, randlose Akzent-Box statt Gradient-Cover.
    `body[data-layout="section"] h1{background:${p.accent};color:#ffffff;padding:${d(40)} ${d(56)};`,
    `border-radius:${r(20)};display:inline-block;max-width:75%;border-bottom:none;position:relative;z-index:1;}`,
    'subtitle{display:block;--fs:24px;font-size:calc(var(--fs) * var(--fsm,1));opacity:0.85;margin:8px 0 0;font-weight:300;}',
    // Inhalt liegt über der ambienten Deko (Punktraster/Dot-Wave) des dunklen Decks.
    'p,ul,ol,table,stats,boxes,columns,agenda,callout{position:relative;z-index:1;}',
    'p{--fs:26px;font-size:calc(var(--fs) * var(--fsm,1));line-height:1.5;margin:0 0 14px;}',
    'ul,ol{line-height:1.5;margin:0;padding-left:36px;}',
    'li{--fs:26px;font-size:calc(var(--fs) * var(--fsm,1));margin-bottom:10px;}',
    `li::marker{color:${headAccent};font-weight:700;}`,
    'table{width:100%;border-collapse:collapse;font-size:22px;',
    `border-top:4px solid ${headAccent};}`,
    `th,td{border:1px solid ${cellBorder};padding:10px 14px;text-align:left;}`,
    `th{background:${card(16)};font-weight:700;${isDark ? `color:${p.accentOnDark};` : ''}}`,
    `tbody tr:nth-child(even) td{background:${band};}`,
    `stats{display:flex;gap:${d(24)};margin-top:8px;}`,
    `stat{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;`,
    `background:${card(10)};border-radius:${r(16)};padding:${d(28)} ${d(20)};${isDark ? `border-top:3px solid ${p.accent};` : ''}}`,
    // Glow-Ring hinter der Kennzahl (nur dunkles Deck) — Pendant zu `add_glow_ring` in app.py.
    ...(isDark
      ? [
          'stat::before{content:"";position:absolute;top:42%;left:50%;width:104px;height:104px;transform:translate(-50%,-50%);',
          `border-radius:50%;border:2px solid color-mix(in srgb,${p.accentOnDark} 55%,transparent);`,
          `box-shadow:0 0 0 10px color-mix(in srgb,${p.accentOnDark} 12%,transparent);z-index:0;}`,
          'statvalue,statlabel{position:relative;z-index:1;}',
          // Emoji-Icons werden im (dunklen) Tech-Deck NICHT gerendert — Präsentationen bleiben emoji-frei.
          // `!important`, weil die generische `icon{display:block}`-Regel weiter unten sonst gewinnt.
          'icon{display:none!important;}',
        ]
      : []),
    `statvalue{--fs:48px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:800;color:${headAccent};line-height:1.1;}`,
    `statlabel{--fs:20px;font-size:calc(var(--fs) * var(--fsm,1));color:${mutedText};margin-top:8px;}`,
    `columns{display:flex;gap:${d(48)};flex:1;align-items:flex-start;}`,
    `column{flex:1;min-width:0;background:${card(6)};`,
    `border-radius:${r(16)};padding:${d(28)} ${d(32)};}`,
    `column h2{font-size:30px;${isDark ? `color:${p.accentOnDark};border-color:${p.accentOnDark};` : ''}}`,
    `agenda{display:flex;flex-direction:column;gap:${d(20)};margin-top:8px;}`,
    `agendaitem{display:flex;align-items:center;gap:24px;background:${card(5)};`,
    `border-radius:${r(14)};padding:${d(14)} ${d(20)};}`,
    `agendanum{flex-shrink:0;width:64px;height:64px;border-radius:${r(14)};background:${p.accent};color:#ffffff;`,
    'display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;}',
    `agendatitle{--fs:28px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:600;color:${bodyText};}`,
    // Boxen: helles Deck = flache Vollfarb-Karten; dunkles Deck = dunkel-transluzente Karten mit
    // Teal-Hairline oben + heller Schrift (an «Everything is information» aus dem Referenzbild angelehnt).
    `callout{display:block;margin-top:20px;padding:${d(20)} ${d(24)};border-radius:${r(16)};border:none;`,
    `background:${p.accent};color:#ffffff;font-weight:700;}`,
    'callout icon{display:inline-block;font-size:28px;margin:0 10px 0 0;vertical-align:middle;}',
    'icon{display:block;font-size:40px;line-height:1;margin-bottom:8px;}',
    `boxes{display:flex;gap:${d(24)};margin-top:8px;}`,
    isDark
      ? `box{flex:1;border-radius:${r(18)};padding:${d(28)} ${d(24)};color:#f8fafc;background:${card(12)};border-top:3px solid ${p.accent};}`
      : `box{flex:1;border-radius:${r(18)};padding:${d(28)} ${d(24)};color:#ffffff;}`,
    ...(isDark
      ? []
      : [
          `box:nth-child(1){background:${p.boxColors[0]};}`,
          `box:nth-child(2){background:${p.boxColors[1]};}`,
          `box:nth-child(3){background:${p.boxColors[2]};}`,
          `box:nth-child(4){background:${p.boxColors[0]};}`,
        ]),
    'boxtitle{display:block;--fs:24px;font-size:calc(var(--fs) * var(--fsm,1));font-weight:700;}',
    `boxtext{display:block;--fs:18px;font-size:calc(var(--fs) * var(--fsm,1));${isDark ? `color:${mutedText};` : 'opacity:0.9;'}margin-top:8px;}`,
    PPTX_ELEMENT_STYLE_OVERRIDE_CSS,
  ].join('')
}

/** `srcDoc` für den sandboxed `<iframe>` (Chat-Vorschau und Slide-Modal) — Design aus `slide.preset`/`slide.theme`, kein Modell-CSS.
 * `position` ist der 0-basierte Folien-Index im Deck — steuert nur die rotierende Deko-Position des
 * dunklen Tech-Decks (gemeinsamer Schlüssel mit dem Python-Export, damit Preview = Export). */
export function buildPptxSlideSrcDoc(slide: PptxSlide, position = 0): string {
  const valignAttr = slide.valign ? ` data-valign="${slide.valign}"` : ''
  const design = resolvePptxSlideDesign(slide)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${buildPptxSlideThemeCss(design, position)}</style></head><body data-layout="${slide.layout}"${valignAttr}>${slide.html}</body></html>`
}
