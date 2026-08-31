/**
 * Die unterbrochene Sitzung — Tests fuer den Leseweg.
 *
 * Geprueft wird ausschliesslich `parseStoredSession`, weil dort die einzige Entscheidung faellt:
 * ist dieser Datensatz fortsetzbar oder nicht. `null` bedeutet immer „frisch anfangen" — also das
 * Verhalten von vor dieser Erweiterung, und damit der sichere Rueckfall. Eine halb
 * wiederhergestellte Sitzung waere der einzige gefaehrliche Ausgang; genau den schliessen diese
 * Faelle aus.
 */

import { describe, expect, it } from 'vitest'
import { parseStoredSession, RESUMABLE_FOR_DAYS } from './brainSession.persistence'

const NOW = '2026-08-30T12:00:00.000Z'

function plannedRow(overrides: Record<string, unknown> = {}) {
  return {
    conceptId: 'c1',
    claim: 'gap',
    urgency: 0.8,
    reason: 'Das faengt an zu verblassen.',
    urgencyBreakdown: {},
    depth: 'recognize',
    format: 'multipleChoice',
    fromReviewReserve: false,
    ...overrides,
  }
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    conceptId: 'c1',
    format: 'multipleChoice',
    depth: 'recognize',
    difficulty: 3,
    prompt: 'Was sind Besitzsteuern?',
    expectedAnswer: 'Steuern auf das Halten von Vermoegenswerten.',
    sourceGrounding: 'Dossier S. 4',
    reason: 'Das faengt an zu verblassen.',
    ...overrides,
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    plan: [plannedRow(), plannedRow({ conceptId: 'c2' })],
    tasks: { '0': taskRow(), '1': taskRow({ conceptId: 'c2' }) },
    current_index: 1,
    images_before: [{ conceptId: 'c1', mastery: 0.4 }],
    events: [{ conceptId: 'c1', occurredAt: NOW }],
    started_at: '2026-08-30T11:30:00.000Z',
    ...overrides,
  } as Parameters<typeof parseStoredSession>[0]
}

describe('parseStoredSession — fortsetzen statt neu erzeugen', () => {
  it('stellt Plan, Aufgaben und Position wieder her', () => {
    const stored = parseStoredSession(row(), NOW)
    expect(stored).not.toBeNull()
    expect(stored?.plan).toHaveLength(2)
    expect(stored?.currentIndex).toBe(1)
    // Der Punkt der ganzen Uebung: die Aufgabe ist da und muss nicht erneut erzeugt werden.
    expect(stored?.tasks.get(1)?.prompt).toBe('Was sind Besitzsteuern?')
    expect(stored?.imagesBefore.get('c1')).toBeTruthy()
    expect(stored?.events).toHaveLength(1)
    // Die Startzeit bleibt die der urspruenglichen Sitzung — die Bilanz nennt die Dauer.
    expect(stored?.startedAt).toBe('2026-08-30T11:30:00.000Z')
  })

  it('setzt fort, auch wenn zur aktuellen Position noch keine Aufgabe vorlag', () => {
    // Beim Verlassen lief die Erzeugung noch. Dann ist genau dieser Platz neu zu erzeugen —
    // aber der Plan und alles davor bleiben erhalten.
    const stored = parseStoredSession(row({ tasks: { '0': taskRow() } }), NOW)
    expect(stored?.plan).toHaveLength(2)
    expect(stored?.tasks.has(1)).toBe(false)
  })

  it('verwirft eine Sitzung, deren Plan nicht vollstaendig lesbar ist', () => {
    /*
     * Nicht die kaputten Eintraege ueberspringen: ein gekuerzter Plan ist ein ANDERER Plan als der
     * festgeschriebene. Die Segmentleiste zeigte dann eine falsche Gesamtzahl, und „3 von 5" waere
     * gelogen (Kapitel 4.2).
     */
    expect(parseStoredSession(row({ plan: [plannedRow(), { conceptId: 'c2' }] }), NOW)).toBeNull()
    expect(parseStoredSession(row({ plan: [] }), NOW)).toBeNull()
    expect(parseStoredSession(row({ plan: 'kaputt' }), NOW)).toBeNull()
  })

  it('verwirft eine Position ausserhalb des Plans', () => {
    expect(parseStoredSession(row({ current_index: 2 }), NOW)).toBeNull()
    expect(parseStoredSession(row({ current_index: -1 }), NOW)).toBeNull()
  })

  it('verwirft eine Sitzung, die zu lange offen stand', () => {
    const tooOld = new Date(Date.parse(NOW) - (RESUMABLE_FOR_DAYS + 1) * 86_400_000).toISOString()
    expect(parseStoredSession(row({ started_at: tooOld }), NOW)).toBeNull()

    // Knapp innerhalb der Frist bleibt sie fortsetzbar.
    const justInside = new Date(Date.parse(NOW) - (RESUMABLE_FOR_DAYS - 1) * 86_400_000).toISOString()
    expect(parseStoredSession(row({ started_at: justInside }), NOW)).not.toBeNull()
  })

  it('verwirft eine Sitzung ohne brauchbare Startzeit', () => {
    expect(parseStoredSession(row({ started_at: 'irgendwann' }), NOW)).toBeNull()
  })

  it('uebergeht eine unbrauchbare Aufgabe, statt die ganze Sitzung zu verwerfen', () => {
    /*
     * Anders als beim Plan: eine fehlende Aufgabe ist heilbar — sie wird schlicht neu erzeugt.
     * Eine Aufgabe ohne Fragetext oder Musterloesung darf dagegen nie angezeigt werden.
     */
    const stored = parseStoredSession(row({ tasks: { '0': taskRow(), '1': { conceptId: 'c2' } } }), NOW)
    expect(stored?.tasks.has(0)).toBe(true)
    expect(stored?.tasks.has(1)).toBe(false)
  })

  it('uebergeht Aufgaben zu Plaetzen, die es im Plan gar nicht gibt', () => {
    const stored = parseStoredSession(row({ tasks: { '0': taskRow(), '7': taskRow() } }), NOW)
    expect(stored?.tasks.has(7)).toBe(false)
  })
})
