/**
 * Der Sprint — Tests.
 *
 * Schwerpunkt sind die Stellen, an denen eine falsche Auskunft teuer waere: die Leiter des
 * Verzichts (Tiefe vor Umfang), welche der beiden Grenzen genannt wird (die Auswege sind
 * verschieden), und dass der genannte Ausweg auch wirkt.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  breadthCeilingFor,
  describeRetention,
  describeSprintDeadline,
  describeSprintScope,
  planSprintScope,
  projectRetention,
  rankByFoundation,
  sprintHeadroom,
  SPRINT_MAX_DAYS,
} from './sprint'

const NOW = '2026-09-02T08:00:00.000Z'

function inDays(days: number): string {
  return new Date(new Date(NOW).getTime() + days * 86_400_000).toISOString()
}

function concept(id: string, overrides: Partial<BrainConcept> = {}): BrainConcept {
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
    ...overrides,
  }
}

function concepts(count: number): BrainConcept[] {
  return Array.from({ length: count }, (_, index) => concept(`c${index + 1}`))
}

function edge(fromConceptId: string, toConceptId: string): BrainPrerequisiteEdge {
  return { id: `${fromConceptId}->${toConceptId}`, pathId: 'p1', fromConceptId, toConceptId, origin: 'cartographer' }
}

/** Ein Konzept, das bereits sitzt: kostet keine Sprintminuten mehr. */
function settled(conceptId: string): LearnerConceptImage {
  return { ...emptyImage(conceptId, 3), mastery: 0.9, depth: 'recognize', lastSeenAt: NOW }
}

function images(entries: LearnerConceptImage[]): Map<string, LearnerConceptImage> {
  return new Map(entries.map((image) => [image.conceptId, image]))
}

describe('breadthCeilingFor', () => {
  it('deckelt drei Tage bei 30 und alles darunter bei 20', () => {
    expect(breadthCeilingFor(3)).toBe(30)
    expect(breadthCeilingFor(2)).toBe(20)
    expect(breadthCeilingFor(1)).toBe(20)
    expect(breadthCeilingFor(0)).toBe(20)
  })
})

describe('planSprintScope — Zustaendigkeit', () => {
  it('meldet sich nicht, wenn der Termin weiter weg ist als das Sprintfenster', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(SPRINT_MAX_DAYS + 1),
      nowIso: NOW,
    })
    expect(plan).toBeNull()
  })

  it('laesst alles drin, wenn der Stoff auf Erkennen-Niveau hineinpasst', () => {
    // 10 Konzepte * 6 min = 60 min; verfuegbar sind 2 * 60 = 120 min.
    const plan = planSprintScope({
      concepts: concepts(10),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })

    expect(plan?.limit).toBe('none')
    expect(plan?.conceptIds).toHaveLength(10)
    expect(plan?.droppedConceptIds).toEqual([])
  })
})

describe('planSprintScope — die Zahlen aus der Absprache', () => {
  /*
   * Die drei Faelle, auf die das Produkt festgelegt ist. Sie stehen hier als Test, weil sie sonst
   * nur in einer Konstante und einer Formel stuenden und niemand den Zusammenhang saehe.
   */
  it('drei Tage bei einer Stunde ergeben 30 Konzepte', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(3),
      nowIso: NOW,
    })
    expect(plan?.conceptIds).toHaveLength(30)
  })

  it('zwei Tage bei einer Stunde ergeben 20 Konzepte', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })
    expect(plan?.conceptIds).toHaveLength(20)
  })

  it('ein Tag bei einer Stunde ergibt trotzdem 20 Konzepte — die Breite gewinnt', () => {
    // Die Minutenrechnung gaebe nur 10 her (60 min / 6). Der Ein-Tages-Fall hebt das an.
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(1),
      nowIso: NOW,
    })
    expect(plan?.timeLimit).toBe(10)
    expect(plan?.conceptIds).toHaveLength(20)
    expect(plan?.limit).toBe('dayFloor')
  })
})

