/**
 * Adaptiver Plan — Schicht 4 (Komposition).
 *
 * Fasst die reinen Entscheidungsfunktionen aus `adaptiveEngine` + das Scoring aus `masteryScoring`
 * zu genau den Ableitungen zusammen, die der Orchestrator/das UI braucht:
 *  - pro Thema: BKT-Score, gemeistert-Flag, Einstiegscheck-Auswahl, zu ueberspringende Schritte,
 *    Remediation-Konzepte, gewichtete Pruefungs-Konzepte,
 *  - pro Pfad: Themen-Scores + Gesamt-Fortschritt,
 *  - faellige Konzepte (Wiederholung).
 *
 * Rein (kein DOM/I/O). Arbeitet auf der normalisierten Curriculum-Struktur (Themen/Schritte mit
 * Konzept-IDs) + der Lerner-Zustands-Map. `nowIso` wird hereingereicht (deterministisch testbar).
 */

import { effectiveMastery } from './learnerModel'
import { topicScore, isTopicMastered, pathProgress, type PathProgress } from './masteryScoring'
import {
  assembleEntryCheck,
  personalizeSteps,
  remediationConcepts,
  weightExamConcepts,
  dueConcepts,
  type ConceptRef,
  type StepRef,
  type StatesById,
} from './adaptiveEngine'

/** Minimal-Sicht auf ein Curriculum-Thema, die der Plan braucht (entkoppelt von der Persistenz-Form). */
export type PlanTopicInput = {
  id: string
  conceptIds: string[]
  steps: { stepId: string; conceptIds: string[] }[]
  examPassed?: boolean
}
/** Konzept-Stammdaten (Schwierigkeit) fuer Gewichtung/Einstiegscheck. */
export type ConceptMeta = { id: string; difficulty: number }

export type TopicPlan = {
  topicId: string
  /** BKT-Score des Themas (0..1, schwierigkeits-gewichtet + Minimum-Regel, inkl. Verfall). */
  score: number
  mastered: boolean
  /** Entscheidung 1 — Konzept-IDs fuer den Einstiegscheck (gemeisterte ausgelassen). */
  entryCheckConceptIds: string[]
  /** Entscheidung 2 — Schritte, die uebersprungen werden koennen (alle Konzepte beherrscht). */
  skippableStepIds: string[]
  /** Entscheidung 3 — Konzepte im Remediation-Band [0.4, 0.7]. */
  remediationConceptIds: string[]
  /** Entscheidung 6 — gewichtete Konzepte fuer die Abschlusspruefung. */
  examWeights: { conceptId: string; weight: number }[]
}

/** Verfall auf die Zustands-Map anwenden, damit alle Entscheidungen auf den effektiven Werten laufen. */
function decayStates(statesById: StatesById, nowIso: string): StatesById {
  const decayed: StatesById = new Map()
  for (const [id, state] of statesById) {
    decayed.set(id, { ...state, pMastery: effectiveMastery(state, nowIso) })
  }
  return decayed
}

function conceptRefs(conceptIds: string[], metaById: Map<string, ConceptMeta>): ConceptRef[] {
  return conceptIds.map((id) => ({ id, difficulty: metaById.get(id)?.difficulty ?? 3 }))
}

/** Adaptiver Plan fuer EIN Thema (alle konzept-basierten Entscheidungen). */
export function buildTopicPlan(
  topic: PlanTopicInput,
  statesById: StatesById,
  metaById: Map<string, ConceptMeta>,
  nowIso: string,
  options: { entryCheckMax?: number } = {},
): TopicPlan {
  const decayed = decayStates(statesById, nowIso)
  const entries = topic.conceptIds.map((id) => ({
    pMastery: decayed.get(id)?.pMastery ?? 0,
    difficulty: metaById.get(id)?.difficulty ?? 3,
  }))
  const score = topicScore(entries)

  const stepRefs: StepRef[] = topic.steps.map((s) => ({ stepId: s.stepId, conceptIds: s.conceptIds }))
  const { skipped } = personalizeSteps(stepRefs, decayed)

  return {
    topicId: topic.id,
    score,
    mastered: isTopicMastered(score, topic.examPassed ?? false),
    entryCheckConceptIds: assembleEntryCheck(conceptRefs(topic.conceptIds, metaById), decayed, {
      maxQuestions: options.entryCheckMax,
    }),
    skippableStepIds: skipped.map((s) => s.stepId),
    remediationConceptIds: remediationConcepts(topic.conceptIds, decayed),
    examWeights: weightExamConcepts(topic.conceptIds, decayed),
  }
}

/**
 * Entscheidung 2 (harter, deterministischer Skip): Ist laut BKT kein Konzept des Themas mehr
 * pruefenswert (der adaptive Einstiegscheck waere leer, obwohl das Thema Konzepte hat), kann der
 * Einstiegscheck ohne KI-Aufruf uebersprungen werden. Rein, testbar.
 */
export function canSkipEntryCheck(plan: TopicPlan, topicConceptCount: number): boolean {
  return topicConceptCount > 0 && plan.entryCheckConceptIds.length === 0
}

export type PathScoring = {
  /** Score je Thema (0..1) in Themen-Reihenfolge. */
  topicScores: { topicId: string; score: number; mastered: boolean }[]
  progress: PathProgress
  /** Faellige Konzept-IDs (Wiederholung), verfall-beruecksichtigt. */
  dueConceptIds: string[]
}

/** Pfad-weites Scoring + Faelligkeiten ueber alle Themen. */
export function buildPathScoring(
  topics: PlanTopicInput[],
  statesById: StatesById,
  metaById: Map<string, ConceptMeta>,
  nowIso: string,
): PathScoring {
  const decayed = decayStates(statesById, nowIso)
  const topicScores = topics.map((t) => {
    const entries = t.conceptIds.map((id) => ({
      pMastery: decayed.get(id)?.pMastery ?? 0,
      difficulty: metaById.get(id)?.difficulty ?? 3,
    }))
    const score = topicScore(entries)
    return { topicId: t.id, score, mastered: isTopicMastered(score, t.examPassed ?? false) }
  })
  return {
    topicScores,
    progress: pathProgress(
      topicScores.map((t) => t.score),
      topicScores.map((t) => t.mastered),
    ),
    // dueConcepts nutzt nextReviewAt aus dem ORIGINAL-Zustand (nicht dem verfallenen pMastery-Klon).
    dueConceptIds: dueConcepts([...statesById.values()], nowIso),
  }
}
