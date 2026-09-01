/**
 * Der Konsolidierungslauf — Tests der Auswahl (Kapitel 8.2).
 *
 * Geprueft wird nicht, ob die Kandidatensuche etwas findet (das steht in `consolidation.test.ts`),
 * sondern was davon den Nutzer erreicht: die Sperrmenge, die Obergrenzen und die drei
 * unterschiedlichen Wege der drei Operationen.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge } from '../types'
import { NO_INSIGHTS, type ConsolidatorInsights } from './consolidator'
import {
  MAX_AUTO_EDGES_PER_RUN,
  MAX_MERGE_QUESTIONS_PER_RUN,
  edgeKeyOf,
  mergeKeyOf,
  planConsolidation,
  suppressionKeys,
  type ConsolidationPlanInput,
} from './plan'
import { EDGE_DISCOVERY_MIN_PAIRS, type EvidenceSample } from './restructure'

const NOW = '2026-09-01T10:00:00.000Z'

function concept(id: string, name: string): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
  }
}

function edge(fromConceptId: string, toConceptId: string): BrainPrerequisiteEdge {
  return { id: `${fromConceptId}-${toConceptId}`, pathId: 'p1', fromConceptId, toConceptId, origin: 'cartographer' }
}

function input(over: Partial<ConsolidationPlanInput> = {}): ConsolidationPlanInput {
  return {
    userId: 'u1',
    pathId: 'p1',
    concepts: [],
    edges: [],
    samples: [],
    insights: NO_INSIGHTS,
    priorProposals: [],
    nowIso: NOW,
    ...over,
  }
}

describe('Schluessel und Sperrmenge', () => {
  it('der Verschmelzungsschluessel ist ungeordnet — „A mit B" ist dieselbe Frage wie „B mit A"', () => {
    expect(mergeKeyOf('a', 'b')).toBe(mergeKeyOf('b', 'a'))
  })

  it('der Kantenschluessel ist geordnet — eine Voraussetzung hat eine Richtung', () => {
    expect(edgeKeyOf('a', 'b')).not.toBe(edgeKeyOf('b', 'a'))
  })

  it('sperrt unabhaengig vom Ausgang: auch ein abgelehnter Vorschlag kommt nicht wieder', () => {
    const keys = suppressionKeys([
      { operation: 'mergeConcepts', payload: { keepConceptId: 'a', mergeConceptId: 'b' } },
      { operation: 'addEdge', payload: { fromConceptId: 'c', toConceptId: 'd' } },
    ])
    expect(keys.has(mergeKeyOf('b', 'a'))).toBe(true)
    expect(keys.has(edgeKeyOf('c', 'd'))).toBe(true)
  })

  it('ignoriert unvollstaendige Nutzlasten, statt einen leeren Schluessel zu sperren', () => {
    expect(suppressionKeys([{ operation: 'mergeConcepts', payload: {} }]).size).toBe(0)
  })
})

describe('planConsolidation — Verschmelzungen', () => {
  /*
   * Der echte Fall aus den gespeicherten Pfaden: zwei Abschnitte haben denselben Begriff
   * gefunden und ihm verschiedene Slugs gegeben. Der Name ist identisch — die Wortueberlappung
   * betraegt damit 1.0 und liegt weit ueber MERGE_NAME_SIMILARITY.
   */
  const zwillinge = [
    concept('a', 'Steuerpflicht Minderjähriger'),
    concept('b', 'Steuerpflicht Minderjähriger'),
  ]

  it('macht aus zwei gleich benannten Konzepten eine Frage — und wendet nichts an', () => {
    const plan = planConsolidation(input({ concepts: zwillinge }))

    expect(plan.mergeProposals).toHaveLength(1)
    const proposal = plan.mergeProposals[0]
    expect(proposal.operation).toBe('mergeConcepts')
    // I6: zerstoererisch heisst gefragt, nicht getan.
    expect(proposal.requiresConfirmation).toBe(true)
    expect(proposal.status).toBe('pending')
    expect(proposal.question).toContain('Steuerpflicht')
    // I7: nicht mitten im Lernen.
    expect(proposal.surfaceContext).toBe('mapReview')
  })

  it('stellt eine einmal gestellte Frage nicht erneut', () => {
    const plan = planConsolidation(
      input({
        concepts: zwillinge,
        priorProposals: [{ operation: 'mergeConcepts', payload: { keepConceptId: 'b', mergeConceptId: 'a' } }],
      }),
    )

    expect(plan.mergeProposals).toHaveLength(0)
    expect(plan.summary.suppressed).toBe(1)
  })

  it('verschmilzt nie zwei Konzepte, zwischen denen eine Voraussetzung steht', () => {
    // Enge Nachbarn: hohe Wortueberlappung UND eine echte Abhaengigkeit — genau der Fall, in dem
    // eine Verschmelzung die Voraussetzung dauerhaft loeschen wuerde.
    const nachbarn = [concept('a', 'Einnahmen des Bundes'), concept('b', 'Einnahmen des Bundes berechnen')]
    const ohneKante = planConsolidation(input({ concepts: nachbarn }))
    expect(ohneKante.mergeProposals.length).toBeGreaterThan(0)

    const mitKante = planConsolidation(input({ concepts: nachbarn, edges: [edge('a', 'b')] }))
    expect(mitKante.mergeProposals).toHaveLength(0)
    // Eine Kante ist kein abgelehnter Vorschlag — sie wird nicht als Sperre gezaehlt.
    expect(mitKante.summary.suppressed).toBe(0)
  })

  it('stellt hoechstens MAX_MERGE_QUESTIONS_PER_RUN Fragen je Lauf', () => {
    const viele: BrainConcept[] = []
    for (let i = 0; i < 8; i += 1) {
      viele.push(concept(`a${i}`, `Thema ${i} Steuerpflicht Minderjähriger`))
    }
    const plan = planConsolidation(input({ concepts: viele }))
    expect(plan.mergeProposals).toHaveLength(MAX_MERGE_QUESTIONS_PER_RUN)
  })

  it('nimmt den Vorschlag des Konsolidierers auf, wenn kein Wort geteilt wird', () => {
    const insights: ConsolidatorInsights = {
      patternNameByObservation: new Map(),
      merges: [
        {
          keepConceptId: 'a',
          mergeConceptId: 'b',
          question: 'Meinen „Steuerprogression" und „Progressive Besteuerung" dasselbe?',
          rationale: 'Beide beschreiben denselben Mechanismus.',
        },
      ],
    }
    const concepts = [concept('a', 'Steuerprogression'), concept('b', 'Progressive Besteuerung')]

    // Der Namensvergleich allein findet hier nichts.
    expect(planConsolidation(input({ concepts })).mergeProposals).toHaveLength(0)

    const plan = planConsolidation(input({ concepts, insights }))
    expect(plan.mergeProposals).toHaveLength(1)
    expect(plan.mergeProposals[0].evidence).toMatchObject({ source: 'konsolidierer' })
    expect(plan.mergeProposals[0].question).toContain('Steuerprogression')
  })

  it('verwirft einen Modellvorschlag, dessen Konzepte es nicht gibt', () => {
    const insights: ConsolidatorInsights = {
      patternNameByObservation: new Map(),
      merges: [{ keepConceptId: 'a', mergeConceptId: 'erfunden', question: 'Dasselbe?', rationale: '' }],
    }
    const plan = planConsolidation(input({ concepts: [concept('a', 'Steuern')], insights }))
    expect(plan.mergeProposals).toHaveLength(0)
  })

  it('der belegbare Namenstreffer bekommt den knappen Platz vor dem Modellurteil', () => {
    const concepts = [
      concept('a', 'Steuerpflicht Minderjähriger'),
      concept('b', 'Steuerpflicht Minderjähriger'),
      concept('c', 'Steuerprogression'),
      concept('d', 'Progressive Besteuerung'),
      concept('e', 'Verrechnungssteuer'),
      concept('f', 'Quellensteuer'),
    ]
    const insights: ConsolidatorInsights = {
      patternNameByObservation: new Map(),
      merges: [
        { keepConceptId: 'c', mergeConceptId: 'd', question: 'Dasselbe?', rationale: '' },
        { keepConceptId: 'e', mergeConceptId: 'f', question: 'Dasselbe?', rationale: '' },
      ],
    }

    const plan = planConsolidation(input({ concepts, insights }))
    expect(plan.mergeProposals).toHaveLength(MAX_MERGE_QUESTIONS_PER_RUN)
    // Der Namenstreffer (a/b) steht vorn; nur EINER der beiden Modellvorschlaege kommt noch mit.
    expect(plan.mergeProposals[0].payload).toMatchObject({ keepConceptId: 'a' })
    expect(plan.mergeProposals[1].evidence).toMatchObject({ source: 'konsolidierer' })
  })
})

