/**
 * Konsolidierung (Kapitel 8 und 10) — Tests.
 *
 * Drei Schwerpunkte:
 *  - Der Ausloeser misst Evidenzgewicht, nicht Stueckzahl. Vielrederei darf nicht konsolidieren.
 *  - Die Wertregeln beim Umbau (8.3) sind konservativ und asymmetrisch — und das mit Absicht.
 *  - Die Anzeigeschwelle fuer Fehlermuster verlangt Verteilung ueber Konzepte UND ueber Zeit.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, ErrorPattern, LearnerConceptImage } from '../types'
import { InvariantViolation } from '../invariants'
import { emptyImage } from '../memory/learnerImage'
import {
  evaluateTrigger,
  triggerProgress,
  CONSOLIDATION_MAX_WAIT_DAYS,
  CONSOLIDATION_WEIGHT_THRESHOLD,
  type ConsolidationState,
} from './trigger'
import {
  describePattern,
  findNearDuplicates,
  groupKeyOf,
  groupObservations,
  meetsSurfaceThreshold,
  nameFor,
  normaliseObject,
  objectSimilarity,
  scopeOf,
  upsertPattern,
  type ErrorObservation,
} from './patterns'
import {
  buildLogEntry,
  discoverEdges,
  findMergeCandidates,
  findSplitCandidates,
  mergeImages,
  proposeEdge,
  proposeMerge,
  splitImage,
  undoPayloadForMerge,
  SPLIT_RESIDUAL_EVIDENCE_WEIGHT,
} from './restructure'

const NOW = '2026-08-18T10:00:00.000Z'

function state(overrides: Partial<ConsolidationState> = {}): ConsolidationState {
  return { pendingEvidenceWeight: 0, oldestPendingAt: null, lastRunAt: null, runCount: 0, ...overrides }
}

// ---------------------------------------------------------------------------
// Ausloeser
// ---------------------------------------------------------------------------

describe('Ausloeser (Kapitel 8.1)', () => {
  it('laeuft nicht ohne nennenswerte Evidenz', () => {
    expect(evaluateTrigger(state({ pendingEvidenceWeight: 0.3 }), NOW)).toEqual({
      shouldRun: false,
      reason: 'nothingPending',
    })
  })

  it('laeuft, sobald das Evidenzgewicht die Schwelle erreicht', () => {
    const trigger = evaluateTrigger(state({ pendingEvidenceWeight: CONSOLIDATION_WEIGHT_THRESHOLD }), NOW)
    expect(trigger).toEqual({ shouldRun: true, reason: 'weightReached' })
  })

  it('laeuft bei reiner Vielrederei nicht — zwanzig Chatsignale wiegen 1.0', () => {
    // 20 Chatsignale zu je 0.05 ergeben ein Gewicht von 1.0.
    const trigger = evaluateTrigger(state({ pendingEvidenceWeight: 1, oldestPendingAt: NOW }), NOW)
    expect(trigger.shouldRun).toBe(false)
  })

  it('laeuft nach der Wartezeit-Obergrenze auch mit wenig Evidenz', () => {
    const long = new Date(new Date(NOW).getTime() - (CONSOLIDATION_MAX_WAIT_DAYS + 1) * 86_400_000).toISOString()
    const trigger = evaluateTrigger(state({ pendingEvidenceWeight: 2, oldestPendingAt: long }), NOW)
    expect(trigger).toEqual({ shouldRun: true, reason: 'waitCapReached' })
  })

  it('haelt den Abstand zum letzten Lauf ein — ein langer Lernabend loest nicht mehrfach aus', () => {
    const recent = new Date(new Date(NOW).getTime() - 60 * 60 * 1000).toISOString()
    const trigger = evaluateTrigger(
      state({ pendingEvidenceWeight: CONSOLIDATION_WEIGHT_THRESHOLD * 3, lastRunAt: recent }),
      NOW,
    )
    expect(trigger).toEqual({ shouldRun: false, reason: 'cooldown' })
  })

  it('meldet den Fortschritt bis zum naechsten Lauf', () => {
    expect(triggerProgress(state({ pendingEvidenceWeight: CONSOLIDATION_WEIGHT_THRESHOLD / 2 }), NOW)).toBeCloseTo(
      0.5,
      5,
    )
    expect(triggerProgress(state({ pendingEvidenceWeight: 999 }), NOW)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fehlermuster
// ---------------------------------------------------------------------------

function observation(overrides: Partial<ErrorObservation> = {}): ErrorObservation {
  return {
    id: 'o1',
    conceptId: 'c1',
    kind: 'confused',
    object: 'Netz- und Broadcast-Adresse',
    rawDescription: 'Hat die Netzadresse als Broadcast angegeben.',
    subject: 'Netzwerktechnik',
    occurredAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('Fehlermuster (Kapitel 10)', () => {
  it('normalisiert Formulierungsvarianten auf denselben Schluessel', () => {
    expect(normaliseObject('Netz- und Broadcast-Adresse')).toBe(normaliseObject('netz broadcast adresse'))
  })

  it('trennt nach Fehlerart, auch bei gleichem Objekt', () => {
    expect(groupKeyOf({ kind: 'confused', object: 'Adressen' })).not.toBe(
      groupKeyOf({ kind: 'omitted', object: 'Adressen' }),
    )
  })

  it('gruppiert wiederkehrende Beschreibungen', () => {
    const groups = groupObservations([
      observation({ id: 'o1' }),
      observation({ id: 'o2', object: 'broadcast adresse und netz' }),
      observation({ id: 'o3', kind: 'omitted', object: 'Subnetzmaske' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].observations).toHaveLength(2)
  })

  it('wirft Zusammenschreibungen NICHT mit Getrenntschreibungen zusammen', () => {
    /* Bewusst konservativ: „broadcastadresse" und „broadcast adresse" koennten auch zwei
       verschiedene Dinge meinen. Ein Muster, das zwei Sachen meint, ist als Einsicht wertlos —
       die Zusammenfuehrung solcher Faelle bleibt dem Konsolidierer-Modell und dem Nutzer. */
    expect(normaliseObject('Broadcast-Adresse')).not.toBe(normaliseObject('Broadcastadresse'))
  })

  it('taeuft einen Namen, der ein Satz ueber die Person ist', () => {
    const groups = groupObservations([observation()])
    expect(nameFor(groups[0])).toBe('Verwechselt Netz- und Broadcast-Adresse')
  })

  it('erkennt ein generisches Muster an der Streuung ueber Faecher', () => {
    const groups = groupObservations([
      observation({ id: 'o1', conceptId: 'c1', subject: 'Netzwerktechnik' }),
      observation({ id: 'o2', conceptId: 'c2', subject: 'Mathematik' }),
    ])
    expect(scopeOf(groups[0])).toBe('generic')
  })

  it('erkennt ein fachspezifisches Muster an der Ballung', () => {
    const groups = groupObservations([
      observation({ id: 'o1', conceptId: 'c1' }),
      observation({ id: 'o2', conceptId: 'c2' }),
    ])
    expect(scopeOf(groups[0])).toBe('domainSpecific')
  })

  it('zeigt nichts an, was nur an einem Abend passiert ist', () => {
    const sameEvening = groupObservations(
      Array.from({ length: 7 }, (_, i) =>
        observation({ id: `o${i}`, conceptId: 'c1', occurredAt: '2026-08-01T20:00:00.000Z' }),
      ),
    )
    expect(meetsSurfaceThreshold(sameEvening[0])).toBe(false)
  })

  it('zeigt an, was sich ueber Konzepte und Tage verteilt', () => {
    const spread = groupObservations([
      observation({ id: 'o1', conceptId: 'c1', occurredAt: '2026-08-01T10:00:00.000Z' }),
      observation({ id: 'o2', conceptId: 'c2', occurredAt: '2026-08-05T10:00:00.000Z' }),
      observation({ id: 'o3', conceptId: 'c3', occurredAt: '2026-08-09T10:00:00.000Z' }),
      observation({ id: 'o4', conceptId: 'c1', occurredAt: '2026-08-12T10:00:00.000Z' }),
    ])
    expect(meetsSurfaceThreshold(spread[0])).toBe(true)
  })

  it('haelt einen einmal vergebenen Namen fest (Invariante I12)', () => {
    const groups = groupObservations([observation()])
    const existing: ErrorPattern = {
      id: 'p1',
      userId: 'u1',
      name: 'Verwechselt Adressen',
      kind: 'confused',
      object: 'Adressen',
      scope: 'domainSpecific',
      subjects: [],
      distinctConceptCount: 1,
      occurrenceCount: 1,
      distinctDayCount: 1,
      surfaced: false,
      userDisputed: false,
      mergedIntoId: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    }
    const updated = upsertPattern({ candidate: groups[0], existing, userId: 'u1', nowIso: NOW })
    expect(updated.name).toBe('Verwechselt Adressen')
  })

  it('nimmt eine einmal erreichte Anzeigeschwelle nicht zurueck', () => {
    const groups = groupObservations([observation()])
    const surfaced = upsertPattern({
      candidate: groups[0],
      existing: {
        id: 'p1',
        userId: 'u1',
        name: 'Verwechselt Netz- und Broadcast-Adresse',
        kind: 'confused',
        object: '',
        scope: 'unknown',
        subjects: [],
        distinctConceptCount: 0,
        occurrenceCount: 0,
        distinctDayCount: 0,
        surfaced: true,
        userDisputed: false,
        mergedIntoId: null,
        firstSeenAt: NOW,
        lastSeenAt: NOW,
      },
      userId: 'u1',
      nowIso: NOW,
    })
    expect(surfaced.surfaced).toBe(true)
  })

  it('findet Fastduplikate', () => {
    const base: Omit<ErrorPattern, 'id' | 'name' | 'object'> = {
      userId: 'u1',
      kind: 'overlooked',
      scope: 'generic',
      subjects: [],
      distinctConceptCount: 3,
      occurrenceCount: 5,
      distinctDayCount: 3,
      surfaced: true,
      userDisputed: false,
      mergedIntoId: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    }
    const pairs = findNearDuplicates([
      { ...base, id: 'p1', name: 'A', object: 'Angaben in der Aufgabenstellung' },
      { ...base, id: 'p2', name: 'B', object: 'Angaben in Aufgabenstellung' },
      { ...base, id: 'p3', name: 'C', object: 'Einheiten' },
    ])
    expect(pairs).toHaveLength(1)
  })

  it('misst Aehnlichkeit ueber die Wortueberlappung', () => {
    expect(objectSimilarity('Netz- und Broadcast-Adresse', 'Netz und Broadcast Adresse')).toBe(1)
    expect(objectSimilarity('Einheiten', 'Adressen')).toBe(0)
  })

  it('formuliert Muster als Beobachtung mit Beleg, nicht als Urteil', () => {
    const text = describePattern({
      id: 'p1',
      userId: 'u1',
      name: 'Uebersieht Angaben',
      kind: 'overlooked',
      object: 'Angaben',
      scope: 'generic',
      subjects: ['Mathematik', 'Netzwerktechnik'],
      distinctConceptCount: 5,
      occurrenceCount: 9,
      distinctDayCount: 4,
      surfaced: true,
      userDisputed: false,
      mergedIntoId: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    })
    expect(text).toMatch(/9 Mal/)
    expect(text).toMatch(/4 Tage/)
    expect(text).toMatch(/Siehst du das auch so\?/)
  })
})

