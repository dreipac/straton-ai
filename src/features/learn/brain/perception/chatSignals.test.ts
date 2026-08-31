/**
 * Chatsignale (Kapitel 5.1) — Tests.
 *
 * Invariante I2 ist hier das Ganze: Chatverhalten erhoeht die Beherrschung nie. Der Test dazu
 * prueft nicht nur das Delta im Ereignis, sondern auch den Zustand selbst — ein Delta von null
 * bei stillschweigend veraenderter Beherrschung waere die gefaehrlichere Variante des Fehlers.
 */

import { describe, expect, it } from 'vitest'
import type { ChatSignal, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  chatConfidencePenalty,
  describeChatSignal,
  perceiveChatSignal,
  CHAT_CONFIDENCE_PENALTY_CAP,
  CHAT_SIGNALS_DISCLOSURE,
} from './chatSignals'

const NOW = '2026-08-18T10:00:00.000Z'

function signal(overrides: Partial<ChatSignal> = {}): ChatSignal {
  return {
    kind: 'repeatedQuestion',
    conceptId: 'vlsm',
    occurrences: 3,
    spanDays: 14,
    observedAt: NOW,
    ...overrides,
  }
}

function image(overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return { ...emptyImage('vlsm', 3), mastery: 0.75, confidence: 0.6, directEvidenceCount: 4, ...overrides }
}

describe('Abschlag je Signalart', () => {
  it('wiegt eine wiederholte Frage schwerer als eine Warum-Frage', () => {
    const repeated = chatConfidencePenalty(signal({ kind: 'repeatedQuestion' }))
    const reason = chatConfidencePenalty(signal({ kind: 'asksForReason' }))
    expect(repeated).toBeGreaterThan(reason)
  })

  it('wiegt Loesungsfragen schwerer als Warum-Fragen', () => {
    const solution = chatConfidencePenalty(signal({ kind: 'asksForSolution' }))
    const reason = chatConfidencePenalty(signal({ kind: 'asksForReason' }))
    expect(solution).toBeGreaterThan(reason)
  })

  it('wiegt Wiederholung ueber Wochen schwerer als in einer Sitzung', () => {
    const overWeeks = chatConfidencePenalty(signal({ spanDays: 21 }))
    const sameDay = chatConfidencePenalty(signal({ spanDays: 0 }))
    expect(overWeeks).toBeGreaterThan(sameDay)
  })

  it('deckelt den Abschlag', () => {
    expect(chatConfidencePenalty(signal({ occurrences: 500, spanDays: 90 }))).toBeLessThanOrEqual(
      CHAT_CONFIDENCE_PENALTY_CAP,
    )
  })
})

describe('Invariante I2 — Chat hebt die Beherrschung nie', () => {
  it('laesst die Beherrschung woertlich unveraendert', () => {
    const before = image({ mastery: 0.75 })
    const result = perceiveChatSignal({
      userId: 'u1',
      pathId: 'p1',
      image: before,
      signal: signal(),
      chatSignalsEnabled: true,
      nowIso: NOW,
    })
    expect(result?.updated.mastery).toBe(0.75)
    expect(result?.event.masteryDelta).toBe(0)
  })

  it('senkt ausschliesslich die Sicherheit', () => {
    const result = perceiveChatSignal({
      userId: 'u1',
      pathId: 'p1',
      image: image(),
      signal: signal(),
      chatSignalsEnabled: true,
      nowIso: NOW,
    })
    expect(result?.event.confidenceDelta).toBeLessThan(0)
    expect(result?.updated.propagationConfidencePenalty).toBeGreaterThan(0)
  })

  it('markiert bei starkem Signal als ueberpruefungsbeduerftig', () => {
    const result = perceiveChatSignal({
      userId: 'u1',
      pathId: 'p1',
      image: image(),
      signal: signal({ kind: 'repeatedQuestion', occurrences: 4, spanDays: 21 }),
      chatSignalsEnabled: true,
      nowIso: NOW,
    })
    expect(result?.updated.reviewNeeded).toBe(true)
    expect(result?.updated.reviewReason.length).toBeGreaterThan(0)
  })
})

describe('Abschaltbarkeit (Pflicht zur Sichtbarkeit)', () => {
  it('verarbeitet nichts, wenn der Nutzer Chatsignale abgeschaltet hat', () => {
    const result = perceiveChatSignal({
      userId: 'u1',
      pathId: 'p1',
      image: image(),
      signal: signal(),
      chatSignalsEnabled: false,
      nowIso: NOW,
    })
    expect(result).toBeNull()
  })

  it('haelt einen Hinweistext bereit, der beides nennt: Wirkung und Abschaltbarkeit', () => {
    expect(CHAT_SIGNALS_DISCLOSURE).toMatch(/abschalten/i)
    expect(CHAT_SIGNALS_DISCLOSURE).toMatch(/nie erhoehen|nie erhöhen/i)
  })
})

describe('Beschreibung', () => {
  it('formuliert jede Signalart in einem Satz', () => {
    const kinds: ChatSignal['kind'][] = [
      'repeatedQuestion',
      'abandonedExplanation',
      'asksForSolution',
      'asksForReason',
    ]
    for (const kind of kinds) {
      const text = describeChatSignal(signal({ kind }))
      expect(text.length).toBeGreaterThan(10)
      expect(text).not.toMatch(/Propagation|Konfidenz|Knoten/)
    }
  })
})
