/**
 * Wissensgraph (Kapitel 4.1) — Tests.
 *
 * Schwerpunkt: die Ursachensuche. Sie ist der Grund, warum der Graph gerichtet ist — eine reine
 * Hierarchie koennte sie nicht leisten.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { emptyImage } from './learnerImage'
import {
  conceptsWithoutProvenance,
  dependentsOf,
  findRootCauses,
  frontier,
  originBreakdown,
  prerequisitesOf,
  topologicalOrder,
} from './knowledgeGraph'

function concept(id: string, overrides: Partial<BrainConcept> = {}): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: id.toUpperCase(),
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: { doc: 'skript.pdf' },
    sourceQuote: 'Beleg',
    ordinal: 0,
    ...overrides,
  }
}

function edge(from: string, to: string): BrainPrerequisiteEdge {
  return { id: `${from}->${to}`, pathId: 'p1', fromConceptId: from, toConceptId: to, origin: 'cartographer' }
}

function images(entries: [string, number][]): Map<string, LearnerConceptImage> {
  return new Map(
    entries.map(([id, mastery]) => [id, { ...emptyImage(id, 3), mastery, directEvidenceCount: 1 }]),
  )
}

describe('Nachbarschaft', () => {
  const edges = [edge('a', 'b'), edge('b', 'c')]

  it('findet Voraussetzungen', () => {
    expect(prerequisitesOf(edges, 'b')).toEqual(['a'])
    expect(prerequisitesOf(edges, 'a')).toEqual([])
  })

  it('findet Abhaengige', () => {
    expect(dependentsOf(edges, 'b')).toEqual(['c'])
  })
})

describe('topologische Sortierung', () => {
  it('stellt Voraussetzungen vor ihre Abhaengigen', () => {
    const concepts = [concept('c'), concept('a'), concept('b')]
    const order = topologicalOrder(concepts, [edge('a', 'b'), edge('b', 'c')])
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('ist deterministisch — gleiche Eingabe, gleiche Ausgabe', () => {
    const concepts = [concept('x', { difficulty: 2 }), concept('y', { difficulty: 2 }), concept('z', { difficulty: 1 })]
    const first = topologicalOrder(concepts, [])
    const second = topologicalOrder([...concepts].reverse(), [])
    expect(first).toEqual(second)
  })

  it('sortiert bei gleichem Rang nach Schwierigkeit', () => {
    const order = topologicalOrder([concept('hart', { difficulty: 5 }), concept('leicht', { difficulty: 1 })], [])
    expect(order).toEqual(['leicht', 'hart'])
  })

  it('bricht Zyklen auf, statt zu haengen', () => {
    const concepts = [concept('a'), concept('b')]
    const order = topologicalOrder(concepts, [edge('a', 'b'), edge('b', 'a')])
    expect(order).toHaveLength(2)
    expect(new Set(order)).toEqual(new Set(['a', 'b']))
  })
})

describe('Ursachensuche', () => {
  /* zweierpotenzen -> subnetzmaske -> vlsm */
  const edges = [edge('zweierpotenzen', 'subnetzmaske'), edge('subnetzmaske', 'vlsm')]

  it('findet die eigentliche Luecke hinter dem Fehlschlag', () => {
    const causes = findRootCauses({
      conceptId: 'vlsm',
      edges,
      images: images([['subnetzmaske', 0.8], ['zweierpotenzen', 0.2]]),
    })
    expect(causes[0].conceptId).toBe('zweierpotenzen')
  })

  it('sortiert das schwaechste Glied nach vorn', () => {
    const causes = findRootCauses({
      conceptId: 'vlsm',
      edges,
      images: images([['subnetzmaske', 0.5], ['zweierpotenzen', 0.1]]),
    })
    expect(causes.map((c) => c.conceptId)).toEqual(['zweierpotenzen', 'subnetzmaske'])
  })

  it('behandelt ein nie geprueftes Konzept als vollwertigen Verdaechtigen', () => {
    const causes = findRootCauses({ conceptId: 'vlsm', edges, images: new Map() })
    expect(causes.map((c) => c.conceptId)).toContain('zweierpotenzen')
    expect(causes.every((c) => c.mastery === 0)).toBe(true)
  })

  it('meldet nichts, wenn alle Voraussetzungen sitzen', () => {
    const causes = findRootCauses({
      conceptId: 'vlsm',
      edges,
      images: images([['subnetzmaske', 0.95], ['zweierpotenzen', 0.9]]),
    })
    expect(causes).toEqual([])
  })

  it('begrenzt die Suchtiefe', () => {
    const deep = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e')]
    const causes = findRootCauses({ conceptId: 'e', edges: deep, images: new Map(), maxDepth: 2 })
    expect(causes.every((c) => c.distance <= 2)).toBe(true)
    expect(causes.map((c) => c.conceptId)).not.toContain('a')
  })
})

describe('Front', () => {
  it('liefert lernbare Konzepte: selbst offen, Voraussetzungen sitzen', () => {
    const concepts = [concept('a'), concept('b'), concept('c')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    const front = frontier({ concepts, edges, images: images([['a', 0.9]]) })
    expect(front).toEqual(['b'])
  })

  it('liefert bei leerem Lernerbild die Wurzeln', () => {
    const concepts = [concept('a'), concept('b')]
    const front = frontier({ concepts, edges: [edge('a', 'b')], images: new Map() })
    expect(front).toEqual(['a'])
  })
})

describe('Herkunft (Invariante I4)', () => {
  it('zaehlt die Herkuenfte', () => {
    const counts = originBreakdown([
      concept('a'),
      concept('b', { origin: 'aiSupplement', sourceQuote: '' }),
      concept('c', { origin: 'user' }),
    ])
    expect(counts).toEqual({ material: 1, aiSupplement: 1, user: 1, unknown: 0 })
  })

  it('findet Material-Konzepte ohne jeden Beleg', () => {
    const broken = concept('kaputt', { sourceRef: {}, sourceQuote: '' })
    const found = conceptsWithoutProvenance([concept('gut'), broken])
    expect(found.map((c) => c.id)).toEqual(['kaputt'])
  })

  it('beanstandet KI-Ergaenzungen nicht — sie haben per Definition keine Quelle', () => {
    const supplement = concept('erg', { origin: 'aiSupplement', sourceRef: {}, sourceQuote: '' })
    expect(conceptsWithoutProvenance([supplement])).toEqual([])
  })
})
