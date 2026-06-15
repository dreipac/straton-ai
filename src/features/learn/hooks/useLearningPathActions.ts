import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import {
  createLearningPathByUserId,
  deleteEmptyLearningPathsByUserId,
  deleteLearningPathById,
  getLearningPathById,
  listLearningPathsByUserId,
  updateLearningPathById,
  type LearningPathRecord,
  type LearningPathSummary,
} from '../services/learn.persistence'
import {
  createPendingLearningPathSummary,
  isLearningPathEmpty,
  isPendingLearningPathId,
} from '../utils/learnPageHelpers'
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
  /** Wie «Auto löschen von leeren Chats» in den Einstellungen. */
  autoRemoveEmptyLearningPaths?: boolean
  /** Keine Sidebar-Einblend-Animation (z. B. nach Ersetzen des Platzhalter-Pfads). */
  skipEnterPathIdsRef?: MutableRefObject<Set<string>>
  /** Nach Aktivierung eines Pfads (z. B. URL im eingebetteten Chat syncen). */
  onPathActivated?: (pathId: string) => void
}

function emptyCheckFromSnapshot(snapshot: EditableLearningPathSnapshot): boolean {
  return isLearningPathEmpty(snapshot)
}

function toPathSummary(record: LearningPathRecord): LearningPathSummary {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

const LEARNING_PATH_REMOVE_ANIMATION_MS = 180

export function useLearningPathActions(args: UseLearningPathActionsArgs) {
  const [isLearningPathWorkspaceLoading, setIsLearningPathWorkspaceLoading] = useState(false)
  const createInFlightRef = useRef(false)
  const removeTimersRef = useRef<Record<string, number>>({})

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
    autoRemoveEmptyLearningPaths = true,
    skipEnterPathIdsRef,
    onPathActivated,
  } = args

  const removeEmptyPathsByIds = useCallback(
    (pathIds: string[]) => {
      if (!autoRemoveEmptyLearningPaths || pathIds.length === 0) {
        return
      }
      const unique = [...new Set(pathIds)]
      setLearningPaths((prev) =>
        prev.map((path) => (unique.includes(path.id) ? { ...path, isRemoving: true } : path)),
      )

      for (const id of unique) {
        const existingTimer = removeTimersRef.current[id]
        if (existingTimer) {
          window.clearTimeout(existingTimer)
        }
        removeTimersRef.current[id] = window.setTimeout(() => {
          void (async () => {
            try {
              await deleteLearningPathById(id)
              delete pathCacheRef.current[id]
              setLearningPaths((prev) => prev.filter((path) => path.id !== id))
            } catch (err) {
              setLearningPaths((prev) =>
                prev.map((path) => (path.id === id ? { ...path, isRemoving: false } : path)),
              )
              setError(
                err instanceof Error ? err.message : 'Leerer Lernpfad konnte nicht entfernt werden.',
              )
            } finally {
              delete removeTimersRef.current[id]
            }
          })()
        }, LEARNING_PATH_REMOVE_ANIMATION_MS)
      }
    },
    [autoRemoveEmptyLearningPaths, pathCacheRef, setError, setLearningPaths],
  )

  const handleCreateLearningPath = useCallback(async () => {
    if (!userId || isLearningPathWorkspaceLoading || createInFlightRef.current) {
      return
    }
    if (learningPaths.some((path) => path.isPending)) {
      return
    }

    createInFlightRef.current = true

    setError(null)
    const previousActiveId = activePathIdRef.current

    try {
      await persistActivePath()

      const pending = createPendingLearningPathSummary(userId)
      setLearningPaths((prev) => [pending, ...prev.filter((path) => !path.isPending)])
      setActivePathId(pending.id)
      activePathIdRef.current = pending.id
      setIsLearningPathWorkspaceLoading(true)
      resetPathStateForLoading()

      if (autoRemoveEmptyLearningPaths) {
        await deleteEmptyLearningPathsByUserId(userId)
        const remaining = await listLearningPathsByUserId(userId)
        const remainingIds = new Set(remaining.map((record) => record.id))
        for (const cachedId of Object.keys(pathCacheRef.current)) {
          if (!remainingIds.has(cachedId)) {
            delete pathCacheRef.current[cachedId]
          }
        }
        setLearningPaths((prev) => {
          const optimistic = prev.find((path) => path.id === pending.id)
          const fromServer = remaining.map((record) => toPathSummary(record))
          return optimistic ? [optimistic, ...fromServer] : fromServer
        })
      }

      const created = await createLearningPathByUserId(userId, 'Neuer Lernpfad')
      pathCacheRef.current[created.id] = created

      skipEnterPathIdsRef?.current.add(created.id)

      const pendingListKey = pending.sidebarListKey
      setLearningPaths((prev) => [
        {
          ...toPathSummary(created),
          ...(pendingListKey ? { sidebarListKey: pendingListKey } : {}),
        },
        ...prev.filter((path) => path.id !== pending.id && path.id !== created.id),
      ])

      if (activePathIdRef.current === pending.id) {
        setActivePathId(created.id)
        activePathIdRef.current = created.id
        applyPathToState(created)
        onPathActivated?.(created.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neuer Lernpfad konnte nicht erstellt werden.')
      setLearningPaths((prev) => prev.filter((path) => !path.isPending))
      if (isPendingLearningPathId(activePathIdRef.current)) {
        const fallbackId = previousActiveId && pathCacheRef.current[previousActiveId] ? previousActiveId : ''
        if (fallbackId) {
          setActivePathId(fallbackId)
          activePathIdRef.current = fallbackId
          applyPathToState(pathCacheRef.current[fallbackId]!)
        } else {
          setActivePathId('')
          activePathIdRef.current = ''
        }
      }
    } finally {
      createInFlightRef.current = false
      setIsLearningPathWorkspaceLoading(false)
    }
  }, [
    activePathIdRef,
    applyPathToState,
    autoRemoveEmptyLearningPaths,
    isLearningPathWorkspaceLoading,
    learningPaths,
    pathCacheRef,
    persistActivePath,
    resetPathStateForLoading,
    setActivePathId,
    setError,
    setLearningPaths,
    skipEnterPathIdsRef,
    onPathActivated,
    userId,
  ])

  const handleSelectLearningPath = useCallback(
    async (pathId: string) => {
      if (pathId === activePathIdRef.current || isPendingLearningPathId(pathId)) {
        return
      }

      setError(null)
      const previousPathId = activePathIdRef.current
      const previousSummary = learningPaths.find((path) => path.id === previousPathId)
      const previousSnapshot = captureEditableState()

      if (previousPathId && previousSummary) {
        persistPathInBackground(previousPathId, previousSummary.title, previousSnapshot)
      }

      if (
        autoRemoveEmptyLearningPaths &&
        previousPathId &&
        emptyCheckFromSnapshot(previousSnapshot)
      ) {
        removeEmptyPathsByIds([previousPathId])
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
      autoRemoveEmptyLearningPaths,
      captureEditableState,
      learningPaths,
      pathCacheRef,
      persistPathInBackground,
      removeEmptyPathsByIds,
      resetPathStateForLoading,
      setActivePathId,
      setError,
    ],
  )

  const handleRenameLearningPath = useCallback(
    async (pathId: string, nextTitle: string) => {
      const title = nextTitle.trim()
      if (!title || isPendingLearningPathId(pathId)) {
        return
      }

      closePathMenu()
      setError(null)

      try {
        const updated = await updateLearningPathById(pathId, { title })
        pathCacheRef.current[pathId] = updated
        setLearningPaths((prev) =>
          prev.map((path) =>
            path.id === pathId
              ? {
                  ...path,
                  title: updated.title,
                  updatedAt: updated.updatedAt,
                }
              : path,
          ),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht umbenannt werden.')
        throw err
      }
    },
    [closePathMenu, pathCacheRef, setError, setLearningPaths],
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
    handleRenameLearningPath,
    handleDeleteLearningPath,
    isLearningPathWorkspaceLoading,
  }
}
