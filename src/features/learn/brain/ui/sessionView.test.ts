/**
 * Anbindung Lernsitzung und Abschlussbilanz — Tests gegen UI-Spezifikation Kapitel 4 und 15.
 *
 * Die beiden Regeln, die hier wirklich auf dem Spiel stehen: die Segmentleiste springt nie
 * zurueck (4.7), und waehrend der Sitzung gibt es keine aktualisierten Werte zu holen (4.8).
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, EvidenceEvent, LearnerConceptImage, PlannedTask } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  buildSessionSummary,
  buildSessionView,
  continueLabel,
  sessionProgress,
  COLD_START_NOTICE,
  DONT_KNOW_ACKNOWLEDGEMENT,
} from './sessionView'

const NOW = '2026-08-19T10:00:00.000Z'

function concept(id: string, name = `Konzept ${id}`): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
  }
}

function planned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    conceptId: 'a',
    claim: 'goal',
    urgency: 0.5,
    reason: 'Naechster Schritt im Pfad.',
    urgencyBreakdown: {},
    depth: 'recognize',
    format: 'multipleChoice',
    fromReviewReserve: false,
    ...overrides,
  }
}

function event(conceptId: string, credit: number): EvidenceEvent {
  return {
    userId: 'u1',
    pathId: 'p1',
    conceptId,
    source: 'gradedTask',
    verdict: { credit, partialCredit: {}, cause: null, confidence: 0.9 },
    depth: 'recognize',
    format: 'multipleChoice',
    difficulty: 3,
    evidenceWeight: 1,
    escalated: false,
    masteryDelta: 0.1,
    confidenceDelta: 0.1,
    occurredAt: NOW,
  }
}

describe('Sitzungsrahmen (Kapitel 4.2)', () => {
  const concepts = [concept('a', 'Subnetzmaske'), concept('b', 'VLSM')]

  it('erkennt Anker, Wiederholung und Folgekonzept auseinander', () => {
    const view = buildSessionView({
      tasks: [
        planned({ conceptId: 'a' }),
        planned({ conceptId: 'b', fromReviewReserve: true, claim: 'review' }),
        planned({ conceptId: 'a' }),
      ],
      concepts,
      images: new Map(),
      inColdStart: false,
    })
    expect(view.anchorConceptId).toBe('a')
    expect(view.slots.map((s) => s.origin)).toEqual(['anchor', 'review', 'anchor'])
  })

  it('kennzeichnet eingemischte Wiederholungen samt Untertitel', () => {
    /*
     * „Ohne diese Markierung wirkt es wie ein Themensprung." Der Untertitel ist deshalb Pflicht
     * und nicht Beiwerk: er sagt, dass die Aufgabe NICHT zum Einschub gehoert.
     */
    const view = buildSessionView({
      tasks: [planned({ conceptId: 'a' }), planned({ conceptId: 'b', fromReviewReserve: true, claim: 'review' })],
      concepts,
      images: new Map(),
      inColdStart: false,
    })
    const eingemischt = view.slots[1]
    expect(eingemischt.badge).toBe('Wiederholung · VLSM')
    expect(eingemischt.badgeSubtitle).toContain('faelligen Stapel')
  })

  it('uebernimmt den Faelligkeitsgrund, wenn einer vorliegt', () => {
    const view = buildSessionView({
      tasks: [planned({ conceptId: 'b', fromReviewReserve: true, claim: 'review' })],
      concepts,
      images: new Map(),
      dueReasons: new Map([['b', '19 Tage nicht angefasst']]),
      inColdStart: false,
    })
    expect(view.slots[0].badgeSubtitle).toBe('19 Tage nicht angefasst')
  })

  it('gibt einen Einstiegstext nur bei unberuehrten Konzepten (Kapitel 4.4a)', () => {
    const images = new Map([['b', { ...emptyImage('b', 3), directEvidenceCount: 2, confidence: 0.3 }]])
    const view = buildSessionView({
      tasks: [planned({ conceptId: 'a' }), planned({ conceptId: 'b' })],
      concepts,
      images,
      inColdStart: false,
    })
    expect(view.slots[0].hasIntro).toBe(true)
    expect(view.slots[1].hasIntro).toBe(false)
  })

  it('sagt den Kaltstart vorab an, spaeter nicht mehr', () => {
    const mit = buildSessionView({ tasks: [planned()], concepts, images: new Map(), inColdStart: true })
    const ohne = buildSessionView({ tasks: [planned()], concepts, images: new Map(), inColdStart: false })
    expect(mit.coldStartNotice).toBe(COLD_START_NOTICE)
    expect(ohne.coldStartNotice).toBe('')
    // Die erhoehte Lernrate ist ein Architekturdetail und wird nicht erwaehnt (Kapitel 10).
    expect(COLD_START_NOTICE).not.toMatch(/Lernrate|Modell|Gewicht/i)
  })
})

