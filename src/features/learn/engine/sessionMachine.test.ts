import { describe, it, expect } from 'vitest'
import {
  canTransition,
  nextTopicStatus,
  statusRank,
  isTopicComplete,
  isTopicUnlocked,
  firstUnmasteredIndex,
  allTopicsMastered,
  masteredCount,
  TOPIC_STATUS_ORDER,
  type TopicStatus,
} from './sessionMachine'

describe('Themen-Uebergaenge', () => {
  it('durchlaeuft den vollen Lebenszyklus', () => {
    let s: TopicStatus = 'locked'
    s = nextTopicStatus(s, 'open')
    expect(s).toBe('entry_check')
    s = nextTopicStatus(s, 'analyze')
    expect(s).toBe('analyzing')
    s = nextTopicStatus(s, 'substepsReady')
    expect(s).toBe('learning')
    s = nextTopicStatus(s, 'allSubstepsCompleted')
    expect(s).toBe('mastered')
  })

  it('laesst illegale Uebergaenge den Zustand unveraendert', () => {
    expect(nextTopicStatus('locked', 'analyze')).toBe('locked')
    expect(nextTopicStatus('mastered', 'open')).toBe('mastered')
    expect(nextTopicStatus('learning', 'open')).toBe('learning')
  })

  it('canTransition spiegelt die Tabelle', () => {
    expect(canTransition('locked', 'open')).toBe(true)
    expect(canTransition('locked', 'analyze')).toBe(false)
    expect(canTransition('mastered', 'allSubstepsCompleted')).toBe(false)
  })
})

describe('Ableitungen', () => {
  it('statusRank folgt der Reihenfolge', () => {
    expect(statusRank('locked')).toBe(0)
    expect(statusRank('mastered')).toBe(TOPIC_STATUS_ORDER.length - 1)
  })

  it('isTopicComplete nur bei mastered', () => {
    expect(isTopicComplete('mastered')).toBe(true)
    expect(isTopicComplete('learning')).toBe(false)
  })

  it('isTopicUnlocked: erstes immer, sonst nur wenn vorheriges gemeistert', () => {
    const statuses: TopicStatus[] = ['mastered', 'learning', 'locked']
    expect(isTopicUnlocked(statuses, 0)).toBe(true)
    expect(isTopicUnlocked(statuses, 1)).toBe(true) // vorheriges mastered
    expect(isTopicUnlocked(statuses, 2)).toBe(false) // vorheriges learning
  })

  it('firstUnmasteredIndex findet die Frontier / -1 wenn alle gemeistert', () => {
    expect(firstUnmasteredIndex(['mastered', 'mastered', 'learning'])).toBe(2)
    expect(firstUnmasteredIndex(['mastered', 'mastered'])).toBe(-1)
  })

  it('allTopicsMastered inkl. leere Liste (true)', () => {
    expect(allTopicsMastered(['mastered', 'mastered'])).toBe(true)
    expect(allTopicsMastered(['mastered', 'learning'])).toBe(false)
    expect(allTopicsMastered([])).toBe(true)
  })

  it('masteredCount zaehlt gemeisterte Themen', () => {
    expect(masteredCount(['mastered', 'learning', 'mastered', 'locked'])).toBe(2)
  })
})
