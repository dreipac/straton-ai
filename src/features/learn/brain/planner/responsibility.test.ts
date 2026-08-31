/**
 * Zustaendigkeitsgrenze Wiederholung gegen Pfad (Kapitel 6.7) — Tests.
 *
 * Die Grenze verlaeuft nach AUSLOESER, nicht nach Inhalt. Jede Folgerung aus 6.7 hat hier
 * genau einen Test, damit sich die Grenze nicht durch eine spaetere Bequemlichkeit verschiebt.
 */

import { describe, expect, it } from 'vitest'
import type { LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  buildReviewQueue,
  describeDueReason,
  dueConceptCount,
  isReviewEligible,
  needsDeeperRefresh,
  responsibilityFor,
  slippedBackToPath,
  CONSOLIDATED_MASTERY,
  FALLS_BACK_TO_PATH_MASTERY,
  REVIEW_STACK_DEPTH,
} from './responsibility'

const NOW = '2026-08-19T10:00:00.000Z'
const DAYS_AGO_20 = '2026-07-30T10:00:00.000Z'
const DAYS_AGO_3 = '2026-08-16T10:00:00.000Z'
const IN_2_DAYS = '2026-08-21T10:00:00.000Z'

/** Ein gefestigtes Konzept, das faellig geworden ist — der Normalfall des Stapels. */
function stackItem(id: string, overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return {
    ...emptyImage(id, 3),
    mastery: 0.82,
    confidence: 0.7,
    depth: 'recognize',
    directEvidenceCount: 5,
    directEvidenceWeight: 5,
    everConsolidated: true,
    lastSeenAt: DAYS_AGO_3,
    lastDirectEvidenceAt: DAYS_AGO_3,
    nextReviewAt: DAYS_AGO_3,
    ...overrides,
  }
}

describe('Ausloeser Verfall — der Stapel', () => {
  it('nimmt gefestigte, faellige Konzepte auf', () => {
    const verdict = responsibilityFor(stackItem('a'), NOW)
    expect(verdict.responsibility).toBe('review')
    expect(verdict.trigger).toBe('decay')
  })

  it('laesst nicht faellige Konzepte in Ruhe', () => {
    const verdict = responsibilityFor(stackItem('a', { nextReviewAt: IN_2_DAYS }), NOW)
    expect(verdict.responsibility).toBe('idle')
  })

  it('arbeitet immer auf Erkennen', () => {
    expect(REVIEW_STACK_DEPTH).toBe('recognize')
  })
})

describe('Folgerungen aus Kapitel 6.7', () => {
  it('ein nie gelerntes Konzept erscheint in der Wiederholung nie', () => {
    const nie = { ...emptyImage('x', 3), nextReviewAt: DAYS_AGO_20 }
    const verdict = responsibilityFor(nie, NOW)
    expect(verdict.responsibility).toBe('path')
    expect(verdict.trigger).toBe('gap')
    expect(isReviewEligible(nie)).toBe(false)
  })

  it('was auf Anwenden aufgefrischt werden muss, gehoert in den Pfad', () => {
    const tiefer = stackItem('a', { depth: 'apply', mastery: 0.55, everConsolidated: true })
    expect(needsDeeperRefresh(tiefer)).toBe(true)
    expect(responsibilityFor(tiefer, NOW).responsibility).toBe('path')
  })

  it('Fehler landen nie in der Wiederholung — auch wenn das Konzept faellig ist', () => {
    const markiert = stackItem('a', {
      reviewNeeded: true,
      reviewReason: 'Bei „Subnetzmaske" ist etwas schiefgegangen.',
    })
    const verdict = responsibilityFor(markiert, NOW)
    expect(verdict.responsibility).toBe('path')
    expect(verdict.trigger).toBe('error')
    // Der Grund wird durchgereicht, nicht durch einen Faelligkeitssatz ersetzt.
    expect(verdict.reason).toContain('Subnetzmaske')
  })

  it('schickt hohe, aber unbelegte Werte in den Pfad statt in den Stapel', () => {
    // Genau der Fall, den die Trennung von Beherrschung und Sicherheit sichtbar macht.
    const unbelegt = stackItem('a', { confidence: 0.1, directEvidenceCount: 1, directEvidenceWeight: 0.6 })
    expect(responsibilityFor(unbelegt, NOW).responsibility).toBe('path')
  })
})

