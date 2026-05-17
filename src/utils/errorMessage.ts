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
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim()
  }
  if (typeof err === 'string' && err.trim()) {
    return err.trim()
  }
  const fromObject = parseApiErrorField(err)
  if (fromObject) {
    return fromObject
  }
  return fallback
}
