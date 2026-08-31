/**
 * Anbindung: Einsichten-Karte (UI-Spezifikation Kapitel 3.7 und 15).
 *
 * Zwei Sorten Inhalt, die dieselbe harte Bedingung teilen: sie duerfen **nie waehrend einer
 * Sitzung erscheinen** (Invariante I7).
 *
 * Diese Datei erzwingt das, statt es zu erwaehnen. `buildInsightsCard` verlangt den Kontext als
 * Argument und liefert bei `inSession` eine leere Karte — eine Komponente, die den Filter
 * vergisst, bekommt hier nichts zu rendern. Der Grund fuer I7 ist eine Verhaltensbeobachtung,
 * keine Geschmacksfrage: „Unterbrechungen im Lernfluss zerstoeren die Sitzung und werden
 * reflexhaft weggeklickt" — ein weggeklickter Verschmelzungsvorschlag ist schlimmer als keiner,
 * weil er als beantwortet gilt.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ErrorPattern, StructureProposal } from '../types'
import { describePattern } from '../consolidation/patterns'
import { isDestructive } from '../types'

/** Wo die Karte gerade gezeigt werden soll. `inSession` ist der verbotene Fall (I7). */
export type SurfaceContext = 'pathTab' | 'sessionStart' | 'inSession'

export type ObservationView = {
  patternId: string
  /** „Mir faellt auf: … Siehst du das auch so?" — Beobachtung mit Beleg, kein Urteil. */
  text: string
  occurrenceCount: number
  distinctConceptCount: number
  distinctDayCount: number
  scope: 'generic' | 'domainSpecific' | 'unknown'
  /** Der Widerspruch ist selbst ein Signal und muss zurueckfliessen. */
  actions: readonly ['Kommt hin', 'Stimmt nicht']
}

export type MapQuestionView = {
  proposalId: string
  /** In Nutzersprache, nicht in Graphensprache. */
  question: string
  actions: readonly string[]
  /**
   * Ankuendigung der konservativen Wertregel — Pflicht bei Verschmelzungen (Kapitel 3.7).
   * Leer bei nicht zerstoererischen Vorschlaegen.
   */
  valueWarning: string
  destructive: boolean
  expiresAt: string
}

export type InsightsCardView = {
  observations: ObservationView[]
  mapQuestions: MapQuestionView[]
  /** „2 Beobachtungen ueber dich · 1 Frage zu deiner Karte" */
  counterLabel: string
  isEmpty: boolean
  /** Warum die Karte leer ist — nur gesetzt, wenn I7 sie unterdrueckt hat. */
  suppressedReason: string
}

/**
 * Der Ankuendigungstext vor einer Verschmelzung (Kapitel 3.7 und Architekturkapitel 8.3).
 *
 * „Werden 80 Prozent und 30 Prozent zusammengelegt, steht der neue Knoten bei 30 Prozent — der
 * Nutzer sieht Fortschritt verschwinden. Das waere normalerweise der Moment, in dem sich eine App
 * kaputt anfuehlt."
 *
 * Der Dialog ist die einzige Stelle, an der sich das erklaeren laesst — und genau deshalb duerfen
 * Bestaetigungspflicht und Wertregel nicht einzeln geaendert werden. Ohne diesen Satz ist der
 * Verlust mysterioes; mit ihm ist er eine nachvollziehbare Systementscheidung.
 */
export const MERGE_VALUE_WARNING =
  'Ich lege beide zusammen. Der Fortschritt wird dabei vorsichtshalber auf den niedrigeren Wert ' +
  'gesetzt und in den naechsten Sitzungen schnell wieder ueberprueft.'

const MERGE_ACTIONS = ['Ja, zusammenlegen', 'Nein, das ist verschieden', 'Weiss ich nicht'] as const
const NON_DESTRUCTIVE_ACTIONS = ['Passt', 'Nein, lass es'] as const

/**
 * Die Einsichten-Karte bauen.
 *
 * `context` ist Pflicht und nicht optional: ein vergessener Standardwert waere hier eine
 * Invariantenverletzung mit Ansage. Bei `inSession` kommt eine leere Karte mit Begruendung
 * zurueck — sichtbar im Debugger, unsichtbar fuer den Nutzer.
 *
 * Angezeigt werden nur Muster ueber der Anzeigeschwelle (`surfaced`) und nicht bestrittene:
 * „Intern nutzt das Gehirn Muster laengst, bevor es sie ausspricht. Es handelt auf Verdacht, es
 * redet nur ueber Gewissheit." Ein bestrittenes Muster erneut zu zeigen waere die Aussage, dass
 * der Widerspruch nichts gilt.
 */
