import { useCallback, useMemo } from 'react'
import type { Concept, ConceptEdge } from '../engine/types'
import type { TopicPlan } from '../engine/adaptivePlan'
import type { PersistedCurriculum } from '../services/learnCurriculum.persistence'
import {
  buildConceptDirective,
  buildExamWeightDirective,
  type ConceptDirectiveItem,
  type ExamWeightItem,
} from '../utils/conceptConditioning'

export type UseConceptDirectivesArgs = {
  conceptGraph: { concepts: Concept[]; edges: ConceptEdge[] }
  curriculum: PersistedCurriculum
  /** Ob ein normalisiertes Curriculum + Netz vorliegt (sonst greifen leere Direktiven / Legacy). */
  hasConceptScoring: boolean
  /** Voller adaptiver Plan eines Themas (fuer die gewichtete Pruefung), oder null. */
  planForTopic: (topicId: string) => TopicPlan | null
  /** Verfall-bereinigte Mastery je Konzept-Slug (0..1|null). */
  masteryForSlug: (slug: string | undefined) => number | null
}

export type ConceptDirectives = {
  /** Konzept-Nachschlag je ID. */
  conceptById: Map<string, Concept>
  /** Konzept-Nachschlag je Slug. */
  conceptBySlug: Map<string, Concept>
  /** Schicht-5-Direktive fuer die Generierung (echte Slugs + Lerner-Stand + Quelle). Leer ohne Netz. */
  conceptDirective: string
  /** Konzept-Direktive-Items eines Themas (per Ordinal) fuer die adaptiven Entscheidungen 1–3. */
  topicConceptItems: (topicIndex: number) => ConceptDirectiveItem[]
  /** Entscheidung 6 — gewichtete Abschlusspruefung als Direktive. Leer ohne Netz. */
  topicExamDirective: (topicIndex: number) => string
}

/**
 * Konzept-/Lerner-konditionierte Direktiven-Ableitung (Schicht 5 + Entscheidungen 1–3,6), aus dem
 * Orchestrator (LearnPage) extrahiert. Rein ableitend — kein State/Effekt, kein I/O. Ohne Konzept-Netz
 * liefern alle Direktiven leere Strings → identisches Legacy-Verhalten.
 */
export function useConceptDirectives(args: UseConceptDirectivesArgs): ConceptDirectives {
  const { conceptGraph, curriculum, hasConceptScoring, planForTopic, masteryForSlug } = args

  const conceptDirective = useMemo(() => {
    if (conceptGraph.concepts.length === 0) {
      return ''
    }
    const items = conceptGraph.concepts.map((c) => ({
      slug: c.slug,
      name: c.name,
      difficulty: c.difficulty,
      mastery: masteryForSlug(c.slug),
      source: [c.sourceRef?.doc, c.sourceRef?.section].filter(Boolean).join(' · ') || undefined,
    }))
    return buildConceptDirective(items)
  }, [conceptGraph.concepts, masteryForSlug])

  const conceptById = useMemo(
    () => new Map(conceptGraph.concepts.map((c) => [c.id, c])),
    [conceptGraph.concepts],
  )
  const conceptBySlug = useMemo(
    () => new Map(conceptGraph.concepts.map((c) => [c.slug, c])),
    [conceptGraph.concepts],
  )

  const topicConceptItems = useCallback(
    (topicIndex: number): ConceptDirectiveItem[] => {
      if (!hasConceptScoring) {
        return []
      }
      const topic = curriculum.topics[topicIndex]
      if (!topic) {
        return []
      }
      return topic.conceptIds
        .map((id): ConceptDirectiveItem | null => {
          const c = conceptById.get(id)
          if (!c) {
            return null
          }
          return {
            slug: c.slug,
            name: c.name,
            difficulty: c.difficulty,
            mastery: masteryForSlug(c.slug),
            source: [c.sourceRef?.doc, c.sourceRef?.section].filter(Boolean).join(' · ') || undefined,
          }
        })
        .filter((x): x is ConceptDirectiveItem => x !== null)
    },
    [hasConceptScoring, curriculum, conceptById, masteryForSlug],
  )

  const topicExamDirective = useCallback(
    (topicIndex: number): string => {
      if (!hasConceptScoring) {
        return ''
      }
      const topic = curriculum.topics[topicIndex]
      if (!topic) {
        return ''
      }
      const plan = planForTopic(topic.id)
      if (!plan) {
        return ''
      }
      const items = plan.examWeights
        .map((w): ExamWeightItem | null => {
          const c = conceptById.get(w.conceptId)
          return c ? { slug: c.slug, name: c.name, weight: w.weight } : null
        })
        .filter((x): x is ExamWeightItem => x !== null)
      return buildExamWeightDirective(items)
    },
    [hasConceptScoring, curriculum, planForTopic, conceptById],
  )

  return { conceptById, conceptBySlug, conceptDirective, topicConceptItems, topicExamDirective }
}
