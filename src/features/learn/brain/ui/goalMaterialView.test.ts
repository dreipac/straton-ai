/**
 * Ziel-Dialog und Quellenliste — Tests gegen UI-Spezifikation Kapitel 6 und 7.
 *
 * Zwei Zusagen stehen hier im Mittelpunkt:
 *  - Bei einem unmoeglichen Ziel folgt ein KONKRETER Vorschlag, nicht nur eine Warnung (7).
 *  - Die Herkunft wird getrennt ausgewiesen, und zwar in vier Toepfen statt in zwei (6, I4).
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import { buildGoalPreview, groupConceptsForScope, defaultDueDate } from './goalView'
import { buildMaterialSources, AI_SUPPLEMENT_NOTICE } from './materialView'

const NOW = '2026-08-19T10:00:00.000Z'

function concept(id: string, overrides: Partial<BrainConcept> = {}): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: `Konzept ${id}`,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
    ...overrides,
  }
}

function untouched(id: string): LearnerConceptImage {
  return emptyImage(id, 3)
}

describe('Ziel setzen (Kapitel 7)', () => {
  it('rechnet erst, wenn Termin, Umfang und Zeit stehen', () => {
    const preview = buildGoalPreview({
      draft: { title: '', dueAt: '', conceptIds: [], minutesPerDay: 0 },
      userId: 'u1',
      pathId: 'p1',
      images: new Map(),
      nowIso: NOW,
    })
    expect(preview.isComplete).toBe(false)
    expect(preview.assessment).toBeNull()
  })

  it('nennt bei einem machbaren Ziel die taegliche Last', () => {
    const images = new Map([['c1', untouched('c1')]])
    const preview = buildGoalPreview({
      draft: {
        title: 'Pruefung',
        dueAt: '2026-09-19T23:59:59.000Z',
        conceptIds: ['c1'],
        minutesPerDay: 60,
      },
      userId: 'u1',
      pathId: 'p1',
      images,
      nowIso: NOW,
    })
    expect(preview.feasible).toBe(true)
    expect(preview.suggestion).toBe('')
    expect(preview.sentence).toContain('geht sich aus')
  })

  /*
   * Der Kern von Kapitel 7: „Bei Unmoeglichkeit muss ein konkreter Vorschlag folgen (Umfang
   * kuerzen, Zeit erhoehen, Tiefe senken), nicht nur eine Warnung."
   */
  it('nennt bei einem zu engen Ziel einen konkreten Ausweg mit Zahl', () => {
    const images = new Map(
      Array.from({ length: 12 }, (_, index) => [`c${index}`, untouched(`c${index}`)] as const),
    )
    const preview = buildGoalPreview({
      draft: {
        title: 'Test',
        dueAt: '2026-08-21T23:59:59.000Z',
        conceptIds: [...images.keys()],
        minutesPerDay: 10,
      },
      userId: 'u1',
      pathId: 'p1',
      images,
      nowIso: NOW,
    })
    expect(preview.feasible).toBe(false)
    expect(preview.suggestion.length).toBeGreaterThan(0)
    expect(preview.suggestion).toMatch(/\d+ Minuten pro Tag/)
  })

  it('gruppiert den Umfang wie die Themenliste', () => {
    const groups = groupConceptsForScope([
      concept('a', { sourceRef: { section: 'Kapitel 1' } }),
      concept('b', { sourceRef: { section: 'Kapitel 1' } }),
      concept('c', { sourceRef: {} }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({ title: 'Kapitel 1', conceptIds: ['a', 'b'] })
    expect(groups[1].title).toBe('Weitere Konzepte')
  })

  it('schlaegt einen Termin vor, der in der Zukunft liegt', () => {
    expect(defaultDueDate(NOW) > NOW.slice(0, 10)).toBe(true)
  })
})

describe('Quellen im Material (Kapitel 6, Invariante I4)', () => {
  it('haelt Material, Nutzerkonzepte, KI-Ergaenzungen und Altbestand auseinander', () => {
    const view = buildMaterialSources([
      concept('a', { sourceRef: { doc: 'Skript.pdf' } }),
      concept('b', { sourceRef: { doc: 'Skript.pdf' } }),
      concept('c', { origin: 'user', sourceQuote: '' }),
      concept('d', { origin: 'aiSupplement', sourceQuote: '' }),
      concept('e', { origin: 'unknown', sourceQuote: '' }),
    ])

    expect(view.fromMaterial).toEqual([
      { title: 'Skript.pdf', conceptCount: 2, conceptNames: ['Konzept a', 'Konzept b'] },
    ])
    expect(view.fromUser).toHaveLength(1)
    expect(view.aiSupplemented).toHaveLength(1)
    expect(view.unverified).toHaveLength(1)
    expect(view.totalConceptCount).toBe(5)
  })

  it('zeigt den Pruefhinweis nur, wenn es KI-Ergaenzungen gibt', () => {
    expect(buildMaterialSources([concept('a')]).aiNotice).toBe('')
    expect(buildMaterialSources([concept('a', { origin: 'aiSupplement', sourceQuote: '' })]).aiNotice).toBe(
      AI_SUPPLEMENT_NOTICE,
    )
  })
})
