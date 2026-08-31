/**
 * Schicht 6 — Ausloeser der Konsolidierung (Kapitel 8.1).
 *
 * Konsolidiert wird bei ausreichendem EVIDENZGEWICHT, nicht nach Zeitplan und nicht nach jeder
 * Sitzung.
 *
 * Zwei Praezisierungen aus dem Dokument, beide hier umgesetzt:
 *  - „Genug" wird in Evidenzgewicht gemessen, nicht in Stueckzahl. Zwanzig Chatnachrichten
 *    wiegen weniger als fuenf bewertete Aufgaben. Reines Zaehlen wuerde Vielrederei zu
 *    Ausloesern machen, die nichts Neues enthalten.
 *  - Es gibt eine Obergrenze fuer die Wartezeit, sonst konsolidiert ein Gelegenheitsnutzer nie
 *    und sein Lernerbild bleibt fuer immer roh.
 *
 * Verworfene Alternativen (der Vollstaendigkeit halber, weil sie naheliegen):
 *  - Nach jeder Sitzung: zu verrauscht. Ein mueder Abend wuerde zur Erkenntnis, und fuenf kurze
 *    Sitzungen bedeuten fuenf teure Durchlaeufe.
 *  - Naechtlich: erzaehlerisch attraktiv (Schlafmetapher), aber bei intensivem Lernen vor einer
 *    Pruefung kommen die Einsichten zu spaet, und bei seltener Nutzung laufen die meisten
 *    Naechte leer.
 *
 * Rein — kein DOM, kein I/O.
 */

/**
 * Schwelle in Evidenzgewicht.
 *
 * Bei einem Gewicht von 1.0 pro bewerteter Aufgabe entspricht das rund acht Aufgaben. Chat
 * allein erreicht die Schwelle praktisch nie: bei 0.05 je Signal waeren 160 Chatsignale noetig.
 * Genau so ist es gemeint.
 */
export const CONSOLIDATION_WEIGHT_THRESHOLD = 8

/** Obergrenze der Wartezeit — danach wird auch mit wenig Evidenz konsolidiert. */
export const CONSOLIDATION_MAX_WAIT_DAYS = 14

/** Untergrenze: unter diesem Gewicht lohnt auch die Wartezeit-Obergrenze keinen Durchlauf. */
export const CONSOLIDATION_MIN_WEIGHT = 1

/** Mindestabstand zwischen zwei Durchlaeufen — verhindert Doppellaeufe an einem intensiven Tag. */
export const CONSOLIDATION_COOLDOWN_HOURS = 6

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

/** Der Buchhaltungsstand aus `learn_consolidation_state`. */
export type ConsolidationState = {
  pendingEvidenceWeight: number
  oldestPendingAt: string | null
  lastRunAt: string | null
  runCount: number
}

export type ConsolidationTrigger =
  | { shouldRun: false; reason: 'notEnoughEvidence' | 'cooldown' | 'nothingPending' }
  | { shouldRun: true; reason: 'weightReached' | 'waitCapReached' }

/**
 * Soll jetzt konsolidiert werden?
 *
 * Reihenfolge der Pruefungen ist bedeutsam: der Cooldown kommt VOR der Gewichtsschwelle, sonst
 * loest ein einziger langer Lernabend mehrere teure Durchlaeufe hintereinander aus.
 */
export function evaluateTrigger(state: ConsolidationState, nowIso: string): ConsolidationTrigger {
  const now = new Date(nowIso).getTime()

  if (state.pendingEvidenceWeight < CONSOLIDATION_MIN_WEIGHT) {
    return { shouldRun: false, reason: 'nothingPending' }
  }

  if (state.lastRunAt) {
    const since = now - new Date(state.lastRunAt).getTime()
    if (Number.isFinite(since) && since < CONSOLIDATION_COOLDOWN_HOURS * MS_PER_HOUR) {
      return { shouldRun: false, reason: 'cooldown' }
    }
  }

  if (state.pendingEvidenceWeight >= CONSOLIDATION_WEIGHT_THRESHOLD) {
    return { shouldRun: true, reason: 'weightReached' }
  }

  if (state.oldestPendingAt) {
    const waitedDays = (now - new Date(state.oldestPendingAt).getTime()) / MS_PER_DAY
    if (Number.isFinite(waitedDays) && waitedDays >= CONSOLIDATION_MAX_WAIT_DAYS) {
      return { shouldRun: true, reason: 'waitCapReached' }
    }
  }

  return { shouldRun: false, reason: 'notEnoughEvidence' }
}

/**
 * Fortschritt bis zum naechsten Durchlauf, 0..1.
 *
 * Nimmt das Maximum aus Gewichts- und Wartezeitfortschritt — der Durchlauf kommt, sobald einer
 * der beiden Wege am Ziel ist.
 */
export function triggerProgress(state: ConsolidationState, nowIso: string): number {
  const byWeight = state.pendingEvidenceWeight / CONSOLIDATION_WEIGHT_THRESHOLD

  let byWait = 0
  if (state.oldestPendingAt) {
    const waited = (new Date(nowIso).getTime() - new Date(state.oldestPendingAt).getTime()) / MS_PER_DAY
    if (Number.isFinite(waited)) {
      byWait = waited / CONSOLIDATION_MAX_WAIT_DAYS
    }
  }

  return Math.max(0, Math.min(1, Math.max(byWeight, byWait)))
}
