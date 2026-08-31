/**
 * Wahrnehmung (Kapitel 5) — Tests.
 *
 * Der wichtigste Test dieser Datei ist der auf die Zuversicht: dass eine unsichere Bewertung
 * das Lernerbild kaum bewegt und stattdessen eine Eskalation oder Nachfrage ausloest. Das ist
 * die Stelle, an der die Mehrmodellarchitektur funktional statt dekorativ wird.
 */

import { describe, expect, it } from 'vitest'
import type { BrainPrerequisiteEdge, ExaminerVerdict, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  dueConceptIds,
  evidenceWeightFor,
  nextDepthFor,
  perceiveGradedAnswer,
  unverifiedConceptIds,
  EVIDENCE_BASE_WEIGHT,
} from './evidence'
import { calibrateConfidence, partialCreditIsConsistent, reactionFor } from './examiner'

const NOW = '2026-08-18T10:00:00.000Z'

function verdict(overrides: Partial<ExaminerVerdict> = {}): ExaminerVerdict {
  return { credit: 1, partialCredit: {}, cause: null, confidence: 0.9, ...overrides }
}

function edge(from: string, to: string): BrainPrerequisiteEdge {
  return { id: `${from}->${to}`, pathId: 'p1', fromConceptId: from, toConceptId: to, origin: 'cartographer' }
}

function baseInput(overrides: Partial<Parameters<typeof perceiveGradedAnswer>[0]> = {}) {
  const image = emptyImage('vlsm', 3)
  const images = new Map<string, LearnerConceptImage>([
    ['vlsm', image],
    ['subnetzmaske', { ...emptyImage('subnetzmaske', 3), mastery: 0.8, confidence: 0.6, directEvidenceCount: 3 }],
  ])
  return {
    userId: 'u1',
    pathId: 'p1',
    conceptId: 'vlsm',
    image,
    images,
    edges: [edge('subnetzmaske', 'vlsm')],
    verdict: verdict(),
    depth: 'apply' as const,
    format: 'calculation',
    difficulty: 3,
    escalationAvailable: true,
    nowIso: NOW,
    ...overrides,
  }
}

describe('Evidenzgewicht', () => {
  it('gewichtet eine bewertete Aufgabe weit hoeher als ein Chatsignal', () => {
    expect(EVIDENCE_BASE_WEIGHT.gradedTask / EVIDENCE_BASE_WEIGHT.chat).toBeGreaterThanOrEqual(20)
  })

  it('gewichtet tiefere Anwendungstiefe hoeher', () => {
    const recognize = evidenceWeightFor({ source: 'gradedTask', depth: 'recognize', examinerConfidence: 1 })
    const transfer = evidenceWeightFor({ source: 'gradedTask', depth: 'transfer', examinerConfidence: 1 })
    expect(transfer).toBeGreaterThan(recognize)
  })

  it('senkt das Gewicht mit der Zuversicht des Pruefers', () => {
    const sure = evidenceWeightFor({ source: 'gradedTask', depth: 'apply', examinerConfidence: 1 })
    const unsure = evidenceWeightFor({ source: 'gradedTask', depth: 'apply', examinerConfidence: 0.4 })
    expect(unsure).toBeLessThan(sure)
  })
})

describe('Reaktion auf die Zuversicht (Kapitel 5.3)', () => {
  it('laesst eine sichere Bewertung voll durch', () => {
    const reaction = reactionFor(verdict({ confidence: 0.95 }), { escalationAvailable: true })
    expect(reaction).toEqual({ escalate: false, reask: false, weightFactor: 1 })
  })

  it('eskaliert bei sehr niedriger Zuversicht und laesst das Lernerbild unberuehrt', () => {
    const reaction = reactionFor(verdict({ confidence: 0.2 }), { escalationAvailable: true })
    expect(reaction.escalate).toBe(true)
    expect(reaction.weightFactor).toBe(0)
  })

  it('fragt erneut, wenn kein staerkeres Modell bereitsteht', () => {
    const reaction = reactionFor(verdict({ confidence: 0.2 }), { escalationAvailable: false })
    expect(reaction.escalate).toBe(false)
    expect(reaction.reask).toBe(true)
    expect(reaction.weightFactor).toBeLessThan(1)
  })

  it('daempft im Zwischenbereich und fragt erneut', () => {
    const reaction = reactionFor(verdict({ confidence: 0.5 }), { escalationAvailable: true })
    expect(reaction.escalate).toBe(false)
    expect(reaction.reask).toBe(true)
    expect(reaction.weightFactor).toBeCloseTo(0.5, 5)
  })
})

