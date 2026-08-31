/**
 * Adaptiver Motor — Schicht 4.
 *
 * Reine Entscheidungsfunktionen ueber Konzept-Graph + Lerner-Modell. Kein State, keine I/O — die
 * Verdrahtung (welche Karten/Schritte real generiert werden) passiert in Phase 4.
 */

import type { LearnerConceptState } from './types'

/** Ab hier gilt ein Konzept als beherrscht (uebersprungen/nicht mehr getestet). */
export const MASTERED_THRESHOLD = 0.8
/** Band fuer Remediation-Zwischenschritte: schwach genug um Probleme zu machen, zu spezifisch fuer's naechste Thema. */
export const REMEDIATION_LOW = 0.4
export const REMEDIATION_HIGH = 0.7

export type StatesById = Map<string, LearnerConceptState>
export type ConceptRef = { id: string; difficulty: number }
export type StepRef = { stepId: string; conceptIds: string[] }

function masteryOf(statesById: StatesById, id: string): number {
  return statesById.get(id)?.pMastery ?? 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Entscheidung 1 — Einstiegscheck zusammenstellen: bereits (quellenuebergreifend) gemeisterte Konzepte
 * auslassen, aus den restlichen eine nach Schwierigkeit gemischte, gedeckelte Auswahl treffen.
 */
export function assembleEntryCheck(
  topicConcepts: ConceptRef[],
  statesById: StatesById,
  options: { maxQuestions?: number } = {},
): string[] {
  const max = options.maxQuestions ?? 6
  const candidates = topicConcepts.filter((c) => masteryOf(statesById, c.id) <= MASTERED_THRESHOLD)
  // Nach Schwierigkeit sortieren und gleichmaessig ueber das Spektrum auswaehlen (Mix aus leicht/mittel/schwer).
  const byDifficulty = [...candidates].sort((a, b) => a.difficulty - b.difficulty || (a.id < b.id ? -1 : 1))
  if (byDifficulty.length <= max) {
    return byDifficulty.map((c) => c.id)
  }
  const picked: string[] = []
  const step = byDifficulty.length / max
  for (let i = 0; i < max; i += 1) {
    picked.push(byDifficulty[Math.floor(i * step)].id)
  }
  return [...new Set(picked)]
}

/**
 * Entscheidung 2 — Schritte personalisieren: einen Schritt ueberspringen, wenn ALLE seine Konzepte
 * bereits beherrscht werden (P > MASTERED_THRESHOLD), sonst behalten.
 */
export function personalizeSteps(
  stepPool: StepRef[],
  statesById: StatesById,
): { kept: StepRef[]; skipped: StepRef[] } {
  const kept: StepRef[] = []
  const skipped: StepRef[] = []
  for (const step of stepPool) {
    const allMastered =
      step.conceptIds.length > 0 && step.conceptIds.every((id) => masteryOf(statesById, id) > MASTERED_THRESHOLD)
    if (allMastered) {
      skipped.push(step)
    } else {
      kept.push(step)
    }
  }
  return { kept, skipped }
}

/**
 * Entscheidung 3 — Remediation: Konzepte im Band [0.4, 0.7] identifizieren, die einen
 * Zwischenschritt auf der Hauptkarte rechtfertigen.
 */
export function remediationConcepts(conceptIds: string[], statesById: StatesById): string[] {
  return conceptIds.filter((id) => {
    const m = masteryOf(statesById, id)
    return m >= REMEDIATION_LOW && m <= REMEDIATION_HIGH
  })
}

/**
 * Entscheidung 4 — Echtzeit-Schwierigkeit: bei muehelosem Lauf hochschalten, bei Fehlern runter.
 * `recentOutcomes` neueste am Ende.
 */
export function nextDifficulty(currentDifficulty: number, recentOutcomes: boolean[]): number {
  const d = clamp(Math.round(currentDifficulty), 1, 5)
  const last3 = recentOutcomes.slice(-3)
  const wrong = last3.filter((o) => !o).length
  if (last3.length >= 3 && wrong === 0) {
    return Math.min(5, d + 1)
  }
  if (wrong >= 2) {
    return Math.max(1, d - 1)
  }
  return d
}

/**
 * Entscheidung 6 — Abschlusspruefung gewichten: schwaechere Konzepte und solche mit hohem Verfall
 * bekommen mehr Gewicht.
 */
export function weightExamConcepts(
  conceptIds: string[],
  statesById: StatesById,
): { conceptId: string; weight: number }[] {
  return conceptIds.map((id) => {
    const s = statesById.get(id)
    const m = s?.pMastery ?? 0
    const decay = s?.decayRate ?? 0
    const weight = clamp(1 - m + 0.5 * decay, 0.1, 2)
    return { conceptId: id, weight: Math.round(weight * 100) / 100 }
  })
}

/** Entscheidung 5 (Teil) — faellige Konzepte fuer Wiederholung (SR-Details in reviewScheduler). */
export function dueConcepts(states: LearnerConceptState[], nowIso: string): string[] {
  const now = new Date(nowIso).getTime()
  return states
    .filter((s) => s.nextReviewAt !== null && new Date(s.nextReviewAt).getTime() <= now)
    .map((s) => s.conceptId)
}