describe('planSprintScope — welche Grenze genannt wird', () => {
  it('nennt die Zeit, wenn mehr Zeit tatsaechlich alles freischalten wuerde', () => {
    // 20 Konzepte, 3 Tage, 30 min/Tag: 90 min reichen fuer 15. Die Breitengrenze (30) greift nicht.
    const plan = planSprintScope({
      concepts: concepts(20),
      edges: [],
      images: new Map(),
      minutesPerDay: 30,
      dueAt: inDays(3),
      nowIso: NOW,
    })

    expect(plan?.limit).toBe('time')
    expect(plan?.conceptIds).toHaveLength(15)
    // 20 Konzepte * 6 min / 3 Tage = 40 min pro Tag.
    expect(plan?.minutesPerDayForAll).toBe(40)
  })

  it('nennt die Breite, wenn auch unbegrenzte Zeit den Rest nicht freischalten wuerde', () => {
    // 40 Konzepte, 3 Tage, 120 min/Tag: die Zeit reichte fuer 60, die Breite deckelt bei 30.
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 120,
      dueAt: inDays(3),
      nowIso: NOW,
    })

    expect(plan?.limit).toBe('breadth')
    expect(plan?.conceptIds).toHaveLength(30)
  })

  it('nennt die Breite auch dort, wo beide Grenzen gleichzeitig greifen', () => {
    /*
     * Der heikle Fall: 40 Konzepte, 2 Tage, 60 min/Tag. Zeitgrenze 20, Breitengrenze 20 — beide
     * binden. „Mehr Zeit" waere hier ein falscher Ausweg, weil die Breite bei 20 bliebe.
     */
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })

    expect(plan?.timeLimit).toBe(20)
    expect(plan?.breadthLimit).toBe(20)
    expect(plan?.limit).toBe('breadth')
    // Kein Ausweg ueber Zeit — also wird auch keiner genannt.
    expect(plan?.minutesPerDayForAll).toBe(0)
  })
})

describe('planSprintScope — was bereits sitzt', () => {
  it('nimmt gefestigte Konzepte gratis mit, ohne sie gegen die Grenzen zu zaehlen', () => {
    /*
     * 25 Konzepte, 2 Tage, 60 min/Tag: Platz fuer 20 neue. Sitzen bereits 5, muessen sie nicht
     * noch einmal bezahlt werden — es passen weiterhin 20 neue dazu, also alle 25.
     */
    const plan = planSprintScope({
      concepts: concepts(25),
      edges: [],
      images: images(['c1', 'c2', 'c3', 'c4', 'c5'].map(settled)),
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })

    expect(plan?.conceptIds).toHaveLength(25)
    expect(plan?.limit).toBe('none')
  })
})

describe('rankByFoundation', () => {
  it('setzt die Wurzel einer langen Kette vor einen Knoten mit mehr direkten Nachfolgern', () => {
    /*
     * `wurzel` hat einen direkten Nachfolger, traegt aber vier Konzepte. `breit` hat zwei
     * direkte Nachfolger und traegt nur diese zwei. Mit dem direkten Ausgangsgrad stuende
     * `breit` vorn — genau falsch herum.
     */
    const nodes = [
      concept('wurzel', { ordinal: 9 }),
      concept('kette1', { ordinal: 1 }),
      concept('kette2', { ordinal: 2 }),
      concept('kette3', { ordinal: 3 }),
      concept('breit', { ordinal: 0 }),
      concept('blatt1', { ordinal: 4 }),
      concept('blatt2', { ordinal: 5 }),
    ]
    const edges = [
      edge('wurzel', 'kette1'),
      edge('kette1', 'kette2'),
      edge('kette2', 'kette3'),
      edge('breit', 'blatt1'),
      edge('breit', 'blatt2'),
    ]

    const ranked = rankByFoundation(nodes, edges).map((entry) => entry.id)
    expect(ranked[0]).toBe('wurzel')
    expect(ranked.indexOf('breit')).toBeLessThan(ranked.indexOf('blatt1'))
  })

  it('kommt mit einem Zyklus zurecht, statt zu haengen', () => {
    const nodes = [concept('a'), concept('b'), concept('c')]
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    expect(rankByFoundation(nodes, edges)).toHaveLength(3)
  })

  it('ist deterministisch — gleiche Eingabe, gleiche Reihenfolge (I11)', () => {
    const nodes = concepts(12)
    const edges = [edge('c1', 'c2'), edge('c3', 'c4')]
    expect(rankByFoundation(nodes, edges).map((entry) => entry.id)).toEqual(
      rankByFoundation([...nodes].reverse(), edges).map((entry) => entry.id),
    )
  })

  it('ignoriert Kanten auf Konzepte ausserhalb der Auswahl', () => {
    const nodes = [concept('a'), concept('b')]
    const ranked = rankByFoundation(nodes, [edge('a', 'fremd'), edge('fremd', 'b')])
    expect(ranked).toHaveLength(2)
  })
})

