import { describe, it, expect } from 'vitest'
import {
  buildConceptDirective,
  prependConceptDirective,
  buildEntryCheckDirective,
  buildStepPlanDirective,
  buildExamWeightDirective,
  masteryBand,
  type ConceptDirectiveItem,
} from './conceptConditioning'

const ITEMS: ConceptDirectiveItem[] = [
  { slug: 'binary', name: 'Binärsystem', difficulty: 2, mastery: 0.9 },
  { slug: 'mask', name: 'Subnetzmaske', difficulty: 3, mastery: 0.2 },
  { slug: 'vlsm', name: 'VLSM', difficulty: 5, mastery: null, source: 'Skript S.12' },
]

describe('masteryBand', () => {
  it('bildet Mastery auf Baender ab', () => {
    expect(masteryBand(null)).toBe('neu')
    expect(masteryBand(0.1)).toBe('schwach')
    expect(masteryBand(0.5)).toBe('mittel')
    expect(masteryBand(0.9)).toBe('beherrscht')
  })
})

describe('buildConceptDirective', () => {
  it('leere Liste → leere Direktive (Legacy-Verhalten)', () => {
    expect(buildConceptDirective([])).toBe('')
  })

  it('listet Konzepte mit Slug, Name, Schwierigkeit und Stand', () => {
    const d = buildConceptDirective(ITEMS)
    expect(d).toContain('binary — Binärsystem [Schwierigkeit 2/5, Stand: beherrscht')
    expect(d).toContain('mask — Subnetzmaske [Schwierigkeit 3/5, Stand: schwach')
    expect(d).toContain('vlsm — VLSM [Schwierigkeit 5/5, Stand: neu, Quelle: Skript S.12]')
  })

  it('weist an, skillTag mit genau einem der Slugs zu taggen', () => {
    const d = buildConceptDirective(ITEMS)
    expect(d).toContain('"skillTag"')
    expect(d).toContain('GENAU EINEM')
  })

  it('priorisiert schwache/neue Konzepte in der Fokus-Zeile und Reihenfolge', () => {
    const d = buildConceptDirective(ITEMS)
    // schwach (mask) + neu (vlsm) sollen vor beherrscht (binary) gelistet sein
    const idxMask = d.indexOf('mask —')
    const idxVlsm = d.indexOf('vlsm —')
    const idxBinary = d.indexOf('binary —')
    expect(idxMask).toBeLessThan(idxBinary)
    expect(idxVlsm).toBeLessThan(idxBinary)
    expect(d).toContain('Priorisiere diese noch nicht sicher beherrschten Konzepte')
    expect(d).toContain('mask')
  })

  it('begrenzt die Anzahl gelisteter Konzepte', () => {
    const many: ConceptDirectiveItem[] = Array.from({ length: 40 }, (_, i) => ({
      slug: `c${i}`,
      name: `C${i}`,
      difficulty: 3,
      mastery: 0.5,
    }))
    const d = buildConceptDirective(many, { maxConcepts: 5 })
    const listed = d.split('\n').filter((l) => l.startsWith('- c'))
    expect(listed.length).toBe(5)
  })

  it('meldet Auffrischung, wenn alles beherrscht ist', () => {
    const mastered: ConceptDirectiveItem[] = [{ slug: 'a', name: 'A', difficulty: 2, mastery: 0.95 }]
    expect(buildConceptDirective(mastered)).toContain('weitgehend beherrscht')
  })
})

describe('prependConceptDirective', () => {
  it('stellt die Direktive voran', () => {
    const out = prependConceptDirective('OUTLINE-TEXT', 'DIREKTIVE')
    expect(out.startsWith('DIREKTIVE')).toBe(true)
    expect(out).toContain('OUTLINE-TEXT')
  })
  it('leere Direktive lässt die Outline unverändert', () => {
    expect(prependConceptDirective('OUTLINE', '')).toBe('OUTLINE')
    expect(prependConceptDirective('OUTLINE', '   ')).toBe('OUTLINE')
  })
})

describe('buildEntryCheckDirective (Entscheidung 1)', () => {
  it('leere Liste → leer', () => {
    expect(buildEntryCheckDirective([])).toBe('')
  })
  it('fokussiert auf schwache und lässt beherrschte weg/kurz', () => {
    const d = buildEntryCheckDirective(ITEMS)
    expect(d).toContain('ADAPTIVER EINSTIEGSCHECK')
    // mask (schwach) + vlsm (neu) sind schwerpunkt; binary (beherrscht) → Bestätigung/weglassen
    expect(d).toMatch(/schwerpunktmaessig.*mask/)
    expect(d).toMatch(/bereits als beherrscht.*binary/)
  })
})

describe('buildExamWeightDirective (Entscheidung 6)', () => {
  it('leere/gewichtslose Liste → leer', () => {
    expect(buildExamWeightDirective([])).toBe('')
    expect(buildExamWeightDirective([{ slug: 'a', name: 'A', weight: 0 }])).toBe('')
  })
  it('verteilt Fragen nach Gewicht, schwerste zuerst', () => {
    const d = buildExamWeightDirective([
      { slug: 'leicht', name: 'Leicht', weight: 1 },
      { slug: 'schwer', name: 'Schwer', weight: 3 },
    ])
    expect(d).toContain('GEWICHTETE ABSCHLUSSPRUEFUNG')
    const idxSchwer = d.indexOf('schwer —')
    const idxLeicht = d.indexOf('leicht —')
    expect(idxSchwer).toBeLessThan(idxLeicht)
    expect(d).toContain('75% der Fragen')
    expect(d).toContain('25% der Fragen')
  })
})

describe('buildStepPlanDirective (Entscheidung 2)', () => {
  it('leere Liste → leer', () => {
    expect(buildStepPlanDirective([])).toBe('')
  })
  it('unterrichtet beherrschte Konzepte nicht neu, konzentriert auf schwache', () => {
    const d = buildStepPlanDirective(ITEMS)
    expect(d).toContain('ADAPTIVER LERNPLAN')
    expect(d).toMatch(/Bereits beherrscht:.*binary/)
    expect(d).toMatch(/schwachen Konzepte:.*mask/)
    expect(d).toContain('kuerzerer, gezielter Plan')
  })
})
