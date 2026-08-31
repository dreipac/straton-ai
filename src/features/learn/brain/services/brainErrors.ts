/**
 * Gemeinsame Fehleraufbereitung der Gehirn-Persistenz.
 *
 * Gleiches Muster wie `learnConceptGraph.persistence.ts` — ein Supabase-Fehlerobjekt traegt
 * Meldung, Details, Hinweis und Code in vier getrennten Feldern, und die interessante Angabe
 * steht selten in `message`.
 */

export function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const parts = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.details === 'string' ? candidate.details : '',
    typeof candidate.hint === 'string' ? candidate.hint : '',
    typeof candidate.code === 'string' ? `Code: ${candidate.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}