describe('projectRetention', () => {
  it('haelt am Termin noch, faellt danach deutlich ab', () => {
    const projection = projectRetention(2)
    expect(projection.atDueDate).toBeGreaterThan(0.6)
    expect(projection.afterOneWeek).toBeLessThan(projection.atDueDate)
    expect(projection.afterOneMonth).toBeLessThan(projection.afterOneWeek)
    // Der Boden des Verfallsmodells wird nie unterschritten.
    expect(projection.afterOneMonth).toBeGreaterThan(0.1)
  })
})

describe('Texte', () => {
  it('die Einrichtungswarnung schweigt bei entspanntem Termin', () => {
    expect(describeSprintDeadline(SPRINT_MAX_DAYS + 1, 60)).toBe('')
  })

  it('die Einrichtungswarnung nennt Tiefe und fehlenden Abstand', () => {
    const text = describeSprintDeadline(2, 60)
    expect(text).toContain('20 Konzepte')
    expect(text).toContain('nicht zum Anwenden')
    expect(text).toContain('wiederholen')
  })

  it('der Umfangssatz nennt bei der Zeitgrenze den Ausweg mit Zahl', () => {
    const plan = planSprintScope({
      concepts: concepts(20),
      edges: [],
      images: new Map(),
      minutesPerDay: 30,
      dueAt: inDays(3),
      nowIso: NOW,
    })!
    const text = describeSprintScope(plan, 20)
    expect(text).toContain('15 von 20')
    expect(text).toContain('40 Minuten am Tag')
  })

  it('der Umfangssatz nennt bei der Breitengrenze KEINEN Zeitausweg', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 120,
      dueAt: inDays(3),
      nowIso: NOW,
    })!
    const text = describeSprintScope(plan, 40)
    expect(text).toContain('spaeterer Termin')
    expect(text).not.toContain('Minuten am Tag')
  })

  it('der Umfangssatz beziffert im Ein-Tages-Fall die echten Stunden', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(1),
      nowIso: NOW,
    })!
    // 20 Konzepte * 6 min = 120 min = 2 Stunden, nicht die eingetragene eine.
    expect(describeSprintScope(plan, 40)).toContain('2 Stunden')
  })

  it('die Haltbarkeitswarnung trennt Termin und Zeit danach', () => {
    const plan = planSprintScope({
      concepts: concepts(40),
      edges: [],
      images: new Map(),
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })!
    const text = describeRetention(plan)
    expect(text).toContain('Fuer den Termin reicht das')
    expect(text).toContain('einen Durchgang')
    expect(text).toContain('zweites Ziel')
  })
})

describe('sprintHeadroom', () => {
  it('meldet den Umfang als erledigt, sobald alle Zielkonzepte sitzen', () => {
    const all = concepts(30)
    const scope = ['c1', 'c2', 'c3']
    const headroom = sprintHeadroom({
      concepts: all,
      edges: [],
      images: images(scope.map(settled)),
      goalConceptIds: scope,
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })

    expect(headroom.isScopeComplete).toBe(true)
    // Und es steht noch etwas bereit, das zurueckgeholt werden koennte.
    expect(headroom.conceptIds.length).toBeGreaterThan(0)
    expect(headroom.conceptIds).not.toContain('c1')
  })

  it('meldet offen, solange ein Zielkonzept noch Arbeit braucht', () => {
    const all = concepts(30)
    const headroom = sprintHeadroom({
      concepts: all,
      edges: [],
      images: images([settled('c1')]),
      goalConceptIds: ['c1', 'c2'],
      minutesPerDay: 60,
      dueAt: inDays(2),
      nowIso: NOW,
    })

    expect(headroom.isScopeComplete).toBe(false)
  })
})
