import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { listLearningPathsByUserId, type LearningPathSummary } from '../services/learn.persistence'
import { sortLearningPathsByCreatedAt } from '../utils/learnPageHelpers'

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
          loaded.map((record) => ({
            id: record.id,
            userId: record.userId,
            title: record.title,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          })),
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
