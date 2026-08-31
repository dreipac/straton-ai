/**
 * Session-/Themen-Zustandsmaschine — Schicht 7.
 *
 * Formalisiert die bisher implizit ueber `LearnPage` verstreute Themen-Progression als reine, getestete
 * Funktionen. Ein Thema durchlaeuft: locked → entry_check → analyzing → learning → mastered. Das naechste
 * Thema entsperrt erst, wenn das vorige gemeistert ist (sequentielle Landkarte).
 *
 * Rein (kein DOM/I/O). Die Uebergaenge sind eine explizite Tabelle mit Guards — illegale Uebergaenge
 * lassen den Zustand unveraendert (kein Werfen), damit die Maschine robust als Ableitung nutzbar ist.
 */

export type TopicStatus = 'locked' | 'entry_check' | 'analyzing' | 'learning' | 'mastered'

/** Ereignisse, die einen Themen-Statuswechsel ausloesen. */
export type TopicEvent =
  /** Ein entsperrtes Thema wird geoeffnet (Einstiegscheck beginnt). */
  | 'open'
  /** Der Einstiegscheck ist abgeschlossen; die Auswertung/Analyse laeuft. */
  | 'analyze'
  /** Die Zwischenschritte (Substeps) stehen bereit; das Lernen beginnt. */
  | 'substepsReady'
  /** Alle Zwischenschritte sind abgeschlossen; das Thema gilt als gemeistert. */
  | 'allSubstepsCompleted'

/** Reihenfolge der Zustaende (fuer Vergleiche/Fortschritt). */
export const TOPIC_STATUS_ORDER: TopicStatus[] = ['locked', 'entry_check', 'analyzing', 'learning', 'mastered']

const TRANSITIONS: Record<TopicStatus, Partial<Record<TopicEvent, TopicStatus>>> = {
  locked: { open: 'entry_check' },
  entry_check: { analyze: 'analyzing' },
  analyzing: { substepsReady: 'learning' },
  learning: { allSubstepsCompleted: 'mastered' },
  mastered: {},
}

/** Ob `event` im Zustand `from` einen legalen Uebergang hat. */
export function canTransition(from: TopicStatus, event: TopicEvent): boolean {
  return TRANSITIONS[from][event] !== undefined
}

/** Folgezustand nach `event`; bei illegalem Uebergang bleibt `from` erhalten. */
export function nextTopicStatus(from: TopicStatus, event: TopicEvent): TopicStatus {
  return TRANSITIONS[from][event] ?? from
}

/** Rang eines Status in der Progression (0..4); unbekannt → -1. */
export function statusRank(status: TopicStatus): number {
  return TOPIC_STATUS_ORDER.indexOf(status)
}

/** Ein Thema gilt als gemeistert. */
export function isTopicComplete(status: TopicStatus): boolean {
  return status === 'mastered'
}

/**
 * Ob das Thema an `index` entsperrt ist: das erste Thema immer, sonst nur wenn das direkt vorige
 * gemeistert ist (sequentielle Freischaltung).
 */
export function isTopicUnlocked(statuses: TopicStatus[], index: number): boolean {
  if (index <= 0) {
    return true
  }
  return statuses[index - 1] === 'mastered'
}

/** Index des ersten noch nicht gemeisterten Themas (Frontier); -1 wenn alle gemeistert. */
export function firstUnmasteredIndex(statuses: TopicStatus[]): number {
  return statuses.findIndex((s) => s !== 'mastered')
}

/** Ob alle Themen gemeistert sind (leere Liste → true, analog Array.every). */
export function allTopicsMastered(statuses: TopicStatus[]): boolean {
  return statuses.every((s) => s === 'mastered')
}

/** Anzahl gemeisterter Themen. */
export function masteredCount(statuses: TopicStatus[]): number {
  return statuses.filter((s) => s === 'mastered').length
}
