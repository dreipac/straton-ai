/**
 * Anbindung: Wiederholen-Bereich (UI-Spezifikation Kapitel 5 und 15).
 *
 * Der Stapel ist die zweite Oberflaeche, die der Planer speist. Was hineindarf, entscheidet
 * ausschliesslich `planner/responsibility.ts` (Architekturkapitel 6.7) — diese Datei stellt es
 * nur dar. Wer hier eine zusaetzliche Bedingung einbaut, hat eine zweite Zustaendigkeitsgrenze
 * geschaffen, und die beiden werden auseinanderlaufen.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept, LearnerConceptImage, LearningGoal } from '../types'
import { buildReviewQueue, isReviewEligible, type ReviewQueueEntry } from '../planner/responsibility'
import { sprintScopeOf } from '../planner/sprint'

export type ReviewItemView = {
  conceptId: string
  conceptName: string
  /** Der Faelligkeitsgrund im Klartext (Kapitel 5.2). */
  reason: string
  nextReviewAt: string | null
}

export type ReviewOverviewView = {
  items: ReviewItemView[]
  /**
   * Zaehlung fuer den Tab (Kapitel 5.7).
   *
   * Gezaehlt werden KONZEPTE. „17 Lernkarten" suggeriert 17 existierende Objekte; tatsaechlich
   * sind es abgeleitete Pruefpunkte. Eine Zahl, die ohne Nutzerhandlung springt, wirkt kaputt.
   */
  dueConceptCount: number
  /** Stabile Beschriftung: „5 Konzepte faellig". */
  counterLabel: string
  /** Beide Einstiege aus Kapitel 5.2. */
  canStartFull: boolean
  canStartShort: boolean
  /** Der erklaerende Satz, der eine Erwartung bricht. */
  explainer: string
  isEmpty: boolean
  /**
   * Der Leerzustand mit Angabe (UI-Spezifikation Kapitel 8).
   *
   * „Nichts faellig. Komm in zwei Tagen wieder, dann werden 4 Konzepte weich." — statt nur
   * „alles erledigt". Der Unterschied ist nicht Hoeflichkeit: ein Leerzustand ohne Angabe liest
   * sich wie ein Endzustand, und ein Endzustand ist kein Grund, wiederzukommen.
   */
  emptyForecast: string
}

/**
 * Der Satz unter den beiden Knoepfen (Kapitel 5.2).
 *
 * Er bricht bewusst eine Erwartung: wer „Wiederholen" liest, erwartet Karteikarten zum Umdrehen.
 * Ohne diesen Satz wirkt das Eingabefeld wie ein fehlendes Feature statt wie eine Entscheidung.
 */
export const REVIEW_EXPLAINER =
  'Du tippst statt umzudrehen — so bleibt die Bewertung beim Pruefer. Die Formulierungen wechseln ' +
  'zwischen den Durchgaengen, damit du das Konzept lernst und nicht die Karte.'

/**
 * Wie viele Abfragen „Nur 3 Minuten" umfasst.
 *
 * „Der wichtigste Knopf fuer die Abschlussquote. Niemand startet acht Abfragen, wenn er zwei
 * Minuten hat — und was nicht gestartet wird, liefert gar keine Evidenz."
 */
export const SHORT_SESSION_ITEMS = 3

export function buildReviewOverview(args: {
  images: Iterable<LearnerConceptImage>
  concepts: BrainConcept[]
  /** Das laufende Ziel — nur, um den Leerzustand im Sprint erklaeren zu koennen. */
  goal?: LearningGoal | null
  nowIso: string
}): ReviewOverviewView {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))
  /*
   * Einmal einlesen, zweimal verwenden: Aufrufer reichen ueblicherweise `map.values()` herein,
   * und ein Iterator ist nach dem ersten Durchlauf leer. Ohne diese Zeile waere die Vorschau im
   * Leerzustand immer die pessimistische Variante — und niemand faende den Grund.
   */
  const all = [...args.images]
  const queue: ReviewQueueEntry[] = buildReviewQueue(all, args.nowIso)

  const items = queue.map((entry) => ({
    conceptId: entry.conceptId,
    conceptName: nameById.get(entry.conceptId) ?? entry.conceptId,
    reason: entry.reason,
    nextReviewAt: entry.nextReviewAt,
  }))

  return {
    items,
    dueConceptCount: items.length,
    counterLabel: `${items.length} ${items.length === 1 ? 'Konzept' : 'Konzepte'} faellig`,
    canStartFull: items.length > 0,
    canStartShort: items.length > 0,
    explainer: REVIEW_EXPLAINER,
    isEmpty: items.length === 0,
    emptyForecast:
      items.length === 0 ? buildEmptyForecast(all, args.nowIso, args.goal ?? null) : '',
  }
}

/**
 * Wann wieder etwas faellig wird — der Leerzustand aus Kapitel 8.
 *
 * Gezaehlt wird bis zum Tag des naechsten Termins einschliesslich: „in zwei Tagen werden 4
 * Konzepte weich" meint alle, die bis dahin faellig geworden sind, nicht nur das erste. Zwei
 * getrennte Ankuendigungen fuer denselben Tag waeren zwei Gruende zurueckzukommen, wo es einen
 * gibt.
 *
 * Beruecksichtigt werden nur stapelfaehige Konzepte (Kapitel 6.7). Ein Konzept, das in den Pfad
 * gehoert, hier anzukuendigen waere ein Termin, den der Stapel nie einloest.
 */
