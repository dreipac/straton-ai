/**
 * Persistenz des Curriculums (Schicht 2): Themen + Schritte + n:m-Konzeptzuordnungen.
 *
 * Client-Anbindung an learn_topics / learn_steps / learn_topic_concepts / learn_step_concepts
 * (Migration 20260725130000). Speichert ein clientseitig generiertes + geordnetes Curriculum und
 * laedt es strukturiert zurueck. Der erste Topic/Schritt wird als `active` markiert, der Rest gesperrt.
 */

import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { Curriculum } from '../utils/curriculumGeneration'

function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const c = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const parts = [
    typeof c.message === 'string' ? c.message : '',
    typeof c.details === 'string' ? c.details : '',
    typeof c.hint === 'string' ? c.hint : '',
    typeof c.code === 'string' ? `Code: ${c.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}

export type PersistedStep = {
  id: string
  topicId: string
  ordinal: number
  title: string
  kind: 'regular' | 'remediation'
  status: 'locked' | 'active' | 'done'
  conceptIds: string[]
}

export type PersistedTopic = {
  id: string
  ordinal: number
  title: string
  learningGoal: string
  status: 'locked' | 'active' | 'mastered'
  conceptIds: string[]
  steps: PersistedStep[]
}

export type PersistedCurriculum = { topics: PersistedTopic[] }

/**
 * Persistiert ein geordnetes Curriculum. Themen werden per `ordinal` mit den zurueckgegebenen IDs
 * korreliert (Batch-Insert garantiert keine Reihenfolge). `conceptIdBySlug` bildet die Konzept-Slugs
 * (aus dem Curriculum) auf die in Phase 1 persistierten Konzept-IDs ab.
 */
export async function saveCurriculum(
  pathId: string,
  curriculum: Curriculum,
  conceptIdBySlug: Map<string, string>,
): Promise<PersistedCurriculum> {
  const supabase = getSupabaseClient()

  const topicRows = curriculum.topics.map((t, i) => ({
    path_id: pathId,
    ordinal: i,
    title: t.title,
    learning_goal: t.learningGoal,
    status: i === 0 ? 'active' : 'locked',
  }))
  const { data: topicsData, error: topicError } = await supabase
    .from('learn_topics')
    .insert(topicRows)
    .select('id, ordinal')
  if (topicError) {
    throw toReadableError(topicError)
  }
  const topicIdByOrdinal = new Map<number, string>()
  for (const row of topicsData ?? []) {
    topicIdByOrdinal.set(row.ordinal as number, row.id as string)
  }

  const topicConceptRows: { path_id: string; topic_id: string; concept_id: string }[] = []
  const persistedTopics: PersistedTopic[] = []

  for (let i = 0; i < curriculum.topics.length; i += 1) {
    const topic = curriculum.topics[i]
    const topicId = topicIdByOrdinal.get(i)
    if (!topicId) {
      continue
    }
    const topicConceptIds: string[] = []
    for (const slug of topic.conceptSlugs) {
      const conceptId = conceptIdBySlug.get(slug)
      if (conceptId) {
        topicConceptRows.push({ path_id: pathId, topic_id: topicId, concept_id: conceptId })
        topicConceptIds.push(conceptId)
      }
    }

    const stepRows = topic.steps.map((s, j) => ({
      path_id: pathId,
      topic_id: topicId,
      ordinal: j,
      title: s.title,
      kind: 'regular',
      status: i === 0 && j === 0 ? 'active' : 'locked',
    }))
    const { data: stepsData, error: stepError } = await supabase
      .from('learn_steps')
      .insert(stepRows)
      .select('id, ordinal')
    if (stepError) {
      throw toReadableError(stepError)
    }
    const stepIdByOrdinal = new Map<number, string>()
    for (const row of stepsData ?? []) {
      stepIdByOrdinal.set(row.ordinal as number, row.id as string)
    }

    const stepConceptRows: { path_id: string; step_id: string; concept_id: string }[] = []
    const persistedSteps: PersistedStep[] = []
    for (let j = 0; j < topic.steps.length; j += 1) {
      const step = topic.steps[j]
      const stepId = stepIdByOrdinal.get(j)
      if (!stepId) {
        continue
      }
      const stepConceptIds: string[] = []
      for (const slug of step.conceptSlugs) {
        const conceptId = conceptIdBySlug.get(slug)
        if (conceptId) {
          stepConceptRows.push({ path_id: pathId, step_id: stepId, concept_id: conceptId })
          stepConceptIds.push(conceptId)
        }
      }
      persistedSteps.push({
        id: stepId,
        topicId,
        ordinal: j,
        title: step.title,
        kind: 'regular',
        status: i === 0 && j === 0 ? 'active' : 'locked',
        conceptIds: stepConceptIds,
      })
    }
    if (stepConceptRows.length > 0) {
      const { error } = await supabase.from('learn_step_concepts').insert(stepConceptRows)
      if (error) {
        throw toReadableError(error)
      }
    }

    persistedTopics.push({
      id: topicId,
      ordinal: i,
      title: topic.title,
      learningGoal: topic.learningGoal,
      status: i === 0 ? 'active' : 'locked',
      conceptIds: topicConceptIds,
      steps: persistedSteps,
    })
  }

  if (topicConceptRows.length > 0) {
    const { error } = await supabase.from('learn_topic_concepts').insert(topicConceptRows)
    if (error) {
      throw toReadableError(error)
    }
  }

  return { topics: persistedTopics }
}

type TopicRow = { id: string; ordinal: number; title: string; learning_goal: string | null; status: string }
type StepRow = { id: string; topic_id: string; ordinal: number; title: string; kind: string; status: string }
type JunctionRow = { concept_id: string } & Record<string, string>

export async function loadCurriculum(pathId: string): Promise<PersistedCurriculum> {
  const supabase = getSupabaseClient()
  const [topicsRes, stepsRes, topicConceptsRes, stepConceptsRes] = await Promise.all([
    supabase.from('learn_topics').select('id, ordinal, title, learning_goal, status').eq('path_id', pathId).order('ordinal', { ascending: true }),
    supabase.from('learn_steps').select('id, topic_id, ordinal, title, kind, status').eq('path_id', pathId).order('ordinal', { ascending: true }),
    supabase.from('learn_topic_concepts').select('topic_id, concept_id').eq('path_id', pathId),
    supabase.from('learn_step_concepts').select('step_id, concept_id').eq('path_id', pathId),
  ])
  for (const res of [topicsRes, stepsRes, topicConceptsRes, stepConceptsRes]) {
    if (res.error) {
      throw toReadableError(res.error)
    }
  }

  const conceptsByTopic = new Map<string, string[]>()
  for (const row of (topicConceptsRes.data ?? []) as JunctionRow[]) {
    const list = conceptsByTopic.get(row.topic_id) ?? []
    list.push(row.concept_id)
    conceptsByTopic.set(row.topic_id, list)
  }
  const conceptsByStep = new Map<string, string[]>()
  for (const row of (stepConceptsRes.data ?? []) as JunctionRow[]) {
    const list = conceptsByStep.get(row.step_id) ?? []
    list.push(row.concept_id)
    conceptsByStep.set(row.step_id, list)
  }
  const stepsByTopic = new Map<string, PersistedStep[]>()
  for (const row of (stepsRes.data ?? []) as StepRow[]) {
    const list = stepsByTopic.get(row.topic_id) ?? []
    list.push({
      id: row.id,
      topicId: row.topic_id,
      ordinal: row.ordinal,
      title: row.title,
      kind: row.kind === 'remediation' ? 'remediation' : 'regular',
      status: row.status === 'active' ? 'active' : row.status === 'done' ? 'done' : 'locked',
      conceptIds: conceptsByStep.get(row.id) ?? [],
    })
    stepsByTopic.set(row.topic_id, list)
  }

  const topics: PersistedTopic[] = ((topicsRes.data ?? []) as TopicRow[]).map((row) => ({
    id: row.id,
    ordinal: row.ordinal,
    title: row.title,
    learningGoal: row.learning_goal ?? '',
    status: row.status === 'active' ? 'active' : row.status === 'mastered' ? 'mastered' : 'locked',
    conceptIds: conceptsByTopic.get(row.id) ?? [],
    steps: (stepsByTopic.get(row.id) ?? []).sort((a, b) => a.ordinal - b.ordinal),
  }))

  return { topics }
}

/** Loescht das Curriculum eines Pfads (Schritte + Junctions via ON DELETE CASCADE). */
export async function deleteCurriculum(pathId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learn_topics').delete().eq('path_id', pathId)
  if (error) {
    throw toReadableError(error)
  }
}
