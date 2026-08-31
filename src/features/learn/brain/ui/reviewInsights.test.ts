/**
 * Anbindung Wiederholen-Bereich und Einsichten-Karte — Tests gegen UI-Spezifikation
 * Kapitel 3.7, 5 und 15.
 *
 * Der wichtigste Test dieser Datei ist der erste im zweiten Block: Invariante I7 muss die
 * Einsichten waehrend einer Sitzung unterdruecken, und zwar hier und nicht in der Komponente.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, ErrorPattern, LearnerConceptImage, StructureProposal } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  buildEmptyForecast,
  buildReviewCompletion,
  buildReviewOverview,
  ABORT_NOTICE,
  REVIEW_EXPLAINER,
} from './reviewView'
import { buildInsightsCard, statusForAnswer, MERGE_VALUE_WARNING } from './insightsView'

const NOW = '2026-08-19T10:00:00.000Z'
const DUE = '2026-08-10T10:00:00.000Z'

function concept(id: string, name = `Konzept ${id}`): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
  }
}

/** Gefestigt und faellig — der Normalfall des Stapels. */
function stackItem(id: string, overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return {
    ...emptyImage(id, 3),
    mastery: 0.82,
    confidence: 0.7,
    directEvidenceCount: 5,
    directEvidenceWeight: 5,
    everConsolidated: true,
    lastSeenAt: DUE,
    lastDirectEvidenceAt: DUE,
    nextReviewAt: DUE,
    ...overrides,
  }
}

describe('Wiederholen-Uebersicht (Kapitel 5.2 und 5.7)', () => {
  it('zeigt jedes faellige Konzept mit Grund', () => {
    const view = buildReviewOverview({
      images: [stackItem('a')],
      concepts: [concept('a', 'VLSM')],
      nowIso: NOW,
    })
    expect(view.items).toHaveLength(1)
    expect(view.items[0].conceptName).toBe('VLSM')
    expect(view.items[0].reason.length).toBeGreaterThan(0)
  })

  it('zaehlt Konzepte, nicht Abfragen', () => {
    /*
     * Kapitel 5.7: „17 Lernkarten" suggeriert 17 existierende Objekte, tatsaechlich sind es
     * abgeleitete Pruefpunkte. Eine Zahl, die ohne Nutzerhandlung springt, wirkt kaputt.
     */
    const view = buildReviewOverview({
      images: [stackItem('a'), stackItem('b')],
      concepts: [concept('a'), concept('b')],
      nowIso: NOW,
    })
    expect(view.counterLabel).toBe('2 Konzepte faellig')
  })

  it('haelt sich an die Zustaendigkeitsgrenze aus Kapitel 6.7', () => {
    // Ein nie gefestigtes Konzept gehoert in den Pfad und darf im Stapel nicht auftauchen.
    const nieGesessen = stackItem('b', { mastery: 0.3, everConsolidated: false })
    const view = buildReviewOverview({
      images: [stackItem('a'), nieGesessen],
      concepts: [concept('a'), concept('b')],
      nowIso: NOW,
    })
    expect(view.items.map((i) => i.conceptId)).toEqual(['a'])
  })

  it('bricht die Karteikarten-Erwartung ausdruecklich', () => {
    expect(REVIEW_EXPLAINER).toContain('tippst statt umzudrehen')
    expect(REVIEW_EXPLAINER).toContain('Formulierungen wechseln')
  })

  it('bietet ohne faellige Konzepte keinen Einstieg an', () => {
    const view = buildReviewOverview({ images: [], concepts: [], nowIso: NOW })
    expect(view.isEmpty).toBe(true)
    expect(view.canStartFull).toBe(false)
  })
})

