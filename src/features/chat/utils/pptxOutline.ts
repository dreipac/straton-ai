import type { ChatMessage } from '../types'
import {
  PPTX_HTML_END,
  PPTX_HTML_START,
  PPTX_SLIDE_LAYOUTS,
  PPTX_THEME_KEYS,
  type PptxSlideLayout,
  type PptxThemeKey,
} from '../constants/pptxExportPrompt'

const PPTX_DEFAULT_THEME: PptxThemeKey = 'blue'

export type PptxSlide = {
  layout: PptxSlideLayout
  /** Sanitiertes Inner-HTML der Folie (nur Whitelist-Tags) — direkt für `srcDoc` geeignet. */
  html: string
  /** Akzentfarben-Palette der gesamten Präsentation (vom Wrapper-`data-theme` übernommen). */
  theme: PptxThemeKey
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

/** Nur Whitelist-Tags ohne Attribute übernehmen — verhindert Style/Script/Event-Handler im Folien-HTML. */
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
  return `<${tag}>${innerHtml}</${tag}>`
}

function isPptxSlideLayout(value: string): value is PptxSlideLayout {
  return (PPTX_SLIDE_LAYOUTS as readonly string[]).includes(value)
}

function isPptxThemeKey(value: string): value is PptxThemeKey {
  return (PPTX_THEME_KEYS as readonly string[]).includes(value)
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
  const theme = isPptxThemeKey(themeRaw) ? themeRaw : PPTX_DEFAULT_THEME
  const sections = Array.from(root.querySelectorAll('section'))
  const slides: PptxSlide[] = []
  for (const section of sections) {
    const layoutRaw = (section.getAttribute('data-layout') ?? '').trim().toLowerCase()
    const layout = isPptxSlideLayout(layoutRaw) ? layoutRaw : 'content'
    const html = Array.from(section.childNodes).map(sanitizeSlideNode).join('').trim()
    if (!html) {
      continue
    }
    slides.push({ layout, html, theme })
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
  const theme = slides[0]?.theme ?? PPTX_DEFAULT_THEME
  const sectionsHtml = slides
    .map((slide) => `<section class="slide" data-layout="${slide.layout}">${slide.html}</section>`)
    .join('')
  return `<div data-theme="${theme}">${sectionsHtml}</div>`
}

function findLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return messages[i]
    }
  }
  return undefined
}

/** PowerPoint noch nicht erzeugt, aber Vorschau parsebar und /PowerPoint wurde für **diese** Antwort genutzt. */
export function canFinalizePptxExportFromThread(messages: ChatMessage[]): boolean {
  if (messages.length < 2) {
    return false
  }
  const last = messages[messages.length - 1]
  if (last?.role !== 'assistant' || last.metadata?.pptxExport) {
    return false
  }
  if (last.metadata?.liveStream) {
    return false
  }
  const lastUser = findLastUserMessage(messages)
  if (lastUser?.metadata?.userPptxCommand !== true) {
    return false
  }
  return parsePptxSlidesFromAssistantContent(last.content).length > 0
}

/** Folien der letzten Assistant-Antwort — für den finalen PPTX-Export-Aufruf. */
export function extractPptxSlidesFromThread(messages: ChatMessage[]): PptxSlide[] | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') {
    return null
  }
  const slides = parsePptxSlidesFromAssistantContent(last.content)
  return slides.length > 0 ? slides : null
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
}

