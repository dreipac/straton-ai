/**
 * Scoring-Aggregation — Schicht 6.
 *
 * Aggregiert Konzept-P(Mastery) zu Schritt-/Themen-/Pfad-Scores:
 *  - schwierigkeits-gewichteter Durchschnitt (schwerere Konzepte zaehlen mehr),
 *  - Minimum-Regel (ein kritisch schwaches Konzept deckelt den Themen-Score),
 *  - monoton-in-Session (der angezeigte Score sinkt waehrend einer Session nie).
 */

export type ConceptScoreEntry = { pMastery: number; difficulty: number }

/** Kritische Schwelle: ein Konzept darunter deckelt den Themen-Score. */
export const MIN_CONCEPT_THRESHOLD = 0.3
/** Deckel, wenn ein Konzept unter der kritischen Schwelle liegt. */
export const MIN_RULE_CAP = 0.7
/** Ab hier gilt ein Thema (score-seitig) als gemeistert (zusaetzlich muss der Abschlusstest bestanden sein). */
export const TOPIC_MASTERY_THRESHOLD = 0.75

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Gewicht eines Konzepts nach Schwierigkeit (1..5): schwerer -> hoeher, mindestens 0.5. */
export function conceptWeight(difficulty: number): number {
  const d = Number.isFinite(difficulty) ? Math.max(1, Math.min(5, difficulty)) : 3
  return Math.max(0.5, 1 + 0.25 * (d - 3))
}

/** Schwierigkeits-gewichteter Durchschnitt der P(Mastery)-Werte. */
export function weightedAverage(entries: ConceptScoreEntry[]): number {
  if (entries.length === 0) {
    return 0
  }
  let weighted = 0
  let totalWeight = 0
  for (const e of entries) {
    const w = conceptWeight(e.difficulty)
    weighted += clamp01(e.pMastery) * w
    totalWeight += w
  }
  return totalWeight > 0 ? weighted / totalWeight : 0
}

/** Minimum-Regel: liegt ein Konzept unter der kritischen Schwelle, deckle den Score auf MIN_RULE_CAP. */
export function applyMinimumRule(score: number, entries: ConceptScoreEntry[]): number {
  const hasCritical = entries.some((e) => clamp01(e.pMastery) < MIN_CONCEPT_THRESHOLD)
  return hasCritical ? Math.min(score, MIN_RULE_CAP) : score
}

/** Themen-Score = gewichteter Schnitt + Minimum-Regel (0..1). */
export function topicScore(entries: ConceptScoreEntry[]): number {
  return clamp01(applyMinimumRule(weightedAverage(entries), entries))
}

/** Monoton-in-Session: der angezeigte Score darf innerhalb einer Session nicht sinken. */
export function monotonicScore(previousDisplayed: number, computed: number): number {
  return Math.max(previousDisplayed, computed)
}

/** Ein Thema gilt als gemeistert, wenn der Score die Schwelle erreicht UND der Abschlusstest bestanden ist. */
export function isTopicMastered(score: number, examPassed: boolean): boolean {
  return score >= TOPIC_MASTERY_THRESHOLD && examPassed
}

export type PathProgress = { mastered: number; total: number; percent: number }

/** Pfad-Fortschritt: Anzahl gemeisterter Themen + Gesamt-Prozent (Durchschnitt der Themen-Scores). */
export function pathProgress(topicScores: number[], masteredFlags: boolean[]): PathProgress {
  const total = topicScores.length
  const mastered = masteredFlags.filter(Boolean).length
  const percent =
    total > 0 ? Math.round((topicScores.reduce((sum, s) => sum + clamp01(s), 0) / total) * 100) : 0
  return { mastered, total, percent }
}
