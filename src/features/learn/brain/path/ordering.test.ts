/**
 * Vom Netz zum Pfad (Kapitel 11) — Tests.
 *
 * Die zentrale Eigenschaft, die hier geprueft wird: die Strecke haelt still. Ein Einschub oder
 * eine Aufspaltung darf keine bestehende Position verschieben und den Fortschrittsnenner nicht
 * antasten — sonst wird jede Fortschrittsanzeige bedeutungslos, und mit ihr die Mastery-Anzeige.
 */

import { describe, expect, it } from 'vitest'
import type { BrainConcept, BrainPrerequisiteEdge, LearnerConceptImage, PathOrderEntry } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  appendNewConcepts,
  buildBaseOrder,
  buildOverview,
  focusWindow,
  insertRemediation,
  pathProgressView,
  positionBefore,
  reflowAfterMerge,
  reflowAfterSplit,
} from './ordering'

const NOW = '2026-08-18T10:00:00.000Z'

function concept(id: string, difficulty = 3, ordinal = 0): BrainConcept {
  return {
    id,
    pathId: 'p1',
    slug: id,
    name: `Konzept ${id}`,
    description: '',
    difficulty,
    origin: 'material',
    sourceRef: {},
    sourceQuote: 'Beleg',
    ordinal,
  }
}

function edge(from: string, to: string): BrainPrerequisiteEdge {
  return { id: `${from}->${to}`, pathId: 'p1', fromConceptId: from, toConceptId: to, origin: 'cartographer' }
}

const CONCEPTS = [concept('a', 1, 0), concept('b', 2, 1), concept('c', 3, 2)]
const EDGES = [edge('a', 'b'), edge('b', 'c')]

function mastered(id: string): LearnerConceptImage {
  return { ...emptyImage(id, 3), mastery: 0.9, lastSeenAt: NOW }
}

describe('Grundordnung', () => {
  it('folgt den Voraussetzungen', () => {
    const order = buildBaseOrder(CONCEPTS, EDGES)
    expect(order.map((e) => e.conceptId)).toEqual(['a', 'b', 'c'])
  })

  it('laesst Luecken zwischen den Positionen — dort passen spaeter Einschuebe hinein', () => {
    const order = buildBaseOrder(CONCEPTS, EDGES)
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].position - order[i - 1].position).toBeGreaterThan(1)
    }
  })

  it('markiert alles als Grundstrecke', () => {
    expect(buildBaseOrder(CONCEPTS, EDGES).every((e) => e.kind === 'base')).toBe(true)
  })
})

describe('Einschuebe', () => {
  const order = buildBaseOrder(CONCEPTS, EDGES)

  it('findet eine freie Position vor einem Eintrag', () => {
    const position = positionBefore(order, 'c')
    expect(position).toBeGreaterThan(order[1].position)
    expect(position).toBeLessThan(order[2].position)
  })

  it('setzt den Umweg unmittelbar vor das ausloesende Konzept', () => {
    const next = insertRemediation({
      entries: order,
      conceptId: 'zwischen',
      beforeConceptId: 'c',
      conceptName: 'Zweierpotenzen',
      triggeredByName: 'Konzept c',
    })
    const ids = next.map((e) => e.conceptId)
    expect(ids.indexOf('zwischen')).toBe(ids.indexOf('c') - 1)
  })

  it('markiert den Einschub und begruendet ihn — sonst wirkt der wachsende Pfad wie ein Fehler', () => {
    const next = insertRemediation({
      entries: order,
      conceptId: 'zwischen',
      beforeConceptId: 'c',
      conceptName: 'Zweierpotenzen',
      triggeredByName: 'VLSM',
    })
    const inserted = next.find((e) => e.conceptId === 'zwischen')
    expect(inserted?.kind).toBe('insert')
    expect(inserted?.insertReason).toMatch(/Zweierpotenzen/)
    expect(inserted?.insertReason).toMatch(/VLSM/)
  })

  it('verschiebt keine bestehende Position — die Strecke haelt still', () => {
    const before = new Map(order.map((e) => [e.conceptId, e.position]))
    const next = insertRemediation({
      entries: order,
      conceptId: 'zwischen',
      beforeConceptId: 'c',
      conceptName: 'X',
      triggeredByName: 'Y',
    })
    for (const entry of next) {
      if (before.has(entry.conceptId)) {
        expect(entry.position).toBe(before.get(entry.conceptId))
      }
    }
  })

  it('dupliziert ein bereits vorhandenes Konzept nicht, sondern zieht es vor', () => {
    const next = insertRemediation({
      entries: order,
      conceptId: 'a',
      beforeConceptId: 'c',
      conceptName: 'A',
      triggeredByName: 'C',
    })
    expect(next.filter((e) => e.conceptId === 'a')).toHaveLength(1)
  })
})

