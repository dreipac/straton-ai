import { describe, it, expect } from 'vitest'
import { applyDecay, daysBetween, decayedMastery, adjustDecayRate, MASTERY_FLOOR } from './forgetting'
import type { LearnerConceptState } from './types'

describe('daysBetween', () => {
  it('berechnet Tage und ist nie negativ', () => {
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z')).toBeCloseTo(3, 5)
    expect(daysBetween('2026-01-04T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(0)
  })
  it('ungueltige Daten -> 0', () => {
    expect(daysBetween('kaputt', '2026-01-01T00:00:00Z')).toBe(0)
  })
})

describe('applyDecay', () => {
  it('mehr verstrichene Zeit -> niedrigere Mastery', () => {
    const short = applyDecay(0.9, 0.1, 2)
    const long = applyDecay(0.9, 0.1, 20)
    expect(long).toBeLessThan(short)
    expect(short).toBeLessThan(0.9)
  })
  it('respektiert den Bodenwert und faellt nie darunter', () => {
    expect(applyDecay(0.9, 0.5, 1000)).toBeGreaterThanOrEqual(MASTERY_FLOOR - 1e-9)
  })
  it('kein Verfall ohne Zeit oder ohne Rate', () => {
    expect(applyDecay(0.8, 0.1, 0)).toBe(0.8)
    expect(applyDecay(0.8, 0, 10)).toBe(0.8)
  })
  it('Werte auf/unter dem Boden bleiben unveraendert', () => {
    expect(applyDecay(0.05, 0.2, 10)).toBe(0.05)
  })
})

describe('decayedMastery', () => {
  const base: LearnerConceptState = {
    conceptId: 'c1',
    pMastery: 0.8,
    attempts: 3,
    correct: 3,
    outcomeHistory: [],
    decayRate: 0.1,
    lastSeenAt: '2026-01-01T00:00:00Z',
    nextReviewAt: null,
  }
  it('ohne lastSeenAt keine Aenderung', () => {
    expect(decayedMastery({ ...base, lastSeenAt: null }, '2026-02-01T00:00:00Z')).toBe(0.8)
  })
  it('mit verstrichener Zeit gesunken', () => {
    expect(decayedMastery(base, '2026-01-15T00:00:00Z')).toBeLessThan(0.8)
  })
})

describe('adjustDecayRate', () => {
  it('firstTryCorrect senkt die Rate', () => {
    expect(adjustDecayRate(0.1, { firstTryCorrect: true, priorWrongStreak: 0, consistentAcrossSessions: false }))
      .toBeLessThan(0.1)
  })
  it('viele Fehlversuche erhoehen die Rate', () => {
    expect(adjustDecayRate(0.1, { firstTryCorrect: false, priorWrongStreak: 4, consistentAcrossSessions: false }))
      .toBeGreaterThan(0.1)
  })
  it('Konsistenz ueber Sessions senkt zusaetzlich', () => {
    const withConsistency = adjustDecayRate(0.1, {
      firstTryCorrect: true,
      priorWrongStreak: 0,
      consistentAcrossSessions: true,
    })
    const without = adjustDecayRate(0.1, {
      firstTryCorrect: true,
      priorWrongStreak: 0,
      consistentAcrossSessions: false,
    })
    expect(withConsistency).toBeLessThan(without)
  })
  it('bleibt in Schranken [0.01, 0.4]', () => {
    expect(adjustDecayRate(0.001, { firstTryCorrect: true, priorWrongStreak: 0, consistentAcrossSessions: true }))
      .toBeGreaterThanOrEqual(0.01)
    expect(adjustDecayRate(1, { firstTryCorrect: false, priorWrongStreak: 5, consistentAcrossSessions: false }))
      .toBeLessThanOrEqual(0.4)
  })
})
