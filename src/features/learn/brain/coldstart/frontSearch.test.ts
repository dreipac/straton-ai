/**
 * Kaltstart (Kapitel 9) — Tests.
 *
 * Der wichtigste Test hier ist der auf Invariante I1: die adaptive Suche darf den Suchraum
 * halbieren, aber sie darf kein Lernerbild anfassen. „Vieles darunter gilt als wahrscheinlich
 * vorhanden" ist eine Aussage ueber die SUCHE, nicht ueber die Person.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  ancestorsOf,
  descendantsOf,
  frontIsLocated,
  informationGain,
  informationGains,
  initialFrontSearch,
  openConcepts,
  recordProbe,
  selectProbe,
  summariseColdStart,
  COLD_START_PROBE_BUDGET,
} from './frontSearch'

function concept(id: string, difficulty = 3): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: `Konzept ${id}`,
    description: '',
    difficulty,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
  }
}

function chain(ids: string[]): BrainPrerequisiteEdge[] {
  const edges: BrainPrerequisiteEdge[] = []
  for (let i = 1; i < ids.length; i += 1) {
    edges.push({
      id: `e${i}`,
      pathId: 'p1',
      fromConceptId: ids[i - 1],
      toConceptId: ids[i],
      origin: 'cartographer',
    })
  }
  return edges
}

const IDS = ['a', 'b', 'c', 'd', 'e']
const CONCEPTS = IDS.map((id) => concept(id))
const EDGES = chain(IDS)

describe('Vorfahren und Nachfahren', () => {
  it('sammelt alle transitiven Voraussetzungen', () => {
    expect(ancestorsOf(EDGES, 'd')).toEqual(new Set(['a', 'b', 'c']))
  })

  it('sammelt alle transitiv Aufbauenden', () => {
    expect(descendantsOf(EDGES, 'b')).toEqual(new Set(['c', 'd', 'e']))
  })

  it('laeuft in einem Zyklus nicht endlos', () => {
    const cyclic: BrainPrerequisiteEdge[] = [
      { id: '1', pathId: 'p', fromConceptId: 'x', toConceptId: 'y', origin: 'cartographer' },
      { id: '2', pathId: 'p', fromConceptId: 'y', toConceptId: 'x', origin: 'cartographer' },
    ]
    expect(ancestorsOf(cyclic, 'x')).toEqual(new Set(['x', 'y']))
  })
})

describe('Informationsgewinn', () => {
  const open = new Set(IDS)

  it('ist in der Mitte der Kette am hoechsten', () => {
    const middle = informationGain({ conceptId: 'c', edges: EDGES, openConceptIds: open })
    const edgeNode = informationGain({ conceptId: 'a', edges: EDGES, openConceptIds: open })
    expect(middle).toBeGreaterThan(edgeNode)
  })

  it('ist null fuer ein Konzept ausserhalb des Suchraums', () => {
    expect(informationGain({ conceptId: 'fremd', edges: EDGES, openConceptIds: open })).toBe(0)
  })

  it('ist null, wenn nur noch ein Konzept offen ist', () => {
    expect(informationGain({ conceptId: 'a', edges: EDGES, openConceptIds: new Set(['a']) })).toBe(0)
  })
})

describe('Sondierungsauswahl', () => {
  it('waehlt das Konzept mit dem hoechsten Gewinn', () => {
    const probe = selectProbe({ concepts: CONCEPTS, edges: EDGES, images: new Map(), search: initialFrontSearch() })
    expect(probe).toBe('c')
  })

  it('ist deterministisch', () => {
    const search = initialFrontSearch()
    const first = selectProbe({ concepts: CONCEPTS, edges: EDGES, images: new Map(), search })
    const second = selectProbe({ concepts: CONCEPTS, edges: EDGES, images: new Map(), search })
    expect(first).toBe(second)
  })

  it('bevorzugt bei gleichem Gewinn mittlere Schwierigkeit', () => {
    const flat = [concept('leicht', 1), concept('mittel', 3), concept('schwer', 5)]
    const probe = selectProbe({ concepts: flat, edges: [], images: new Map(), search: initialFrontSearch() })
    expect(probe).toBe('mittel')
  })

  it('hoert nach dem Sondierungsbudget auf', () => {
    const spent = { ...initialFrontSearch(), probesUsed: COLD_START_PROBE_BUDGET }
    expect(selectProbe({ concepts: CONCEPTS, edges: EDGES, images: new Map(), search: spent })).toBeNull()
  })
})

describe('Suchraum halbieren', () => {
  it('raeumt bei richtiger Antwort die Vorfahren aus dem Suchraum', () => {
    const next = recordProbe({ search: initialFrontSearch(), conceptId: 'c', edges: EDGES, correct: true })
    expect(next.presumedKnown).toEqual(new Set(['a', 'b']))
  })

  it('raeumt bei falscher Antwort die Nachfahren aus dem Suchraum', () => {
    const next = recordProbe({ search: initialFrontSearch(), conceptId: 'c', edges: EDGES, correct: false })
    expect(next.presumedOpen).toEqual(new Set(['d', 'e']))
  })

  it('verkleinert den offenen Suchraum mit jeder Antwort', () => {
    let search = initialFrontSearch()
    const before = openConcepts({ concepts: CONCEPTS, images: new Map(), search }).size
    search = recordProbe({ search, conceptId: 'c', edges: EDGES, correct: true })
    const after = openConcepts({ concepts: CONCEPTS, images: new Map(), search }).size
    expect(after).toBeLessThan(before)
  })

  it('zaehlt die verbrauchten Sondierungen', () => {
    const next = recordProbe({ search: initialFrontSearch(), conceptId: 'c', edges: EDGES, correct: true })
    expect(next.probesUsed).toBe(1)
  })
})

describe('Invariante I1 — die Suche fasst kein Lernerbild an', () => {
  it('laesst die uebergebenen Lernerbilder unveraendert', () => {
    const image: LearnerConceptImage = { ...emptyImage('a', 3), mastery: 0.11 }
    const images = new Map([['a', image]])
    const snapshot = JSON.stringify([...images.entries()])

    let search = initialFrontSearch()
    search = recordProbe({ search, conceptId: 'c', edges: EDGES, correct: true })
    selectProbe({ concepts: CONCEPTS, edges: EDGES, images, search })
    summariseColdStart({ search, concepts: CONCEPTS, edges: EDGES, images })

    expect(JSON.stringify([...images.entries()])).toBe(snapshot)
  })

  it('gibt aus recordProbe kein Lernerbild zurueck, das man versehentlich speichern koennte', () => {
    const next = recordProbe({ search: initialFrontSearch(), conceptId: 'c', edges: EDGES, correct: true })
    expect(Object.keys(next).sort()).toEqual(['presumedKnown', 'presumedOpen', 'probesUsed'])
  })
})

describe('offener Suchraum', () => {
  it('schliesst Konzepte mit direkter Evidenz aus', () => {
    const images = new Map([['a', { ...emptyImage('a', 3), directEvidenceCount: 1 }]])
    expect(openConcepts({ concepts: CONCEPTS, images, search: initialFrontSearch() }).has('a')).toBe(false)
  })

  it('liefert alle Gewinne fuer den Planer', () => {
    const gains = informationGains({
      concepts: CONCEPTS,
      edges: EDGES,
      images: new Map(),
      search: initialFrontSearch(),
    })
    expect(gains.size).toBe(CONCEPTS.length)
  })
})

describe('Abschluss und Ergebnisanzeige', () => {
  it('gilt nach dem Budget als abgeschlossen', () => {
    const spent = { ...initialFrontSearch(), probesUsed: COLD_START_PROBE_BUDGET }
    expect(frontIsLocated({ search: spent, concepts: CONCEPTS, images: new Map() })).toBe(true)
  })

  it('liefert einen Einordnungssatz mit Zahlen', () => {
    let search = initialFrontSearch()
    search = recordProbe({ search, conceptId: 'c', edges: EDGES, correct: true })
    const summary = summariseColdStart({ search, concepts: CONCEPTS, edges: EDGES, images: new Map() })
    expect(summary.sentence).toMatch(/Aufgabe/)
    expect(summary.presumedKnownCount).toBe(2)
    expect(summary.probesUsed).toBe(1)
  })

  it('kommt ohne eingelesenen Stoff zurecht', () => {
    const summary = summariseColdStart({
      search: initialFrontSearch(),
      concepts: [],
      edges: [],
      images: new Map(),
    })
    expect(summary.sentence).toMatch(/kein Stoff/i)
  })
})
