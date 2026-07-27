/**
 * Retry-/Backoff-Hilfen für Lernpfad-KI-Aufrufe (Ebene 1: rein clientseitig, kein Edge-Deploy).
 *
 * Hintergrund: Der Lernpfad-Modell-Call scheitert vor allem an VORÜBERGEHENDEN Fehlern (429-Überlast,
 * 5xx, Timeout). Die Edge-Function weicht darauf NICHT auf ein anderes Modell aus und wirft sofort; die
 * Client-Schleifen versuchten es bisher OHNE Wartezeit erneut → trafen dasselbe Rate-Limit-Fenster und
 * scheiterten in Sekunden. Ein kurzer exponentieller Backoff lässt das Fenster frei werden und heilt die
 * meisten Fälle automatisch (statt „manuell nochmals versuchen").
 */

/**
 * Erkennt vorübergehende KI-Fehler, für die ein erneuter Versuch lohnt (429-Überlast, 5xx, Timeout,
 * Netzwerk). NICHT als transient gewertet: aufgebrauchtes Kontingent / Billing — da hilft kein Retry.
 */
export function isTransientAiFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  // Kontingent/Billing ist dauerhaft, kein Retry.
  if (
    message.includes('kontingent') ||
    message.includes('insufficient_quota') ||
    message.includes('billing') ||
    message.includes('guthaben')
  ) {
    return false
  }
  return (
    message.includes('429') ||
    message.includes('überlast') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('timeout') ||
    message.includes('dauert zu lange') ||
    message.includes('network') ||
    message.includes('netzwerk') ||
    message.includes('fehlgeschlagen')
  )
}

/** Exponentieller Backoff (ms) vor dem nächsten Versuch: ~3s, 6s, 12s (gedeckelt). attempt ist 1-basiert. */
export function aiBackoffDelayMs(attempt: number): number {
  return Math.min(3000 * 2 ** Math.max(0, attempt - 1), 12_000)
}

/** Warten (ms). Nutzt window.setTimeout; im SSR/Node-Kontext wird nicht aufgerufen. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