// ---------------------------------------------------------------------------
// Wertregeln (Kapitel 8.3)
// ---------------------------------------------------------------------------

describe('Geltungsbereich des Musterkatalogs (Kapitel 10, neu in 1.1)', () => {
  it('sammelt ueber Lernpfade hinweg — die Beobachtung kennt gar keinen Pfad', () => {
    /*
     * „Ohne pfadueebergreifende Sammlung erreicht ein generisches Muster die Anzeigeschwelle
     *  unter Umstaenden nie, weil sich die Belege auf mehrere Pfade verteilen."
     *
     * Umgesetzt durch Weglassen: `ErrorObservation` traegt keine pathId, die Gruppierung kann
     * also gar nicht nach Pfad trennen. Der Test haelt diese Auslassung fest — ein spaeter
     * ergaenztes Feld waere sonst eine stille Rueckkehr zur Sammlung pro Pfad.
     */
    const keys = Object.keys(observation())
    expect(keys).not.toContain('pathId')

    const ueberPfade = [
      observation({ id: 'o1', conceptId: 'netz-1', subject: 'Netzwerktechnik', object: 'die Aufgabenstellung' }),
      observation({ id: 'o2', conceptId: 'steuer-1', subject: 'Steuerrecht', object: 'die Aufgabenstellung' }),
      observation({ id: 'o3', conceptId: 'mathe-1', subject: 'Mathematik', object: 'die Aufgabenstellung' }),
    ]
    const groups = groupObservations(ueberPfade)
    expect(groups).toHaveLength(1)
    expect(groups[0].observations).toHaveLength(3)
  })

  it('erkennt genau daran, dass ein Muster generisch ist', () => {
    // Fachspezifische Muster sterben mit dem Fach; generische sagen etwas ueber die Person.
    const ueberFaecher = [
      observation({ id: 'o1', conceptId: 'a', subject: 'Netzwerktechnik', object: 'die Angabe' }),
      observation({ id: 'o2', conceptId: 'b', subject: 'Steuerrecht', object: 'die Angabe' }),
      observation({ id: 'o3', conceptId: 'c', subject: 'Mathematik', object: 'die Angabe' }),
      observation({ id: 'o4', conceptId: 'd', subject: 'Recht', object: 'die Angabe' }),
    ]
    expect(scopeOf(groupObservations(ueberFaecher)[0])).toBe('generic')

    const einFach = [
      observation({ id: 'o1', conceptId: 'a', subject: 'Netzwerktechnik' }),
      observation({ id: 'o2', conceptId: 'b', subject: 'Netzwerktechnik' }),
    ]
    expect(scopeOf(groupObservations(einFach)[0])).toBe('domainSpecific')
  })

  it('bindet ein Muster an den Nutzer, nicht an einen Pfad', () => {
    const candidate = groupObservations([observation({ id: 'o1' }), observation({ id: 'o2', conceptId: 'c2' })])[0]
    const pattern = upsertPattern({ candidate, existing: null, userId: 'u1', nowIso: NOW })
    expect(pattern.userId).toBe('u1')
    expect(Object.keys(pattern)).not.toContain('pathId')
  })
})

