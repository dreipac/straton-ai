import { describe, it, expect } from 'vitest'
import {
  normalizeConceptSlug,
  buildConceptIngestionPrompt,
  parseConceptGraphFromText,
  validateConceptGraph,
  mergeConceptGraphs,
  CONCEPT_INGESTION_MIN_CONCEPTS,
  CONCEPT_INGESTION_MAX_CONCEPTS,
  type IngestedGraph,
} from './conceptIngestion'

describe('normalizeConceptSlug', () => {
  it('normalisiert zu kleinschrift mit bindestrichen', () => {
    expect(normalizeConceptSlug('VLSM-Berechnung!')).toBe('vlsm-berechnung')
    expect(normalizeConceptSlug('  Subnetzmaske  lesen  ')).toBe('subnetzmaske-lesen')
    expect(normalizeConceptSlug('')).toBe('')
    expect(normalizeConceptSlug(undefined)).toBe('')
  })
})

describe('buildConceptIngestionPrompt', () => {
  it('enthaelt Schema, Material und Regeln; Vorversuch-Hinweise nur bei attempt>1', () => {
    const p1 = buildConceptIngestionPrompt({ topicHint: 'Subnetting', materialContext: 'MATERIAL', attempt: 1, validationHint: '' })
    expect(p1).toContain('KONZEPT-NETZ')
    expect(p1).toContain('MATERIAL')
    expect(p1).toContain('prerequisite')
    expect(p1).not.toContain('Der vorige Versuch war ungueltig')

    const p2 = buildConceptIngestionPrompt({ topicHint: 'X', materialContext: 'M', attempt: 2, validationHint: 'zu wenige' })
    expect(p2).toContain('Der vorige Versuch war ungueltig')
    expect(p2).toContain('zu wenige')
  })
})

describe('parseConceptGraphFromText', () => {
  const validJson = JSON.stringify({
    concepts: [
      { slug: 'binary', name: 'Binäre Umrechnung', description: 'Bits', difficulty: 2, source: { section: 'Kap 1', pageFrom: 3 } },
      { slug: 'mask', name: 'Subnetzmaske lesen', difficulty: 2 },
      { slug: 'calc', name: 'Subnetzmaske berechnen', difficulty: 3 },
      { slug: 'vlsm', name: 'VLSM', difficulty: 5 },
    ],
    edges: [
      { from: 'binary', to: 'mask', type: 'prerequisite' },
      { from: 'mask', to: 'calc', type: 'prerequisite' },
      { from: 'calc', to: 'vlsm', type: 'prerequisite' },
    ],
  })

  it('parst sauberes JSON', () => {
    const g = parseConceptGraphFromText(validJson)
    expect(g.concepts.length).toBe(4)
    expect(g.edges.length).toBe(3)
    expect(g.concepts[0].sourceRef.section).toBe('Kap 1')
    expect(g.concepts[0].sourceRef.pageFrom).toBe(3)
  })

  it('extrahiert JSON aus umgebendem Markdown/Text', () => {
    const wrapped = 'Hier ist das Netz:\n```json\n' + validJson + '\n```\nEnde.'
    expect(parseConceptGraphFromText(wrapped).concepts.length).toBe(4)
  })

  it('dedupliziert Slugs und clamped Schwierigkeit', () => {
    const json = JSON.stringify({
      concepts: [
        { slug: 'a', name: 'A', difficulty: 9 },
        { slug: 'a', name: 'A dup', difficulty: 1 },
        { slug: 'b', name: 'B', difficulty: -3 },
      ],
      edges: [],
    })
    const g = parseConceptGraphFromText(json)
    expect(g.concepts.length).toBe(2)
    expect(g.concepts[0].difficulty).toBe(5)
    expect(g.concepts[1].difficulty).toBe(1)
  })

  it('verwirft Kanten auf unbekannte Slugs, Selbstkanten und Duplikate', () => {
    const json = JSON.stringify({
      concepts: [
        { slug: 'a', name: 'A', difficulty: 2 },
        { slug: 'b', name: 'B', difficulty: 2 },
      ],
      edges: [
        { from: 'a', to: 'b', type: 'related' },
        { from: 'a', to: 'b', type: 'related' }, // dup
        { from: 'a', to: 'a', type: 'related' }, // self
        { from: 'a', to: 'ghost', type: 'related' }, // unknown
        { from: 'a', to: 'b', type: 'quatsch' }, // ungueltiger typ
      ],
    })
    const g = parseConceptGraphFromText(json)
    expect(g.edges).toEqual([{ fromSlug: 'a', toSlug: 'b', type: 'related' }])
  })

  it('kaputte Eingabe -> leeres Netz', () => {
    expect(parseConceptGraphFromText('kein json')).toEqual({ concepts: [], edges: [] })
  })
})

