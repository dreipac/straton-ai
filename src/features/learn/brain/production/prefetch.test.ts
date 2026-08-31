/**
 * Vorproduktion (Kapitel 7.1) — Tests.
 *
 * Der Sinn der Versetzung ist, Echtzeit zu behalten UND die Wartezeit loszuwerden. Der Test, an
 * dem sich das entscheidet, ist der auf die ueberholte Vorproduktion: wird sie ausgeliefert,
 * ist es Vorratsproduktion mit Extraschritten.
 */

import { describe, expect, it } from 'vitest'
import type { GeneratedTask, PlannedTask } from '../types'
import {
  afterDelivery,
  afterProduction,
  fingerprintOf,
  initialPrefetchState,
  nextPrefetchDecision,
  prefetchIsStale,
  waitIsExpected,
  type PrefetchedTask,
} from './prefetch'

function planned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    conceptId: 'c1',
    claim: 'review',
    urgency: 0.8,
    reason: 'Das faengt an zu verblassen.',
    urgencyBreakdown: {},
    depth: 'apply',
    format: 'calculation',
    fromReviewReserve: false,
    ...overrides,
  }
}

function generated(): GeneratedTask {
  return {
    conceptId: 'c1',
    format: 'calculation',
    depth: 'apply',
    difficulty: 3,
    prompt: 'Frage?',
    expectedAnswer: 'Antwort',
    sourceGrounding: 'Skript S. 1',
    reason: 'Das faengt an zu verblassen.',
  }
}

function prefetched(fingerprint: string): PrefetchedTask {
  return {
    planned: planned(),
    task: generated(),
    basisFingerprint: fingerprint,
    producedAt: '2026-08-18T10:00:00.000Z',
  }
}

describe('Fingerabdruck der Entscheidungsgrundlage', () => {
  it('ist bei gleicher Lage gleich', () => {
    expect(fingerprintOf(planned(), 3)).toBe(fingerprintOf(planned(), 3))
  })

  it('aendert sich, sobald eine neue Beobachtung eingelaufen ist', () => {
    expect(fingerprintOf(planned(), 3)).not.toBe(fingerprintOf(planned(), 4))
  })

  it('aendert sich bei anderem Konzept, anderer Tiefe oder anderem Format', () => {
    const base = fingerprintOf(planned(), 3)
    expect(fingerprintOf(planned({ conceptId: 'c2' }), 3)).not.toBe(base)
    expect(fingerprintOf(planned({ depth: 'transfer' }), 3)).not.toBe(base)
    expect(fingerprintOf(planned({ format: 'clozeCalculation' }), 3)).not.toBe(base)
  })
})

describe('Ablaufentscheidung', () => {
  it('produziert das allererste Element blockierend', () => {
    const decision = nextPrefetchDecision({ state: initialPrefetchState(), currentFingerprint: 'f1' })
    expect(decision.action).toBe('produceBlocking')
  })

  it('liefert eine gueltige Vorproduktion sofort aus und stoesst die naechste an', () => {
    const state = { ...initialPrefetchState(), upcoming: prefetched('f1') }
    const decision = nextPrefetchDecision({ state, currentFingerprint: 'f1' })
    expect(decision.action).toBe('deliverAndPrefetch')
  })

  it('verwirft eine ueberholte Vorproduktion, statt sie auszuliefern', () => {
    const state = { ...initialPrefetchState(), upcoming: prefetched('f1') }
    const decision = nextPrefetchDecision({ state, currentFingerprint: 'f2' })
    expect(decision.action).toBe('discardAndProduceBlocking')
  })

  it('wartet, statt einen zweiten Auftrag zu starten', () => {
    const state = { ...initialPrefetchState(), producing: true }
    expect(nextPrefetchDecision({ state, currentFingerprint: 'f1' }).action).toBe('wait')
  })

  it('erkennt eine ueberholte Vorproduktion direkt', () => {
    expect(prefetchIsStale(prefetched('f1'), 'f1')).toBe(false)
    expect(prefetchIsStale(prefetched('f1'), 'f2')).toBe(true)
  })
})

describe('Zustandsuebergaenge', () => {
  it('macht das gelieferte Element zum aktuellen und startet die naechste Produktion', () => {
    const delivered = prefetched('f1')
    const next = afterDelivery(initialPrefetchState(), delivered)
    expect(next.current).toBe(delivered)
    expect(next.upcoming).toBeNull()
    expect(next.producing).toBe(true)
    expect(next.delivered).toBe(1)
  })

  it('legt eine fertige Produktion bereit', () => {
    const state = { ...initialPrefetchState(), producing: true }
    const next = afterProduction(state, prefetched('f1'))
    expect(next.upcoming).not.toBeNull()
    expect(next.producing).toBe(false)
  })

  it('kommt mit einer fehlgeschlagenen Produktion zurecht', () => {
    const next = afterProduction({ ...initialPrefetchState(), producing: true }, null)
    expect(next.upcoming).toBeNull()
    expect(next.producing).toBe(false)
  })
})

describe('Sichtbare Wartezeit', () => {
  it('ist nur beim allerersten Element erwartbar', () => {
    expect(waitIsExpected(initialPrefetchState())).toBe(true)
    expect(waitIsExpected(afterDelivery(initialPrefetchState(), prefetched('f1')))).toBe(false)
  })
})
