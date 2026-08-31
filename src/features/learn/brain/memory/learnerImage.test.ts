/**
 * Lernerbild (Kapitel 4.2) — Tests.
 *
 * Der Kern dieser Tests ist die Trennung der drei Werte: dass Beherrschung, Sicherheit und
 * Anwendungstiefe sich unabhaengig voneinander bewegen, und dass jede von ihnen genau die
 * Signale annimmt, die ihr zustehen.
 */

import { describe, expect, it } from 'vitest'
import type { ExaminerVerdict, LearnerConceptImage } from '../types'
import {
  applyDirectEvidence,
  confidenceFromEvidence,
  effectiveConfidence,
  effectiveMastery,
  emptyImage,
  nextReviewIntervalDays,
  resolveDepth,
  responsivenessFor,
  COLD_START_EVIDENCE_WEIGHT,
  MAX_RESPONSIVENESS,
  MIN_RESPONSIVENESS,
} from './learnerImage'

const NOW = '2026-08-18T10:00:00.000Z'

function verdict(credit: number, confidence = 0.9): ExaminerVerdict {
  return { credit, partialCredit: {}, cause: null, confidence }
}

function imageWith(overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return { ...emptyImage('c1', 3), ...overrides }
}

describe('emptyImage', () => {
  it('startet mit Sicherheit null — eine Vermutung ist kein Wissen', () => {
    const image = emptyImage('c1', 3)
    expect(image.confidence).toBe(0)
    expect(image.directEvidenceCount).toBe(0)
    expect(image.coldStart).toBe(true)
  })

  it('setzt einen schwierigkeitsabhaengigen Startwert der Beherrschung', () => {
    expect(emptyImage('a', 1).mastery).toBeGreaterThan(emptyImage('b', 5).mastery)
  })
})

describe('Reaktionsstaerke — der erste Eindruck praegt stark, der hundertste kaum noch', () => {
  it('ist ohne Evidenz maximal', () => {
    expect(responsivenessFor(0)).toBeCloseTo(MAX_RESPONSIVENESS, 5)
  })

  it('faellt monoton mit dem Evidenzgewicht', () => {
    const values = [0, 2, 6, 20, 100].map(responsivenessFor)
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeLessThan(values[i - 1])
    }
  })

  it('faellt nie unter die Untergrenze', () => {
    expect(responsivenessFor(10_000)).toBeGreaterThanOrEqual(MIN_RESPONSIVENESS)
  })
})

describe('Sicherheit aus Evidenzgewicht', () => {
  it('ist bei null Evidenz null', () => {
    expect(confidenceFromEvidence(0)).toBe(0)
  })

  it('waechst saettigend', () => {
    const a = confidenceFromEvidence(5)
    const b = confidenceFromEvidence(10)
    const c = confidenceFromEvidence(15)
    expect(b).toBeGreaterThan(a)
    expect(c - b).toBeLessThan(b - a)
  })

  it('erreicht nie ganz eins', () => {
    expect(confidenceFromEvidence(1000)).toBeLessThanOrEqual(1)
  })
})