export function buildInsightsCard(args: {
  patterns: ErrorPattern[]
  proposals: StructureProposal[]
  context: SurfaceContext
  nowIso: string
}): InsightsCardView {
  if (args.context === 'inSession') {
    return {
      observations: [],
      mapQuestions: [],
      counterLabel: '',
      isEmpty: true,
      suppressedReason:
        'Invariante I7: keine Strukturfragen und keine Beobachtungen waehrend einer Lernsitzung.',
    }
  }

  const observations: ObservationView[] = args.patterns
    .filter((pattern) => pattern.surfaced && !pattern.userDisputed && pattern.mergedIntoId == null)
    .map((pattern) => ({
      patternId: pattern.id,
      text: describePattern(pattern),
      occurrenceCount: pattern.occurrenceCount,
      distinctConceptCount: pattern.distinctConceptCount,
      distinctDayCount: pattern.distinctDayCount,
      scope: pattern.scope,
      actions: ['Kommt hin', 'Stimmt nicht'] as const,
    }))

  const now = new Date(args.nowIso).getTime()
  const mapQuestions: MapQuestionView[] = args.proposals
    .filter((proposal) => proposal.status === 'pending')
    .filter((proposal) => {
      // Unbeantwortete Kartenfragen verfallen nach einer Weile ohne Aenderung (Kapitel 3.7).
      const expires = new Date(proposal.expiresAt).getTime()
      return !Number.isFinite(expires) || expires > now
    })
    .filter((proposal) => surfaceMatches(proposal.surfaceContext, args.context))
    .map((proposal) => {
      const destructive = isDestructive(proposal.operation)
      return {
        proposalId: proposal.id ?? '',
        question: proposal.question,
        actions: destructive ? MERGE_ACTIONS : NON_DESTRUCTIVE_ACTIONS,
        valueWarning: destructive ? MERGE_VALUE_WARNING : '',
        destructive,
        expiresAt: proposal.expiresAt,
      }
    })

  const isEmpty = observations.length === 0 && mapQuestions.length === 0

  return {
    observations,
    mapQuestions,
    counterLabel: isEmpty ? '' : counterLabelFor(observations.length, mapQuestions.length),
    isEmpty,
    suppressedReason: '',
  }
}

/**
 * Passt der Vorschlag an diese Stelle?
 *
 * `sessionStart` ist enger als `mapReview`: ein Vorschlag, der ausdruecklich fuer den
 * Sitzungsbeginn gedacht ist, gehoert auch in den Pfad-Tab; umgekehrt soll eine reine
 * Kartenfrage den Sitzungsbeginn nicht belasten.
 */
function surfaceMatches(proposalContext: StructureProposal['surfaceContext'], context: SurfaceContext): boolean {
  if (context === 'pathTab') {
    return true
  }
  return proposalContext === 'sessionStart'
}

function counterLabelFor(observationCount: number, questionCount: number): string {
  const parts: string[] = []
  if (observationCount > 0) {
    parts.push(`${observationCount} ${observationCount === 1 ? 'Beobachtung' : 'Beobachtungen'} ueber dich`)
  }
  if (questionCount > 0) {
    parts.push(`${questionCount} ${questionCount === 1 ? 'Frage' : 'Fragen'} zu deiner Karte`)
  }
  return parts.join(' · ')
}

/**
 * Die Antwort des Nutzers auf eine Beobachtung.
 *
 * „Der Widerspruch ist selbst ein wertvolles Signal und muss zurueckfliessen." Deshalb ein
 * eigener Typ statt eines Booleans: „Stimmt nicht" ist keine Ablehnung einer Anzeige, sondern
 * eine Aussage der Person ueber sich selbst, und sie gehoert in den Musterkatalog zurueck.
 */
export type ObservationResponse = { patternId: string; agreed: boolean }

/**
 * Die Antwort auf eine Kartenfrage.
 *
 * „Weiss ich nicht" ist absichtlich kein Nein: der Vorschlag bleibt offen und verfaellt ueber
 * seine Frist, statt als abgelehnt protokolliert zu werden. Ein Nein aus Unsicherheit waere ein
 * falsches Signal an die Konsolidierung.
 */
export type MapQuestionResponse = {
  proposalId: string
  answer: 'accept' | 'reject' | 'unsure'
}

export function statusForAnswer(answer: MapQuestionResponse['answer']): StructureProposal['status'] | null {
  switch (answer) {
    case 'accept':
      return 'accepted'
    case 'reject':
      return 'rejected'
    case 'unsure':
      return null
  }
}