describe('Kalibrierung der Zuversicht', () => {
  it('erkennt schluessige Teilpunkte', () => {
    expect(partialCreditIsConsistent(verdict({ credit: 0.5, partialCredit: { a: 1, b: 0 } }))).toBe(true)
  })

  it('erkennt unschluessige Teilpunkte', () => {
    expect(partialCreditIsConsistent(verdict({ credit: 1, partialCredit: { a: 0, b: 0 } }))).toBe(false)
  })

  it('wertet die Zuversicht bei unschluessiger Bewertung ab', () => {
    const raw = verdict({ credit: 1, partialCredit: { a: 0, b: 0 }, confidence: 0.9 })
    expect(calibrateConfidence(raw).confidence).toBeLessThan(0.9)
  })
})

describe('perceiveGradedAnswer', () => {
  it('hebt die Beherrschung bei richtiger Antwort und schreibt ein Ereignis', () => {
    const result = perceiveGradedAnswer(baseInput())
    expect(result.event.masteryDelta).toBeGreaterThan(0)
    expect(result.event.source).toBe('gradedTask')
    expect(result.updated.directEvidenceCount).toBe(1)
  })

  it('propagiert bei Fehlschlag Zweifel auf die Voraussetzung — und nur auf die Sicherheit', () => {
    const result = perceiveGradedAnswer(baseInput({ verdict: verdict({ credit: 0 }) }))
    const neighbour = result.propagated.find((image) => image.conceptId === 'subnetzmaske')
    expect(neighbour).toBeDefined()
    expect(neighbour?.mastery).toBe(0.8)
    expect(neighbour?.propagationConfidencePenalty).toBeGreaterThan(0)
    expect(neighbour?.reviewNeeded).toBe(true)
  })

  it('propagiert bei richtiger Antwort gar nicht', () => {
    const result = perceiveGradedAnswer(baseInput())
    expect(result.adjustments).toEqual([])
    expect(result.propagated).toEqual([])
  })

  it('laesst das Lernerbild bei Eskalation unberuehrt', () => {
    const result = perceiveGradedAnswer(baseInput({ verdict: verdict({ confidence: 0.2 }) }))
    expect(result.escalate).toBe(true)
    expect(result.event.evidenceWeight).toBe(0)
    expect(result.updated.directEvidenceWeight).toBe(0)
  })

  it('markiert Eskalation im Ereignis, damit sie spaeter nachvollziehbar ist', () => {
    const result = perceiveGradedAnswer(baseInput({ verdict: verdict({ confidence: 0.2 }) }))
    expect(result.event.escalated).toBe(true)
  })

  it('saet bei einem Fehlschlag mit schwacher Zuversicht keinen Zweifel im Graphen', () => {
    const result = perceiveGradedAnswer(
      baseInput({ verdict: verdict({ credit: 0, confidence: 0.3 }), escalationAvailable: false }),
    )
    expect(result.adjustments).toEqual([])
  })
})

describe('Faelligkeit und unbelegte Werte', () => {
  it('meldet ueberfaellige Konzepte', () => {
    const image: LearnerConceptImage = {
      ...emptyImage('a', 3),
      directEvidenceCount: 2,
      mastery: 0.9,
      nextReviewAt: '2026-08-01T00:00:00.000Z',
    }
    expect(dueConceptIds([image], NOW)).toEqual(['a'])
  })

  it('meldet nie geprueftes nicht als faellig', () => {
    expect(dueConceptIds([emptyImage('a', 3)], NOW)).toEqual([])
  })

  it('findet hohe Werte ohne Beleg — genau wofuer die Sicherheit da ist', () => {
    const image: LearnerConceptImage = {
      ...emptyImage('a', 3),
      mastery: 0.85,
      confidence: 0.1,
      directEvidenceCount: 1,
      lastDirectEvidenceAt: NOW,
    }
    expect(unverifiedConceptIds([image], NOW)).toEqual(['a'])
  })
})

describe('naechste Anwendungstiefe', () => {
  it('haelt die Stufe, solange die Beherrschung nicht sitzt', () => {
    const image = { ...emptyImage('a', 3), mastery: 0.5, depth: 'recognize' as const }
    expect(nextDepthFor(image)).toBe('recognize')
  })

  it('steigert erst, wenn die aktuelle Stufe sitzt', () => {
    const image = { ...emptyImage('a', 3), mastery: 0.85, depth: 'recognize' as const }
    expect(nextDepthFor(image)).toBe('apply')
  })

  it('bleibt auf der hoechsten Stufe stehen', () => {
    const image = { ...emptyImage('a', 3), mastery: 0.95, depth: 'transfer' as const }
    expect(nextDepthFor(image)).toBe('transfer')
  })
})
