/**
 * Ziel und Machbarkeit (Kapitel 6.3) — Tests.
 *
 * Der eigentliche Pruefstein ist die Ehrlichkeit: liefert die Machbarkeitsaussage im
 * Nichtmachbarkeitsfall einen konkreten Verzicht statt eines Motivationsspruchs?
 */

import { describe, expect, it } from 'vitest'
import type { LearnerConceptImage, LearningGoal } from '../types'
import { emptyImage } from '../memory/learnerImage'
import { assessGoal, describeFeasibility, estimateConceptMinutes, isInGoalScope } from './goal'

const NOW = '2026-08-18T10:00:00.000Z'

function goal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  return {
    id: 'g1',
    userId: 'u1',
    pathId: 'p1',
    title: 'Pruefung Netzwerktechnik',
    dueAt: '2026-08-23T10:00:00.000Z',
    conceptIds: ['c1', 'c2', 'c3'],
    minutesPerDay: 40,
    targetDepth: 'apply',
    status: 'active',
    ...overrides,
  }
}

function images(entries: [string, Partial<LearnerConceptImage>][]): Map<string, LearnerConceptImage> {
  return new Map(entries.map(([id, o]) => [id, { ...emptyImage(id, 3), ...o }]))
}

describe('Aufwandsschaetzung', () => {
  it('veranschlagt fuer ein unberuehrtes Konzept den vollen Aufwand', () => {
    expect(estimateConceptMinutes({ image: undefined, targetDepth: 'apply', nowIso: NOW })).toBeGreaterThan(0)
  })

  it('veranschlagt fuer ein sitzendes Konzept nichts mehr', () => {
    const image = { ...emptyImage('c1', 3), mastery: 0.9, depth: 'apply' as const }
    expect(estimateConceptMinutes({ image, targetDepth: 'apply', nowIso: NOW })).toBe(0)
  })

  it('veranschlagt fuer eine hoehere Zielstufe mehr', () => {
    const image = { ...emptyImage('c1', 3), mastery: 0.9, depth: 'recognize' as const }
    const apply = estimateConceptMinutes({ image, targetDepth: 'apply', nowIso: NOW })
    const transfer = estimateConceptMinutes({ image, targetDepth: 'transfer', nowIso: NOW })
    expect(transfer).toBeGreaterThan(apply)
  })
})

describe('Machbarkeit', () => {
  it('meldet ein erreichbares Ziel als machbar', () => {
    const result = assessGoal({
      goal: goal({ conceptIds: ['c1'], minutesPerDay: 60 }),
      images: images([['c1', { mastery: 0.5, depth: 'apply' }]]),
      nowIso: NOW,
    })
    expect(result.feasible).toBe(true)
    expect(result.shortfallMinutes).toBe(0)
  })

  it('rechnet die verbleibenden Tage aus dem Termin', () => {
    const result = assessGoal({ goal: goal(), images: new Map(), nowIso: NOW })
    expect(result.daysLeft).toBe(5)
    expect(result.minutesAvailable).toBe(200)
  })

  it('meldet ein ueberfrachtetes Ziel als nicht machbar', () => {
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`)
    const result = assessGoal({
      goal: goal({ conceptIds: many, minutesPerDay: 10 }),
      images: new Map(),
      nowIso: NOW,
    })
    expect(result.feasible).toBe(false)
    expect(result.shortfallMinutes).toBeGreaterThan(0)
  })

  it('nennt konkret, welche Konzepte auf niedrigerer Stufe bleiben muessen', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const result = assessGoal({
      goal: goal({ conceptIds: ids, minutesPerDay: 25 }),
      images: new Map(),
      nowIso: NOW,
    })
    expect(result.feasible).toBe(false)
    expect(result.downgradedConceptIds.length).toBeGreaterThan(0)
  })

  it('zaehlt bereits sitzende Konzepte nicht als offen', () => {
    const result = assessGoal({
      goal: goal({ conceptIds: ['c1', 'c2'] }),
      images: images([
        ['c1', { mastery: 0.95, depth: 'apply' }],
        ['c2', { mastery: 0.1 }],
      ]),
      nowIso: NOW,
    })
    expect(result.openConceptCount).toBe(1)
  })
})

describe('Machbarkeitsaussage', () => {
  it('nennt bei machbarem Ziel Umfang, Zeit und Tagespensum', () => {
    const result = assessGoal({
      goal: goal({ conceptIds: ['c1'], minutesPerDay: 60 }),
      images: images([['c1', { mastery: 0.5 }]]),
      nowIso: NOW,
    })
    const sentence = describeFeasibility(result)
    expect(sentence).toMatch(/Konzept/)
    expect(sentence).toMatch(/Tagen|Tag/)
    expect(sentence).toMatch(/geht sich aus/)
  })

  it('nennt bei nicht machbarem Ziel den konkreten Verzicht statt eines Zuspruchs', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const result = assessGoal({ goal: goal({ conceptIds: ids, minutesPerDay: 25 }), images: new Map(), nowIso: NOW })
    const sentence = describeFeasibility(result, 'apply')
    expect(sentence).toMatch(/Erkennen-Niveau bleiben statt auf Anwenden/)
    expect(sentence).not.toMatch(/schaffst du|du packst das/i)
  })

  it('sagt klar, wenn auch der Verzicht nicht reicht', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `c${i}`)
    const result = assessGoal({ goal: goal({ conceptIds: ids, minutesPerDay: 5 }), images: new Map(), nowIso: NOW })
    const sentence = describeFeasibility(result, 'apply')
    expect(sentence).toMatch(/geht sich nicht aus/)
    expect(sentence).toMatch(/Stunden/)
  })
})

describe('Zielumfang', () => {
  it('erkennt Konzepte im Umfang', () => {
    expect(isInGoalScope(goal(), 'c1')).toBe(true)
    expect(isInGoalScope(goal(), 'fremd')).toBe(false)
  })

  it('ignoriert ein abgeschlossenes Ziel', () => {
    expect(isInGoalScope(goal({ status: 'achieved' }), 'c1')).toBe(false)
  })

  it('kommt ohne Ziel zurecht', () => {
    expect(isInGoalScope(null, 'c1')).toBe(false)
  })
})