describe('Stapelabschluss (Kapitel 5.4)', () => {
  it('zeigt die naechste Faelligkeit statt einer Punktzahl', () => {
    const view = buildReviewCompletion({
      images: [{ ...stackItem('a'), nextReviewAt: '2026-08-24T10:00:00.000Z' }],
      concepts: [concept('a', 'VLSM')],
      nowIso: NOW,
    })
    expect(view.nextDates[0].label).toBe('wieder dran in 5 Tagen')
    // Ausdruecklich keine Trefferquote: Auffrischung ist keine Pruefung.
    expect(JSON.stringify(view)).not.toMatch(/richtig|Punkte|Quote/i)
  })

  it('sagt, dass Abbrechen nichts verwirft', () => {
    expect(ABORT_NOTICE).toContain('verwirft nichts')
  })
})

describe('Einsichten-Karte (Kapitel 3.7)', () => {
  const pattern: ErrorPattern = {
    id: 'p1',
    userId: 'u1',
    name: 'Uebersieht Angaben in der Aufgabenstellung',
    kind: 'overlooked',
    object: 'Angaben in der Aufgabenstellung',
    scope: 'generic',
    subjects: ['Netzwerktechnik', 'Mathematik'],
    distinctConceptCount: 3,
    occurrenceCount: 7,
    distinctDayCount: 4,
    surfaced: true,
    userDisputed: false,
    mergedIntoId: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
  }

  const mergeProposal: StructureProposal = {
    id: 'sp1',
    userId: 'u1',
    pathId: 'path1',
    operation: 'mergeConcepts',
    payload: {},
    evidence: {},
    question: 'Meinen „Subnetzmaske" und „Netzmaske berechnen" bei dir dasselbe?',
    rationale: 'Beide Konzepte werden immer zusammen richtig oder falsch beantwortet.',
    requiresConfirmation: true,
    status: 'pending',
    surfaceContext: 'mapReview',
    expiresAt: '2026-09-10T10:00:00.000Z',
  }

  it('zeigt waehrend einer Sitzung gar nichts (Invariante I7)', () => {
    /*
     * Die Unterdrueckung sitzt in dieser Schicht und nicht in der Komponente. Eine Komponente,
     * die den Filter vergisst, bekaeme sonst Inhalte zum Rendern — und ein weggeklickter
     * Verschmelzungsvorschlag ist schlimmer als keiner, weil er als beantwortet gilt.
     */
    const card = buildInsightsCard({
      patterns: [pattern],
      proposals: [mergeProposal],
      context: 'inSession',
      nowIso: NOW,
    })
    expect(card.isEmpty).toBe(true)
    expect(card.observations).toHaveLength(0)
    expect(card.mapQuestions).toHaveLength(0)
    expect(card.suppressedReason).toContain('I7')
  })

  it('formuliert Beobachtungen mit Beleg und Widerspruchsmoeglichkeit', () => {
    const card = buildInsightsCard({ patterns: [pattern], proposals: [], context: 'pathTab', nowIso: NOW })
    expect(card.observations[0].text).toContain('Mir faellt auf')
    expect(card.observations[0].actions).toEqual(['Kommt hin', 'Stimmt nicht'])
    expect(card.counterLabel).toBe('1 Beobachtung ueber dich')
  })

  it('schweigt ueber Muster unter der Anzeigeschwelle', () => {
    // „Es handelt auf Verdacht, es redet nur ueber Gewissheit."
    const card = buildInsightsCard({
      patterns: [{ ...pattern, surfaced: false }],
      proposals: [],
      context: 'pathTab',
      nowIso: NOW,
    })
    expect(card.observations).toHaveLength(0)
  })

  it('zeigt ein bestrittenes Muster nicht erneut', () => {
    const card = buildInsightsCard({
      patterns: [{ ...pattern, userDisputed: true }],
      proposals: [],
      context: 'pathTab',
      nowIso: NOW,
    })
    expect(card.observations).toHaveLength(0)
  })

  it('kuendigt bei Verschmelzungen die konservative Wertregel an', () => {
    const card = buildInsightsCard({ patterns: [], proposals: [mergeProposal], context: 'pathTab', nowIso: NOW })
    expect(card.mapQuestions[0].destructive).toBe(true)
    expect(card.mapQuestions[0].valueWarning).toBe(MERGE_VALUE_WARNING)
    expect(card.mapQuestions[0].actions).toContain('Weiss ich nicht')
  })

  it('laesst abgelaufene Kartenfragen verfallen', () => {
    const card = buildInsightsCard({
      patterns: [],
      proposals: [{ ...mergeProposal, expiresAt: '2026-08-01T10:00:00.000Z' }],
      context: 'pathTab',
      nowIso: NOW,
    })
    expect(card.mapQuestions).toHaveLength(0)
  })

  it('belastet den Sitzungsbeginn nicht mit reinen Kartenfragen', () => {
    const amAnfang = buildInsightsCard({
      patterns: [],
      proposals: [mergeProposal],
      context: 'sessionStart',
      nowIso: NOW,
    })
    expect(amAnfang.mapQuestions).toHaveLength(0)

    const ausdruecklich = buildInsightsCard({
      patterns: [],
      proposals: [{ ...mergeProposal, surfaceContext: 'sessionStart' }],
      context: 'sessionStart',
      nowIso: NOW,
    })
    expect(ausdruecklich.mapQuestions).toHaveLength(1)
  })

  it('behandelt „weiss ich nicht" nicht als Ablehnung', () => {
    // Ein Nein aus Unsicherheit waere ein falsches Signal an die Konsolidierung.
    expect(statusForAnswer('accept')).toBe('accepted')
    expect(statusForAnswer('reject')).toBe('rejected')
    expect(statusForAnswer('unsure')).toBeNull()
  })
})


