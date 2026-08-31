import { describe, it, expect } from 'vitest'
import { initialCardState, isCardDue, reviewCard, dueCards, DEFAULT_EASINESS } from './reviewScheduler'

const NOW = '2026-06-01T00:00:00Z'

describe('initialCardState / isCardDue', () => {
  it('neue Karte ist sofort faellig', () => {
    expect(isCardDue(initialCardState('c1'), NOW)).toBe(true)
  })
})

describe('reviewCard', () => {
  it('erste richtige Antwort -> Intervall 1 Tag, Stufe 1', () => {
    const next = reviewCard(initialCardState('c1'), { correct: true }, NOW)
    expect(next.srStage).toBe(1)
    expect(next.intervalDays).toBe(1)
    expect(next.easiness).toBeGreaterThan(DEFAULT_EASINESS)
    expect(next.nextReviewAt).toBe('2026-06-02T00:00:00.000Z')
  })

  it('Intervalle wachsen bei Folge-Erfolgen', () => {
    let s = initialCardState('c1')
    const intervals: number[] = []
    for (let i = 0; i < 4; i += 1) {
      s = reviewCard(s, { correct: true }, NOW)
      intervals.push(s.intervalDays)
    }
    // 1, 6, dann wachsend
    expect(intervals[0]).toBe(1)
    expect(intervals[1]).toBe(6)
    expect(intervals[2]).toBeGreaterThan(intervals[1])
    expect(intervals[3]).toBeGreaterThan(intervals[2])
  })

  it('falsche Antwort setzt zurueck auf Stufe 0 / 1 Tag und senkt Easiness', () => {
    let s = reviewCard(initialCardState('c1'), { correct: true }, NOW)
    s = reviewCard(s, { correct: true }, NOW)
    const easinessBefore = s.easiness
    const failed = reviewCard(s, { correct: false }, NOW)
    expect(failed.srStage).toBe(0)
    expect(failed.intervalDays).toBe(1)
    expect(failed.easiness).toBeLessThan(easinessBefore)
    expect(failed.status).toBe('learning')
  })

  it('erreicht Status "mastered" nach genug Erfolgen', () => {
    let s = initialCardState('c1')
    for (let i = 0; i < 4; i += 1) {
      s = reviewCard(s, { correct: true }, NOW)
    }
    expect(s.status).toBe('mastered')
  })

  it('hohe Konzept-Verfallsrate verkuerzt das Intervall', () => {
    let base = initialCardState('c1')
    base = reviewCard(base, { correct: true }, NOW)
    base = reviewCard(base, { correct: true }, NOW) // Stufe 2, Intervall 6
    const normal = reviewCard(base, { correct: true }, NOW)
    const highDecay = reviewCard(base, { correct: true, conceptDecayRate: 0.3 }, NOW)
    expect(highDecay.intervalDays).toBeLessThan(normal.intervalDays)
  })
})

describe('dueCards', () => {
  it('filtert faellige Karten', () => {
    const a = { ...initialCardState('a'), nextReviewAt: '2026-01-01T00:00:00Z' }
    const b = { ...initialCardState('b'), nextReviewAt: '2026-12-01T00:00:00Z' }
    expect(dueCards([a, b], NOW).map((c) => c.cardId)).toEqual(['a'])
  })
})
