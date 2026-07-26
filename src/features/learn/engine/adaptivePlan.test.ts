import { describe, it, expect } from 'vitest'
import {
  buildTopicPlan,
  buildPathScoring,
  canSkipEntryCheck,
  type PlanTopicInput,
  type ConceptMeta,
} from './adaptivePlan'
import type { LearnerConceptState } from './types'

const NOW = '2026-02-01T00:00:00.000Z'

function state(conceptId: string, pMastery: number, over: Partial<LearnerConceptState> = {}): LearnerConceptState {
  return {
    conceptId,
    pMastery,
    attempts: 1,
    correct: pMastery > 0.5 ? 1 : 0,
    outcomeHistory: [],
    decayRate: 0.08,
    lastSeenAt: NOW,
    nextReviewAt: null,
    ...over,
  }
}

const META = new Map<string, ConceptMeta>([
  ['a', { id: 'a', difficulty: 2 }],
  ['b', { id: 'b', difficulty: 3 }],
  ['c', { id: 'c', difficulty: 4 }],
])

describe('buildTopicPlan', () => {
  const topic: PlanTopicInput = {
    id: 't1',
    conceptIds: ['a', 'b', 'c'],
    steps: [
      { stepId: 's1', conceptIds: ['a'] },
      { stepId: 's2', conceptIds: ['b', 'c'] },
    ],
  }

  it('laesst gemeisterte Konzepte aus dem Einstiegscheck (Entscheidung 1)', () => {
    const states = new Map([
      ['a', state('a', 0.95)], // gemeistert -> raus
      ['b', state('b', 0.4)],
      ['c', state('c', 0.2)],
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    expect(plan.entryCheckConceptIds).not.toContain('a')
    expect(plan.entryCheckConceptIds).toEqual(expect.arrayContaining(['b', 'c']))
  })

  it('markiert einen Schritt als ueberspringbar, wenn alle seine Konzepte beherrscht sind (Entscheidung 2)', () => {
    const states = new Map([
      ['a', state('a', 0.9)], // s1 nur a -> skippable
      ['b', state('b', 0.5)],
      ['c', state('c', 0.5)], // s2 nicht alle beherrscht -> bleibt
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    expect(plan.skippableStepIds).toEqual(['s1'])
  })

  it('findet Remediation-Konzepte im Band [0.4, 0.7] (Entscheidung 3)', () => {
    const states = new Map([
      ['a', state('a', 0.2)],
      ['b', state('b', 0.55)], // im Band
      ['c', state('c', 0.9)],
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    expect(plan.remediationConceptIds).toEqual(['b'])
  })

  it('gewichtet schwaechere Konzepte hoeher fuer die Pruefung (Entscheidung 6)', () => {
    const states = new Map([
      ['a', state('a', 0.9)],
      ['b', state('b', 0.5)],
      ['c', state('c', 0.1)],
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    const wa = plan.examWeights.find((w) => w.conceptId === 'a')!.weight
    const wc = plan.examWeights.find((w) => w.conceptId === 'c')!.weight
    expect(wc).toBeGreaterThan(wa)
  })

  it('gemeistert nur mit Score UND bestandener Pruefung', () => {
    const strong = new Map([
      ['a', state('a', 0.9)],
      ['b', state('b', 0.85)],
      ['c', state('c', 0.85)],
    ])
    const withoutExam = buildTopicPlan(topic, strong, META, NOW)
    expect(withoutExam.score).toBeGreaterThanOrEqual(0.75)
    expect(withoutExam.mastered).toBe(false)
    const withExam = buildTopicPlan({ ...topic, examPassed: true }, strong, META, NOW)
    expect(withExam.mastered).toBe(true)
  })

  it('beruecksichtigt Verfall: lange nicht gesehen senkt den Score', () => {
    const stale = new Map([
      ['a', state('a', 0.9, { lastSeenAt: '2026-01-01T00:00:00.000Z', decayRate: 0.2 })],
      ['b', state('b', 0.9, { lastSeenAt: '2026-01-01T00:00:00.000Z', decayRate: 0.2 })],
      ['c', state('c', 0.9, { lastSeenAt: '2026-01-01T00:00:00.000Z', decayRate: 0.2 })],
    ])
    const fresh = new Map([
      ['a', state('a', 0.9)],
      ['b', state('b', 0.9)],
      ['c', state('c', 0.9)],
    ])
    expect(buildTopicPlan(topic, stale, META, NOW).score).toBeLessThan(buildTopicPlan(topic, fresh, META, NOW).score)
  })
})

describe('buildPathScoring', () => {
  const topics: PlanTopicInput[] = [
    { id: 't1', conceptIds: ['a'], steps: [], examPassed: true },
    { id: 't2', conceptIds: ['b', 'c'], steps: [] },
  ]

  it('aggregiert Themen-Scores + Fortschritt und listet faellige Konzepte', () => {
    const states = new Map([
      ['a', state('a', 0.9)],
      ['b', state('b', 0.3)],
      ['c', state('c', 0.3, { nextReviewAt: '2026-01-15T00:00:00.000Z' })], // faellig (< NOW)
    ])
    const scoring = buildPathScoring(topics, states, META, NOW)
    expect(scoring.topicScores).toHaveLength(2)
    expect(scoring.topicScores[0].mastered).toBe(true)
    expect(scoring.progress.total).toBe(2)
    expect(scoring.progress.mastered).toBe(1)
    expect(scoring.progress.percent).toBeGreaterThan(0)
    expect(scoring.dueConceptIds).toContain('c')
  })
})

describe('canSkipEntryCheck (harter Skip)', () => {
  const topic: PlanTopicInput = { id: 't1', conceptIds: ['a', 'b', 'c'], steps: [] }

  it('alle Konzepte beherrscht → Einstiegscheck überspringbar', () => {
    const states = new Map([
      ['a', state('a', 0.95)],
      ['b', state('b', 0.95)],
      ['c', state('c', 0.95)],
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    expect(plan.entryCheckConceptIds).toHaveLength(0)
    expect(canSkipEntryCheck(plan, topic.conceptIds.length)).toBe(true)
  })

  it('mindestens ein schwaches Konzept → kein Skip', () => {
    const states = new Map([
      ['a', state('a', 0.95)],
      ['b', state('b', 0.2)],
      ['c', state('c', 0.95)],
    ])
    const plan = buildTopicPlan(topic, states, META, NOW)
    expect(canSkipEntryCheck(plan, topic.conceptIds.length)).toBe(false)
  })

  it('Thema ohne Konzepte → kein Skip', () => {
    const empty: PlanTopicInput = { id: 't0', conceptIds: [], steps: [] }
    const plan = buildTopicPlan(empty, new Map(), META, NOW)
    expect(canSkipEntryCheck(plan, 0)).toBe(false)
  })
})