/**
 * Der Leerzustand mit Angabe (UI-Spezifikation Kapitel 8).
 *
 * „Nichts faellig. Komm in zwei Tagen wieder, dann werden 4 Konzepte weich." — die Angabe ist der
 * Grund wiederzukommen; ohne sie liest sich der Bereich wie erledigt.
 */
describe('Leerzustand des Stapels (Kapitel 8)', () => {
  it('nennt Tag und Anzahl der naechsten Faelligkeit', () => {
    const soon = new Date(new Date(NOW).getTime() + 2 * 86_400_000).toISOString()
    const text = buildEmptyForecast(
      [stackItem('a', { nextReviewAt: soon }), stackItem('b', { nextReviewAt: soon })],
      NOW,
    )
    expect(text).toContain('in 2 Tagen')
    expect(text).toContain('2 Konzepte')
  })

  it('zaehlt nur, was ueberhaupt in den Stapel darf (Kapitel 6.7)', () => {
    const soon = new Date(new Date(NOW).getTime() + 86_400_000).toISOString()
    const nieGefestigt = stackItem('b', { nextReviewAt: soon, everConsolidated: false, mastery: 0.3 })
    const text = buildEmptyForecast([stackItem('a', { nextReviewAt: soon }), nieGefestigt], NOW)
    expect(text).toContain('morgen')
    expect(text).toContain('1 Konzept')
  })

  it('sagt es ehrlich, wenn gar nichts ansteht', () => {
    expect(buildEmptyForecast([], NOW)).toContain('Der Pfad ist gerade der bessere Ort.')
  })

  it('haengt die Vorschau an die leere Uebersicht', () => {
    const later = new Date(new Date(NOW).getTime() + 3 * 86_400_000).toISOString()
    const view = buildReviewOverview({
      // Ein Iterator statt eines Feldes: genau so reicht die Oberflaeche die Bilder herein.
      images: new Map([['a', stackItem('a', { nextReviewAt: later })]]).values(),
      concepts: [concept('a')],
      nowIso: NOW,
    })
    expect(view.isEmpty).toBe(true)
    expect(view.emptyForecast).toContain('in 3 Tagen')
  })
})