describe('applyDirectEvidence', () => {
  it('hebt die Beherrschung bei richtiger Antwort', () => {
    const { next, masteryDelta } = applyDirectEvidence({
      image: imageWith(),
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(masteryDelta).toBeGreaterThan(0)
    expect(next.mastery).toBeGreaterThan(emptyImage('c1', 3).mastery)
  })

  it('senkt die Beherrschung bei falscher Antwort', () => {
    const start = imageWith({ mastery: 0.8, directEvidenceWeight: 3, confidence: 0.45 })
    const { masteryDelta } = applyDirectEvidence({
      image: start,
      verdict: verdict(0),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(masteryDelta).toBeLessThan(0)
  })

  it('bewegt das Lernerbild bei niedriger Zuversicht nur schwach (Kapitel 5.3)', () => {
    const start = imageWith()
    const confident = applyDirectEvidence({
      image: start,
      verdict: verdict(1, 1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    const doubtful = applyDirectEvidence({
      image: start,
      verdict: verdict(1, 0.3),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(Math.abs(doubtful.masteryDelta)).toBeLessThan(Math.abs(confident.masteryDelta))
  })

  it('bewegt sich in der Kaltstartphase in groesseren Schritten als spaeter (Kapitel 9)', () => {
    const cold = applyDirectEvidence({
      image: imageWith({ mastery: 0.4, directEvidenceWeight: 0 }),
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    const seasoned = applyDirectEvidence({
      image: imageWith({ mastery: 0.4, directEvidenceWeight: 30 }),
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(cold.masteryDelta).toBeGreaterThan(seasoned.masteryDelta)
  })

  it('beendet die Kaltstartphase, sobald genug Evidenz vorliegt', () => {
    const { next } = applyDirectEvidence({
      image: imageWith({ directEvidenceWeight: COLD_START_EVIDENCE_WEIGHT }),
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(next.coldStart).toBe(false)
  })

  it('loest einen propagierten Zweifel auf — dafuer war er da', () => {
    const doubted = imageWith({
      propagationConfidencePenalty: 0.3,
      reviewNeeded: true,
      reviewReason: 'Verdacht aus Nachbarknoten',
    })
    const { next } = applyDirectEvidence({
      image: doubted,
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(next.propagationConfidencePenalty).toBe(0)
    expect(next.reviewNeeded).toBe(false)
  })

  it('setzt eine Faelligkeit in der Zukunft', () => {
    const { next } = applyDirectEvidence({
      image: imageWith(),
      verdict: verdict(1),
      depth: 'apply',
      difficulty: 3,
      evidenceWeight: 1,
      nowIso: NOW,
    })
    expect(new Date(next.nextReviewAt as string).getTime()).toBeGreaterThan(new Date(NOW).getTime())
  })
})

describe('Anwendungstiefe', () => {
  it('gilt erst ab genug Versuchen als belegt', () => {
    expect(resolveDepth({ apply: { attempts: 1, correct: 1 } })).toBe('recognize')
    expect(resolveDepth({ apply: { attempts: 2, correct: 2 } })).toBe('apply')
  })

  it('gilt nicht bei zu niedriger Trefferquote', () => {
    expect(resolveDepth({ transfer: { attempts: 4, correct: 1 } })).toBe('recognize')
  })

  it('nimmt die hoechste belegte Stufe', () => {
    expect(
      resolveDepth({
        recognize: { attempts: 5, correct: 5 },
        apply: { attempts: 4, correct: 3 },
        transfer: { attempts: 3, correct: 3 },
      }),
    ).toBe('transfer')
  })
})

describe('Verfall', () => {
  it('senkt die Beherrschung ueber die Zeit', () => {
    const image = imageWith({ mastery: 0.9, lastSeenAt: NOW, decayRate: 0.1 })
    const later = '2026-09-18T10:00:00.000Z'
    expect(effectiveMastery(image, later)).toBeLessThan(0.9)
  })

  it('senkt auch die Sicherheit — eine Einschaetzung altert', () => {
    const image = imageWith({ confidence: 0.8, lastDirectEvidenceAt: NOW })
    const later = '2026-09-18T10:00:00.000Z'
    expect(effectiveConfidence(image, later)).toBeLessThan(0.8)
  })

  it('zieht den Propagationsabschlag von der Sicherheit ab (I3)', () => {
    const image = imageWith({ confidence: 0.8, propagationConfidencePenalty: 0.3, lastDirectEvidenceAt: NOW })
    expect(effectiveConfidence(image, NOW)).toBeCloseTo(0.5, 5)
    // Die gespeicherte Beherrschung bleibt davon unberuehrt.
    expect(effectiveMastery(image, NOW)).toBe(image.mastery)
  })
})

describe('Wiederholungsintervall', () => {
  it('waechst mit der Beherrschung', () => {
    expect(nextReviewIntervalDays(0.9, 1)).toBeGreaterThan(nextReviewIntervalDays(0.2, 1))
  })

  it('ist bei unbelegter Einschaetzung kuerzer', () => {
    expect(nextReviewIntervalDays(0.9, 0)).toBeLessThan(nextReviewIntervalDays(0.9, 1))
  })
})
