/**
 * Propagation (Kapitel 4.3) — Tests.
 *
 * Zwei Dinge stehen hier auf dem Spiel und werden entsprechend hart geprueft:
 *  - Invariante I3: die Beherrschung bleibt unberuehrt, egal was passiert.
 *  - Die Begrenzung: ein einzelner Fehler darf nicht das halbe Lernerbild einreissen.
 */

import { describe, expect, it } from 'vitest'
import type { BrainPrerequisiteEdge, LearnerConceptImage } from '../types'
import { emptyImage } from './learnerImage'
import {
  applyConfidenceAdjustment,
  applyPropagation,
  propagateDoubt,
  shouldPropagate,
  PROPAGATION_FORWARD_FACTOR,
  PROPAGATION_MAX_DISTANCE,
} from './propagation'

/** Kette a -> b -> c -> d -> e (a ist Voraussetzung fuer b, usw.). */
function chain(ids: string[]): BrainPrerequisiteEdge[] {
  const edges: BrainPrerequisiteEdge[] = []
  for (let i = 1; i < ids.length; i += 1) {
    edges.push({
      id: `e${i}`,
      pathId: 'p1',
      fromConceptId: ids[i - 1],
      toConceptId: ids[i],
      origin: 'cartographer',
    })
  }
  return edges
}

function imageFor(id: string, overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return { ...emptyImage(id, 3), ...overrides }
}

describe('shouldPropagate', () => {
  it('propagiert bei einem klaren Fehlschlag', () => {
    expect(shouldPropagate(0, 0.9)).toBe(true)
  })

  it('propagiert nicht bei richtiger Antwort', () => {
    expect(shouldPropagate(1, 0.9)).toBe(false)
  })

  it('propagiert nicht, wenn der Pruefer seiner eigenen Bewertung kaum glaubt', () => {
    expect(shouldPropagate(0, 0.2)).toBe(false)
  })
})

describe('propagateDoubt — Richtung', () => {
  const edges = chain(['a', 'b', 'c'])

  it('geht rueckwaerts auf die Voraussetzungen (Ursachensuche)', () => {
    const adjustments = propagateDoubt({ originConceptId: 'c', edges })
    const backward = adjustments.filter((a) => a.direction === 'backward').map((a) => a.conceptId)
    expect(backward).toContain('b')
    expect(backward).toContain('a')
  })

  it('geht vorwaerts auf das Aufbauende (Vorsicht)', () => {
    const adjustments = propagateDoubt({ originConceptId: 'a', edges })
    const forward = adjustments.filter((a) => a.direction === 'forward').map((a) => a.conceptId)
    expect(forward).toContain('b')
    expect(forward).toContain('c')
  })

  it('wirkt vorwaerts schwaecher als rueckwaerts', () => {
    const backward = propagateDoubt({ originConceptId: 'c', edges }).find(
      (a) => a.conceptId === 'b' && a.direction === 'backward',
    )
    const forward = propagateDoubt({ originConceptId: 'a', edges }).find(
      (a) => a.conceptId === 'b' && a.direction === 'forward',
    )
    expect(backward?.penalty).toBeGreaterThan(forward?.penalty ?? 0)
    expect(forward?.penalty).toBeCloseTo((backward?.penalty ?? 0) * PROPAGATION_FORWARD_FACTOR, 6)
  })
})

