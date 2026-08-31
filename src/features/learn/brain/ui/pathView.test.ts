/**
 * Anbindung Lernpfad-Bereich — Tests gegen UI-Spezifikation Kapitel 3 und 15.
 *
 * Geprueft wird nicht das Aussehen, sondern die Zuordnung: kommt jedes Feld aus der Komponente,
 * die Kapitel 15 dafuer nennt, und halten die verbindlichen Regeln aus 3.5 und 3.6.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, LearnerConceptImage, LearningGoal, PathOrderEntry } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  buildNode,
  buildNodePanel,
  buildNowCard,
  buildPathHeader,
  confidenceWord,
  groupIntoTopics,
  nodeStateFor,
  provenanceLine,
  VALUE_EXPLANATION,
} from './pathView'

const NOW = '2026-08-19T10:00:00.000Z'
const RECENT = '2026-08-18T10:00:00.000Z'
const LONG_AGO = '2026-06-01T10:00:00.000Z'

function concept(id: string, overrides: Partial<BrainConcept> = {}): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: `Konzept ${id}`,
    description: '',
    difficulty: 3,
    origin: 'material',
    sourceRef: { section: 'Adressierung', pageFrom: 12 },
    sourceQuote: 'Ein Subnetz teilt ein Netz.',
    ordinal: 0,
    ...overrides,
  }
}

function settled(id: string): LearnerConceptImage {
  return {
    ...emptyImage(id, 3),
    mastery: 0.85,
    confidence: 0.7,
    directEvidenceCount: 6,
    directEvidenceWeight: 6,
    everConsolidated: true,
    lastSeenAt: RECENT,
    lastDirectEvidenceAt: RECENT,
    nextReviewAt: '2026-09-01T10:00:00.000Z',
  }
}

describe('Lernpfad-Kopf (Kapitel 3.1)', () => {
  it('rechnet den Fortschritt nur aus bearbeiteten Konzepten hoch', () => {
    /*
     * Der wichtigste Test dieser Datei. `emptyImage` setzt einen kalten Startwert von 0.2 bis 0.4
     * — wuerde er mitgerechnet, zeigte ein frisch angelegter Pfad rund 30 Prozent Fortschritt,
     * ohne dass jemand eine Aufgabe geloest hat. Der Ring ist die Zahl, an der der Nutzer das
     * ganze Produkt misst.
     */
    const header = buildPathHeader({
      concepts: [concept('a'), concept('b'), concept('c')],
      images: new Map([
        ['a', emptyImage('a', 3)],
        ['b', emptyImage('b', 1)],
        ['c', emptyImage('c', 5)],
      ]),
      goal: null,
      nowIso: NOW,
    })
    expect(header.progress).toBe(0)
  })

  it('liefert die Kurzstatistik als fertigen Satz', () => {
    const header = buildPathHeader({
      concepts: [concept('a'), concept('b')],
      images: new Map([['a', settled('a')]]),
      goal: null,
      nowIso: NOW,
    })
    expect(header.summary).toBe('2 Konzepte · 1 gefestigt · 0 fällig')
  })

  it('zaehlt hohe Beherrschung ohne Sicherheit NICHT als gefestigt', () => {
    // Genau der Fall, den die Trennung der beiden Werte sichtbar machen soll (Architektur 4.2).
    const unbelegt = { ...settled('a'), confidence: 0.1, directEvidenceCount: 1, directEvidenceWeight: 0.5 }
    const header = buildPathHeader({
      concepts: [concept('a')],
      images: new Map([['a', unbelegt]]),
      goal: null,
      nowIso: NOW,
    })
    expect(header.settledCount).toBe(0)
  })

  it('bietet ohne Ziel den Einstieg an', () => {
    const header = buildPathHeader({ concepts: [], images: new Map(), goal: null, nowIso: NOW })
    expect(header.goalChip).toEqual({ state: 'unset', label: 'Ziel setzen' })
  })

  it('macht den Ziel-Chip funktional statt dekorativ', () => {
    const goal: LearningGoal = {
      id: 'g1',
      userId: 'u1',
      pathId: 'p1',
      title: 'Pruefung Freitag',
      dueAt: '2026-08-21T10:00:00.000Z',
      conceptIds: ['a', 'b'],
      minutesPerDay: 40,
      status: 'active',
    }
    const header = buildPathHeader({
      concepts: [concept('a'), concept('b')],
      images: new Map(),
      goal,
      nowIso: NOW,
    })

    expect(header.goalChip.state).toBe('set')
    if (header.goalChip.state === 'set') {
      // Termin, Umfang und Machbarkeit — ohne die drei laesst sich die Zielsteuerung nicht ausloesen.
      expect(header.goalChip.label).toContain('Pruefung Freitag')
      expect(header.goalChip.label).toContain('2 Konzepte')
      expect(header.goalChip.detail.length).toBeGreaterThan(20)
    }
  })
})

