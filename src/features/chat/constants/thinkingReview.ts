export type ThinkingReviewResult = {
  fits_intent: boolean
  gaps: string[]
  rewrite_hints: string
  summary: string
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const t = value.trim()
  if (!t) {
    return ''
  }
  return t.length > max ? t.slice(0, max).trim() : t
}

function asStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => clipText(entry, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function sanitizeThinkingReviewResult(raw: unknown): ThinkingReviewResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const fits_intent = o.fits_intent === true
  const gaps = asStringArray(o.gaps, 6, 160)
  const rewrite_hints = clipText(o.rewrite_hints, 600)
  const summary = clipText(o.summary, 280) || (fits_intent ? 'Entwurf passt zur Anfrage.' : 'Entwurf braucht Nachbesserung.')
  return { fits_intent, gaps, rewrite_hints, summary }
}

export function fallbackThinkingReviewResult(draftLength: number): ThinkingReviewResult {
  return {
    fits_intent: draftLength > 200,
    gaps: draftLength > 200 ? [] : ['Entwurf zu kurz oder leer'],
    rewrite_hints:
      draftLength > 200
        ? ''
        : 'Vollständige ausführliche Antwort zur Nutzeranfrage liefern; alle Pflichtkapitel gemäss task_type.',
    summary: draftLength > 200 ? 'Entwurf ausreichend — final formatieren.' : 'Entwurf unzureichend.',
  }
}

export function buildThinkingReviewBriefingForGateway(
  review: ThinkingReviewResult,
): string {
  const lines = [
    'Thinking — Qualitätsprüfung des Entwurfs (verbindlich für die finale Antwort):',
    `Ergebnis: ${review.summary}`,
    `Passt zur Anfrage: ${review.fits_intent ? 'ja' : 'nein'}`,
  ]
  if (review.gaps.length > 0) {
    lines.push(`Lücken: ${review.gaps.join('; ')}`)
  }
  if (review.rewrite_hints.trim()) {
    lines.push(`Nachbesserung für die sichtbare Antwort: ${review.rewrite_hints.trim()}`)
  }
  return lines.join('\n')
}
