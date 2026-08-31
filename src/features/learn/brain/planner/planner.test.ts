/**
 * Planer (Kapitel 6) — Tests.
 *
 * Drei Dinge, die hier nicht verhandelbar sind:
 *  - Determinismus (I11): gleiche Ausgangslage, gleiche Sitzung. Ohne das ist kein Fehler
 *    reproduzierbar und keine Verbesserung gezielt.
 *  - Wiederholungs-Mindestreserve (I9), auch wenn ein Ziel alles uebersteuert.
 *  - Erklaerpflicht (I8): jede Aufgabe traegt ihren Satz.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage, LearningGoal } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  planNextTask,
  planSession,
  pathProgress,
  reviewReserveSlots,
  MIN_SESSION_FOR_REVIEW_RESERVE,
  REVIEW_RESERVE_SHARE,
} from './planner'

const NOW = '2026-08-18T10:00:00.000Z'
const LONG_AGO = '2026-07-01T10:00:00.000Z'

function concept(id: string, overrides: Partial<BrainConcept> = {}): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: `Konzept ${id}`,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal: 0,
    ...overrides,
  }
}

function edge(from: string, to: string): BrainPrerequisiteEdge {
  return { id: `${from}->${to}`, pathId: 'p1', fromConceptId: from, toConceptId: to, origin: 'cartographer' }
}

/** Ein Konzept, das laengst faellig ist. */
function overdue(id: string, mastery = 0.5): LearnerConceptImage {
  return {
    ...emptyImage(id, 3),
    mastery,
    confidence: 0.7,
    directEvidenceCount: 4,
    directEvidenceWeight: 4,
    // Ab 0.7 war es einmal gefestigt — dieselbe Regel, die `applyDirectEvidence` anwendet.
    everConsolidated: mastery >= 0.7,
    lastSeenAt: LONG_AGO,
    lastDirectEvidenceAt: LONG_AGO,
    nextReviewAt: LONG_AGO,
  }
}

/**
 * Ein gefestigtes Konzept, das zu verfallen beginnt — der Fall, fuer den der Stapel da ist
 * (Kapitel 6.7). Nur solche Konzepte duerfen die Mindestreserve fuellen.
 */
function dueFromStack(id: string): LearnerConceptImage {
  return overdue(id, 0.8)
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    concepts: [concept('a'), concept('b'), concept('c')],
    edges: [] as BrainPrerequisiteEdge[],
    images: new Map<string, LearnerConceptImage>(),
    goal: null as LearningGoal | null,
    sessionSize: 3,
    consecutiveFailures: 0,
    nowIso: NOW,
    ...overrides,
  } as Parameters<typeof planSession>[0]
}

describe('Determinismus (Invariante I11)', () => {
  it('liefert bei gleicher Ausgangslage zweimal dieselbe Sitzung', () => {
    const images = new Map([['a', overdue('a', 0.4)], ['b', overdue('b', 0.6)]])
    const first = planSession(baseInput({ images }))
    const second = planSession(baseInput({ images }))
    expect(first.tasks.map((t) => t.conceptId)).toEqual(second.tasks.map((t) => t.conceptId))
    expect(first.tasks.map((t) => t.format)).toEqual(second.tasks.map((t) => t.format))
  })

  it('stellt in einer frischen Sitzung nicht ueberall dasselbe Format', () => {
    /*
     * Ohne den konzeptabhaengigen Versatz (`formatRotationOffset`) beginnt jedes Konzept ohne
     * direkte Evidenz bei Rotationsindex 0 — und damit beim ersten Format der Tiefe. Eine erste
     * Sitzung bestuende dann ausschliesslich aus Auswahlfragen, obwohl Kapitel 6.6 gerade die
     * Abwechslung verlangt.
     */
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const concepts = ids.map((id) => concept(id))
    // Frisch: noch keine direkte Evidenz, also fuer alle derselbe Rotationsindex 0.
    const images = new Map(ids.map((id) => [id, emptyImage(id, 3)]))
    const plan = planSession(baseInput({ concepts, images, sessionSize: 6 }))
    expect(plan.tasks).toHaveLength(6)
    expect(new Set(plan.tasks.map((task) => task.format)).size).toBeGreaterThan(1)
  })

  it('haengt nicht von der Eingabereihenfolge der Konzepte ab', () => {
    const images = new Map([['a', overdue('a', 0.4)], ['b', overdue('b', 0.4)]])
    const forward = planSession(baseInput({ images }))
    const reversed = planSession(
      baseInput({ images, concepts: [concept('c'), concept('b'), concept('a')] }),
    )
    expect(new Set(forward.tasks.map((t) => t.conceptId))).toEqual(
      new Set(reversed.tasks.map((t) => t.conceptId)),
    )
  })
})