describe('Jetzt-Karte (Kapitel 3.3)', () => {
  const names = new Map([['a', 'Binaerumrechnung']])

  it('uebernimmt die Begruendung des Planers unveraendert (I8)', () => {
    const card = buildNowCard({
      tasks: [
        {
          conceptId: 'a',
          claim: 'review',
          urgency: 0.8,
          reason: 'Das war 19 Tage unangetastet und faengt an zu verfallen.',
          urgencyBreakdown: {},
          depth: 'recognize',
          format: 'multipleChoice',
          fromReviewReserve: false,
        },
      ],
      conceptNames: names,
    })
    expect(card?.reason).toBe('Das war 19 Tage unangetastet und faengt an zu verfallen.')
  })

  it('leitet die Ausloeserart aus dem Anspruch ab', () => {
    const trigger = (claim: 'review' | 'rootCause' | 'goal' | 'motivation') =>
      buildNowCard({
        tasks: [
          {
            conceptId: 'a',
            claim,
            urgency: 0.5,
            reason: 'x',
            urgencyBreakdown: {},
            depth: 'recognize',
            format: 'multipleChoice',
            fromReviewReserve: false,
          },
        ],
        conceptNames: names,
      })?.trigger

    expect(trigger('review')).toBe('review')
    // Die Ursachensuche ist genau das, was sich im Pfad als Einschub zeigt.
    expect(trigger('rootCause')).toBe('insert')
    expect(trigger('goal')).toBe('goal')
    expect(trigger('motivation')).toBe('regular')
  })

  it('liefert nichts, wenn der Planer nichts liefert', () => {
    expect(buildNowCard({ tasks: [], conceptNames: names })).toBeNull()
  })
})

describe('Knotenzustaende (Kapitel 3.5, verbindlich)', () => {
  it('zeigt ein unberuehrtes Konzept als offen', () => {
    expect(nodeStateFor({ image: undefined, isCurrent: false, nowIso: NOW })).toBe('open')
    expect(nodeStateFor({ image: emptyImage('a', 3), isCurrent: false, nowIso: NOW })).toBe('open')
  })

  it('laesst „jetzt dran" gegen alles gewinnen', () => {
    // Sonst staende der Knoten, an dem gerade gearbeitet wird, gleichzeitig als „faellig" daneben.
    const faellig = { ...settled('a'), nextReviewAt: LONG_AGO, lastSeenAt: LONG_AGO }
    expect(nodeStateFor({ image: faellig, isCurrent: true, nowIso: NOW })).toBe('current')
  })

  it('zeigt einen Propagationsverdacht als unsicher', () => {
    const verdacht = { ...settled('a'), reviewNeeded: true, reviewReason: 'Zweifel' }
    expect(nodeStateFor({ image: verdacht, isCurrent: false, nowIso: NOW })).toBe('uncertain')
  })

  it('zeigt niedrige Sicherheit als unsicher, auch bei hoher Beherrschung', () => {
    const unbelegt = { ...settled('a'), confidence: 0.1 }
    expect(nodeStateFor({ image: unbelegt, isCurrent: false, nowIso: NOW })).toBe('uncertain')
  })

  it('markiert Einschuebe und rueckt sie ein', () => {
    const order: PathOrderEntry = {
      conceptId: 'a',
      position: 150,
      kind: 'insert',
      insertReason: 'Deine Fehler kommen aus den Zweierpotenzen.',
    }
    const node = buildNode({ concept: concept('a'), image: settled('a'), order, isCurrent: false, nowIso: NOW })
    expect(node.badges).toContain('insert')
    expect(node.indented).toBe(true)
    expect(node.insertReason).toContain('Zweierpotenzen')
  })

  it('markiert von der Konsolidierung ergaenzte Knoten als neu', () => {
    const node = buildNode({
      concept: concept('a'),
      image: undefined,
      order: undefined,
      isCurrent: false,
      newConceptIds: new Set(['a']),
      nowIso: NOW,
    })
    expect(node.badges).toContain('new')
  })
})

