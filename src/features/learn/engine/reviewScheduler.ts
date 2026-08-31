/**
 * Wiederholungs-Planung (Spaced Repetition) — Schicht 4/6.
 *
 * SM-2-artiger Easiness-Faktor statt fixer Intervall-Leiter, zusaetzlich verfall-getunt: Konzepte mit
 * hoher Vergessens-Rate bekommen kuerzere Intervalle. Arbeitet auf `LearnerCardState` (neues Modell).
 *
 * Hinweis: Das bestehende `src/features/learn/utils/spacedRepetition.ts` (altes Blob-Karten-Modell)
 * bleibt bis zur Ablösung in Phase 4 unangetastet — dieses Modul ist die Nachfolge-Implementierung.
 */

import type { LearnerCardState } from './types'
import { DEFAULT_DECAY_RATE } from './forgetting'

const MS_PER_DAY = 86_400_000
export const DEFAULT_EASINESS = 2.5
/** Ab dieser Stufe gilt eine Karte als gemeistert (langes Intervall erreicht). */
export const MASTERED_STAGE = 4

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function addDaysIso(nowMs: number, days: number): string {
  return new Date(nowMs + days * MS_PER_DAY).toISOString()
}

export function initialCardState(cardId: string): LearnerCardState {
  return {
    cardId,
    srStage: 0,
    easiness: DEFAULT_EASINESS,
    intervalDays: 0,
    status: 'new',
    lastReviewedAt: null,
    nextReviewAt: null,
  }
}

export function isCardDue(state: LearnerCardState, nowIso: string): boolean {
  if (!state.nextReviewAt) {
    return true
  }
  return new Date(state.nextReviewAt).getTime() <= new Date(nowIso).getTime()
}

/**
 * SM-2-artiges Update. `correct=false` setzt die Karte zurueck (morgen wieder); bei `correct=true`
 * waechst das Intervall mit dem Easiness-Faktor, moduliert durch die Konzept-Vergessens-Rate.
 */
export function reviewCard(
  state: LearnerCardState,
  input: { correct: boolean; conceptDecayRate?: number },
  nowIso: string,
): LearnerCardState {
  const nowMs = new Date(nowIso).getTime()

  if (!input.correct) {
    const easiness = Math.max(1.3, state.easiness - 0.2)
    return {
      ...state,
      srStage: 0,
      easiness,
      intervalDays: 1,
      status: 'learning',
      lastReviewedAt: nowIso,
      nextReviewAt: addDaysIso(nowMs, 1),
    }
  }

  const easiness = Math.max(1.3, state.easiness + 0.1)
  const nextStage = state.srStage + 1
  let intervalDays: number
  if (state.srStage <= 0) {
    intervalDays = 1
  } else if (state.srStage === 1) {
    intervalDays = 6
  } else {
    intervalDays = Math.round(Math.max(1, state.intervalDays) * easiness)
  }

  // Verfall-Tuning: hoehere Konzept-decayRate -> Faktor < 1 -> kuerzeres Intervall.
  if (input.conceptDecayRate && input.conceptDecayRate > 0) {
    const factor = clamp(DEFAULT_DECAY_RATE / input.conceptDecayRate, 0.5, 1.5)
    intervalDays = Math.max(1, Math.round(intervalDays * factor))
  }

  return {
    ...state,
    srStage: nextStage,
    easiness,
    intervalDays,
    status: nextStage >= MASTERED_STAGE ? 'mastered' : 'review',
    lastReviewedAt: nowIso,
    nextReviewAt: addDaysIso(nowMs, intervalDays),
  }
}

export function dueCards(states: LearnerCardState[], nowIso: string): LearnerCardState[] {
  return states.filter((s) => isCardDue(s, nowIso))
}
