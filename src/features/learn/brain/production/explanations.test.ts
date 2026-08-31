/**
 * Erklaertexte als eigene Erzeugungsart (Kapitel 7.3) — Tests.
 *
 * Der Schwerpunkt liegt auf der Grenze, nicht auf dem Text: WANN darf erklaert werden, und was
 * passiert mit einem Text, der nicht durch die Quelle gedeckt ist. Beides sind Regeln, die sich
 * ohne Test nach dem dritten Nutzerfeedback verschieben.
 */

import { describe, expect, it } from 'vitest'
import type { LearnerConceptImage } from '../types'
import { InvariantViolation } from '../invariants'
import { emptyImage } from '../memory/learnerImage'
import {
  assertExplanationCleared,
  buildExplanationVerdict,
  countSentences,
  explanationAllowed,
  explanationSlotSpec,
  needsIntro,
  withinScope,
  EXPLANATION_SLOTS,
  type GeneratedExplanation,
} from './explanations'

function touched(overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return {
    ...emptyImage('c1', 3),
    directEvidenceCount: 1,
    directEvidenceWeight: 1,
    confidence: 0.2,
    ...overrides,
  }
}

function explanation(overrides: Partial<GeneratedExplanation> = {}): GeneratedExplanation {
  return {
    conceptId: 'c1',
    slot: 'intro',
    text: 'Ein Subnetz teilt ein Netz in kleinere Bereiche. Die Maske bestimmt die Grenze. Hosts jenseits der Grenze sind nicht direkt erreichbar.',
    solutionPath: '',
    sourceGrounding: 'Skript S. 12, Abschnitt „Subnetzbildung"',
    sourceRef: { pageFrom: 12 },
    ...overrides,
  }
}

describe('Die drei zugelassenen Erklaerstellen', () => {
  it('kennt genau drei — alles weitere gehoert in den Chat', () => {
    expect(EXPLANATION_SLOTS.map((s) => s.slot)).toEqual(['intro', 'feedback', 'dontKnow'])
  })

  it('gibt jeder Stelle eine Umfangsgrenze mit', () => {
    for (const spec of EXPLANATION_SLOTS) {
      expect(spec.minSentences, spec.slot).toBeGreaterThan(0)
      expect(spec.maxSentences, spec.slot).toBeGreaterThanOrEqual(spec.minSentences)
    }
  })

  it('haelt den Einstieg bei drei bis fuenf Saetzen', () => {
    const spec = explanationSlotSpec('intro')
    expect([spec.minSentences, spec.maxSentences]).toEqual([3, 5])
  })
})

describe('Wann erklaert werden darf', () => {
  it('gibt einen Einstieg nur bei Beherrschung und Sicherheit auf null', () => {
    expect(needsIntro(undefined)).toBe(true)
    expect(needsIntro(emptyImage('c1', 3))).toBe(true)
    expect(needsIntro(touched())).toBe(false)
  })

  it('erklaert nach dem Versuch immer', () => {
    expect(explanationAllowed({ slot: 'feedback', image: touched() })).toBe(true)
    expect(explanationAllowed({ slot: 'feedback', image: undefined })).toBe(true)
  })

  it('gibt die vollstaendige Erklaerung nur auf Anforderung', () => {
    expect(explanationAllowed({ slot: 'dontKnow', image: touched() })).toBe(false)
    expect(explanationAllowed({ slot: 'dontKnow', image: touched(), requestedByUser: true })).toBe(true)
  })

  it('erklaert ein begonnenes Konzept nicht mehr vorab', () => {
    /*
     * Kapitel 7.3: „Wer erst versucht und dann die Erklaerung erhaelt, behaelt deutlich mehr als
     * wer zuerst liest." Ein Einstieg bei jedem Konzept waere bequemer und die schwaechere
     * Reihenfolge.
     */
    expect(explanationAllowed({ slot: 'intro', image: touched() })).toBe(false)
  })
})

describe('Quellenabgleich fuer Erklaertexte (Invariante I5)', () => {
  it('laesst einen gedeckten Text durch', () => {
    const verdict = buildExplanationVerdict({ sourceAligned: true })
    expect(verdict.passed).toBe(true)
    expect(() => assertExplanationCleared(explanation(), verdict)).not.toThrow()
  })

  it('haelt einen Text ohne Kontrolleur-Befund auf', () => {
    expect(() => assertExplanationCleared(explanation(), null)).toThrow(InvariantViolation)
  })

  it('haelt einen nicht verankerten Text auf', () => {
    const verdict = buildExplanationVerdict({ sourceAligned: false })
    expect(verdict.passed).toBe(false)
    expect(() => assertExplanationCleared(explanation(), verdict)).toThrow(InvariantViolation)
  })

  it('haelt einen Text mit ungedeckten Behauptungen auf, auch wenn er im Uebrigen passt', () => {
    /*
     * Der gefaehrliche Fall: der Text ist fachlich richtig und stammt trotzdem nicht aus dem
     * Material. Die Person wird an ihrem Skript geprueft, nicht am Weltwissen.
     */
    const verdict = buildExplanationVerdict({
      sourceAligned: true,
      unsupportedClaims: ['Die Standardmaske ist immer /24.'],
    })
    expect(verdict.passed).toBe(false)
    expect(() => assertExplanationCleared(explanation(), verdict)).toThrow(InvariantViolation)
  })

  it('haelt einen Text ohne Herkunftsmarkierung auf (Invariante I4)', () => {
    const verdict = buildExplanationVerdict({ sourceAligned: true })
    expect(() => assertExplanationCleared(explanation({ sourceGrounding: '  ' }), verdict)).toThrow(
      InvariantViolation,
    )
  })

  it('nennt in der Fehlermeldung die verletzte Invariante', () => {
    try {
      assertExplanationCleared(explanation({ sourceGrounding: '' }), buildExplanationVerdict({ sourceAligned: true }))
      expect.unreachable('haette werfen muessen')
    } catch (error) {
      expect((error as InvariantViolation).invariant).toBe('I4')
    }
  })
})

describe('Umfangsgrenze', () => {
  it('zaehlt Saetze grob, aber brauchbar', () => {
    expect(countSentences('Eins. Zwei! Drei?')).toBe(3)
    expect(countSentences('   ')).toBe(0)
  })

  it('laesst einen Einstieg im vorgesehenen Umfang durch', () => {
    expect(withinScope(explanation())).toBe(true)
  })

  it('faengt den Einstieg ab, der zum Kapitel wird', () => {
    const kapitel = explanation({ text: Array.from({ length: 12 }, (_, i) => `Satz ${i}.`).join(' ') })
    expect(withinScope(kapitel)).toBe(false)
  })

  it('faengt auch den zu knappen Einstieg ab', () => {
    // Ein Satz vor der ersten Aufgabe diagnostiziert nichts und beruhigt niemanden.
    expect(withinScope(explanation({ text: 'Subnetze teilen Netze.' }))).toBe(false)
  })
})
