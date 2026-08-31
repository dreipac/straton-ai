import { describe, it, expect } from 'vitest'
import {
  applyConceptObservation,
  nextReviewIntervalDays,
  effectiveMastery,
  OUTCOME_HISTORY_CAP,
} from './learnerModel'
import { DEFAULT_DECAY_RATE } from './forgetting'
import type { Concept, ConceptEdge, LearnerConceptState } from './types'

function concept(id: string, difficulty = 3, ordinal = 0): Concept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: id.toUpperCase(),
    description: '',
    difficulty,
    sourceRef: {},
    ordinal,
  }
}

const NOW = '2026-01-10T12:00:00.000Z'

describe('nextReviewIntervalDays', () => {
  it('steigt monoton mit der Mastery', () => {
    expect(nextReviewIntervalDays(0.1)).toBe(1)
    expect(nextReviewIntervalDays(0.4)).toBe(2)
    expect(nextReviewIntervalDays(0.6)).toBe(4)
    expect(nextReviewIntervalDays(0.8)).toBe(8)
    expect(nextReviewIntervalDays(0.95)).toBe(15)
  })
})

describe('applyConceptObservation — erstes Signal', () => {
  it('erzeugt einen Zustand aus dem Graph-Seed und hebt bei korrekt', () => {
    const c = concept('binary', 2)
    const { updated } = applyConceptObservation({
      concept: c,
      edges: [],
      statesById: new Map(),
      correct: true,
      nowIso: NOW,
    })
    expect(updated.conceptId).toBe('binary')
    expect(updated.attempts).toBe(1)
    expect(updated.correct).toBe(1)
    expect(updated.pMastery).toBeGreaterThan(0.3)
    expect(updated.lastSeenAt).toBe(NOW)
    expect(updated.outcomeHistory).toHaveLength(1)
    expect(updated.outcomeHistory[0]).toMatchObject({ correct: true, at: NOW })
    // firstTryCorrect -> Verfallsrate sinkt unter den Default
    expect(updated.decayRate).toBeLessThan(DEFAULT_DECAY_RATE)
  })

  it('falsch senkt die Mastery gegenueber richtig', () => {
    const c = concept('mask', 3)
    const wrong = applyConceptObservation({ concept: c, edges: [], statesById: new Map(), correct: false, nowIso: NOW })
    const right = applyConceptObservation({ concept: c, edges: [], statesById: new Map(), correct: true, nowIso: NOW })
    expect(wrong.updated.pMastery).toBeLessThan(right.updated.pMastery)
  })
})

describe('applyConceptObservation — Fortschreibung', () => {
  it('addiert Versuche/Historie und deckelt die Historie', () => {
    const c = concept('vlsm', 3)
    let state: LearnerConceptState | undefined
    const statesById = new Map<string, LearnerConceptState>()
    for (let i = 0; i < OUTCOME_HISTORY_CAP + 5; i += 1) {
      const { updated } = applyConceptObservation({
        concept: c,
        edges: [],
        statesById,
        correct: i % 2 === 0,
        nowIso: NOW,
      })
      state = updated
      statesById.set(c.id, updated)
    }
    expect(state?.attempts).toBe(OUTCOME_HISTORY_CAP + 5)
    expect(state?.outcomeHistory.length).toBe(OUTCOME_HISTORY_CAP)
  })

  it('startet die neue Evidenz vom verfallenen Vorwert (Vergessen vor Update)', () => {
    const c = concept('cidr', 3)
    const old: LearnerConceptState = {
      conceptId: 'cidr',
      pMastery: 0.9,
      attempts: 4,
      correct: 4,
      outcomeHistory: [{ correct: true, difficulty: 3, at: '2025-12-01T00:00:00.000Z' }],
      decayRate: 0.2,
      lastSeenAt: '2025-12-01T00:00:00.000Z',
      nextReviewAt: null,
    }
    const statesById = new Map([['cidr', old]])
    // Lange Pause + falsche Antwort: Ergebnis muss deutlich unter dem alten 0.9 liegen.
    const { updated } = applyConceptObservation({ concept: c, edges: [], statesById, correct: false, nowIso: NOW })
    expect(updated.pMastery).toBeLessThan(0.9)
  })
})

describe('applyConceptObservation — keine Propagation mehr', () => {
  it('laesst Nachbarknoten unberuehrt (Invarianten I1 und I3)', () => {
    const a = concept('a')
    const edges: ConceptEdge[] = [
      { id: 'e1', pathId: 'p1', fromConceptId: 'a', toConceptId: 'b', type: 'related' },
      { id: 'e2', pathId: 'p1', fromConceptId: 'a', toConceptId: 'c', type: 'related' },
    ]
    const bState: LearnerConceptState = {
      conceptId: 'b',
      pMastery: 0.5,
      attempts: 1,
      correct: 1,
      outcomeHistory: [],
      decayRate: DEFAULT_DECAY_RATE,
      lastSeenAt: NOW,
      nextReviewAt: null,
    }
    const statesById = new Map([['b', bState]])
    const { updated, propagated } = applyConceptObservation({
      concept: a,
      edges,
      statesById,
      correct: true,
      nowIso: NOW,
    })

    // Frueher wurde b hier mitgezogen. Eine richtige Antwort auf a ist aber keine Evidenz zu b:
    // I1 laesst nur direkte Evidenz an die Beherrschung, I3 verbietet Propagation auf ihr ganz.
    expect(propagated).toHaveLength(0)
    expect(statesById.get('b')?.pMastery).toBe(0.5)
    // Das bewertete Konzept selbst bewegt sich weiterhin.
    expect(updated.conceptId).toBe('a')
    expect(updated.attempts).toBe(1)
  })
})

describe('effectiveMastery', () => {
  it('wendet Verfall seit lastSeenAt an', () => {
    const state: LearnerConceptState = {
      conceptId: 'x',
      pMastery: 0.8,
      attempts: 2,
      correct: 2,
      outcomeHistory: [],
      decayRate: 0.1,
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      nextReviewAt: null,
    }
    const decayed = effectiveMastery(state, NOW)
    expect(decayed).toBeLessThan(0.8)
    expect(decayed).toBeGreaterThan(0.1)
  })
})
