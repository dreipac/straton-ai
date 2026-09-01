/**
 * Die Konsolidierer-Bruecke — Tests.
 *
 * Der Schwerpunkt liegt auf dem, was die Modellantwort NICHT durchlassen darf: erfundene
 * Konzept-IDs und Verschmelzungen ohne Frage. Beides waere fuer den Nutzer sichtbar kaputt —
 * eine Frage, deren Ja ins Leere laeuft, bzw. eine Bestaetigung ohne Frage (I6).
 */

import { describe, expect, it } from 'vitest'
import { readInsights } from './consolidator'

const KONZEPTE = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]

describe('readInsights — Verschmelzungen', () => {
  it('uebernimmt einen vollstaendigen Vorschlag mit Frage', () => {
    const insights = readInsights(
      {
        patterns: [],
        proposals: [
          {
            operation: 'merge_concepts',
            payload: { keepConceptId: 'c1', mergeConceptId: 'c2' },
            question: 'Meinen „Steuerprogression" und „Progressive Besteuerung" dasselbe?',
            rationale: 'Beide beschreiben denselben Mechanismus.',
            evidence: {},
          },
        ],
      },
      KONZEPTE,
    )

    expect(insights.merges).toEqual([
      {
        keepConceptId: 'c1',
        mergeConceptId: 'c2',
        question: 'Meinen „Steuerprogression" und „Progressive Besteuerung" dasselbe?',
        rationale: 'Beide beschreiben denselben Mechanismus.',
      },
    ])
  })

  it('verwirft eine erfundene Konzept-ID', () => {
    const insights = readInsights(
      {
        proposals: [
          {
            operation: 'merge_concepts',
            payload: { keepConceptId: 'c1', mergeConceptId: 'gibt-es-nicht' },
            question: 'Dasselbe?',
            rationale: '',
            evidence: {},
          },
        ],
      },
      KONZEPTE,
    )
    expect(insights.merges).toHaveLength(0)
  })

  it('verwirft ein Konzept, das mit sich selbst verschmolzen werden soll', () => {
    const insights = readInsights(
      {
        proposals: [
          {
            operation: 'merge_concepts',
            payload: { keepConceptId: 'c1', mergeConceptId: 'c1' },
            question: 'Dasselbe?',
            rationale: '',
            evidence: {},
          },
        ],
      },
      KONZEPTE,
    )
    expect(insights.merges).toHaveLength(0)
  })

  it('verwirft eine Verschmelzung ohne Frage (I6)', () => {
    const insights = readInsights(
      {
        proposals: [
          {
            operation: 'merge_concepts',
            payload: { keepConceptId: 'c1', mergeConceptId: 'c2' },
            question: '   ',
            rationale: '',
            evidence: {},
          },
        ],
      },
      KONZEPTE,
    )
    expect(insights.merges).toHaveLength(0)
  })

  it('ignoriert Aufspaltungsvorschlaege — dafuer gibt es keinen Ausfuehrungsweg', () => {
    const insights = readInsights(
      { proposals: [{ operation: 'split_concept', payload: { conceptId: 'c1' }, question: '', rationale: '', evidence: {} }] },
      KONZEPTE,
    )
    expect(insights.merges).toHaveLength(0)
  })

  it('kommt mit Unsinn zurecht, statt zu werfen', () => {
    expect(readInsights(null, KONZEPTE).merges).toHaveLength(0)
    expect(readInsights('kein JSON', KONZEPTE).patternNameByObservation.size).toBe(0)
  })
})

describe('readInsights — Musternamen', () => {
  it('bildet jede genannte Beobachtung auf den Musternamen ab', () => {
    const insights = readInsights(
      {
        patterns: [
          { name: 'Verwechselt Netz- und Broadcast-Adresse', kind: 'confused', object: 'Adressen', observationIds: ['o1', 'o2'] },
        ],
      },
      KONZEPTE,
    )

    expect(insights.patternNameByObservation.get('o1')).toBe('Verwechselt Netz- und Broadcast-Adresse')
    expect(insights.patternNameByObservation.get('o2')).toBe('Verwechselt Netz- und Broadcast-Adresse')
  })

  it('bei widerspruechlicher Zuordnung gewinnt die erste Nennung', () => {
    const insights = readInsights(
      {
        patterns: [
          { name: 'Erstes Muster', kind: 'confused', object: 'x', observationIds: ['o1'] },
          { name: 'Zweites Muster', kind: 'omitted', object: 'y', observationIds: ['o1'] },
        ],
      },
      KONZEPTE,
    )
    expect(insights.patternNameByObservation.get('o1')).toBe('Erstes Muster')
  })

  it('verwirft ein Muster mit unbekannter Fehlerart', () => {
    const insights = readInsights(
      { patterns: [{ name: 'Irgendwas', kind: 'erfunden', object: 'x', observationIds: ['o1'] }] },
      KONZEPTE,
    )
    expect(insights.patternNameByObservation.size).toBe(0)
  })
})
