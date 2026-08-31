/**
 * Vorratserzeugung fuer Wiederholungsabfragen (Kapitel 7.1) — Tests.
 *
 * Zwei Dinge stehen hier auf dem Spiel. Erstens die Wirksamkeit: ein Vorrat, der bei jedem
 * Aufruf fuer ungueltig erklaert wird, ist Echtzeit mit Zwischenschritt. Zweitens die Grenze der
 * Ausnahme: sie gilt fuer den Stapel und sonst nirgends.
 */

import { describe, expect, it } from 'vitest'
import type { GeneratedTask, LearnerConceptImage } from '../types'
import { emptyImage } from '../memory/learnerImage'
import {
  assertReviewOnly,
  buildStock,
  nextFromStock,
  reviewStackFormats,
  stockFingerprintOf,
  stockIsStale,
  topUpStock,
  REVIEW_STOCK_SIZE,
} from './reviewStock'

const NOW = '2026-08-19T10:00:00.000Z'

function image(overrides: Partial<LearnerConceptImage> = {}): LearnerConceptImage {
  return {
    ...emptyImage('c1', 3),
    mastery: 0.8,
    confidence: 0.7,
    directEvidenceCount: 5,
    directEvidenceWeight: 5,
    everConsolidated: true,
    lastSeenAt: '2026-08-01T10:00:00.000Z',
    lastDirectEvidenceAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

function task(prompt: string): GeneratedTask {
  return {
    conceptId: 'c1',
    format: 'multipleChoice',
    depth: 'recognize',
    difficulty: 2,
    prompt,
    expectedAnswer: 'A',
    sourceGrounding: 'Skript S. 4',
    reason: 'Das faengt an zu verblassen.',
  }
}

function stockOf(count = REVIEW_STOCK_SIZE, img = image()) {
  return buildStock({
    conceptId: 'c1',
    tasks: Array.from({ length: count }, (_, i) => task(`Frage ${i}`)),
    image: img,
    nowIso: NOW,
  })
}

describe('Gueltigkeit des Vorrats', () => {
  it('bleibt gueltig, solange sich im Lernerbild nichts aendert', () => {
    const img = image()
    expect(stockIsStale(stockOf(REVIEW_STOCK_SIZE, img), img)).toBe(false)
  })

  it('wird nach neuer Evidenz neu erzeugt', () => {
    const stock = stockOf()
    const nachher = image({ directEvidenceCount: 6, mastery: 0.85 })
    expect(stockIsStale(stock, nachher)).toBe(true)
    expect(nextFromStock(stock, nachher).action).toBe('regenerate')
  })

  it('verfaellt NICHT durch blossen Zeitablauf', () => {
    /*
     * Der entscheidende Test dieser Datei. Ginge der Verfall in den Fingerabdruck ein, waere der
     * Vorrat bei jedem Aufruf ueberholt — die Ausnahme aus 7.1 waere formal umgesetzt und
     * praktisch wirkungslos, und der Nutzer wartete wieder zwischen jeder Abfrage.
     */
    const img = image()
    const stock = stockOf(REVIEW_STOCK_SIZE, img)
    expect(stockFingerprintOf(img)).toBe(stockFingerprintOf({ ...img, lastSeenAt: '2026-05-01T10:00:00.000Z' }))
    expect(stockIsStale(stock, { ...img, lastSeenAt: '2026-05-01T10:00:00.000Z' })).toBe(false)
  })

  it('bemerkt einen Sprung der Beherrschung, nicht aber ein Tausendstel', () => {
    const img = image({ mastery: 0.8 })
    const stock = stockOf(REVIEW_STOCK_SIZE, img)
    expect(stockIsStale(stock, image({ mastery: 0.801 }))).toBe(false)
    expect(stockIsStale(stock, image({ mastery: 0.6 }))).toBe(true)
  })
})

describe('Rotation', () => {
  it('spielt zuerst aus, was am laengsten nicht dran war', () => {
    let stock = stockOf(3)
    const gesehen: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const decision = nextFromStock(stock, image())
      if (decision.action === 'regenerate') {
        throw new Error('unerwartet')
      }
      gesehen.push(decision.item.task.prompt)
      stock = decision.next
    }
    // Drei Durchgaenge, drei verschiedene Formulierungen — die Person lernt das Konzept,
    // nicht die Karte (UI-Spezifikation 5.2).
    expect(new Set(gesehen).size).toBe(3)
  })

  it('ist deterministisch', () => {
    const a = nextFromStock(stockOf(), image())
    const b = nextFromStock(stockOf(), image())
    expect(a.action).toBe(b.action)
    if (a.action !== 'regenerate' && b.action !== 'regenerate') {
      expect(a.item.task.prompt).toBe(b.item.task.prompt)
    }
  })

  it('verlangt Nachschub, bevor der Vorrat leer ist', () => {
    const decision = nextFromStock(stockOf(1), image())
    expect(decision.action).toBe('serveAndRefill')
    if (decision.action === 'serveAndRefill') {
      expect(decision.missing).toBe(REVIEW_STOCK_SIZE - 1)
    }
  })

  it('fuellt nach, ohne die Ausspielzaehler zu verlieren', () => {
    let stock = stockOf(2)
    const served = nextFromStock(stock, image())
    if (served.action === 'regenerate') {
      throw new Error('unerwartet')
    }
    stock = topUpStock(served.next, [task('Frage neu')])
    expect(stock.items).toHaveLength(3)
    expect(stock.items.some((entry) => entry.timesServed === 1)).toBe(true)
  })

  it('erzeugt neu, wenn gar kein Vorrat da ist', () => {
    expect(nextFromStock(null, image()).action).toBe('regenerate')
  })
})

describe('Die Ausnahme bleibt eine Ausnahme', () => {
  it('laesst den Stapel durch', () => {
    expect(() => assertReviewOnly({ depth: 'recognize', fromReviewStack: true })).not.toThrow()
  })

  it('verweigert Vorratserzeugung fuer Pfadaufgaben', () => {
    // Kapitel 7.1, letzter Satz: „Alle Aufgaben im Pfad bleiben Echtzeit."
    expect(() => assertReviewOnly({ depth: 'recognize', fromReviewStack: false })).toThrow(/Echtzeit/)
  })

  it('verweigert tiefere Stufen auch innerhalb des Stapels', () => {
    expect(() => assertReviewOnly({ depth: 'transfer', fromReviewStack: true })).toThrow(/6\.7/)
  })

  it('bietet im Stapel nur Erkennen-Formate an', () => {
    expect(reviewStackFormats()).toEqual(['multipleChoice', 'shortAnswer', 'matching'])
  })
})
