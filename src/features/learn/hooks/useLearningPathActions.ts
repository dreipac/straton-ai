import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  createLearningPathByUserId,
  deleteLearningPathById,
  getLearningPathById,
  type LearningPathRecord,
  type LearningPathSummary,
} from '../services/learn.persistence'
import type { EditableLearningPathSnapshot } from './useLearningPathPersistence'

type UseLearningPathActionsArgs = {
  userId: string | undefined
  learningPaths: LearningPathSummary[]
  setLearningPaths: Dispatch<SetStateAction<LearningPathSummary[]>>
  activePathIdRef: MutableRefObject<string>
  setActivePathId: Dispatch<SetStateAction<string>>
  pathCacheRef: MutableRefObject<Record<string, LearningPathRecord>>
  setError: (message: string | null) => void
  applyPathToState: (record: LearningPathRecord) => void
  resetPathStateForLoading: () => void
  captureEditableState: () => EditableLearningPathSnapshot
  persistActivePath: () => Promise<void>
  persistPathInBackground: (pathId: string, title: string, snapshot: EditableLearningPathSnapshot) => void
  closePathMenu: () => void
}

export function useLearningPathActions(args: UseLearningPathActionsArgs) {
  const {
    userId,
    learningPaths,
    setLearningPaths,
    activePathIdRef,
    setActivePathId,
    pathCacheRef,
    setError,
    applyPathToState,
    resetPathStateForLoading,
    captureEditableState,
    persistActivePath,
    persistPathInBackground,
    closePathMenu,
  } = args

  const handleCreateLearningPath = useCallback(async () => {
    if (!userId) {
      return
    }

    setError(null)

    try {
      await persistActivePath()
      const created = await createLearningPathByUserId(userId, 'Neuer Lernpfad')
      setLearningPaths((prev) => [
        {
          id: created.id,
          userId: created.userId,
          title: created.title,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...prev,
      ])
      setActivePathId(created.id)
      activePathIdRef.current = created.id
      applyPathToState(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neuer Lernpfad konnte nicht erstellt werden.')
    }
  }, [activePathIdRef, applyPathToState, persistActivePath, setActivePathId, setError, setLearningPaths, userId])

  const handleSelectLearningPath = useCallback(
    async (pathId: string) => {
      if (pathId === activePathIdRef.current) {
        return
      }

      setError(null)
      const previousPathId = activePathIdRef.current
      const previousSummary = learningPaths.find((path) => path.id === previousPathId)
      const previousSnapshot = captureEditableState()

      if (previousPathId && previousSummary) {
        persistPathInBackground(previousPathId, previousSummary.title, previousSnapshot)
      }

      setActivePathId(pathId)
      activePathIdRef.current = pathId

      const cached = pathCacheRef.current[pathId]
      if (cached) {
        applyPathToState(cached)
        return
      }

      resetPathStateForLoading()

      try {
        const next = await getLearningPathById(pathId)
        if (!next) {
          return
        }
        pathCacheRef.current[pathId] = next
        if (activePathIdRef.current !== pathId) {
          return
        }
        applyPathToState(next)
      } catch (err) {
        if (activePathIdRef.current === pathId) {
          setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht geladen werden.')
        }
      }
    },
    [
      activePathIdRef,
      applyPathToState,
      captureEditableState,
      learningPaths,
      pathCacheRef,
      persistPathInBackground,
      resetPathStateForLoading,
      setActivePathId,
      setError,
    ],
  )

  const handleDeleteLearningPath = useCallback(
    async (pathId: string) => {
      if (!userId) {
        return
      }

      closePathMenu()
      setError(null)

      const currentActivePathId = activePathIdRef.current
      const remainingPaths = learningPaths.filter((path) => path.id !== pathId)

      try {
        await deleteLearningPathById(pathId)
        delete pathCacheRef.current[pathId]
        setLearningPaths(remainingPaths)

        if (pathId !== currentActivePathId) {
          return
        }

        const nextSummary = remainingPaths[0]
        if (!nextSummary) {
          const created = await createLearningPathByUserId(userId, 'Neuer Lernpfad')
          pathCacheRef.current[created.id] = created
          setLearningPaths([
            {
              id: created.id,
              userId: created.userId,
              title: created.title,
              createdAt: created.createdAt,
              updatedAt: created.updatedAt,
            },
          ])
          setActivePathId(created.id)
          activePathIdRef.current = created.id
          applyPathToState(created)
          return
        }

        setActivePathId(nextSummary.id)
        activePathIdRef.current = nextSummary.id

        const cached = pathCacheRef.current[nextSummary.id]
        if (cached) {
          applyPathToState(cached)
          return
        }

        resetPathStateForLoading()

        const next = await getLearningPathById(nextSummary.id)
        if (!next) {
          return
        }
        pathCacheRef.current[nextSummary.id] = next
        if (activePathIdRef.current !== nextSummary.id) {
          return
        }
        applyPathToState(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht gelöscht werden.')
      }
    },
    [
      activePathIdRef,
      applyPathToState,
      closePathMenu,
      learningPaths,
      pathCacheRef,
      resetPathStateForLoading,
      setActivePathId,
      setError,
      setLearningPaths,
      userId,
    ],
  )

  return {
    handleCreateLearningPath,
    handleSelectLearningPath,
    handleDeleteLearningPath,
  }
}