describe('Ablauf in der Sitzung (Kapitel 4.6 und 4.7)', () => {
  it('laesst die Segmentleiste nie zurueckspringen', () => {
    let last = -1
    for (const answered of [0, 1, 2, 3, 4, 5]) {
      const progress = sessionProgress(answered, 5)
      expect(progress.index).toBeGreaterThanOrEqual(last)
      last = progress.index
    }
  })

  it('benennt den letzten Schritt anders', () => {
    expect(continueLabel(0, 5)).toBe('Weiter')
    expect(continueLabel(4, 5)).toBe('Sitzung abschliessen')
  })

  it('verbucht „weiss ich nicht" als offen, nicht als Fehler', () => {
    expect(DONT_KNOW_ACKNOWLEDGEMENT).toContain('nicht als Fehler')
  })
})

describe('Abschlussbilanz (Kapitel 4.9)', () => {
  const concepts = [concept('a', 'Binaerumrechnung'), concept('b', 'Subnetzmaske berechnen')]

  function imageAt(id: string, mastery: number, confidence: number): LearnerConceptImage {
    return {
      ...emptyImage(id, 3),
      mastery,
      confidence,
      directEvidenceCount: 3,
      directEvidenceWeight: 3,
      lastSeenAt: NOW,
      lastDirectEvidenceAt: NOW,
    }
  }

  it('zeigt, was sich veraendert hat — nicht, dass es gut war', () => {
    const summary = buildSessionSummary({
      before: new Map([['a', imageAt('a', 0.34, 0.4)]]),
      after: new Map([['a', imageAt('a', 0.58, 0.5)]]),
      concepts,
      events: [event('a', 1)],
      nextStep: 'Weiter geht es regulaer mit Subnetzmaske berechnen.',
      minutes: 8,
      nowIso: NOW,
    })

    expect(summary.headline).toBe('Das hat sich veraendert')
    expect(summary.stats).toBe('1 von 1 richtig · rund 8 Minuten')
    expect(summary.changes[0]).toMatchObject({ kind: 'mastery', label: '34 % → 58 %' })
  })

  it('macht die Propagation sichtbar — auch ohne Arbeit am Knoten', () => {
    /*
     * Kapitel 4.9 verlangt ausdruecklich „gestiegene oder gefallene Sicherheit, auch bei Knoten,
     * an denen nicht direkt gearbeitet wurde — das ist die Propagation, sichtbar gemacht".
     * Ohne diese Zeile wirken fallende Werte an unberuehrten Knoten wie ein Fehler.
     */
    const summary = buildSessionSummary({
      before: new Map([['b', imageAt('b', 0.7, 0.8)]]),
      after: new Map([['b', { ...imageAt('b', 0.7, 0.8), propagationConfidencePenalty: 0.3 }]]),
      concepts,
      events: [],
      nextStep: '',
      minutes: 5,
      nowIso: NOW,
    })

    expect(summary.changes).toHaveLength(1)
    expect(summary.changes[0]).toMatchObject({ kind: 'confidence', direction: 'down' })
  })

  it('nennt neue Knoten und erledigte Einschuebe', () => {
    const summary = buildSessionSummary({
      before: new Map(),
      after: new Map(),
      concepts,
      events: [],
      newConceptIds: ['b'],
      resolvedInsertConceptIds: ['a'],
      nextStep: '',
      minutes: 4,
      nowIso: NOW,
    })
    expect(summary.changes[0]).toMatchObject({ kind: 'newNode', conceptName: 'Subnetzmaske berechnen' })
    expect(summary.resolvedInserts).toEqual(['Binaerumrechnung'])
  })

  it('stellt bewegte Beherrschung vor die Nebenwirkungen', () => {
    const summary = buildSessionSummary({
      before: new Map([
        ['a', imageAt('a', 0.3, 0.5)],
        ['b', imageAt('b', 0.7, 0.8)],
      ]),
      after: new Map([
        ['a', imageAt('a', 0.6, 0.5)],
        ['b', { ...imageAt('b', 0.7, 0.8), propagationConfidencePenalty: 0.3 }],
      ]),
      concepts,
      events: [event('a', 1)],
      nextStep: '',
      minutes: 6,
      nowIso: NOW,
    })
    expect(summary.changes.map((c) => c.kind)).toEqual(['mastery', 'confidence'])
  })

  it('schweigt ueber Werte, die sich kaum bewegt haben', () => {
    const summary = buildSessionSummary({
      before: new Map([['a', imageAt('a', 0.5, 0.5)]]),
      after: new Map([['a', imageAt('a', 0.505, 0.51)]]),
      concepts,
      events: [],
      nextStep: '',
      minutes: 3,
      nowIso: NOW,
    })
    expect(summary.changes).toHaveLength(0)
  })

  it('zaehlt nur bewertete Aufgaben, keine Chatsignale', () => {
    const chat: EvidenceEvent = { ...event('a', 0), source: 'chat', masteryDelta: 0 }
    const summary = buildSessionSummary({
      before: new Map(),
      after: new Map(),
      concepts,
      events: [event('a', 1), event('a', 0), chat],
      nextStep: '',
      minutes: 5,
      nowIso: NOW,
    })
    expect(summary.taskCount).toBe(2)
    expect(summary.correctCount).toBe(1)
  })
})