describe('Themenliste (Kapitel 3.4)', () => {
  const concepts = [
    concept('a', { sourceRef: { section: 'Grundlagen' }, ordinal: 0 }),
    concept('b', { sourceRef: { section: 'Adressierung' }, ordinal: 1 }),
    concept('c', { sourceRef: { section: 'Adressierung' }, ordinal: 2 }),
  ]

  it('gruppiert nach dem Abschnitt aus der Herkunftsangabe', () => {
    const topics = groupIntoTopics({
      concepts,
      images: new Map(),
      order: [],
      currentConceptId: null,
      nowIso: NOW,
    })
    expect(topics.map((t) => t.title)).toEqual(['Grundlagen', 'Adressierung'])
    expect(topics[1].nodes).toHaveLength(2)
  })

  it('klappt genau das Thema mit dem aktuellen Knoten auf', () => {
    const topics = groupIntoTopics({
      concepts,
      images: new Map(),
      order: [],
      currentConceptId: 'c',
      nowIso: NOW,
    })
    expect(topics.find((t) => t.title === 'Adressierung')?.expandedByDefault).toBe(true)
    expect(topics.find((t) => t.title === 'Grundlagen')?.expandedByDefault).toBe(false)
  })

  it('nennt im Kurzstatus, wo man gerade ist', () => {
    const topics = groupIntoTopics({
      concepts,
      images: new Map([['b', settled('b')]]),
      order: [],
      currentConceptId: 'c',
      nowIso: NOW,
    })
    expect(topics.find((t) => t.title === 'Adressierung')?.status).toBe('1 von 2 · hier bist du gerade')
  })

  it('folgt der Pfadreihenfolge, damit Einschuebe an ihrer Stelle stehen', () => {
    const order: PathOrderEntry[] = [
      { conceptId: 'c', position: 100, kind: 'base', insertReason: '' },
      { conceptId: 'b', position: 200, kind: 'base', insertReason: '' },
    ]
    const topics = groupIntoTopics({
      concepts,
      images: new Map(),
      order,
      currentConceptId: null,
      nowIso: NOW,
    })
    expect(topics.find((t) => t.title === 'Adressierung')?.nodes.map((n) => n.conceptId)).toEqual(['c', 'b'])
  })

  it('faengt Konzepte ohne Abschnitt auf, statt sie zu verlieren', () => {
    const topics = groupIntoTopics({
      concepts: [concept('x', { sourceRef: {} })],
      images: new Map(),
      order: [],
      currentConceptId: null,
      nowIso: NOW,
    })
    expect(topics[0].title).toBe('Weitere Konzepte')
  })
})

describe('Knoten-Panel (Kapitel 3.6)', () => {
  it('zeigt Materialherkunft mit Stelle', () => {
    const line = provenanceLine(concept('a'))
    expect(line.line).toContain('Seite 12')
    expect(line.line).toContain('aus deinem Material')
    expect(line.needsUserCheck).toBe(false)
  })

  it('bittet bei KI-ergaenzten Knoten um Nachpruefung', () => {
    const line = provenanceLine(concept('a', { origin: 'aiSupplement', sourceQuote: '' }))
    expect(line.line).toContain('KI-ergänzt')
    expect(line.needsUserCheck).toBe(true)
  })

  it('gibt Altbestand nicht als Materialherkunft aus (Invariante I4)', () => {
    const line = provenanceLine(concept('a', { origin: 'unknown', sourceQuote: '' }))
    expect(line.line).not.toContain('aus deinem Material')
    expect(line.needsUserCheck).toBe(true)
  })

  it('zeigt die Sicherheit als Wort, nicht als Prozentwert', () => {
    // „sonst liest ein Schueler ‚Sicherheit 18 %' als zweite Note"
    expect(confidenceWord(0.1)).toBe('niedrig')
    expect(confidenceWord(0.5)).toBe('mittel')
    expect(confidenceWord(0.9)).toBe('hoch')
  })

  it('liefert alle drei Werte offen', () => {
    const panel = buildNodePanel({
      concept: concept('a'),
      image: settled('a'),
      concepts: [concept('a')],
      edges: [],
      nowIso: NOW,
    })
    expect(panel.mastery).toBeGreaterThan(0)
    expect(panel.confidenceWord).toBeTruthy()
    expect(panel.depth).toBe('recognize')
  })

  it('nennt die Voraussetzungen namentlich', () => {
    const panel = buildNodePanel({
      concept: concept('b'),
      image: undefined,
      concepts: [concept('a', { name: 'Zweierpotenzen' }), concept('b')],
      edges: [{ id: 'e1', pathId: 'p1', fromConceptId: 'a', toConceptId: 'b', origin: 'cartographer' }],
      nowIso: NOW,
    })
    expect(panel.prerequisites).toEqual([{ conceptId: 'a', name: 'Zweierpotenzen' }])
  })

  it('haelt die Ersterklaerung der drei Werte bereit', () => {
    expect(VALUE_EXPLANATION.map((entry) => entry.term)).toEqual([
      'Beherrschung',
      'Sicherheit',
      'Verständnisstufe',
    ])
    // Der entscheidende Satz: niedrige Sicherheit ist keine zweite Note.
    expect(VALUE_EXPLANATION[1].text).toContain('nicht, dass du es nicht kannst')
  })
})