describe('Uebergaenge in beide Richtungen', () => {
  it('befoerdert ein Konzept nach einer verpatzten Wiederholung zurueck in den Pfad', () => {
    const vorher = stackItem('a')
    const nachher = { ...vorher, mastery: 0.3 }
    expect(slippedBackToPath(vorher, nachher)).toBe(true)
    expect(responsibilityFor(nachher, NOW).responsibility).toBe('path')
  })

  it('laesst einen einzelnen Fehler bei hohem Wert im Stapel', () => {
    const vorher = stackItem('a', { mastery: 0.9 })
    // Ein Ausrutscher, aber weiterhin deutlich ueber der Rueckfallgrenze.
    const nachher = { ...vorher, mastery: 0.72 }
    expect(slippedBackToPath(vorher, nachher)).toBe(false)
  })

  it('haelt zwei Schwellen auseinander, damit nichts hin- und herwandert', () => {
    expect(FALLS_BACK_TO_PATH_MASTERY).toBeLessThan(CONSOLIDATED_MASTERY)
  })

  it('wirft ein Konzept nicht durch blossen Verfall aus dem Stapel', () => {
    /*
     * Der Kern von 6.7: Verfall ist der GRUND, warum etwas im Stapel liegt. Wuerde die
     * Zugehoerigkeit am verfallenen Wert gemessen, verschwaende genau das Konzept, das am
     * dringendsten aufgefrischt gehoert — es faellt aus dem Stapel (zu tief) und aus dem Pfad
     * (nichts ging schief).
     */
    const langeLiegen = stackItem('a', {
      lastSeenAt: '2026-05-01T10:00:00.000Z',
      lastDirectEvidenceAt: '2026-05-01T10:00:00.000Z',
      nextReviewAt: '2026-05-20T10:00:00.000Z',
    })
    expect(isReviewEligible(langeLiegen)).toBe(true)
    expect(responsibilityFor(langeLiegen, NOW).responsibility).toBe('review')
  })
})

describe('Stapeluebersicht', () => {
  it('sortiert das am staerksten Verblasste nach vorne', () => {
    const images = [
      stackItem('leicht', { mastery: 0.85 }),
      stackItem('stark', { mastery: 0.5, lastSeenAt: DAYS_AGO_20, lastDirectEvidenceAt: DAYS_AGO_20 }),
    ]
    expect(buildReviewQueue(images, NOW).map((e) => e.conceptId)).toEqual(['stark', 'leicht'])
  })

  it('ist deterministisch (I11 gilt auch fuer den Stapel)', () => {
    const images = [stackItem('b'), stackItem('a')]
    expect(buildReviewQueue(images, NOW).map((e) => e.conceptId)).toEqual(
      buildReviewQueue([...images].reverse(), NOW).map((e) => e.conceptId),
    )
  })

  it('zaehlt Konzepte, nicht Abfragen', () => {
    // UI-Spezifikation 5.7: eine Zahl, die ohne Nutzerhandlung springt, wirkt kaputt.
    const images = [stackItem('a'), stackItem('b'), { ...emptyImage('c', 3) }]
    expect(dueConceptCount(images, NOW)).toBe(2)
  })

  it('nennt drei unterscheidbare Faelligkeitsgruende', () => {
    expect(describeDueReason(stackItem('a', { lastSeenAt: DAYS_AGO_20 }), NOW)).toBe('20 Tage nicht angefasst')
    expect(describeDueReason(stackItem('a', { nextReviewAt: IN_2_DAYS }), NOW)).toBe('verfaellt in 2 Tagen')
    expect(describeDueReason(stackItem('a'), NOW)).toBe('planmaessige Auffrischung')
  })
})
