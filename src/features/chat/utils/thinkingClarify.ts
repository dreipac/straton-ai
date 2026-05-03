/** Marker wie beim Quiz — Modell liefert JSON zwischen diesen Zeilen. */
export const THINKING_CLARIFY_START = '<<<STRATON_THINKING_CLARIFY>>>'
export const THINKING_CLARIFY_END = '<<<END_STRATON_THINKING_CLARIFY>>>'

/** Wie bei Excel-Spec: Marker/JSON sonst nicht zuverlässig zu finden. */
function normalizeContentForThinkingClarify(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
}

/** Feste Option „eigene Antwort“ — wird nur clientseitig angehängt. */
export const THINKING_CUSTOM_OPTION_ID = '__thinking_custom__'

export type ThinkingClarifyOption = { id: string; label: string }

export type ThinkingClarifyPayload = {
  /** Kurze Leitfrage im Popup */
  prompt: string
  /** 2–5 vordefinierte Antworten (ohne „Eigene Antwort“). */
  options: ThinkingClarifyOption[]
}

export type ThinkingClarifyParse =
  | { kind: 'clarify'; introMarkdown: string; payload: ThinkingClarifyPayload }
  | { kind: 'plain' }

function normalizePayload(raw: unknown): ThinkingClarifyPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
  const optsIn = o.options
  if (!prompt || !Array.isArray(optsIn)) {
    return null
  }
  const options: ThinkingClarifyOption[] = []
  for (const item of optsIn) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const r = item as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    if (id && label && id !== THINKING_CUSTOM_OPTION_ID) {
      options.push({ id, label })
    }
  }
  if (options.length < 2 || options.length > 5) {
    return null
  }
  return { prompt, options }
}

export function parseThinkingClarifyContent(content: string): ThinkingClarifyParse {
  const normalized = normalizeContentForThinkingClarify(content)
  const start = normalized.indexOf(THINKING_CLARIFY_START)
  const end = normalized.indexOf(THINKING_CLARIFY_END)
  if (start === -1 || end === -1 || end <= start) {
    return { kind: 'plain' }
  }
  const introMarkdown = normalized.slice(0, start).trim()
  const jsonRaw = normalized.slice(start + THINKING_CLARIFY_START.length, end).trim()
  try {
    const parsed = JSON.parse(jsonRaw) as unknown
    const payload = normalizePayload(parsed)
    if (!payload) {
      return { kind: 'plain' }
    }
    return { kind: 'clarify', introMarkdown, payload }
  } catch {
    return { kind: 'plain' }
  }
}

/** Chat-Bubble: ohne JSON-Block; Intro oder Kurzhinweis. */
export function stripThinkingClarifyMarkersForDisplay(content: string): string {
  const p = parseThinkingClarifyContent(content)
  if (p.kind !== 'clarify') {
    return content
  }
  if (p.introMarkdown.trim()) {
    return p.introMarkdown
  }
  return 'Die KI hat Rückfragen — bitte im Fenster unten beantworten.'
}

export function messageContainsCompleteThinkingClarifyBlock(content: string): boolean {
  const n = normalizeContentForThinkingClarify(content)
  return (
    n.includes(THINKING_CLARIFY_START) &&
    n.includes(THINKING_CLARIFY_END) &&
    parseThinkingClarifyContent(content).kind === 'clarify'
  )
}

/** Popup-Zustand für Thinking-Rückfragen (strukturiert oder Fallback ohne JSON der KI). */
export type ThinkingClarifyDialogState =
  | {
      kind: 'structured'
      threadId: string
      messageId: string
      introMarkdown: string
      payload: ThinkingClarifyPayload
    }
  | {
      kind: 'freeText'
      threadId: string
      messageId: string
      /** Anzuzeigender KI-Text */
      previewText: string
    }

/**
 * Wenn die KI keinen gültigen Clarify-JSON-Block liefert, trotzdem Popup anbieten
 * (kurze/mittlere Antworten — keine langen „Final“-Dokumente).
 */
export function shouldOpenThinkingFallbackPopup(content: string): boolean {
  if (parseThinkingClarifyContent(content).kind === 'clarify') {
    return false
  }
  const t = content.trim()
  if (!t || t.length > 6000) {
    return false
  }
  const lines = t.split(/\r?\n/).length
  if (lines > 28) {
    return false
  }
  const h2 = (t.match(/^##\s+/gm) ?? []).length
  if (h2 >= 2) {
    return false
  }
  return true
}
