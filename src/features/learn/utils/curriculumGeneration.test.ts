import { describe, it, expect } from 'vitest'
import {
  buildCurriculumPrompt,
  parseCurriculumFromText,
  validateCurriculum,
  orderCurriculum,
  buildFallbackCurriculum,
  FALLBACK_TOPIC_SIZE,
  type Curriculum,
} from './curriculumGeneration'

const KNOWN = ['binary', 'mask', 'calc', 'vlsm', 'cidr']

describe('buildCurriculumPrompt', () => {
  it('listet Konzepte + Kanten und enthaelt das Schema', () => {
    const p = buildCurriculumPrompt({
      concepts: [{ slug: 'binary', name: 'Binär', difficulty: 2 }],
      edges: [{ fromSlug: 'binary', toSlug: 'mask', type: 'prerequisite' }],
      attempt: 1,
      validationHint: '',
    })
    expect(p).toContain('binary — Binär')
    expect(p).toContain('binary -> mask [prerequisite]')
    expect(p).toContain('"topics"')
    expect(p).not.toContain('Der vorige Versuch war ungueltig')
  })
})

describe('parseCurriculumFromText', () => {
  it('clustert und ordnet jedes Konzept genau einem Thema zu', () => {
    const json = JSON.stringify({
      topics: [
        { title: 'Grundlagen', learningGoal: 'Basis', conceptSlugs: ['binary', 'mask'], steps: [{ title: 'S1', conceptSlugs: ['binary'] }, { title: 'S2', conceptSlugs: ['mask'] }] },
        { title: 'Fortgeschritten', conceptSlugs: ['calc', 'vlsm', 'cidr'], steps: [{ title: 'S3', conceptSlugs: ['calc', 'vlsm'] }] },
      ],
    })
    const c = parseCurriculumFromText(json, KNOWN)
    expect(c.topics.length).toBe(2)
    // Volle Abdeckung, keine Doppelzuordnung
    const all = c.topics.flatMap((t) => t.conceptSlugs).sort()
    expect(all).toEqual([...KNOWN].sort())
    // cidr war in keinem Schritt -> Abschluss-Schritt
    expect(c.topics[1].steps.some((s) => s.conceptSlugs.includes('cidr'))).toBe(true)
  })

  it('haengt nicht zugeordnete Konzepte an ein Auffang-Thema (Abdeckung)', () => {
    const json = JSON.stringify({
      topics: [{ title: 'Nur Basis', conceptSlugs: ['binary'], steps: [{ title: 'S', conceptSlugs: ['binary'] }] }],
    })
    const c = parseCurriculumFromText(json, KNOWN)
    const covered = new Set(c.topics.flatMap((t) => t.conceptSlugs))
    for (const slug of KNOWN) {
      expect(covered.has(slug)).toBe(true)
    }
  })

  it('verwirft ein Konzept in mehreren Themen (erste Nennung gewinnt)', () => {
    const json = JSON.stringify({
      topics: [
        { title: 'A', conceptSlugs: ['binary'], steps: [{ title: 's', conceptSlugs: ['binary'] }] },
        { title: 'B', conceptSlugs: ['binary', 'mask'], steps: [{ title: 's', conceptSlugs: ['mask'] }] },
      ],
    })
    const c = parseCurriculumFromText(json, ['binary', 'mask'])
    const inA = c.topics[0].conceptSlugs
    const inB = c.topics[1].conceptSlugs
    expect(inA).toEqual(['binary'])
    expect(inB).toEqual(['mask'])
  })

  it('kaputte Eingabe -> Auffang-Thema mit allen Konzepten', () => {
    const c = parseCurriculumFromText('kein json', KNOWN)
    expect(c.topics.length).toBe(1)
    expect(new Set(c.topics[0].conceptSlugs)).toEqual(new Set(KNOWN))
  })

  it('ignoriert unbekannte slugs', () => {
    const json = JSON.stringify({
      topics: [{ title: 'A', conceptSlugs: ['binary', 'ghost'], steps: [{ title: 's', conceptSlugs: ['binary'] }] }],
    })
    const c = parseCurriculumFromText(json, ['binary'])
    expect(c.topics[0].conceptSlugs).toEqual(['binary'])
  })
})

