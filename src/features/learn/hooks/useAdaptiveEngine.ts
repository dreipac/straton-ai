import { useCallback, useMemo } from 'react'
import type { Concept, ConceptEdge, LearnerConceptState } from '../engine/types'
import {
  buildTopicPlan,
  buildPathScoring,
  type PlanTopicInput,
  type ConceptMeta,
  type TopicPlan,
} from '../engine/adaptivePlan'
import type { PersistedCurriculum } from '../services/learnCurriculum.persistence'

type UseAdaptiveEngineArgs = {
  curriculum: PersistedCurriculum
  conceptGraph: { concepts: Concept[]; edges: ConceptEdge[] }
  conceptStatesById: Map<string, LearnerConceptState>
}

export type AdaptiveEngine = {
  /** BKT-Score je Thema-ID (0..1, inkl. Verfall/Minimum-Regel). */
  topicScoreById: Map<string, number>
  /** Thema-IDs, die (Score + bestandene Pruefung) als gemeistert gelten. */
  masteredTopicIds: Set<string>
  /** Gewichteter Gesamt-Fortschritt des Pfads (0..100). */
  pathPercent: number
  /** Faellige Konzept-IDs (Wiederholung), verfall-beruecksichtigt. */
  dueConceptIds: string[]
  /** Ob ein normalisiertes Curriculum + Netz vorliegt (sonst greift die Legacy-Anzeige). */
  hasConceptScoring: boolean
  /** Voller adaptiver Plan fuer ein Thema (die 6 Entscheidungen), oder null wenn unbekannt. */
  planForTopic: (topicId: string) => TopicPlan | null
}

/** Ordnungsindex eines Themas → BKT-Score, fuer den ordinal-basierten Landkarten-Ring. */
function toPlanTopics(curriculum: PersistedCurriculum): PlanTopicInput[] {
  return curriculum.topics.map((t) => ({
    id: t.id,
    conceptIds: t.conceptIds,
    steps: t.steps.map((s) => ({ stepId: s.id, conceptIds: s.conceptIds })),
    examPassed: t.status === 'mastered',
  }))
}

/**
 * Adaptiver Motor live (Schicht 4): leitet aus dem normalisierten Curriculum + den BKT-Konzept-Zustaenden
 * die konzept-basierten Entscheidungen + das Scoring ab. Rein ableitend (kein State/Effekt) — bei leerem
 * Curriculum/Netz ist `hasConceptScoring=false` und der Aufrufer faellt auf die Legacy-Anzeige zurueck.
 *
 * Hinweis: Entscheidung 4 (Echtzeit-Schwierigkeit) und 5 (Karten-SR) benoetigen die in Phase 5 erzeugten
 * `learn_cards`-Zeilen und werden dort verdrahtet; hier stehen die konzept-basierten Entscheidungen (1,2,3,6)
 * + Faelligkeiten bereit.
 */
export function useAdaptiveEngine(args: UseAdaptiveEngineArgs): AdaptiveEngine {
  const { curriculum, conceptGraph, conceptStatesById } = args

  const metaById = useMemo<Map<string, ConceptMeta>>(
    () => new Map(conceptGraph.concepts.map((c) => [c.id, { id: c.id, difficulty: c.difficulty }])),
    [conceptGraph.concepts],
  )

  const planTopics = useMemo(() => toPlanTopics(curriculum), [curriculum])

  const hasConceptScoring = planTopics.length > 0 && conceptStatesById.size > 0

  const scoring = useMemo(() => {
    if (!hasConceptScoring) {
      return null
    }
    return buildPathScoring(planTopics, conceptStatesById, metaById, new Date().toISOString())
  }, [hasConceptScoring, planTopics, conceptStatesById, metaById])

  const topicScoreById = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of scoring?.topicScores ?? []) {
      map.set(t.topicId, t.score)
    }
    return map
  }, [scoring])

  const masteredTopicIds = useMemo(() => {
    const set = new Set<string>()
    for (const t of scoring?.topicScores ?? []) {
      if (t.mastered) {
        set.add(t.topicId)
      }
    }
    return set
  }, [scoring])

  const planForTopic = useCallback<AdaptiveEngine['planForTopic']>(
    (topicId) => {
      const topic = planTopics.find((t) => t.id === topicId)
      if (!topic) {
        return null
      }
      return buildTopicPlan(topic, conceptStatesById, metaById, new Date().toISOString())
    },
    [planTopics, conceptStatesById, metaById],
  )

  return {
    topicScoreById,
    masteredTopicIds,
    pathPercent: scoring?.progress.percent ?? 0,
    dueConceptIds: scoring?.dueConceptIds ?? [],
    hasConceptScoring,
    planForTopic,
  }
}
