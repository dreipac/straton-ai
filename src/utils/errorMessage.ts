/** API-/Supabase-Fehler: `{ error: "…" }` oder `{ error: { message: "…" } }`. */
export function parseApiErrorField(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) {
      return o.message.trim()
    }
    if (typeof o.error === 'string' && o.error.trim()) {
      return o.error.trim()
    }
    if (o.error && typeof o.error === 'object') {
      const inner = o.error as Record<string, unknown>
      if (typeof inner.message === 'string' && inner.message.trim()) {
        return inner.message.trim()
      }
    }
  }
  return ''
}

export function errorMessageFromUnknown(
  err: unknown,
  fallback = 'Beim Senden ist ein unbekannter Fehler aufgetreten.',
): string {
  let message = ''
  if (err instanceof Error && err.message.trim()) {
    message = err.message.trim()
  } else if (typeof err === 'string' && err.trim()) {
    message = err.trim()
  } else {
    message = parseApiErrorField(err)
  }
  if (!message) {
    return fallback
  }
  return sanitizeUserFacingAiError(message)
}

/** Rohe Provider-JSON (z. B. Gemini 503) für Nutzer lesbar machen. */
export function sanitizeUserFacingAiError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('gemini-anfrage fehlgeschlagen') &&
    (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand'))
  ) {
    return 'Das KI-Modell (Gemini) ist gerade stark ausgelastet. Bitte in ein paar Sekunden erneut versuchen.'
  }
  if (lower.includes('gemini-anfrage fehlgeschlagen') && message.includes('{')) {
    return 'Gemini ist vorübergehend nicht erreichbar. Bitte erneut versuchen.'
  }
  return message
}
