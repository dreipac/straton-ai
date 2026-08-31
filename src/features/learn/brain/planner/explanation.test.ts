/**
 * Erklaerpflicht (Invariante I8) — Tests.
 *
 * Der entscheidende Punkt: der Satz entsteht deterministisch. Die Rolle „Erklaerer" darf ihn
 * glaetten, aber nie die Voraussetzung dafuer sein, dass es ihn gibt — sonst haenge eine
 * Invariante an einem Modellaufruf, der ausfallen kann.
 */

import { describe, expect, it } from 'vitest'
import type { UrgencyClaim } from '../types'
import { InvariantViolation } from '../invariants'
import {
  acceptPolished,
  explainInsert,
  explainSelection,
  polishRequestFor,
  COLD_START_DISCLOSURE,
  MAX_EXPLANATION_CHARS,
} from './explanation'

const CLAIMS: UrgencyClaim[] = ['review', 'rootCause', 'goal', 'motivation', 'coldStart']

function context(claim: UrgencyClaim, overrides: Record<string, unknown> = {}) {
  return {
    claim,
    conceptName: 'Subnetzmaske ableiten',
    depth: 'apply' as const,
    signalReason: 'Signalgrund',
    fromReviewReserve: false,
    ...overrides,
  }
}

describe('deterministische Begruendung', () => {
  it('liefert fuer jeden Anspruch einen Satz', () => {
    for (const claim of CLAIMS) {
      const sentence = explainSelection(context(claim))
      expect(sentence.trim().length, `${claim} ohne Satz`).toBeGreaterThan(10)
    }
  })

  it('ist deterministisch', () => {
    expect(explainSelection(context('review'))).toBe(explainSelection(context('review')))
  })

  it('nennt das Konzept beim Namen', () => {
    for (const claim of CLAIMS) {
      expect(explainSelection(context(claim))).toContain('Subnetzmaske ableiten')
    }
  })

  it('vermeidet Fachjargon', () => {
    for (const claim of CLAIMS) {
      expect(explainSelection(context(claim))).not.toMatch(/Propagation|Voraussetzungskante|Konfidenz|Knoten|BKT/)
    }
  })

  it('erklaert die Wiederholung im Endspurt als bewusste Entscheidung', () => {
    const sentence = explainSelection(context('review', { fromReviewReserve: true }))
    expect(sentence).toMatch(/Endspurt|nicht ganz ausfallen/)
  })

  it('nennt bei der Ursachensuche das ausloesende Konzept', () => {
    const sentence = explainSelection(context('rootCause', { triggeredBy: 'VLSM' }))
    expect(sentence).toContain('VLSM')
  })

  it('nennt bei knappem Termin die verbleibenden Tage', () => {
    const sentence = explainSelection(context('goal', { daysToDeadline: 2 }))
    expect(sentence).toMatch(/2 Tagen/)
  })

  it('kommt ohne Konzeptnamen zurecht, statt einen leeren Satz zu liefern', () => {
    expect(() => explainSelection(context('review', { conceptName: '   ' }))).not.toThrow()
  })
})

describe('Einschub-Begruendung', () => {
  it('nennt beide beteiligten Konzepte', () => {
    const reason = explainInsert({ conceptName: 'Zweierpotenzen', triggeredByName: 'VLSM' })
    expect(reason).toContain('Zweierpotenzen')
    expect(reason).toContain('VLSM')
  })

  it('wirft nie einen leeren Grund aus', () => {
    expect(() => explainInsert({ conceptName: '', triggeredByName: '' })).not.toThrow()
  })
})

describe('Glaettung durch den Erklaerer', () => {
  it('reicht den Entwurf als Vorlage weiter', () => {
    const request = polishRequestFor('Das faengt an zu verblassen.', 'Subnetzmaske')
    expect(request.draft).toBe('Das faengt an zu verblassen.')
    expect(request.conceptName).toBe('Subnetzmaske')
  })

  it('uebernimmt eine gute Umformulierung', () => {
    expect(acceptPolished('Entwurf.', 'Das sitzt noch nicht ganz sicher.')).toBe(
      'Das sitzt noch nicht ganz sicher.',
    )
  })

  it('faellt bei ausgefallenem Modell auf die Vorlage zurueck', () => {
    expect(acceptPolished('Entwurf.', null)).toBe('Entwurf.')
    expect(acceptPolished('Entwurf.', '   ')).toBe('Entwurf.')
  })

  it('lehnt einen Absatz ab — der Auftrag lautet auf einen Satz', () => {
    expect(acceptPolished('Entwurf.', 'Erster Satz. Zweiter Satz.')).toBe('Entwurf.')
  })

  it('lehnt eine zu lange Fassung ab', () => {
    const long = `${'x'.repeat(MAX_EXPLANATION_CHARS + 1)}`
    expect(acceptPolished('Entwurf.', long)).toBe('Entwurf.')
  })
})

describe('Kaltstart-Hinweis (Kapitel 9)', () => {
  it('kuendigt an, dass die ersten Aufgaben danebenliegen koennen', () => {
    expect(COLD_START_DISCLOSURE).toMatch(/zu leicht oder zu schwer/)
    expect(COLD_START_DISCLOSURE).toMatch(/einzuschaetzen|einschätzen/)
  })
})

describe('Invariante I8 als Guard', () => {
  it('faellt auf, wenn ein Anspruch keinen Satz erzeugt', () => {
    // Ein unbekannter Anspruch faellt durch alle Zweige — der Guard muss das melden.
    expect(() =>
      explainSelection(context('unbekannt' as UrgencyClaim, { signalReason: '' })),
    ).toThrow(InvariantViolation)
  })
})
