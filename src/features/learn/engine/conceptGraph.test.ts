import { describe, it, expect } from 'vitest'
import {
  neighbors,
  prerequisitesOf,
  topologicalOrder,
  priorFromGraph,
  propagateSignal,
  applyPropagation,
} from './conceptGraph'
import type { Concept, ConceptEdge, LearnerConceptState } from './types'

function concept(id: string, difficulty = 3, ordinal = 0): Concept {
  return {
    id,
    pathId: 'p',
    slug: id,
    name: id,
    description: '',
    difficulty,
    sourceRef: {},
    ordinal,
  }
}

function edge(from: string, to: string, type: ConceptEdge['type']): ConceptEdge {
  return { id: `${from}-${to}-${type}`, pathId: 'p', fromConceptId: from, toConceptId: to, type }
}

function state(conceptId: string, pMastery: number): LearnerConceptState {
  return {
    conceptId,
    pMastery,
    attempts: 1,
    correct: pMastery > 0.5 ? 1 : 0,
    outcomeHistory: [],
    decayRate: 0.08,
    lastSeenAt: null,
    nextReviewAt: null,
  }
}

describe('topologicalOrder', () => {
  it('Voraussetzung kommt vor abhaengigem Konzept', () => {
    const concepts = [concept('binary'), concept('mask'), concept('vlsm')]
    const edges = [edge('binary', 'mask', 'prerequisite'), edge('mask', 'vlsm', 'prerequisite')]
    const order = topologicalOrder(concepts, edges)
    expect(order.indexOf('binary')).toBeLessThan(order.indexOf('mask'))
    expect(order.indexOf('mask')).toBeLessThan(order.indexOf('vlsm'))
  })

  it('Tie-Break nach Schwierigkeit (leichter zuerst)', () => {
    const concepts = [concept('hard', 5), concept('easy', 1)]
    const order = topologicalOrder(concepts, [])
    expect(order).toEqual(['easy', 'hard'])
  })

  it('enthaelt jedes Konzept genau einmal', () => {
    const concepts = [concept('a'), concept('b'), concept('c')]
    const edges = [edge('a', 'b', 'prerequisite')]
    const order = topologicalOrder(concepts, edges)
    expect(order.sort()).toEqual(['a', 'b', 'c'])
  })

  it('bricht Zyklen auf statt endlos zu laufen', () => {
    const concepts = [concept('a'), concept('b')]
    const edges = [edge('a', 'b', 'prerequisite'), edge('b', 'a', 'prerequisite')]
    const order = topologicalOrder(concepts, edges)
    expect(order.sort()).toEqual(['a', 'b'])
  })
})

describe('neighbors / prerequisitesOf', () => {
  const edges = [edge('a', 'b', 'prerequisite'), edge('b', 'c', 'related'), edge('a', 'c', 'opposite')]
  it('out/in Richtung', () => {
    expect(neighbors(edges, 'a', 'prerequisite', 'out')).toEqual(['b'])
    expect(neighbors(edges, 'b', 'prerequisite', 'in')).toEqual(['a'])
  })
  it('prerequisitesOf gibt Voraussetzungen', () => {
    expect(prerequisitesOf(edges, 'b')).toEqual(['a'])
  })
})

describe('priorFromGraph', () => {
  it('gemeisterte Voraussetzungen heben den Prior', () => {
    const c = concept('vlsm', 3)
    const edges = [edge('mask', 'vlsm', 'prerequisite')]
    const states = new Map([['mask', state('mask', 0.95)]])
    const boosted = priorFromGraph(c, edges, states, 0.3)
    expect(boosted).toBeGreaterThan(0.3)
  })
  it('ohne Nachbarn bleibt der kalte Seed', () => {
    expect(priorFromGraph(concept('x'), [], new Map(), 0.3)).toBeCloseTo(0.3, 5)
  })
})

describe('propagateSignal / applyPropagation', () => {
  it('verwandte Konzepte werden in gleicher Richtung genudged', () => {
    const edges = [edge('a', 'b', 'related')]
    const up = propagateSignal('a', true, edges)
    expect(up).toContainEqual({ conceptId: 'b', direction: 'up', strength: 0.05 })
    const down = propagateSignal('a', false, edges)
    expect(down).toContainEqual({ conceptId: 'b', direction: 'down', strength: 0.05 })
  })
  it('Voraussetzungen nur bei richtiger Antwort nach oben', () => {
    const edges = [edge('pre', 'target', 'prerequisite')]
    expect(propagateSignal('target', true, edges)).toContainEqual({ conceptId: 'pre', direction: 'up', strength: 0.03 })
    expect(propagateSignal('target', false, edges).some((p) => p.conceptId === 'pre')).toBe(false)
  })
  it('applyPropagation bleibt in [0,1] und bewegt in die Richtung', () => {
    expect(applyPropagation(0.5, { conceptId: 'x', direction: 'up', strength: 0.1 })).toBeGreaterThan(0.5)
    expect(applyPropagation(0.5, { conceptId: 'x', direction: 'down', strength: 0.1 })).toBeLessThan(0.5)
    expect(applyPropagation(1, { conceptId: 'x', direction: 'up', strength: 0.5 })).toBeLessThanOrEqual(1)
  })
})
