import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  listLearningPathsByUserId,
  type LearningPathRecord,
  type LearningPathSummary,
} from '../services/learn.persistence'
import { firstUnmasteredIndex } from '../engine/sessionMachine'
import { countMasteredTopics, sanitizeChapterTitleForUi, sortLearningPathsByCreatedAt } from '../utils/learnPageHelpers'

/** Thema + Teilthema, bei dem der Nutzer aktuell steht ("Weitermachen"-Karte auf der Startseite). */
function deriveCurrentPosition(record: LearningPathRecord): { topicTitle: string; substepTitle: string } {
  if (record.topicSessions.length === 0) {
    return { topicTitle: '', substepTitle: '' }
  }
  const firstNotMastered = firstUnmasteredIndex(record.topicSessions.map((session) => session.status))
  const topicIndex = firstNotMastered === -1 ? Math.max(0, record.topicSessions.length - 1) : firstNotMastered
  const topicTitle = sanitizeChapterTitleForUi(
    record.syllabus[topicIndex]?.topic ?? '',
    topicIndex,
    record.topic || record.selectedTopic,
  )
  const session = record.topicSessions[topicIndex]
  const substepIndex = session?.substeps.findIndex((substep) => !substep.completed) ?? -1
  const substepTitle =
    substepIndex >= 0
      ? session.substeps[substepIndex]?.blueprint.title.trim() || `Teilthema ${substepIndex + 1}`
      : ''
  return { topicTitle, substepTitle }
}

export type UseLearningPathsSidebarResult = {
  learningPaths: LearningPathSummary[]
  isLoading: boolean
  refreshLearningPaths: () => Promise<void>
  setLearningPaths: Dispatch<SetStateAction<LearningPathSummary[]>>
}

export function useLearningPathsSidebar(userId: string | undefined): UseLearningPathsSidebarResult {
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refreshLearningPaths = useCallback(async () => {
    if (!userId) {
      setLearningPaths([])
      return
    }
    setIsLoading(true)
    try {
      const loaded = await listLearningPathsByUserId(userId)
      setLearningPaths(
        sortLearningPathsByCreatedAt(
          loaded.map((record) => {
            const { topicTitle, substepTitle } = deriveCurrentPosition(record)
            return {
              id: record.id,
              userId: record.userId,
              title: record.title,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              masteredTopicsCount: countMasteredTopics(record.topicSessions),
              totalTopicsCount: record.syllabus.length,
              currentTopicTitle: topicTitle,
              currentSubstepTitle: substepTitle,
            }
          }),
        ),
      )
    } catch {
      setLearningPaths([])
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refreshLearningPaths()
  }, [refreshLearningPaths])

  return {
    learningPaths,
    isLoading,
    refreshLearningPaths,
    setLearningPaths,
  }
}
