import { describe, it, expect } from 'vitest'
import {
  updateMastery,
  slipFor,
  guessFor,
  seedPrior,
  computeMasteryFromHistory,
  DEFAULT_BKT_PARAMS,
} from './bkt'

describe('bkt weiche Evidenz (Teil-Credit)', () => {
  it('credit=1 identisch zu correct:true, credit=0 identisch zu correct:false', () => {
    const prior = 0.4
    expect(updateMastery(prior, { correct: true, difficulty: 3, credit: 1 })).toBeCloseTo(
      updateMastery(prior, { correct: true, difficulty: 3 }),
      10,
    )
    expect(updateMastery(prior, { correct: false, difficulty: 3, credit: 0 })).toBeCloseTo(
      updateMastery(prior, { correct: false, difficulty: 3 }),
      10,
    )
  })

  it('Teil-Credit liegt zwischen Falsch- und Richtig-Update', () => {
    const prior = 0.4
    const low = updateMastery(prior, { correct: false, difficulty: 3 })
    const high = updateMastery(prior, { correct: true, difficulty: 3 })
    const partial = updateMastery(prior, { correct: false, difficulty: 3, credit: 0.6 })
    expect(partial).toBeGreaterThan(low)
    expect(partial).toBeLessThan(high)
  })

  it('clamped Credit ausserhalb [0,1]', () => {
    const prior = 0.4
    expect(updateMastery(prior, { correct: true, difficulty: 3, credit: 5 })).toBeCloseTo(
      updateMastery(prior, { correct: true, difficulty: 3, credit: 1 }),
      10,
    )
  })
})

describe('bkt slip/guess difficulty modulation', () => {
  it('slip steigt mit Schwierigkeit, guess sinkt mit Schwierigkeit', () => {
    expect(slipFor(1)).toBeLessThan(slipFor(5))
    expect(guessFor(1)).toBeGreaterThan(guessFor(5))
  })

  it('bleibt in sinnvollen Schranken und clamped Schwierigkeit', () => {
    expect(slipFor(99)).toBeLessThanOrEqual(0.45)
    expect(guessFor(-3)).toBeLessThanOrEqual(0.5)
    expect(guessFor(99)).toBeGreaterThanOrEqual(0.03)
  })
})

describe('bkt updateMastery', () => {
  it('richtige Antwort hebt, falsche senkt', () => {
    const base = 0.5
    expect(updateMastery(base, { correct: true, difficulty: 3 })).toBeGreaterThan(base)
    expect(updateMastery(base, { correct: false, difficulty: 3 })).toBeLessThan(base)
  })

  it('richtig bei schwerer Frage hebt staerker als bei leichter', () => {
    const easy = updateMastery(0.5, { correct: true, difficulty: 1 })
    const hard = updateMastery(0.5, { correct: true, difficulty: 5 })
    expect(hard).toBeGreaterThan(easy)
  })

  it('falsch bei sehr schwerer Frage senkt schwaecher als bei leichter', () => {
    const easyWrong = updateMastery(0.6, { correct: false, difficulty: 1 })
    const hardWrong = updateMastery(0.6, { correct: false, difficulty: 5 })
    expect(hardWrong).toBeGreaterThan(easyWrong) // weniger stark gesenkt
  })

  it('bleibt im Intervall [0,1] auch an den Raendern', () => {
    expect(updateMastery(0, { correct: false, difficulty: 3 })).toBeGreaterThanOrEqual(0)
    expect(updateMastery(1, { correct: true, difficulty: 3 })).toBeLessThanOrEqual(1)
    expect(updateMastery(1.5, { correct: true, difficulty: 3 })).toBeLessThanOrEqual(1)
    expect(updateMastery(-0.5, { correct: false, difficulty: 3 })).toBeGreaterThanOrEqual(0)
  })
})

describe('bkt Verlaufstrend', () => {
  it('Aufwaertstrend endet hoeher als Abwaertstrend bei gleichem Verhaeltnis', () => {
    const upTrend = [
      ...Array(5).fill({ correct: false, difficulty: 3 }),
      ...Array(3).fill({ correct: true, difficulty: 3 }),
    ]
    const downTrend = [
      ...Array(3).fill({ correct: true, difficulty: 3 }),
      ...Array(5).fill({ correct: false, difficulty: 3 }),
    ]
    expect(computeMasteryFromHistory(upTrend)).toBeGreaterThan(computeMasteryFromHistory(downTrend))
  })

  it('viele richtige hintereinander naehern sich hoher Mastery', () => {
    const many = Array(10).fill({ correct: true, difficulty: 3 })
    expect(computeMasteryFromHistory(many)).toBeGreaterThan(0.9)
  })
})

describe('bkt seedPrior', () => {
  it('schwerere Konzepte starten mit niedrigerem Prior', () => {
    expect(seedPrior(1)).toBeGreaterThan(seedPrior(5))
    expect(seedPrior(3)).toBeGreaterThanOrEqual(0.1)
    expect(seedPrior(3)).toBeLessThanOrEqual(0.5)
  })
})

describe('bkt params sind konfigurierbar', () => {
  it('hoehere learn-Rate hebt schneller', () => {
    const slow = updateMastery(0.5, { correct: true, difficulty: 3 }, { ...DEFAULT_BKT_PARAMS, learn: 0.05 })
    const fast = updateMastery(0.5, { correct: true, difficulty: 3 }, { ...DEFAULT_BKT_PARAMS, learn: 0.3 })
    expect(fast).toBeGreaterThan(slow)
  })
})
