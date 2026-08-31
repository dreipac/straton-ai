import { describe, it, expect } from 'vitest'
import {
  assembleEntryCheck,
  personalizeSteps,
  remediationConcepts,
  nextDifficulty,
  weightExamConcepts,
  dueConcepts,
} from './adaptiveEngine'
import type { LearnerConceptState } from './types'

function state(conceptId: string, pMastery: number, extra: Partial<LearnerConceptState> = {}): LearnerConceptState {
  return {
    conceptId,
    pMastery,
    attempts: 1,
    correct: 0,
    outcomeHistory: [],
    decayRate: 0.08,
    lastSeenAt: null,
    nextReviewAt: null,
    ...extra,
  }
}

describe('assembleEntryCheck', () => {
  it('laesst gemeisterte Konzepte aus', () => {
    const concepts = [
      { id: 'known', difficulty: 2 },
      { id: 'weak', difficulty: 3 },
    ]
    const states = new Map([['known', state('known', 0.95)]])
    const check = assembleEntryCheck(concepts, states)
    expect(check).toContain('weak')
    expect(check).not.toContain('known')
  })
  it('deckelt die Anzahl', () => {
    const concepts = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, difficulty: (i % 5) + 1 }))
    const check = assembleEntryCheck(concepts, new Map(), { maxQuestions: 4 })
    expect(check.length).toBeLessThanOrEqual(4)
  })
})

describe('personalizeSteps', () => {
  it('ueberspringt Schritte, deren Konzepte alle gemeistert sind', () => {
    const states = new Map([
      ['a', state('a', 0.9)],
      ['b', state('b', 0.9)],
      ['c', state('c', 0.3)],
    ])
    const { kept, skipped } = personalizeSteps(
      [
        { stepId: 's1', conceptIds: ['a', 'b'] },
        { stepId: 's2', conceptIds: ['c'] },
      ],
      states,
    )
    expect(skipped.map((s) => s.stepId)).toEqual(['s1'])
    expect(kept.map((s) => s.stepId)).toEqual(['s2'])
  })
})

describe('remediationConcepts', () => {
  it('nur Konzepte im Band [0.4, 0.7]', () => {
    const states = new Map([
      ['low', state('low', 0.2)],
      ['mid', state('mid', 0.55)],
      ['high', state('high', 0.9)],
    ])
    expect(remediationConcepts(['low', 'mid', 'high'], states)).toEqual(['mid'])
  })
})

describe('nextDifficulty', () => {
  it('drei Richtige hintereinander -> hochschalten', () => {
    expect(nextDifficulty(2, [true, true, true])).toBe(3)
  })
  it('zwei von drei falsch -> runter', () => {
    expect(nextDifficulty(3, [false, true, false])).toBe(2)
  })
  it('bleibt in [1,5]', () => {
    expect(nextDifficulty(5, [true, true, true])).toBe(5)
    expect(nextDifficulty(1, [false, false, false])).toBe(1)
  })
})

describe('weightExamConcepts', () => {
  it('schwaechere Konzepte bekommen mehr Gewicht', () => {
    const states = new Map([
      ['weak', state('weak', 0.2)],
      ['strong', state('strong', 0.9)],
    ])
    const weights = weightExamConcepts(['weak', 'strong'], states)
    const weak = weights.find((w) => w.conceptId === 'weak')!
    const strong = weights.find((w) => w.conceptId === 'strong')!
    expect(weak.weight).toBeGreaterThan(strong.weight)
  })
})

describe('dueConcepts', () => {
  it('liefert nur faellige Konzepte', () => {
    const states = [
      state('due', 0.5, { nextReviewAt: '2026-01-01T00:00:00Z' }),
      state('later', 0.5, { nextReviewAt: '2026-12-01T00:00:00Z' }),
      state('never', 0.5, { nextReviewAt: null }),
    ]
    expect(dueConcepts(states, '2026-06-01T00:00:00Z')).toEqual(['due'])
  })
})