describe('Wertbehandlung beim Umbau (Kapitel 8.3)', () => {
  const strong: LearnerConceptImage = {
    ...emptyImage('a', 3),
    mastery: 0.8,
    confidence: 0.7,
    directEvidenceCount: 8,
    directEvidenceWeight: 8,
    depth: 'apply',
  }
  const weak: LearnerConceptImage = {
    ...emptyImage('b', 3),
    mastery: 0.3,
    confidence: 0.2,
    directEvidenceCount: 2,
    directEvidenceWeight: 2,
    depth: 'recognize',
  }

  it('laesst beim Verschmelzen den niedrigeren Beherrschungswert gewinnen', () => {
    expect(mergeImages(strong, weak, 'a').mastery).toBe(0.3)
  })

  it('addiert die Evidenz nicht — sonst staende der neue Knoten selbstsicherer da als jede Haelfte', () => {
    const merged = mergeImages(strong, weak, 'a')
    expect(merged.directEvidenceWeight).toBe(2)
    expect(merged.confidence).toBeLessThan(strong.confidence)
  })

  it('markiert den verschmolzenen Knoten als ueberpruefungsbeduerftig', () => {
    expect(mergeImages(strong, weak, 'a').reviewNeeded).toBe(true)
  })

  it('laesst beim Aufspalten beide Haelften den Wert erben', () => {
    const [left, right] = splitImage(strong, ['a1', 'a2'])
    expect(left.mastery).toBe(0.8)
    expect(right.mastery).toBe(0.8)
  })

  it('setzt die Sicherheit beim Aufspalten auf nahezu null', () => {
    const [left] = splitImage(strong, ['a1', 'a2'])
    expect(left.confidence).toBeGreaterThan(0)
    expect(left.confidence).toBeLessThan(0.1)
    expect(left.directEvidenceWeight).toBe(SPLIT_RESIDUAL_EVIDENCE_WEIGHT)
  })

  it('stellt beide Haelften zur Ueberpruefung — daraus trennen sich die Werte wieder', () => {
    const [left, right] = splitImage(strong, ['a1', 'a2'])
    expect(left.reviewNeeded).toBe(true)
    expect(right.reviewNeeded).toBe(true)
    expect(left.coldStart).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Entdeckung
// ---------------------------------------------------------------------------

describe('Kantenentdeckung (Kapitel 8.2)', () => {
  /** B scheitert genau dann, wenn A davor gescheitert ist. */
  const samples = [
    { conceptId: 'a', credit: 0, at: '2026-08-01T10:00:00.000Z' },
    { conceptId: 'b', credit: 0, at: '2026-08-01T11:00:00.000Z' },
    { conceptId: 'a', credit: 0, at: '2026-08-02T10:00:00.000Z' },
    { conceptId: 'b', credit: 0, at: '2026-08-02T11:00:00.000Z' },
    { conceptId: 'a', credit: 0, at: '2026-08-03T10:00:00.000Z' },
    { conceptId: 'b', credit: 0, at: '2026-08-03T11:00:00.000Z' },
    { conceptId: 'a', credit: 1, at: '2026-08-04T10:00:00.000Z' },
    { conceptId: 'b', credit: 1, at: '2026-08-04T11:00:00.000Z' },
    { conceptId: 'a', credit: 1, at: '2026-08-05T10:00:00.000Z' },
    { conceptId: 'b', credit: 1, at: '2026-08-05T11:00:00.000Z' },
    { conceptId: 'a', credit: 1, at: '2026-08-06T10:00:00.000Z' },
    { conceptId: 'b', credit: 1, at: '2026-08-06T11:00:00.000Z' },
  ]

  it('findet die Abhaengigkeit, die der Kartograf nie gezeichnet hat', () => {
    const candidates = discoverEdges({ samples, existingEdges: [], conceptIds: ['a', 'b'] })
    const found = candidates.find((c) => c.fromConceptId === 'a' && c.toConceptId === 'b')
    expect(found).toBeDefined()
    expect(found?.lift).toBeCloseTo(1, 5)
  })

  it('schlaegt keine bereits vorhandene Kante vor', () => {
    const candidates = discoverEdges({
      samples,
      existingEdges: [
        { id: 'e1', pathId: 'p1', fromConceptId: 'a', toConceptId: 'b', origin: 'cartographer' },
      ],
      conceptIds: ['a', 'b'],
    })
    expect(candidates.find((c) => c.fromConceptId === 'a' && c.toConceptId === 'b')).toBeUndefined()
  })

  it('schlaegt bei zu wenigen Beobachtungen nichts vor', () => {
    const candidates = discoverEdges({ samples: samples.slice(0, 4), existingEdges: [], conceptIds: ['a', 'b'] })
    expect(candidates).toEqual([])
  })

  it('schlaegt nichts vor, wenn es keinen Zusammenhang gibt', () => {
    const noise = samples.map((s, i) => ({ ...s, credit: i % 2 === 0 ? 1 : 0 }))
    const candidates = discoverEdges({ samples: noise, existingEdges: [], conceptIds: ['a', 'b'] })
    expect(candidates).toEqual([])
  })
})

describe('Aufspaltungs- und Verschmelzungskandidaten', () => {
  it('erkennt ein Konzept, dessen Ergebnisse in zwei Gruppen zerfallen', () => {
    const samples = [
      { conceptId: 'c1', credit: 0, at: '2026-08-01T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.05, at: '2026-08-02T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.1, at: '2026-08-03T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.95, at: '2026-08-04T10:00:00.000Z' },
      { conceptId: 'c1', credit: 1, at: '2026-08-05T10:00:00.000Z' },
      { conceptId: 'c1', credit: 1, at: '2026-08-06T10:00:00.000Z' },
    ]
    const candidates = findSplitCandidates({ samples, conceptIds: ['c1'] })
    expect(candidates.map((c) => c.conceptId)).toEqual(['c1'])
  })

  it('haelt einen einzelnen Ausreisser nicht fuer eine zweite Gruppe', () => {
    const samples = [
      { conceptId: 'c1', credit: 0, at: '2026-08-01T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.9, at: '2026-08-02T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.92, at: '2026-08-03T10:00:00.000Z' },
      { conceptId: 'c1', credit: 0.95, at: '2026-08-04T10:00:00.000Z' },
      { conceptId: 'c1', credit: 1, at: '2026-08-05T10:00:00.000Z' },
      { conceptId: 'c1', credit: 1, at: '2026-08-06T10:00:00.000Z' },
    ]
    expect(findSplitCandidates({ samples, conceptIds: ['c1'] })).toEqual([])
  })

  it('findet Doppelungen aus verschiedenen Quellen', () => {
    const concepts: BrainConcept[] = [
      {
        id: 'c1',
        pathId: 'p1',
        slug: 'subnetzmaske-berechnen',
        name: 'Subnetzmaske berechnen',
        description: '',
        difficulty: 3,
        origin: 'material',
        sourceRef: {},
        sourceQuote: 'x',
        ordinal: 0,
      },
      {
        id: 'c2',
        pathId: 'p1',
        slug: 'netzmaske-berechnen',
        name: 'Subnetzmaske berechnen lernen',
        description: '',
        difficulty: 3,
        origin: 'material',
        sourceRef: {},
        sourceQuote: 'y',
        ordinal: 1,
      },
    ]
    const candidates = findMergeCandidates(concepts)
    expect(candidates).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Vorschlaege und Protokoll (I6, I7, 8.4)
// ---------------------------------------------------------------------------

describe('Vorschlaege (Invarianten I6 und I7)', () => {
  it('macht eine Verschmelzung bestaetigungspflichtig und stellt die Frage in Nutzersprache', () => {
    const proposal = proposeMerge({
      userId: 'u1',
      pathId: 'p1',
      candidate: {
        aConceptId: 'c1',
        bConceptId: 'c2',
        similarity: 0.8,
        aName: 'Subnetzmaske',
        bName: 'Netzmaske berechnen',
      },
      nowIso: NOW,
    })
    expect(proposal.requiresConfirmation).toBe(true)
    expect(proposal.question).toBe('Meinen „Subnetzmaske" und „Netzmaske berechnen" dasselbe?')
    expect(proposal.question).not.toMatch(/Knoten|Kante|Graph/)
  })

  it('zeigt Vorschlaege nie mitten in der Sitzung', () => {
    const proposal = proposeMerge({
      userId: 'u1',
      pathId: 'p1',
      candidate: { aConceptId: 'c1', bConceptId: 'c2', similarity: 0.8, aName: 'A', bName: 'B' },
      nowIso: NOW,
    })
    expect(['sessionStart', 'mapReview']).toContain(proposal.surfaceContext)
  })

  it('gibt jedem Vorschlag ein Verfallsdatum', () => {
    const proposal = proposeEdge({
      userId: 'u1',
      pathId: 'p1',
      candidate: {
        fromConceptId: 'a',
        toConceptId: 'b',
        lift: 0.8,
        pairedSamples: 10,
        failureRateWhenWeak: 0.9,
        failureRateWhenStrong: 0.1,
      },
      nowIso: NOW,
    })
    expect(new Date(proposal.expiresAt).getTime()).toBeGreaterThan(new Date(NOW).getTime())
  })

  it('laesst eine umkehrbare Kante ohne Bestaetigung laufen', () => {
    const proposal = proposeEdge({
      userId: 'u1',
      pathId: 'p1',
      candidate: {
        fromConceptId: 'a',
        toConceptId: 'b',
        lift: 0.8,
        pairedSamples: 10,
        failureRateWhenWeak: 0.9,
        failureRateWhenStrong: 0.1,
      },
      nowIso: NOW,
    })
    expect(proposal.requiresConfirmation).toBe(false)
    expect(proposal.evidence).toHaveProperty('lift')
  })
})

describe('Protokollpflicht (Kapitel 8.4)', () => {
  it('verlangt eine Ruecknahmeanleitung', () => {
    expect(() =>
      buildLogEntry({
        userId: 'u1',
        pathId: 'p1',
        proposalId: null,
        operation: 'mergeConcepts',
        payload: {},
        evidence: {},
        undoPayload: {},
        nowIso: NOW,
      }),
    ).toThrow(InvariantViolation)
  })

  it('markiert zerstoererische Operationen als solche', () => {
    const entry = buildLogEntry({
      userId: 'u1',
      pathId: 'p1',
      proposalId: 'pr1',
      operation: 'mergeConcepts',
      payload: { keepConceptId: 'c1' },
      evidence: {},
      undoPayload: { kind: 'restoreMerge' },
      nowIso: NOW,
    })
    expect(entry.destructive).toBe(true)
    expect(entry.revertedAt).toBeNull()
  })

  it('markiert umkehrbare Operationen nicht als zerstoererisch', () => {
    const entry = buildLogEntry({
      userId: 'u1',
      pathId: 'p1',
      proposalId: null,
      operation: 'addEdge',
      payload: {},
      evidence: {},
      undoPayload: { kind: 'removeEdge', fromConceptId: 'a', toConceptId: 'b' },
      nowIso: NOW,
    })
    expect(entry.destructive).toBe(false)
  })

  it('haelt im Ruecknahme-Payload beide urspruenglichen Lernerbilder fest', () => {
    const a = { ...emptyImage('c1', 3), mastery: 0.8 }
    const b = { ...emptyImage('c2', 3), mastery: 0.3 }
    const undo = undoPayloadForMerge({
      keptConceptId: 'c1',
      mergedConceptId: 'c2',
      keptImageBefore: a,
      mergedImageBefore: b,
      mergedConceptSnapshot: {
        id: 'c2',
        pathId: 'p1',
        slug: 'c2',
        name: 'C2',
        description: '',
        difficulty: 3,
        origin: 'material',
        sourceRef: {},
        sourceQuote: 'x',
        ordinal: 1,
      },
      reattachedEdges: [],
    })
    expect(undo.keptImageBefore).toEqual(a)
    expect(undo.mergedImageBefore).toEqual(b)
    expect(undo.mergedConceptSnapshot).toBeDefined()
  })
})
