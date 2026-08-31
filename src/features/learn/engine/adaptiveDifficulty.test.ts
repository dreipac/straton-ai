import { describe, it, expect } from 'vitest'
import {
  adaptiveDeckOrder,
  masteryBandRank,
  nextDifficultyTarget,
  type OrderableCard,
} from './adaptiveDifficulty'

describe('masteryBandRank', () => {
  it('ordnet Mastery den Band-Raengen zu (schwach<neu<mittel<beherrscht)', () => {
    expect(masteryBandRank(0.1)).toBe(0)
    expect(masteryBandRank(null)).toBe(1)
    expect(masteryBandRank(0.5)).toBe(2)
    expect(masteryBandRank(0.9)).toBe(3)
  })
})

describe('nextDifficultyTarget', () => {
  it('startet bei base ohne Antworten', () => {
    expect(nextDifficultyTarget([])).toBe(3)
    expect(nextDifficultyTarget([], 2)).toBe(2)
  })
  it('hebt das Ziel bei einer Richtig-Serie und deckelt bei 5', () => {
    expect(nextDifficultyTarget([true, true])).toBe(5)
    expect(nextDifficultyTarget([true, true, true, true, true])).toBe(5)
  })
  it('senkt das Ziel bei Fehlern und deckelt bei 1', () => {
    expect(nextDifficultyTarget([false, false, false])).toBe(1)
  })
  it('gewichtet nur die letzten vier Antworten', () => {
    // erste beiden (falsch) fallen aus dem Fenster; nur 4x richtig zaehlen → 5
    expect(nextDifficultyTarget([false, false, true, true, true, true])).toBe(5)
  })
})

describe('adaptiveDeckOrder', () => {
  const read = (c: OrderableCard) => c
  it('schwache Konzepte zuerst, dann Schwierigkeit aufsteigend', () => {
    const cards: OrderableCard[] = [
      { difficulty: 2, mastery: 0.9 }, // beherrscht (Rang 3)
      { difficulty: 4, mastery: 0.1 }, // schwach (Rang 0)
      { difficulty: 1, mastery: 0.1 }, // schwach (Rang 0)
      { difficulty: 3, mastery: 0.5 }, // mittel (Rang 2)
    ]
    const ordered = adaptiveDeckOrder(cards, read)
    // schwach zuerst, innerhalb leicht→schwer: (1,0.1) vor (4,0.1)
    expect(ordered[0]).toEqual({ difficulty: 1, mastery: 0.1 })
    expect(ordered[1]).toEqual({ difficulty: 4, mastery: 0.1 })
    expect(ordered[2]).toEqual({ difficulty: 3, mastery: 0.5 })
    expect(ordered[3]).toEqual({ difficulty: 2, mastery: 0.9 })
  })
  it('ist stabil bei Gleichstand und entfernt nichts', () => {
    const cards: OrderableCard[] = [
      { difficulty: 3, mastery: null },
      { difficulty: 3, mastery: null },
    ]
    const ordered = adaptiveDeckOrder(cards, read)
    expect(ordered).toHaveLength(2)
    expect(ordered).toEqual(cards)
  })
})
