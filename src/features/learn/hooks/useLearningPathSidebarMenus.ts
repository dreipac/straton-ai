import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { MouseEvent as ReactMouseEvent, FormEvent } from 'react'
import type { RenameBottomSheetHandle } from '../../../components/ui/bottom-sheet/RenameBottomSheet'
import { isMobileViewport } from '../../../utils/mobile'
import {
  deleteLearningPathById,
  updateLearningPathById,
  type LearningPathSummary,
} from '../services/learn.persistence'
import { getDisplayPathTitle, isPendingLearningPathId } from '../utils/learnPageHelpers'

const RENAME_MODAL_ANIMATION_MS = 220

type UseLearningPathSidebarMenusArgs = {
  learningPaths: LearningPathSummary[]
  setLearningPaths: Dispatch<SetStateAction<LearningPathSummary[]>>
  activeLearnPathId: string | null
  onDeletedActivePath?: (nextPathId: string | null) => void
  pushToast?: (message: string) => void
}

export function useLearningPathSidebarMenus({
  learningPaths,
  setLearningPaths,
  activeLearnPathId,
  onDeletedActivePath,
  pushToast,
}: UseLearningPathSidebarMenusArgs) {
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const renameSheetRef = useRef<RenameBottomSheetHandle | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)

  const [openMenuPathId, setOpenMenuPathId] = useState<string | null>(null)
  const [pathMenuVariant, setPathMenuVariant] = useState<'none' | 'context' | 'sheet'>('none')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [renamingPathId, setRenamingPathId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isRenameVisible, setIsRenameVisible] = useState(false)

  const closeLearningPathMenu = useCallback(() => {
    setOpenMenuPathId(null)
    setContextMenuPosition(null)
    setPathMenuVariant('none')
  }, [])

  const openLearningPathContextMenu = useCallback(
    (event: ReactMouseEvent, pathId: string) => {
      event.preventDefault()
      event.stopPropagation()
      if (isPendingLearningPathId(pathId)) {
        return
      }
      if (isMobileViewport()) {
        setOpenMenuPathId(pathId)
        setPathMenuVariant('sheet')
        setContextMenuPosition(null)
        return
      }
      const margin = 8
      const menuW = 168
      const menuH = 96
      const x = Math.max(margin, Math.min(event.clientX, window.innerWidth - menuW - margin))
      const y = Math.max(margin, Math.min(event.clientY, window.innerHeight - menuH - margin))
      setOpenMenuPathId(pathId)
      setPathMenuVariant('context')
      setContextMenuPosition({ x, y })
    },
    [],
  )

  const openRenameLearningPathModal = useCallback(
    (pathId: string) => {
      const path = learningPaths.find((item) => item.id === pathId)
      if (!path || isPendingLearningPathId(pathId)) {
        return
      }
      closeLearningPathMenu()
      if (renameCloseTimerRef.current !== null) {
        window.clearTimeout(renameCloseTimerRef.current)
        renameCloseTimerRef.current = null
      }
      setRenamingPathId(pathId)
      setRenameDraft(getDisplayPathTitle(path.title))
      setIsRenameVisible(false)
      window.requestAnimationFrame(() => {
        setIsRenameVisible(true)
      })
    },
    [closeLearningPathMenu, learningPaths],
  )

  const closeRenameLearningPathModal = useCallback(() => {
    if (isMobileViewport()) {
      renameSheetRef.current?.requestClose()
      return
    }
    setIsRenameVisible(false)
    renameCloseTimerRef.current = window.setTimeout(() => {
      setRenamingPathId(null)
      renameCloseTimerRef.current = null
    }, RENAME_MODAL_ANIMATION_MS)
  }, [])

  const handleRenameSheetClosed = useCallback(() => {
    if (renameCloseTimerRef.current !== null) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }
    setRenamingPathId(null)
    setIsRenameVisible(false)
  }, [])

  const handleRenameLearningPathSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!renamingPathId || !renameDraft.trim()) {
        return
      }
      const title = renameDraft.trim()
      try {
        const updated = await updateLearningPathById(renamingPathId, { title })
        setLearningPaths((prev) =>
          prev.map((path) =>
            path.id === renamingPathId
              ? {
                  ...path,
                  title: updated.title,
                  updatedAt: updated.updatedAt,
                }
              : path,
          ),
        )
        closeRenameLearningPathModal()
      } catch (err) {
        pushToast?.(err instanceof Error ? err.message : 'Lernpfad konnte nicht umbenannt werden.')
      }
    },
    [closeRenameLearningPathModal, pushToast, renameDraft, renamingPathId, setLearningPaths],
  )

  const handleDeleteLearningPath = useCallback(
    async (pathId: string) => {
      if (isPendingLearningPathId(pathId)) {
        return
      }
      closeLearningPathMenu()
      try {
        await deleteLearningPathById(pathId)
        let nextActivePathId: string | null = null
        setLearningPaths((prev) => {
          const next = prev.filter((path) => path.id !== pathId)
          if (activeLearnPathId === pathId) {
            nextActivePathId = next[0]?.id ?? null
          }
          return next
        })
        if (activeLearnPathId === pathId) {
          onDeletedActivePath?.(nextActivePathId)
        }
      } catch (err) {
        pushToast?.(err instanceof Error ? err.message : 'Lernpfad konnte nicht gelöscht werden.')
      }
    },
    [activeLearnPathId, closeLearningPathMenu, onDeletedActivePath, pushToast, setLearningPaths],
  )

  return {
    pathMenuRef,
    renameSheetRef,
    openMenuPathId,
    pathMenuVariant,
    contextMenuPosition,
    openLearningPathContextMenu,
    closeLearningPathMenu,
    openRenameLearningPathModal,
    closeRenameLearningPathModal,
    handleRenameSheetClosed,
    handleRenameLearningPathSubmit,
    handleDeleteLearningPath,
    renamingPathId,
    renameDraft,
    setRenameDraft,
    isRenameVisible,
  }
}
