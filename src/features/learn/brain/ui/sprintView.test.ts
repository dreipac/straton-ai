/**
 * Die Sprintkarte — Tests.
 *
 * Die drei Fragen, die hier falsch zu beantworten teuer waere: Wann erscheint die Karte
 * ueberhaupt? Verschwindet der Vorschlag, nachdem er beantwortet wurde? Und wird das
 * Rueckhol-Angebot erst gemacht, wenn tatsaechlich Platz ist — nicht schon, weil jemand lange
 * gesessen hat.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, LearnerConceptImage, LearningGoal } from '../types'
import { emptyImage } from '../memory/learnerImage'
import { buildSprintCard } from './sprintView'

const NOW = '2026-09-02T08:00:00.000Z'

function inDays(days: number): string {
  return new Date(new Date(NOW).getTime() + days * 86_400_000).toISOString()
}

function concept(id: string): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: id,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: '',
    ordinal: Number(id.replace(/\D/g, '')) || 0,
  }
}

function concepts(count: number): BrainConcept[] {
  return Array.from({ length: count }, (_, index) => concept(`c${index + 1}`))
}

function settled(conceptId: string): LearnerConceptImage {
  return { ...emptyImage(conceptId, 3), mastery: 0.9, depth: 'recognize', lastSeenAt: NOW }
}

function goal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  return {
    id: 'g1',
    userId: 'u1',
    pathId: 'p1',
    title: 'Pruefung',
    dueAt: inDays(2),
    conceptIds: concepts(40).map((entry) => entry.id),
    minutesPerDay: 60,
    // Vorgabe aus der Einrichtung: noch nicht beantwortet.
    targetDepth: 'apply',
    status: 'active',
    ...overrides,
  }
}

function build(args: {
  goal?: LearningGoal | null
  images?: Map<string, LearnerConceptImage>
  conceptCount?: number
}) {
  return buildSprintCard({
    concepts: concepts(args.conceptCount ?? 40),
    edges: [],
    images: args.images ?? new Map(),
    goal: args.goal === undefined ? goal() : args.goal,
    nowIso: NOW,
  })
}

describe('buildSprintCard — wann ueberhaupt', () => {
  it('schweigt ohne Ziel', () => {
    expect(build({ goal: null }).kind).toBe('none')
  })

  it('schweigt bei einem Ziel mit Vorlauf', () => {
    expect(build({ goal: goal({ dueAt: inDays(10) }) }).kind).toBe('none')
  })

  it('schweigt bei einem abgeschlossenen Ziel', () => {
    expect(build({ goal: goal({ status: 'achieved' }) }).kind).toBe('none')
  })
})

describe('buildSprintCard — der Vorschlag', () => {
  it('schlaegt den Zuschnitt vor, solange nicht geantwortet wurde', () => {
    const card = build({})
    expect(card.kind).toBe('proposal')
    if (card.kind !== 'proposal') return

    expect(card.isCut).toBe(true)
    // Die Ueberschrift ist eine Ueberschrift: nie der Satz selbst, nie mit einer Zahl beginnend.
    expect(card.title).not.toMatch(/^\d/)
    expect(card.title).not.toBe(card.scopeSentence)
    expect(card.keptCount).toBe(20)
    expect(card.totalCount).toBe(40)
    // Beide Aussagen stehen getrennt: die eine betrifft den Termin, die andere die Zeit danach.
    expect(card.scopeSentence).toContain('20 von 40')
    expect(card.retentionSentence).toContain('einen Durchgang')
  })

  it('meldet keinen Zuschnitt, wenn alles hineinpasst', () => {
    const card = build({ conceptCount: 10, goal: goal({ conceptIds: ['c1'] }) })
    expect(card.kind).toBe('proposal')
    if (card.kind !== 'proposal') return
    // Zehn Konzepte passen in zwei Tage — es gibt nichts zu entscheiden, nur zu wissen.
    expect(card.isCut).toBe(false)
  })

  it('verschwindet, sobald geantwortet wurde', () => {
    /*
     * Die Antwort steckt in der Zieltiefe: beide Knoepfe senken sie auf `recognize`. Ohne diese
     * Merkung stuende der Vorschlag bei jedem Oeffnen des Pfads erneut da.
     */
    const card = build({ goal: goal({ targetDepth: 'recognize', conceptIds: ['c1', 'c2'] }) })
    expect(card.kind).not.toBe('proposal')
  })
})

describe('buildSprintCard — das Rueckhol-Angebot', () => {
  it('bietet nichts an, solange der Umfang noch Arbeit macht', () => {
    const scope = concepts(20).map((entry) => entry.id)
    const card = build({ goal: goal({ targetDepth: 'recognize', conceptIds: scope }) })
    expect(card.kind).toBe('none')
  })

  it('bietet mehr an, sobald der Umfang tatsaechlich sitzt', () => {
    const scope = concepts(20).map((entry) => entry.id)
    const images = new Map(scope.map((id) => [id, settled(id)]))
    const card = build({ goal: goal({ targetDepth: 'recognize', conceptIds: scope }), images })

    expect(card.kind).toBe('headroom')
    if (card.kind !== 'headroom') return

    expect(card.isScopeComplete).toBe(true)
    expect(card.title).toContain('durch')
    expect(card.conceptIds.length).toBeGreaterThan(0)
    // Angeboten wird nur, was noch nicht im Umfang steht.
    for (const conceptId of card.conceptIds) {
      expect(scope).not.toContain(conceptId)
    }
  })

  it('bietet auch dem an, der vor dem Plan liegt, ohne schon fertig zu sein', () => {
    /*
     * Neunzehn von zwanzig sitzen: sie kosten keine Minuten mehr, also ist Platz fuer neue —
     * aber der Umfang ist noch nicht durch. Der Satz muss ein Angebot sein, keine Feststellung.
     */
    const scope = concepts(20).map((entry) => entry.id)
    const images = new Map(scope.slice(0, 19).map((id) => [id, settled(id)]))
    const card = build({ goal: goal({ targetDepth: 'recognize', conceptIds: scope }), images })

    expect(card.kind).toBe('headroom')
    if (card.kind !== 'headroom') return
    expect(card.isScopeComplete).toBe(false)
    expect(card.title).toContain('vor dem Plan')
  })
})