describe('propagateDoubt — Begrenzung', () => {
  it('stoppt nach hoechstens zwei Kanten', () => {
    const edges = chain(['a', 'b', 'c', 'd', 'e'])
    const adjustments = propagateDoubt({ originConceptId: 'e', edges })
    expect(adjustments.every((a) => a.distance <= PROPAGATION_MAX_DISTANCE)).toBe(true)
    // 'b' liegt drei Kanten entfernt und darf nicht mehr erreicht werden.
    expect(adjustments.map((a) => a.conceptId)).not.toContain('b')
  })

  it('daempft mit jedem Schritt', () => {
    const edges = chain(['a', 'b', 'c'])
    const adjustments = propagateDoubt({ originConceptId: 'c', edges })
    const first = adjustments.find((a) => a.conceptId === 'b')
    const second = adjustments.find((a) => a.conceptId === 'a')
    expect(second?.penalty).toBeLessThan(first?.penalty ?? 0)
  })

  it('skaliert mit der Staerke der Ausgangsbeobachtung', () => {
    const edges = chain(['a', 'b'])
    const strong = propagateDoubt({ originConceptId: 'b', edges, strength: 1 })[0]
    const weak = propagateDoubt({ originConceptId: 'b', edges, strength: 0.3 })[0]
    expect(weak.penalty).toBeLessThan(strong.penalty)
  })

  it('laeuft in einem Zyklus nicht endlos', () => {
    const edges: BrainPrerequisiteEdge[] = [
      { id: 'e1', pathId: 'p', fromConceptId: 'a', toConceptId: 'b', origin: 'cartographer' },
      { id: 'e2', pathId: 'p', fromConceptId: 'b', toConceptId: 'a', origin: 'cartographer' },
    ]
    const adjustments = propagateDoubt({ originConceptId: 'a', edges })
    expect(adjustments.length).toBeLessThanOrEqual(2)
  })

  it('beruehrt jeden Nachbarn hoechstens einmal, auch bei mehreren Pfaden', () => {
    const edges: BrainPrerequisiteEdge[] = [
      { id: 'e1', pathId: 'p', fromConceptId: 'root', toConceptId: 'left', origin: 'cartographer' },
      { id: 'e2', pathId: 'p', fromConceptId: 'root', toConceptId: 'right', origin: 'cartographer' },
      { id: 'e3', pathId: 'p', fromConceptId: 'left', toConceptId: 'target', origin: 'cartographer' },
      { id: 'e4', pathId: 'p', fromConceptId: 'right', toConceptId: 'target', origin: 'cartographer' },
    ]
    const adjustments = propagateDoubt({ originConceptId: 'target', edges })
    const rootHits = adjustments.filter((a) => a.conceptId === 'root')
    expect(rootHits).toHaveLength(1)
  })
})

describe('Invariante I3 — nur die Sicherheit bewegt sich', () => {
  it('laesst die Beherrschung bei einem Abschlag unveraendert', () => {
    const image = imageFor('b', { mastery: 0.82, confidence: 0.7 })
    const next = applyConfidenceAdjustment(image, {
      conceptId: 'b',
      penalty: 0.3,
      direction: 'backward',
      distance: 1,
      marksReview: true,
      reason: 'Test',
    })
    expect(next.mastery).toBe(0.82)
    expect(next.confidence).toBe(0.7)
    expect(next.propagationConfidencePenalty).toBeCloseTo(0.3, 6)
  })

  it('markiert den Knoten als ueberpruefungsbeduerftig — das aktiviert den Planer', () => {
    const next = applyConfidenceAdjustment(imageFor('b'), {
      conceptId: 'b',
      penalty: 0.3,
      direction: 'backward',
      distance: 1,
      marksReview: true,
      reason: 'Bei „X" ist etwas schiefgegangen.',
    })
    expect(next.reviewNeeded).toBe(true)
    expect(next.reviewReason).toContain('X')
  })

  it('addiert mehrere Abschlaege, gedeckelt bei eins', () => {
    let image = imageFor('b')
    for (let i = 0; i < 10; i += 1) {
      image = applyConfidenceAdjustment(image, {
        conceptId: 'b',
        penalty: 0.3,
        direction: 'backward',
        distance: 1,
        marksReview: false,
        reason: '',
      })
    }
    expect(image.propagationConfidencePenalty).toBe(1)
  })
})

describe('applyPropagation', () => {
  it('erfindet keinen Zustand fuer nie beruehrte Konzepte', () => {
    const images = new Map<string, LearnerConceptImage>([['b', imageFor('b')]])
    const touched = applyPropagation(images, [
      { conceptId: 'b', penalty: 0.2, direction: 'backward', distance: 1, marksReview: true, reason: '' },
      { conceptId: 'unbekannt', penalty: 0.2, direction: 'backward', distance: 1, marksReview: true, reason: '' },
    ])
    expect(touched).toHaveLength(1)
    expect(touched[0].conceptId).toBe('b')
  })
})