describe('validateCurriculum', () => {
  it('leeres Curriculum ungueltig', () => {
    expect(validateCurriculum({ topics: [] }, KNOWN).valid).toBe(false)
  })
  it('fehlende Abdeckung ungueltig', () => {
    const c: Curriculum = { topics: [{ title: 'A', learningGoal: '', conceptSlugs: ['binary'], steps: [{ title: 's', conceptSlugs: ['binary'] }] }] }
    expect(validateCurriculum(c, KNOWN).valid).toBe(false)
  })
  it('vollstaendiges Curriculum gueltig', () => {
    const c = parseCurriculumFromText(
      JSON.stringify({ topics: [{ title: 'Alles', conceptSlugs: KNOWN, steps: [{ title: 's', conceptSlugs: KNOWN }] }] }),
      KNOWN,
    )
    expect(validateCurriculum(c, KNOWN).valid).toBe(true)
  })
})

describe('orderCurriculum', () => {
  it('ordnet Themen nach dem fruehesten Konzept-Rang', () => {
    const c: Curriculum = {
      topics: [
        { title: 'Spaet', learningGoal: '', conceptSlugs: ['vlsm'], steps: [{ title: 's', conceptSlugs: ['vlsm'] }] },
        { title: 'Frueh', learningGoal: '', conceptSlugs: ['binary'], steps: [{ title: 's', conceptSlugs: ['binary'] }] },
      ],
    }
    const ordered = orderCurriculum(c, ['binary', 'mask', 'calc', 'vlsm'])
    expect(ordered.topics.map((t) => t.title)).toEqual(['Frueh', 'Spaet'])
  })

  it('ordnet Konzepte und Schritte innerhalb eines Themas topologisch', () => {
    const c: Curriculum = {
      topics: [
        {
          title: 'T',
          learningGoal: '',
          conceptSlugs: ['vlsm', 'binary', 'mask'],
          steps: [
            { title: 'sVlsm', conceptSlugs: ['vlsm'] },
            { title: 'sBinary', conceptSlugs: ['binary'] },
          ],
        },
      ],
    }
    const ordered = orderCurriculum(c, ['binary', 'mask', 'vlsm'])
    expect(ordered.topics[0].conceptSlugs).toEqual(['binary', 'mask', 'vlsm'])
    expect(ordered.topics[0].steps.map((s) => s.title)).toEqual(['sBinary', 'sVlsm'])
  })
})

describe('buildFallbackCurriculum', () => {
  it('leere Konzeptliste -> keine Themen', () => {
    expect(buildFallbackCurriculum([])).toEqual({ topics: [] })
  })
  it('wenige Konzepte -> ein Thema "Grundlagen", je Konzept ein Schritt', () => {
    const c = buildFallbackCurriculum([
      { slug: 'a', name: 'A' },
      { slug: 'b', name: 'B' },
    ])
    expect(c.topics.length).toBe(1)
    expect(c.topics[0].title).toBe('Grundlagen')
    expect(c.topics[0].steps.map((s) => s.conceptSlugs[0])).toEqual(['a', 'b'])
  })
  it('viele Konzepte werden in Themen gechunkt und decken alle ab', () => {
    const concepts = Array.from({ length: FALLBACK_TOPIC_SIZE * 2 + 1 }, (_, i) => ({ slug: `c${i}`, name: `C${i}` }))
    const c = buildFallbackCurriculum(concepts)
    expect(c.topics.length).toBe(3)
    const covered = c.topics.flatMap((t) => t.conceptSlugs)
    expect(covered.sort()).toEqual(concepts.map((x) => x.slug).sort())
  })
})