export function buildEmptyForecast(
  images: Iterable<LearnerConceptImage>,
  nowIso: string,
  goal: LearningGoal | null = null,
): string {
  /*
   * Im Sprint bleibt dieser Bereich die ganze Zeit leer, und das ist kein Defekt, sondern
   * Arithmetik: das kuerzeste Intervall, das `nextReviewIntervalDays` fuer ein gefestigtes
   * Konzept vergibt, ist groesser als das Fenster bis zum Termin. Ohne diesen Satz liest sich
   * der Leerzustand wie „alles erledigt" — und genau der Eindruck waere im Sprint gefaehrlich.
   */
  if (sprintScopeOf(goal, nowIso)) {
    return (
      'Bis zum Termin kommt hier nichts. Mein kuerzester Abstand zwischen zwei Durchgaengen ist ' +
      'groesser als dein Fenster — im Sprint bekommt jedes Konzept genau einen Durchgang. Setz ' +
      'nach dem Termin ein zweites Ziel, dann faengt die Wiederholung an.'
    )
  }

  const now = new Date(nowIso).getTime()
  const upcoming: number[] = []

  for (const image of images) {
    if (!isReviewEligible(image) || !image.nextReviewAt) {
      continue
    }
    const due = new Date(image.nextReviewAt).getTime()
    if (Number.isFinite(due) && due > now) {
      upcoming.push(due)
    }
  }

  if (upcoming.length === 0) {
    return 'Nichts faellig — und in naechster Zeit wird auch nichts weich. Der Pfad ist gerade der bessere Ort.'
  }

  const earliest = Math.min(...upcoming)
  const days = Math.max(1, Math.ceil((earliest - now) / 86_400_000))
  const cutoff = now + days * 86_400_000
  const count = upcoming.filter((due) => due <= cutoff).length
  const when = days === 1 ? 'morgen' : `in ${days} Tagen`

  return `Nichts faellig. Komm ${when} wieder, dann ${count === 1 ? 'wird 1 Konzept' : `werden ${count} Konzepte`} weich.`
}

/**
 * Abschluss des Stapels (Kapitel 5.4).
 *
 * „Abschluss zeigt NICHT eine Punktzahl als Belohnung, sondern wann das jeweilige Konzept wieder
 * dran ist. Das ist die einzige Information, die beim Wiederholen interessiert."
 *
 * Deshalb gibt dieser Typ auch keine Trefferquote heraus. Sie waere im Stapel eine Note fuer
 * Auffrischung — und Auffrischung ist keine Pruefung.
 */
export type ReviewCompletionView = {
  headline: string
  /** Je Konzept: wann es wieder dran ist. */
  nextDates: { conceptId: string; conceptName: string; nextReviewAt: string | null; label: string }[]
  /** Hinweis, dass Abbrechen nichts verwirft (Kapitel 5.4). */
  abortNotice: string
}

/**
 * „Abbrechen zaehlt" (Kapitel 5.4).
 *
 * „Das ✕ verwirft nichts. Jede beantwortete Abfrage ist bereits Evidenz. Das muss auch dastehen —
 * sonst brechen Nutzer aus Verlustangst nicht ab, sondern schliessen den Tab, was dieselbe
 * Sitzung kostet, nur schlechter."
 */
export const ABORT_NOTICE = 'Abbrechen verwirft nichts — jede beantwortete Abfrage ist schon verbucht.'

function daysUntil(nextReviewAt: string | null, nowIso: string): number | null {
  if (!nextReviewAt) {
    return null
  }
  const due = new Date(nextReviewAt).getTime()
  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(due) || !Number.isFinite(now)) {
    return null
  }
  return Math.round((due - now) / 86_400_000)
}

export function buildReviewCompletion(args: {
  images: LearnerConceptImage[]
  concepts: BrainConcept[]
  nowIso: string
}): ReviewCompletionView {
  const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))

  return {
    headline: 'Erledigt. So geht es weiter:',
    nextDates: args.images.map((image) => {
      const days = daysUntil(image.nextReviewAt, args.nowIso)
      return {
        conceptId: image.conceptId,
        conceptName: nameById.get(image.conceptId) ?? image.conceptId,
        nextReviewAt: image.nextReviewAt,
        label:
          days == null
            ? 'ohne festen Termin'
            : days <= 0
              ? 'wieder faellig'
              : `wieder dran in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`,
      }
    }),
    abortNotice: ABORT_NOTICE,
  }
}

/**
 * Kapitel 5.5 — es gibt nichts zu verwalten, nur etwas zu tun.
 *
 * Steht als Konstante hier, weil sie eine Absenz beschreibt: kein „Karte erstellen"-Knopf, keine
 * Kartenliste, kein Bearbeitungsmodus. Eine Absenz laesst sich schlecht testen; ein benannter
 * Grund laesst sich wenigstens lesen, bevor jemand den Knopf ergaenzt.
 *
 * Das dahinterliegende Beduerfnis („das will ich behalten") wird an zwei anderen Stellen bedient:
 * „Ins Lernpfad aufnehmen" aus dem Chat erzeugt ein KONZEPT, und „Das ist mir wichtig" am Knoten
 * erhoeht die Dringlichkeit beim Planer, ohne Werte anzufassen.
 */
export const NO_SELF_MADE_CARDS_REASON =
  'Abfragen entstehen aus deinem Lernerbild, nicht aus einer Kartenliste. Was du behalten willst, ' +
  'nimmst du als Konzept in den Pfad auf — die Abfragen dazu macht das Gehirn.'
