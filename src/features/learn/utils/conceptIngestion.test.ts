import { describe, it, expect } from 'vitest'
import {
  normalizeConceptSlug,
  buildConceptIngestionPrompt,
  parseConceptGraphFromText,
  validateConceptGraph,
  CONCEPT_INGESTION_MIN_CONCEPTS,
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
