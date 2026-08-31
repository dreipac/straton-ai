/**
 * Vergessens-/Verfallsmodell — Schicht 3.
 *
 * Wissen verfaellt. P(Mastery) sinkt zwischen Sessions exponentiell in Richtung eines Bodenwerts,
 * gesteuert durch die individuelle `decayRate` pro Konzept/User. Der Verfall nutzt Server-Zeitstempel
 * (`lastSeenAt`), damit "vergessen" nicht client-manipulierbar ist.
 */

import type { LearnerConceptState } from './types'

/** Unterer Bodenwert: ein einmal gelerntes Konzept verfaellt nie auf 0 (Rest-Erinnerung/Guess-Baseline). */
export const MASTERY_FLOOR = 0.1
export const DEFAULT_DECAY_RATE = 0.08

const MS_PER_DAY = 86_400_000

/** Tage zwischen zwei ISO-Zeitpunkten (>= 0). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0
  }
  return Math.max(0, (to - from) / MS_PER_DAY)
}

/** Exponentieller Verfall von `pMastery` in Richtung MASTERY_FLOOR ueber `elapsedDays`. */
export function applyDecay(pMastery: number, decayRate: number, elapsedDays: number): number {
  if (elapsedDays <= 0 || decayRate <= 0) {
    return pMastery
  }
  if (pMastery <= MASTERY_FLOOR) {
    return pMastery
  }
  return MASTERY_FLOOR + (pMastery - MASTERY_FLOOR) * Math.exp(-decayRate * elapsedDays)
}

/** Verfall eines Konzept-Zustands bis `nowIso` anwenden (nutzt lastSeenAt). Reine Berechnung. */
export function decayedMastery(state: LearnerConceptState, nowIso: string): number {
  if (!state.lastSeenAt) {
    return state.pMastery
  }
  const elapsed = daysBetween(state.lastSeenAt, nowIso)
  return applyDecay(state.pMastery, state.decayRate, elapsed)
}

/**
 * Individuelle Verfalls-Rate lernen. Konzepte, die beim ersten Mal sitzen, verfallen langsamer;
 * Konzepte mit vielen Fehlversuchen vor dem Sitzen schneller; ueber Sessions konsistent Richtige
 * sehr langsam.
 */
export function adjustDecayRate(
  currentRate: number,
  signal: { firstTryCorrect: boolean; priorWrongStreak: number; consistentAcrossSessions: boolean },
): number {
  let rate = currentRate > 0 ? currentRate : DEFAULT_DECAY_RATE
  if (signal.firstTryCorrect) {
    rate *= 0.85
  } else {
    rate *= 1 + 0.1 * Math.min(Math.max(0, signal.priorWrongStreak), 5)
  }
  if (signal.consistentAcrossSessions) {
    rate *= 0.7
  }
  return Math.max(0.01, Math.min(0.4, rate))
}