/** Theme-CSS für den sandboxed `<iframe>` — Farben aus der Palette, Struktur/Schrift fest. */
function buildPptxSlideThemeCss(theme: PptxThemeKey): string {
  const p = PPTX_THEME_PALETTES[theme]
  return [
    '*{box-sizing:border-box;}',
    'html,body{margin:0;padding:0;}',
    `body{width:${PPTX_SLIDE_NATIVE_WIDTH}px;height:${PPTX_SLIDE_NATIVE_HEIGHT}px;overflow:hidden;display:flex;flex-direction:column;`,
    'position:relative;padding:72px 96px;background:#ffffff;color:#0f172a;',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}",
    // Titel/Trenner bleiben vertikal zentriert — alle anderen Layouts ordnen Titel oben,
    // Inhalt darunter an (Flexbox-Default `flex-start`, kein expliziter Wert nötig).
    'body[data-layout="title"],body[data-layout="section"]{justify-content:center;}',
    // Section bekommt seine flache Akzent-Box horizontal zentriert (statt volle Breite/stretch).
    'body[data-layout="section"]{align-items:center;}',
    // Marken-Akzent am linken Rand — nur die Titelfolie hat keinen (sie hat ihren eigenen
    // grossflächigen Akzent-Hintergrund), alle anderen Layouts inkl. `section` bekommen ihn.
    'body:not([data-layout="title"])::before{',
    `content:"";position:absolute;left:0;top:0;width:8px;height:100%;background:${p.accent};}`,
    // Cover-Look (Gradient + dezentes Deko-Element) bleibt ausschliesslich der Titelfolie vorbehalten.
    'body[data-layout="title"]{',
    `background:linear-gradient(135deg,${p.gradientFrom},${p.gradientTo});color:#f8fafc;}`,
    'body[data-layout="title"]::after{content:"";position:absolute;width:420px;height:420px;border-radius:50%;',
    `right:-120px;bottom:-120px;background:color-mix(in srgb,${p.accentOnDark} 30%,${p.gradientTo});z-index:0;}`,
    'h1{font-size:56px;font-weight:800;margin:0 0 16px;line-height:1.15;}',
    // Titel: schmalere, linksbündige Box statt voller Breite — Editorial-Look statt Plain-Text-Block.
    'body[data-layout="title"] h1,body[data-layout="title"] subtitle{max-width:720px;align-self:flex-start;position:relative;z-index:1;}',
    'body[data-layout="title"] h1{font-weight:300;}',
    `h2{font-size:36px;font-weight:700;margin:0 0 28px;color:${p.accent};padding-bottom:10px;`,
    `border-bottom:4px solid ${p.accent};display:inline-block;}`,
    `body[data-layout="title"] h1{padding-bottom:14px;border-bottom:4px solid ${p.accentOnDark};display:inline-block;}`,
    // Kapitel-Trenner: Titel als flache, randlose Akzent-Box statt Gradient-Cover.
    `body[data-layout="section"] h1{background:${p.accent};color:#ffffff;padding:40px 56px;`,
    'border-radius:20px;display:inline-block;max-width:75%;border-bottom:none;}',
    'subtitle{display:block;font-size:24px;opacity:0.85;margin:8px 0 0;font-weight:300;}',
    'p{font-size:26px;line-height:1.5;margin:0 0 14px;}',
    'ul,ol{font-size:26px;line-height:1.5;margin:0;padding-left:36px;}',
    'li{margin-bottom:10px;}',
    `li::marker{color:${p.accent};font-weight:700;}`,
    'table{width:100%;border-collapse:collapse;font-size:22px;',
    `border-top:4px solid ${p.accent};}`,
    'th,td{border:1px solid #cbd5e1;padding:10px 14px;text-align:left;}',
    `th{background:color-mix(in srgb,${p.accent} 16%,white);font-weight:700;}`,
    `tbody tr:nth-child(even) td{background:color-mix(in srgb,${p.accent} 6%,white);}`,
    'stats{display:flex;gap:24px;margin-top:8px;}',
    `stat{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;`,
    `background:color-mix(in srgb,${p.accent} 10%,white);border-radius:16px;padding:28px 20px;}`,
    `statvalue{font-size:48px;font-weight:800;color:${p.accent};line-height:1.1;}`,
    'statlabel{font-size:20px;color:#475569;margin-top:8px;}',
    'columns{display:flex;gap:48px;flex:1;align-items:flex-start;}',
    `column{flex:1;min-width:0;background:color-mix(in srgb,${p.accent} 6%,white);`,
    'border-radius:16px;padding:28px 32px;}',
    'column h2{font-size:30px;}',
    'agenda{display:flex;flex-direction:column;gap:20px;margin-top:8px;}',
    `agendaitem{display:flex;align-items:center;gap:24px;background:color-mix(in srgb,${p.accent} 5%,white);`,
    'border-radius:14px;padding:14px 20px;}',
    `agendanum{flex-shrink:0;width:64px;height:64px;border-radius:14px;background:${p.accent};color:#ffffff;`,
    'display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;}',
    'agendatitle{font-size:28px;font-weight:600;}',
    // Boxen ohne Rand, flache Vollfarbe — modernerer "Card"-Look statt Tönung+Rand.
    `callout{display:block;margin-top:20px;padding:20px 24px;border-radius:16px;border:none;`,
    `background:${p.accent};color:#ffffff;font-weight:700;}`,
    'callout icon{display:inline-block;font-size:28px;margin:0 10px 0 0;vertical-align:middle;}',
    'icon{display:block;font-size:40px;line-height:1;margin-bottom:8px;}',
    'boxes{display:flex;gap:24px;margin-top:8px;}',
    'box{flex:1;border-radius:18px;padding:28px 24px;color:#ffffff;}',
    `box:nth-child(1){background:${p.boxColors[0]};}`,
    `box:nth-child(2){background:${p.boxColors[1]};}`,
    `box:nth-child(3){background:${p.boxColors[2]};}`,
    `box:nth-child(4){background:${p.boxColors[0]};}`,
    'boxtitle{display:block;font-size:24px;font-weight:700;}',
    'boxtext{display:block;font-size:18px;opacity:0.9;margin-top:8px;}',
  ].join('')
}

/** `srcDoc` für den sandboxed `<iframe>` (Chat-Vorschau und Slide-Modal) — Theme aus `slide.theme`, kein Modell-CSS. */
export function buildPptxSlideSrcDoc(slide: PptxSlide): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${buildPptxSlideThemeCss(slide.theme)}</style></head><body data-layout="${slide.layout}">${slide.html}</body></html>`
}