describe('Nachziehen nach Strukturumbau (Kapitel 11, Auflage)', () => {
  const order = buildBaseOrder(CONCEPTS, EDGES)

  it('setzt aufgespaltene Konzepte an die Stelle des alten, nicht hinten an', () => {
    const next = reflowAfterSplit({ entries: order, sourceConceptId: 'b', createdConceptIds: ['b1', 'b2'] })
    const ids = next.map((e) => e.conceptId)
    expect(ids).toEqual(['a', 'b1', 'b2', 'c'])
  })

  it('entfernt den alten Knoten nach der Aufspaltung', () => {
    const next = reflowAfterSplit({ entries: order, sourceConceptId: 'b', createdConceptIds: ['b1', 'b2'] })
    expect(next.find((e) => e.conceptId === 'b')).toBeUndefined()
  })

  it('nimmt den verschwundenen Knoten nach einer Verschmelzung aus dem Pfad', () => {
    const next = reflowAfterMerge(order, 'b')
    expect(next.map((e) => e.conceptId)).toEqual(['a', 'c'])
  })

  it('haengt neu eingelesene Konzepte an, ohne bestehende zu verschieben', () => {
    const extended = appendNewConcepts(order, [...CONCEPTS, concept('d', 4, 3)], [...EDGES, edge('c', 'd')])
    expect(extended.map((e) => e.conceptId)).toEqual(['a', 'b', 'c', 'd'])
    expect(extended[0].position).toBe(order[0].position)
  })
})

describe('Fortschritt gegen die stabile Grundstrecke', () => {
  const order = buildBaseOrder(CONCEPTS, EDGES)

  it('zaehlt nur Grundeintraege im Nenner', () => {
    const withInsert = insertRemediation({
      entries: order,
      conceptId: 'umweg',
      beforeConceptId: 'c',
      conceptName: 'Umweg',
      triggeredByName: 'C',
    })
    const view = pathProgressView({ entries: withInsert, images: new Map([['a', mastered('a')]]), nowIso: NOW })
    expect(view.baseTotal).toBe(3)
    expect(view.insertTotal).toBe(1)
  })

  it('laesst die Prozentzahl durch einen Einschub nicht fallen', () => {
    const images = new Map([['a', mastered('a')]])
    const before = pathProgressView({ entries: order, images, nowIso: NOW })
    const withInsert = insertRemediation({
      entries: order,
      conceptId: 'umweg',
      beforeConceptId: 'c',
      conceptName: 'Umweg',
      triggeredByName: 'C',
    })
    const after = pathProgressView({ entries: withInsert, images, nowIso: NOW })
    expect(after.ratio).toBe(before.ratio)
  })

  it('weist Einschuebe getrennt aus, statt sie zu verstecken', () => {
    const withInsert = insertRemediation({
      entries: order,
      conceptId: 'umweg',
      beforeConceptId: 'c',
      conceptName: 'Umweg',
      triggeredByName: 'C',
    })
    const view = pathProgressView({ entries: withInsert, images: new Map([['umweg', mastered('umweg')]]), nowIso: NOW })
    expect(view.insertMastered).toBe(1)
    expect(view.baseMastered).toBe(0)
  })
})

describe('Ueberblick und Fokus', () => {
  const order: PathOrderEntry[] = buildBaseOrder(
    [concept('a'), concept('b'), concept('c'), concept('d')],
    [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')],
  )
  const groupOf = new Map([
    ['a', { id: 't1', label: 'Grundlagen' }],
    ['b', { id: 't1', label: 'Grundlagen' }],
    ['c', { id: 't2', label: 'Vertiefung' }],
    ['d', { id: 't2', label: 'Vertiefung' }],
  ])

  it('verdichtet zu Gruppen statt jedes Konzept einzeln zu zeigen', () => {
    const overview = buildOverview({ entries: order, groupOf, images: new Map(), nowIso: NOW })
    expect(overview).toHaveLength(2)
    expect(overview[0].conceptIds).toEqual(['a', 'b'])
  })

  it('rechnet den Fortschritt je Gruppe', () => {
    const overview = buildOverview({
      entries: order,
      groupOf,
      images: new Map([['a', mastered('a')]]),
      nowIso: NOW,
    })
    expect(overview[0].ratio).toBe(0.5)
  })

  it('macht Einschuebe im Ueberblick sichtbar', () => {
    const withInsert = insertRemediation({
      entries: order,
      conceptId: 'umweg',
      beforeConceptId: 'c',
      conceptName: 'Umweg',
      triggeredByName: 'C',
    })
    const overview = buildOverview({
      entries: withInsert,
      groupOf: new Map([...groupOf, ['umweg', { id: 't2', label: 'Vertiefung' }]]),
      images: new Map(),
      nowIso: NOW,
    })
    const vertiefung = overview.find((g) => g.groupId === 't2')
    expect(vertiefung?.insertConceptIds).toEqual(['umweg'])
  })

  it('sortiert Konzepte ohne Gruppe in einen eigenen Sammeleintrag', () => {
    const overview = buildOverview({ entries: order, groupOf: new Map(), images: new Map(), nowIso: NOW })
    expect(overview).toHaveLength(1)
    expect(overview[0].groupId).toBe('ungrouped')
  })

  it('zeigt im Arbeitsbereich den aktuellen Abschnitt in voller Aufloesung', () => {
    const window = focusWindow({ entries: order, currentConceptId: 'c', size: 3 })
    expect(window.map((e) => e.conceptId)).toEqual(['b', 'c', 'd'])
  })

  it('startet ohne aktuelles Konzept am Anfang', () => {
    const window = focusWindow({ entries: order, currentConceptId: null, size: 2 })
    expect(window.map((e) => e.conceptId)).toEqual(['a', 'b'])
  })
})
