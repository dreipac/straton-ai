import type { ChatMessage } from '../types'
import {
  PPTX_HTML_END,
  PPTX_HTML_START,
  PPTX_SLIDE_LAYOUTS,
  type PptxSlideLayout,
} from '../constants/pptxExportPrompt'

export type PptxSlide = {
  layout: PptxSlideLayout
  /** Sanitiertes Inner-HTML der Folie (nur Whitelist-Tags) — direkt für `srcDoc` geeignet. */
  html: string
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

/** `<section class="slide" data-layout="…">…</section>` → sanitierte Folien-Liste. */
export function parsePptxSlidesFromHtmlFragment(htmlFragment: string): PptxSlide[] {
  if (typeof DOMParser === 'undefined') {
    return []
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${htmlFragment}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return []
  }
  const sections = Array.from(root.querySelectorAll('section'))
  const slides: PptxSlide[] = []
  for (const section of sections) {
    const layoutRaw = (section.getAttribute('data-layout') ?? '').trim().toLowerCase()
    const layout = isPptxSlideLayout(layoutRaw) ? layoutRaw : 'content'
    const html = Array.from(section.childNodes).map(sanitizeSlideNode).join('').trim()
    if (!html) {
      continue
    }
    slides.push({ layout, html })
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

/**
 * Festes Theme (16:9, 1280×720) — Farbe/Schrift/Layout-Maße kommen ausschliesslich von hier,
 * nicht vom Modell-HTML (siehe Design-Entscheidung im Plan: ein gemeinsames Theme für
 * Vorschau und späteren python-pptx-Export, `Inches(13.333)`×`Inches(7.5)` serverseitig).
 */
export const PPTX_SLIDE_NATIVE_WIDTH = 1280
export const PPTX_SLIDE_NATIVE_HEIGHT = 720

const PPTX_SLIDE_THEME_CSS = [
  '*{box-sizing:border-box;}',
  'html,body{margin:0;padding:0;}',
  `body{width:${PPTX_SLIDE_NATIVE_WIDTH}px;height:${PPTX_SLIDE_NATIVE_HEIGHT}px;overflow:hidden;display:flex;flex-direction:column;`,
  'justify-content:center;padding:72px 96px;background:#ffffff;color:#0f172a;',
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}",
  'body[data-layout="title"],body[data-layout="section"]{',
  'background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#f8fafc;}',
  'h1{font-size:56px;font-weight:800;margin:0 0 16px;line-height:1.15;}',
  'h2{font-size:36px;font-weight:700;margin:0 0 28px;color:#1d4ed8;}',
  'body[data-layout="title"] h2,body[data-layout="section"] h2{color:#bfdbfe;}',
  'p.subtitle{font-size:24px;opacity:0.85;margin:0;}',
  'p{font-size:26px;line-height:1.5;margin:0 0 14px;}',
  'ul,ol{font-size:26px;line-height:1.5;margin:0;padding-left:36px;}',
  'li{margin-bottom:10px;}',
  'table{width:100%;border-collapse:collapse;font-size:22px;}',
  'th,td{border:1px solid #cbd5e1;padding:10px 14px;text-align:left;}',
  'th{background:#f1f5f9;font-weight:700;}',
].join('')

/** `srcDoc` für den sandboxed `<iframe>` (Chat-Vorschau und Slide-Modal) — fixes Theme, kein Modell-CSS. */
export function buildPptxSlideSrcDoc(slide: PptxSlide): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PPTX_SLIDE_THEME_CSS}</style></head><body data-layout="${slide.layout}">${slide.html}</body></html>`
}
