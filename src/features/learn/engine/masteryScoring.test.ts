import { describe, it, expect } from 'vitest'
import {
  conceptWeight,
  weightedAverage,
  applyMinimumRule,
  topicScore,
  monotonicScore,
  isTopicMastered,
  pathProgress,
  MIN_RULE_CAP,
} from './masteryScoring'

describe('conceptWeight', () => {
  it('schwerere Konzepte wiegen mehr, mindestens 0.5', () => {
    expect(conceptWeight(5)).toBeGreaterThan(conceptWeight(1))
    expect(conceptWeight(1)).toBeGreaterThanOrEqual(0.5)
  })
})

describe('weightedAverage', () => {
  it('leere Liste -> 0', () => {
    expect(weightedAverage([])).toBe(0)
  })
  it('schwere Konzepte ziehen den Schnitt staerker', () => {
    const easyStrong = weightedAverage([
      { pMastery: 1, difficulty: 1 },
      { pMastery: 0, difficulty: 5 },
    ])
    const hardStrong = weightedAverage([
      { pMastery: 0, difficulty: 1 },
      { pMastery: 1, difficulty: 5 },
    ])
    expect(hardStrong).toBeGreaterThan(easyStrong)
  })
})

describe('applyMinimumRule', () => {
  it('deckelt bei kritisch schwachem Konzept auf 0.70', () => {
    const entries = [
      { pMastery: 0.95, difficulty: 3 },
      { pMastery: 0.2, difficulty: 3 },
    ]
    expect(applyMinimumRule(0.9, entries)).toBe(MIN_RULE_CAP)
  })
  it('ohne kritisches Konzept unveraendert', () => {
    const entries = [
      { pMastery: 0.9, difficulty: 3 },
      { pMastery: 0.8, difficulty: 3 },
    ]
    expect(applyMinimumRule(0.85, entries)).toBe(0.85)
  })
})

describe('topicScore', () => {
  it('9 starke + 1 kritisches Konzept bleibt <= 0.70', () => {
    const entries = [
      ...Array(9).fill({ pMastery: 0.95, difficulty: 3 }),
      { pMastery: 0.1, difficulty: 3 },
    ]
    expect(topicScore(entries)).toBeLessThanOrEqual(MIN_RULE_CAP + 1e-9)
  })
})

describe('monotonicScore', () => {
  it('sinkt nie unter den vorher angezeigten Wert', () => {
    expect(monotonicScore(0.6, 0.55)).toBe(0.6)
    expect(monotonicScore(0.6, 0.7)).toBe(0.7)
  })
})

describe('isTopicMastered', () => {
  it('braucht Schwelle UND bestandenen Abschlusstest', () => {
    expect(isTopicMastered(0.8, true)).toBe(true)
    expect(isTopicMastered(0.8, false)).toBe(false)
    expect(isTopicMastered(0.7, true)).toBe(false)
  })
})

describe('pathProgress', () => {
  it('zaehlt gemeisterte Themen und Prozent', () => {
    const p = pathProgress([1, 0.5, 0], [true, false, false])
    expect(p.mastered).toBe(1)
    expect(p.total).toBe(3)
    expect(p.percent).toBe(50)
  })
  it('leerer Pfad -> 0%', () => {
    expect(pathProgress([], [])).toEqual({ mastered: 0, total: 0, percent: 0 })
  })
})