describe('planConsolidation — Kanten und Aufspaltungen', () => {
  /** Beobachtungen, in denen B genau dann scheitert, wenn A davor schiefging. */
  function abhaengigeReihe(): EvidenceSample[] {
    const samples: EvidenceSample[] = []
    for (let i = 0; i < EDGE_DISCOVERY_MIN_PAIRS + 2; i += 1) {
      const aGelingt = i % 2 === 0
      samples.push({ conceptId: 'a', credit: aGelingt ? 1 : 0, at: `2026-08-${String(i + 1).padStart(2, '0')}T08:00:00.000Z` })
      samples.push({ conceptId: 'b', credit: aGelingt ? 1 : 0, at: `2026-08-${String(i + 1).padStart(2, '0')}T09:00:00.000Z` })
    }
    return samples
  }

  it('wendet eine entdeckte Kante automatisch an und fragt nicht danach', () => {
    const plan = planConsolidation(
      input({ concepts: [concept('a', 'Grundlage'), concept('b', 'Folge')], samples: abhaengigeReihe() }),
    )

    expect(plan.edges).toHaveLength(1)
    const proposal = plan.edges[0].proposal
    // Umkehrbar heisst automatisch (Kapitel 8.2) — und `autoApplied` wird von `insightsView`
    // nicht angezeigt, der Nutzer wird also nicht mit einer Frage belastet.
    expect(proposal.status).toBe('autoApplied')
    expect(proposal.requiresConfirmation).toBe(false)
    expect(plan.edges[0]).toMatchObject({ fromConceptId: 'a', toConceptId: 'b' })
  })

  it('legt eine bereits einmal angewandte Kante nicht erneut an', () => {
    const plan = planConsolidation(
      input({
        concepts: [concept('a', 'Grundlage'), concept('b', 'Folge')],
        samples: abhaengigeReihe(),
        priorProposals: [{ operation: 'addEdge', payload: { fromConceptId: 'a', toConceptId: 'b' } }],
      }),
    )
    expect(plan.edges).toHaveLength(0)
    expect(plan.summary.suppressed).toBe(1)
  })

  it('wendet hoechstens MAX_AUTO_EDGES_PER_RUN Kanten je Lauf an', () => {
    expect(MAX_AUTO_EDGES_PER_RUN).toBeGreaterThan(0)
    const samples = abhaengigeReihe()
    // Ein drittes Konzept, das dieselbe Reihe spiegelt — damit mehr Kandidaten als Plaetze da sind.
    for (const sample of [...samples]) {
      if (sample.conceptId === 'b') {
        samples.push({ ...sample, conceptId: 'c', at: sample.at.replace('T09', 'T10') })
      }
    }
    const plan = planConsolidation(
      input({
        concepts: [concept('a', 'Grundlage'), concept('b', 'Folge'), concept('c', 'Weitere Folge')],
        samples,
      }),
    )
    expect(plan.edges.length).toBeLessThanOrEqual(MAX_AUTO_EDGES_PER_RUN)
  })

  it('erkennt Aufspaltungen, schlaegt sie aber nicht vor — es gibt keinen Weg, sie auszufuehren', () => {
    const gespalten: EvidenceSample[] = [
      { conceptId: 'a', credit: 0, at: '2026-08-01T08:00:00.000Z' },
      { conceptId: 'a', credit: 0, at: '2026-08-02T08:00:00.000Z' },
      { conceptId: 'a', credit: 0.05, at: '2026-08-03T08:00:00.000Z' },
      { conceptId: 'a', credit: 0.95, at: '2026-08-04T08:00:00.000Z' },
      { conceptId: 'a', credit: 1, at: '2026-08-05T08:00:00.000Z' },
      { conceptId: 'a', credit: 1, at: '2026-08-06T08:00:00.000Z' },
    ]
    const plan = planConsolidation(input({ concepts: [concept('a', 'Zu grobes Konzept')], samples: gespalten }))

    expect(plan.splitCandidates.length).toBeGreaterThan(0)
    expect(plan.summary.splitCandidates).toBe(plan.splitCandidates.length)
    expect(plan.mergeProposals.every((proposal) => proposal.operation !== 'splitConcept')).toBe(true)
    expect(plan.edges).toHaveLength(0)
  })
})