describe('validateConceptGraph', () => {
  it('zu wenige Konzepte -> ungueltig', () => {
    const g = parseConceptGraphFromText(JSON.stringify({ concepts: [{ slug: 'a', name: 'A', difficulty: 1 }], edges: [] }))
    const v = validateConceptGraph(g)
    expect(v.valid).toBe(false)
    expect(v.reason).toContain(String(CONCEPT_INGESTION_MIN_CONCEPTS))
  })

  it('gueltiges Netz -> gueltig', () => {
    const g = parseConceptGraphFromText(
      JSON.stringify({
        concepts: [
          { slug: 'a', name: 'A', difficulty: 1 },
          { slug: 'b', name: 'B', difficulty: 2 },
          { slug: 'c', name: 'C', difficulty: 2 },
          { slug: 'd', name: 'D', difficulty: 3 },
        ],
        edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
      }),
    )
    expect(validateConceptGraph(g).valid).toBe(true)
  })
})

describe('mergeConceptGraphs', () => {
  it('dedupliziert Konzepte per Slug: längere Beschreibung + höchste Schwierigkeit gewinnen', () => {
    const a: IngestedGraph = {
      concepts: [{ slug: 'x', name: 'X', description: 'kurz', difficulty: 2, sourceRef: { section: 'A', pageFrom: 3 } }],
      edges: [],
    }
    const b: IngestedGraph = {
      concepts: [
        { slug: 'x', name: 'X lang', description: 'eine viel längere beschreibung', difficulty: 4, sourceRef: { pageTo: 7 } },
        { slug: 'y', name: 'Y', description: '', difficulty: 3, sourceRef: {} },
      ],
      edges: [],
    }
    const m = mergeConceptGraphs([a, b])
    expect(m.concepts).toHaveLength(2)
    const x = m.concepts.find((c) => c.slug === 'x')!
    expect(x.description).toBe('eine viel längere beschreibung')
    expect(x.difficulty).toBe(4)
    expect(x.sourceRef.section).toBe('A')
    expect(x.sourceRef.pageFrom).toBe(3)
    expect(x.sourceRef.pageTo).toBe(7)
  })

  it('vereinigt Kanten und filtert auf überlebende Slugs, ohne Doppel-/Selbstkanten', () => {
    const a: IngestedGraph = {
      concepts: [
        { slug: 'a', name: 'A', description: '', difficulty: 1, sourceRef: {} },
        { slug: 'b', name: 'B', description: '', difficulty: 1, sourceRef: {} },
      ],
      edges: [{ fromSlug: 'a', toSlug: 'b', type: 'prerequisite' }],
    }
    const b: IngestedGraph = {
      concepts: [{ slug: 'b', name: 'B', description: '', difficulty: 1, sourceRef: {} }],
      edges: [
        { fromSlug: 'a', toSlug: 'b', type: 'prerequisite' }, // Duplikat
        { fromSlug: 'b', toSlug: 'ghost', type: 'related' }, // ghost existiert nicht → raus
      ],
    }
    const m = mergeConceptGraphs([a, b])
    expect(m.edges).toEqual([{ fromSlug: 'a', toSlug: 'b', type: 'prerequisite' }])
  })

  it('begrenzt die Gesamtzahl der Konzepte auf CONCEPT_INGESTION_MAX_CONCEPTS (Dokumentreihenfolge zuerst)', () => {
    const many: IngestedGraph = {
      concepts: Array.from({ length: CONCEPT_INGESTION_MAX_CONCEPTS + 10 }, (_, i) => ({
        slug: `c${i}`,
        name: `C${i}`,
        description: '',
        difficulty: 3,
        sourceRef: {},
      })),
      edges: [],
    }
    const m = mergeConceptGraphs([many])
    expect(m.concepts).toHaveLength(CONCEPT_INGESTION_MAX_CONCEPTS)
    expect(m.concepts[0].slug).toBe('c0')
  })
})
