import { useCallback, type MutableRefObject } from 'react'
import {
  updateLearningPathById,
  type ChapterBlueprint,
  type ChapterSession,
  type EntryQuizResult,
  type LearnFlashcard,
  type LearnWorksheetItem,
  type LearningPathRecord,
  type LearningPathSummary,
  type TutorChatEntry,
  type UploadedMaterial,
} from '../services/learn.persistence'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import { getDisplayPathTitle } from '../utils/learnPageHelpers'

export type EditableLearningPathSnapshot = {
  topic: string
  topicSuggestions: string[]
  selectedTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  setupStep: 1 | 2 | 3 | 4
  isSetupComplete: boolean
  materials: UploadedMaterial[]
  tutorMessages: TutorChatEntry[]
  entryQuiz: InteractiveQuizPayload | null
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  learningChapters: string[]
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learnFlashcards: LearnFlashcard[]
  learnWorksheets: LearnWorksheetItem[]
}

type UseLearningPathPersistenceArgs = {
  activePathIdRef: MutableRefObject<string>
  learningPaths: LearningPathSummary[]
  pathCacheRef: MutableRefObject<Record<string, LearningPathRecord>>
  setError: (message: string | null) => void
  snapshot: EditableLearningPathSnapshot
}

export function useLearningPathPersistence(args: UseLearningPathPersistenceArgs) {
  const { activePathIdRef, learningPaths, pathCacheRef, setError, snapshot } = args

  const persistActivePath = useCallback(async () => {
    const pathId = activePathIdRef.current
    if (!pathId) {
      return
    }
    const currentSummary = learningPaths.find((entry) => entry.id === pathId)
    if (!currentSummary) {
      return
    }

    const updated = await updateLearningPathById(pathId, {
      title: getDisplayPathTitle(currentSummary.title),
      ...snapshot,
    })

    pathCacheRef.current[pathId] = updated
  }, [activePathIdRef, learningPaths, pathCacheRef, snapshot])

  const persistPathInBackground = useCallback(
    (pathId: string, title: string, nextSnapshot: EditableLearningPathSnapshot) => {
      void updateLearningPathById(pathId, {
        title: getDisplayPathTitle(title),
        ...nextSnapshot,
      })
        .then((updated) => {
          pathCacheRef.current[pathId] = updated
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht gespeichert werden.')
        })
    },
    [pathCacheRef, setError],
  )

  return {
    persistActivePath,
    persistPathInBackground,
  }
}
