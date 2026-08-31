/**
 * Die zwoelf Invarianten (Kapitel 1) — Tests.
 *
 * Diese Datei prueft nicht das Verhalten einzelner Funktionen, sondern die Regeln, die ueber
 * allem stehen. Faellt hier ein Test, ist das kein Randfall: das Lernerbild waere dann nicht
 * mehr vertrauenswuerdig.
 */

import { describe, expect, it } from 'vitest'
import {
  INVARIANTS,
  InvariantViolation,
  assertHasReason,
  assertLogEntryComplete,
  assertMasteryChangeAllowed,
  assertPatternNameStable,
  assertProposalSafe,
  assertPropagationTouchesConfidenceOnly,
  assertReviewReserveHeld,
} from './invariants'

describe('Invariantenregister', () => {
  it('fuehrt alle zwoelf Invarianten', () => {
    expect(INVARIANTS).toHaveLength(12)
    expect(INVARIANTS.map((i) => i.id)).toEqual([
      'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'I11', 'I12',
    ])
  })

  it('gibt fuer jede Invariante an, wo sie durchgesetzt wird', () => {
    for (const invariant of INVARIANTS) {
      expect(invariant.enforcedAt.trim().length, `${invariant.id} ohne Fundstelle`).toBeGreaterThan(0)
      expect(invariant.why.trim().length, `${invariant.id} ohne Begruendung`).toBeGreaterThan(0)
    }
  })
})

describe('I1/I2 — nur direkte Evidenz bewegt die Beherrschung', () => {
  it('laesst eine bewertete Aufgabe in beide Richtungen wirken', () => {
    expect(() => assertMasteryChangeAllowed('gradedTask', 0.2)).not.toThrow()
    expect(() => assertMasteryChangeAllowed('gradedTask', -0.2)).not.toThrow()
  })

  it('verbietet Chat jedes Anheben der Beherrschung', () => {
    expect(() => assertMasteryChangeAllowed('chat', 0.01)).toThrow(InvariantViolation)
    try {
      assertMasteryChangeAllowed('chat', 0.01)
    } catch (error) {
      expect((error as InvariantViolation).invariant).toBe('I2')
    }
  })

  it('verbietet Chat auch das Senken der Beherrschung — Chat wirkt nur auf die Sicherheit', () => {
    try {
      assertMasteryChangeAllowed('chat', -0.01)
      throw new Error('haette werfen muessen')
    } catch (error) {
      expect((error as InvariantViolation).invariant).toBe('I1')
    }
  })

  it('laesst Chat mit Delta null durch', () => {
    expect(() => assertMasteryChangeAllowed('chat', 0)).not.toThrow()
  })
})

describe('I3 — Propagation beruehrt nur die Sicherheit', () => {
  it('akzeptiert einen reinen Sicherheitsabschlag', () => {
    expect(() => assertPropagationTouchesConfidenceOnly({ conceptId: 'a', penalty: 0.2 })).not.toThrow()
  })

  it('lehnt ein untergeschobenes Beherrschungsfeld ab', () => {
    expect(() => assertPropagationTouchesConfidenceOnly({ conceptId: 'a', mastery: 0.5 })).toThrow(
      InvariantViolation,
    )
    expect(() => assertPropagationTouchesConfidenceOnly({ conceptId: 'a', masteryDelta: -0.1 })).toThrow(
      InvariantViolation,
    )
  })
})

describe('I6 — zerstoererische Aenderungen brauchen Bestaetigung und Protokoll', () => {
  const base = { operation: 'mergeConcepts' as const, requiresConfirmation: true, status: 'pending' as const, question: 'Meinen A und B dasselbe?' }

  it('laesst einen bestaetigungspflichtigen Verschmelzungsvorschlag durch', () => {
    expect(() => assertProposalSafe(base)).not.toThrow()
  })

  it('lehnt eine Verschmelzung ohne Bestaetigungspflicht ab', () => {
    expect(() => assertProposalSafe({ ...base, requiresConfirmation: false })).toThrow(InvariantViolation)
  })

  it('lehnt eine automatisch angewandte Verschmelzung ab', () => {
    expect(() => assertProposalSafe({ ...base, status: 'autoApplied' })).toThrow(InvariantViolation)
  })

  it('lehnt eine Bestaetigung ohne Frage ab', () => {
    expect(() => assertProposalSafe({ ...base, question: '   ' })).toThrow(InvariantViolation)
  })

  it('laesst umkehrbare Operationen ohne Bestaetigung zu', () => {
    expect(() =>
      assertProposalSafe({ operation: 'addEdge', requiresConfirmation: false, status: 'pending', question: '' }),
    ).not.toThrow()
  })

  it('lehnt ein Protokoll ohne Ruecknahmeanleitung ab', () => {
    expect(() => assertLogEntryComplete({ operation: 'mergeConcepts', undoPayload: {} })).toThrow(
      InvariantViolation,
    )
    expect(() =>
      assertLogEntryComplete({ operation: 'mergeConcepts', undoPayload: { kind: 'restoreMerge' } }),
    ).not.toThrow()
  })
})

describe('I8 — jede Aufgabe traegt eine Begruendung', () => {
  it('lehnt eine leere Begruendung ab', () => {
    expect(() => assertHasReason('  ', 'Testauswahl')).toThrow(InvariantViolation)
  })

  it('akzeptiert einen Satz', () => {
    expect(() => assertHasReason('Das faengt an zu verblassen.', 'Testauswahl')).not.toThrow()
  })
})

describe('I9 — Wiederholungs-Mindestreserve', () => {
  it('schlaegt an, wenn der reservierte Boden unterschritten wurde', () => {
    expect(() => assertReviewReserveHeld({ reviewSlotsUsed: 1, reserveTarget: 2, sessionSize: 10 })).toThrow(
      InvariantViolation,
    )
  })

  it('schweigt, wenn der Boden genau gehalten wurde', () => {
    expect(() => assertReviewReserveHeld({ reviewSlotsUsed: 2, reserveTarget: 2, sessionSize: 10 })).not.toThrow()
  })

  it('schweigt, wenn mehr Wiederholung kam als reserviert', () => {
    expect(() => assertReviewReserveHeld({ reviewSlotsUsed: 5, reserveTarget: 2, sessionSize: 10 })).not.toThrow()
  })

  it('schweigt, wenn in dieser Sitzung kein Boden gilt', () => {
    expect(() => assertReviewReserveHeld({ reviewSlotsUsed: 0, reserveTarget: 0, sessionSize: 1 })).not.toThrow()
  })
})

describe('I12 — Musternamen bleiben stabil', () => {
  it('lehnt eine Umbenennung ab', () => {
    expect(() => assertPatternNameStable('Verwechselt Netz- und Broadcast-Adresse', 'Verwechselt Adressen')).toThrow(
      InvariantViolation,
    )
  })

  it('erlaubt die Erstvergabe', () => {
    expect(() => assertPatternNameStable('', 'Uebersieht Angaben')).not.toThrow()
  })

  it('erlaubt den unveraenderten Namen', () => {
    expect(() => assertPatternNameStable('Uebersieht Angaben', 'Uebersieht Angaben')).not.toThrow()
  })
})