describe('Erklaerpflicht (Invariante I8)', () => {
  it('gibt jeder Aufgabe einen Satz mit', () => {
    const plan = planSession(baseInput({ images: new Map([['a', overdue('a')]]) }))
    for (const task of plan.tasks) {
      expect(task.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('formuliert ohne Fachjargon', () => {
    const plan = planSession(baseInput({ images: new Map([['a', overdue('a')]]) }))
    for (const task of plan.tasks) {
      expect(task.reason).not.toMatch(/Propagation|Voraussetzungskante|Konfidenz|BKT/)
    }
  })

  it('liefert eine nachvollziehbare Aufschluesselung fuer die Diagnose', () => {
    const plan = planSession(baseInput({ images: new Map([['a', overdue('a')]]) }))
    const task = plan.tasks.find((t) => t.conceptId === 'a')
    expect(Object.keys(task?.urgencyBreakdown ?? {}).length).toBeGreaterThan(0)
  })
})

describe('Wiederholungs-Mindestreserve (Invariante I9)', () => {
  const examGoal: LearningGoal = {
    id: 'g1',
    userId: 'u1',
    pathId: 'p1',
    title: 'Pruefung',
    dueAt: '2026-08-20T10:00:00.000Z',
    conceptIds: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'],
    minutesPerDay: 60,
    status: 'active',
  }

  it('haelt auch im Zielmodus einen Platz fuer Wiederholung frei', () => {
    const goalConcepts = examGoal.conceptIds.map((id) => concept(id))
    const images = new Map([['alt', dueFromStack('alt')]])
    const plan = planSession(
      baseInput({
        concepts: [...goalConcepts, concept('alt')],
        images,
        goal: examGoal,
        sessionSize: 8,
      }),
    )
    expect(plan.reviewSlotsUsed).toBeGreaterThanOrEqual(1)
    expect(plan.tasks.some((t) => t.fromReviewReserve)).toBe(true)
  })

  it('reserviert mindestens den festgelegten Anteil', () => {
    const images = new Map(
      Array.from({ length: 10 }, (_, i) => [`r${i}`, dueFromStack(`r${i}`)] as const),
    )
    const plan = planSession(
      baseInput({
        concepts: Array.from({ length: 10 }, (_, i) => concept(`r${i}`)),
        images,
        sessionSize: 10,
      }),
    )
    expect(plan.reviewSlotsUsed).toBeGreaterThanOrEqual(Math.ceil(10 * REVIEW_RESERVE_SHARE))
  })

  it('fuellt die Reserve nur aus dem faelligen Stapel (Kapitel 6.7)', () => {
    /*
     * Beide Konzepte verblassen, aber nur eines war je gefestigt. Das andere gehoert nach 6.7
     * in den Pfad: es wird aufgebaut, nicht aufgefrischt. Landete es in der Reserve, traege die
     * Aufgabe die Kennzeichnung „Eingemischt aus deinem faelligen Stapel" — aus einem Stapel, in
     * dem sie gar nicht steht.
     */
    const images = new Map([
      ['gefestigt', dueFromStack('gefestigt')],
      ['nie-gesessen', overdue('nie-gesessen', 0.3)],
    ])
    const plan = planSession(
      baseInput({
        concepts: [concept('gefestigt'), concept('nie-gesessen')],
        images,
        sessionSize: 4,
      }),
    )

    expect(plan.reviewCandidatesAvailable).toBe(1)
    const reserved = plan.tasks.filter((t) => t.fromReviewReserve).map((t) => t.conceptId)
    expect(reserved).toEqual(['gefestigt'])
    // Das andere faellt nicht unter den Tisch — es bewirbt sich nur ueber die regulaeren Plaetze.
    expect(plan.tasks.map((t) => t.conceptId)).toContain('nie-gesessen')
  })

  it('stellt eingemischte Wiederholungen auf Erkennen (Kapitel 6.7)', () => {
    const images = new Map([['w', { ...dueFromStack('w'), depth: 'apply' as const }]])
    const plan = planSession(
      baseInput({ concepts: [concept('w'), concept('a'), concept('b')], images, sessionSize: 3 }),
    )
    const reserved = plan.tasks.find((t) => t.fromReviewReserve)
    expect(reserved?.depth).toBe('recognize')
  })

  it('erzwingt nichts, wenn es gar nichts zu wiederholen gibt', () => {
    const plan = planSession(baseInput({ images: new Map() }))
    expect(plan.reviewCandidatesAvailable).toBe(0)
    expect(plan.reviewSlotsUsed).toBe(0)
  })

  it('belegt nie die ganze Sitzung — sonst kaeme ein Ziel nie an die Reihe', () => {
    for (let size = 1; size <= 12; size += 1) {
      expect(reviewReserveSlots(size, 99)).toBeLessThan(Math.max(1, size))
    }
  })

  it('greift bei sehr kurzen Sitzungen gar nicht', () => {
    for (let size = 0; size < MIN_SESSION_FOR_REVIEW_RESERVE; size += 1) {
      expect(reviewReserveSlots(size, 5)).toBe(0)
    }
  })

  it('reserviert nie mehr, als es faellige Konzepte gibt', () => {
    expect(reviewReserveSlots(20, 1)).toBe(1)
  })
})

describe('Konfliktloesung', () => {
  it('laesst ein Ziel die uebrigen Ansprueche uebersteuern', () => {
    const goalObject: LearningGoal = {
      id: 'g1',
      userId: 'u1',
      pathId: 'p1',
      title: 'Pruefung',
      dueAt: '2026-08-19T10:00:00.000Z',
      conceptIds: ['b'],
      minutesPerDay: 60,
      status: 'active',
    }
    const plan = planSession(
      baseInput({
        images: new Map([['a', overdue('a', 0.65)]]),
        goal: goalObject,
        sessionSize: 1,
      }),
    )
    expect(plan.tasks[0].conceptId).toBe('b')
    expect(plan.tasks[0].claim).toBe('goal')
  })

  it('zieht bei Frustration etwas Sitzendes heran', () => {
    const solid: LearnerConceptImage = {
      ...emptyImage('a', 3),
      mastery: 0.92,
      confidence: 0.8,
      directEvidenceCount: 6,
      directEvidenceWeight: 6,
      lastSeenAt: NOW,
      lastDirectEvidenceAt: NOW,
      nextReviewAt: '2026-09-01T10:00:00.000Z',
    }
    const plan = planSession(
      baseInput({ images: new Map([['a', solid]]), consecutiveFailures: 3, sessionSize: 1 }),
    )
    expect(plan.tasks[0].claim).toBe('motivation')
    expect(plan.tasks[0].conceptId).toBe('a')
  })

  it('meldet die Ursachensuche fuer die Voraussetzung, nicht fuer den Fehlerort', () => {
    const flagged: LearnerConceptImage = {
      ...emptyImage('vlsm', 3),
      mastery: 0.4,
      directEvidenceCount: 2,
      reviewNeeded: true,
      reviewReason: 'Bei „VLSM" ist etwas schiefgegangen.',
      lastSeenAt: NOW,
    }
    const plan = planSession(
      baseInput({
        concepts: [concept('zweierpotenzen'), concept('subnetzmaske'), concept('vlsm')],
        edges: [edge('zweierpotenzen', 'subnetzmaske'), edge('subnetzmaske', 'vlsm')],
        images: new Map([['vlsm', flagged]]),
        sessionSize: 3,
      }),
    )
    const rootCauses = plan.tasks.filter((t) => t.claim === 'rootCause').map((t) => t.conceptId)
    expect(rootCauses).toContain('subnetzmaske')
  })
})

describe('Kaltstart im Planer', () => {
  it('nimmt Konzepte mit hohem Informationsgewinn auf', () => {
    const plan = planSession(
      baseInput({
        images: new Map(),
        coldStartGains: new Map([['b', 0.9], ['c', 0.1]]),
        sessionSize: 1,
      }),
    )
    expect(plan.tasks[0].conceptId).toBe('b')
    expect(plan.tasks[0].claim).toBe('coldStart')
  })
})

describe('Sitzungsgroesse', () => {
  it('liefert nie mehr Aufgaben als angefordert', () => {
    const images = new Map(Array.from({ length: 10 }, (_, i) => [`c${i}`, overdue(`c${i}`)] as const))
    const plan = planSession(
      baseInput({ concepts: Array.from({ length: 10 }, (_, i) => concept(`c${i}`)), images, sessionSize: 3 }),
    )
    expect(plan.tasks).toHaveLength(3)
  })

  it('kommt mit Sitzungsgroesse null zurecht', () => {
    const plan = planSession(baseInput({ sessionSize: 0, images: new Map([['a', overdue('a')]]) }))
    expect(plan.tasks).toEqual([])
  })

  it('nennt kein Konzept zweimal in derselben Sitzung', () => {
    const images = new Map([['a', overdue('a', 0.2)], ['b', overdue('b', 0.3)]])
    const plan = planSession(baseInput({ images, sessionSize: 3 }))
    const ids = plan.tasks.map((t) => t.conceptId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('planNextTask', () => {
  it('liefert genau die naechste Aufgabe', () => {
    const task = planNextTask(baseInput({ images: new Map([['a', overdue('a', 0.2)]]) }))
    expect(task?.conceptId).toBe('a')
  })

  it('liefert null, wenn nichts ansteht', () => {
    expect(planNextTask(baseInput({ concepts: [], images: new Map() }))).toBeNull()
  })
})

describe('Fortschritt', () => {
  it('zaehlt sitzende Konzepte', () => {
    const images = new Map([
      ['a', { ...emptyImage('a', 3), mastery: 0.9, lastSeenAt: NOW }],
      ['b', { ...emptyImage('b', 3), mastery: 0.3, lastSeenAt: NOW }],
    ])
    const progress = pathProgress([concept('a'), concept('b')], images, NOW)
    expect(progress).toEqual({ mastered: 1, total: 2, ratio: 0.5 })
  })
})

describe('Sitzungsaufbau: aufsteigende Anwendungstiefe (Kapitel 6.6)', () => {
  /**
   * Ein Konzept, das auf einer bestimmten Stufe steht und dort auch gefragt werden soll.
   * `nextDepthFor` steigt erst ab Beherrschung 0.7 eine Stufe hoeher — die Bilder hier bleiben
   * bewusst darunter, damit die Zielstufe die gesetzte ist.
   */
  function atDepth(id: string, depth: 'recognize' | 'apply' | 'transfer'): LearnerConceptImage {
    return { ...overdue(id, 0.5), depth }
  }

  it('stellt die Aufgaben nach steigender Tiefe, nicht nach Dringlichkeit', () => {
    const images = new Map([
      // Absichtlich die dringendste Aufgabe auf der hoechsten Stufe: ohne die Regel stuende sie vorne.
      ['a', { ...atDepth('a', 'transfer'), mastery: 0.1 }],
      ['b', atDepth('b', 'apply')],
      ['c', { ...atDepth('c', 'recognize'), mastery: 0.6 }],
    ])
    const plan = planSession(baseInput({ images, sessionSize: 3 }))

    expect(plan.tasks.map((t) => t.depth)).toEqual(['recognize', 'apply', 'transfer'])
  })

  it('erzeugt damit Evidenz auf mehreren Stufen statt fuenfmal auf derselben', () => {
    const images = new Map([
      ['a', atDepth('a', 'recognize')],
      ['b', atDepth('b', 'apply')],
      ['c', atDepth('c', 'transfer')],
    ])
    const plan = planSession(baseInput({ images, sessionSize: 3 }))
    expect(new Set(plan.tasks.map((t) => t.depth)).size).toBe(3)
  })

  it('hebt die Tiefe nicht an, nur um die Sitzung zu staffeln', () => {
    /*
     * Alle drei Konzepte stehen auf Erkennen. Eine Sitzung, die daraus eine Transferaufgabe
     * macht, weil „die Tiefe ansteigen soll", erzeugte Frust statt Evidenz — die Tiefe kommt aus
     * dem Lernerbild, die Regel ordnet nur.
     */
    const images = new Map([
      ['a', atDepth('a', 'recognize')],
      ['b', atDepth('b', 'recognize')],
      ['c', atDepth('c', 'recognize')],
    ])
    const plan = planSession(baseInput({ images, sessionSize: 3 }))
    expect(plan.tasks.every((t) => t.depth === 'recognize')).toBe(true)
  })

  it('bleibt innerhalb einer Stufe bei der Dringlichkeit', () => {
    const images = new Map([
      ['a', { ...atDepth('a', 'recognize'), mastery: 0.65 }],
      ['b', { ...atDepth('b', 'recognize'), mastery: 0.15 }],
    ])
    const plan = planSession(baseInput({ images, sessionSize: 2 }))
    // b ist schwaecher und damit dringender.
    expect(plan.tasks[0].conceptId).toBe('b')
  })
})

/**
 * „Spaeter" (UI-Spezifikation 3.3).
 *
 * „Ein System ohne Widerspruchsmoeglichkeit wird als bevormundend erlebt. […] Nach dem Klick
 * waehlt der Planer die naechstdringlichste Option und begruendet erneut." Beides wird hier
 * geprueft — und zusaetzlich, dass die Zurueckweisung KEINEN Wert bewegt (I1).
 */
describe('Zurueckgewiesene Konzepte (Kapitel 3.3)', () => {
  it('waehlt nach einer Zurueckweisung die naechstdringlichste Option', () => {
    const images = new Map([
      ['a', overdue('a', 0.2)],
      ['b', overdue('b', 0.5)],
    ])
    const before = planSession(baseInput({ images, sessionSize: 1 }))
    expect(before.tasks[0].conceptId).toBe('a')

    const after = planSession(
      baseInput({ images, sessionSize: 1, deferredConceptIds: new Set(['a']) }),
    )
    expect(after.tasks[0].conceptId).toBe('b')
    expect(after.tasks[0].reason.length).toBeGreaterThan(0)
  })

  it('laesst das Lernerbild unangetastet', () => {
    const image = overdue('a', 0.2)
    const images = new Map([['a', image], ['b', overdue('b', 0.5)]])
    planSession(baseInput({ images, deferredConceptIds: new Set(['a']) }))
    expect(images.get('a')).toBe(image)
    expect(image.mastery).toBe(0.2)
  })

  it('nimmt ein zurueckgewiesenes Konzept auch aus der Mindestreserve', () => {
    const images = new Map([['a', dueFromStack('a')]])
    const plan = planSession(
      baseInput({ images, sessionSize: 6, deferredConceptIds: new Set(['a']) }),
    )
    expect(plan.reviewCandidatesAvailable).toBe(0)
    expect(plan.tasks.every((task) => task.conceptId !== 'a')).toBe(true)
  })
})
