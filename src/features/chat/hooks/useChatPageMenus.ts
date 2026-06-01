import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import type { RenameBottomSheetHandle } from '../../../components/ui/bottom-sheet/RenameBottomSheet'
import { isThreadOwner } from '../services/chat.collaboration'
import type { useChatFolders } from './useChatFolders'
import type { ChatFolder, ChatThread } from '../types'
import { hapticLightImpact } from '../../../utils/haptics'
import { isMobileViewport } from '../../../utils/mobile'
import {
  CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX,
  CHAT_PAGE_LONG_PRESS_MS,
  CHAT_PAGE_MODAL_ANIMATION_MS,
} from '../components/chat-page/chatPageConstants'

type ChatFoldersState = ReturnType<typeof useChatFolders>

type UseChatPageMenusArgs = {
  user: { id: string } | null
  threads: ChatThread[]
  chatFolders: ChatFoldersState
  chatFoldersFeatureEnabled: boolean
  isCompactMobileSidebarLayout: boolean
  renameChat: (threadId: string, title: string) => Promise<void>
  pushToast: (message: string) => void
}

export function useChatPageMenus({
  user,
  threads,
  chatFolders,
  chatFoldersFeatureEnabled,
  isCompactMobileSidebarLayout,
  renameChat,
  pushToast,
}: UseChatPageMenusArgs) {
  const menuWrapperRef = useRef<HTMLDivElement | null>(null)
  const threadSheetRef = useRef<HTMLDivElement | null>(null)
  const renameSheetRef = useRef<RenameBottomSheetHandle | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)
  const folderSheetRef = useRef<HTMLDivElement | null>(null)
  const folderMenuWrapperRef = useRef<HTMLDivElement | null>(null)
  const folderLongPressTimerRef = useRef<number | null>(null)
  const folderLongPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const folderNameCloseTimerRef = useRef<number | null>(null)
  const folderMoveCloseTimerRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressThreadClickRef = useRef(false)

  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null)
  const [pressingThreadId, setPressingThreadId] = useState<string | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [threadMenuVariant, setThreadMenuVariant] = useState<'none' | 'context' | 'sheet'>('none')
  const [editingThread, setEditingThread] = useState<ChatThread | null>(null)
  const [isRenameVisible, setIsRenameVisible] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')

  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null)
  const [folderMenuVariant, setFolderMenuVariant] = useState<'none' | 'context' | 'sheet'>('none')
  const [folderContextMenuPosition, setFolderContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [folderMoveThreadId, setFolderMoveThreadId] = useState<string | null>(null)
  const [isFolderMoveModalVisible, setIsFolderMoveModalVisible] = useState(false)
  const [folderNameSheetMode, setFolderNameSheetMode] = useState<'create' | { renameFolderId: string } | null>(null)
  const [folderNameDraft, setFolderNameDraft] = useState('')
  const [isFolderNameSheetOpen, setIsFolderNameSheetOpen] = useState(false)
  const [isFolderNameModalVisible, setIsFolderNameModalVisible] = useState(false)

  const threadForMenu = useMemo(
    () => (openMenuThreadId ? threads.find((t) => t.id === openMenuThreadId) : undefined),
    [openMenuThreadId, threads],
  )
  const ownsThreadForMenu = Boolean(user && threadForMenu && isThreadOwner(threadForMenu, user.id))
  const canLeaveSharedChatForMenu = Boolean(
    user && threadForMenu && !threadForMenu.isTemporary && threadForMenu.membershipRole === 'member',
  )

  const closeThreadActionMenu = useCallback(() => {
    setOpenMenuThreadId(null)
    setContextMenuPosition(null)
    setThreadMenuVariant('none')
    setPressingThreadId(null)
  }, [])

  const closeFolderActionMenu = useCallback(() => {
    setOpenFolderMenuId(null)
    setFolderContextMenuPosition(null)
    setFolderMenuVariant('none')
  }, [])

  const openThreadContextMenuAt = useCallback((threadId: string, clientX: number, clientY: number) => {
    setOpenMenuThreadId(threadId)
    if (isMobileViewport()) {
      setThreadMenuVariant('sheet')
      setContextMenuPosition(null)
      return
    }
    setThreadMenuVariant('context')
    const margin = 8
    const menuW = 168
    const menuH = 96
    const x = Math.max(margin, Math.min(clientX, window.innerWidth - menuW - margin))
    const y = Math.max(margin, Math.min(clientY, window.innerHeight - menuH - margin))
    setContextMenuPosition({ x, y })
  }, [])

  const openThreadContextMenu = useCallback(
    (event: ReactMouseEvent, threadId: string) => {
      event.preventDefault()
      event.stopPropagation()
      openThreadContextMenuAt(threadId, event.clientX, event.clientY)
    },
    [openThreadContextMenuAt],
  )

  const cancelThreadLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
    setPressingThreadId(null)
  }, [])

  const handleThreadLongPressTouchStart = useCallback(
    (threadId: string, event: ReactTouchEvent) => {
      if (event.touches.length !== 1) {
        return
      }
      const touch = event.touches[0]
      longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
      }
      if (isMobileViewport()) {
        setPressingThreadId(threadId)
      }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null
        suppressThreadClickRef.current = true
        openThreadContextMenuAt(threadId, touch.clientX, touch.clientY)
        hapticLightImpact()
      }, CHAT_PAGE_LONG_PRESS_MS)
    },
    [openThreadContextMenuAt],
  )

  const handleThreadLongPressTouchMove = useCallback((event: ReactTouchEvent) => {
    if (!longPressStartRef.current || longPressTimerRef.current === null) {
      return
    }
    if (event.touches.length === 0) {
      return
    }
    const touch = event.touches[0]
    const dx = Math.abs(touch.clientX - longPressStartRef.current.x)
    const dy = Math.abs(touch.clientY - longPressStartRef.current.y)
    if (dx > CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX || dy > CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
      longPressStartRef.current = null
      setPressingThreadId(null)
    }
  }, [])

  const handleThreadLongPressTouchEnd = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
    setPressingThreadId(null)
  }, [])

  const buildThreadLongPressHandlers = useCallback(
    (threadId: string) => ({
      onTouchStart: (event: ReactTouchEvent<HTMLElement>) => handleThreadLongPressTouchStart(threadId, event),
      onTouchMove: handleThreadLongPressTouchMove,
      onTouchEnd: handleThreadLongPressTouchEnd,
      onTouchCancel: handleThreadLongPressTouchEnd,
    }),
    [handleThreadLongPressTouchEnd, handleThreadLongPressTouchMove, handleThreadLongPressTouchStart],
  )

  const openRenameModal = useCallback(
    (thread: ChatThread) => {
      if (renameCloseTimerRef.current !== null) {
        window.clearTimeout(renameCloseTimerRef.current)
        renameCloseTimerRef.current = null
      }

      setEditingThread(thread)
      setRenameDraft(thread.title)
      if (isMobileViewport()) {
        setIsRenameVisible(false)
      } else {
        setIsRenameVisible(false)
        window.requestAnimationFrame(() => {
          setIsRenameVisible(true)
        })
      }
      closeThreadActionMenu()
    },
    [closeThreadActionMenu],
  )

  const handleRenameSheetClosed = useCallback(() => {
    if (renameCloseTimerRef.current !== null) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }
    setEditingThread(null)
    setIsRenameVisible(false)
  }, [])

  const closeRenameModal = useCallback(() => {
    if (isMobileViewport()) {
      renameSheetRef.current?.requestClose()
      return
    }
    setIsRenameVisible(false)
    renameCloseTimerRef.current = window.setTimeout(() => {
      setEditingThread(null)
      renameCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [])

  const handleRenameSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!editingThread) {
        return
      }

      await renameChat(editingThread.id, renameDraft)
      if (isMobileViewport()) {
        renameSheetRef.current?.requestClose()
      } else {
        closeRenameModal()
      }
    },
    [closeRenameModal, editingThread, renameChat, renameDraft],
  )

  const openFolderContextMenuAt = useCallback((folderId: string, clientX: number, clientY: number) => {
    setOpenFolderMenuId(folderId)
    if (isMobileViewport()) {
      setFolderMenuVariant('sheet')
      setFolderContextMenuPosition(null)
      return
    }
    setFolderMenuVariant('context')
    const margin = 8
    const menuW = 168
    const menuH = 96
    const x = Math.max(margin, Math.min(clientX, window.innerWidth - menuW - margin))
    const y = Math.max(margin, Math.min(clientY, window.innerHeight - menuH - margin))
    setFolderContextMenuPosition({ x, y })
  }, [])

  const openFolderContextMenu = useCallback(
    (folder: ChatFolder, event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      openFolderContextMenuAt(folder.id, event.clientX, event.clientY)
    },
    [openFolderContextMenuAt],
  )

  const cancelFolderLongPress = useCallback(() => {
    if (folderLongPressTimerRef.current !== null) {
      window.clearTimeout(folderLongPressTimerRef.current)
      folderLongPressTimerRef.current = null
    }
    folderLongPressStartRef.current = null
  }, [])

  const handleFolderLongPressTouchStart = useCallback(
    (folder: ChatFolder, event: ReactTouchEvent) => {
      if (event.touches.length !== 1) {
        return
      }
      const touch = event.touches[0]
      folderLongPressStartRef.current = { x: touch.clientX, y: touch.clientY }
      if (folderLongPressTimerRef.current !== null) {
        window.clearTimeout(folderLongPressTimerRef.current)
      }
      folderLongPressTimerRef.current = window.setTimeout(() => {
        folderLongPressTimerRef.current = null
        openFolderContextMenuAt(folder.id, touch.clientX, touch.clientY)
        hapticLightImpact()
      }, CHAT_PAGE_LONG_PRESS_MS)
    },
    [openFolderContextMenuAt],
  )

  const handleFolderLongPressTouchMove = useCallback((event: ReactTouchEvent) => {
    if (!folderLongPressStartRef.current || folderLongPressTimerRef.current === null) {
      return
    }
    if (event.touches.length === 0) {
      return
    }
    const touch = event.touches[0]
    const dx = Math.abs(touch.clientX - folderLongPressStartRef.current.x)
    const dy = Math.abs(touch.clientY - folderLongPressStartRef.current.y)
    if (dx > CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX || dy > CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX) {
      cancelFolderLongPress()
    }
  }, [cancelFolderLongPress])

  const handleFolderLongPressTouchEnd = useCallback(() => {
    cancelFolderLongPress()
  }, [cancelFolderLongPress])

  const openFolderNameDialog = useCallback(
    (mode: 'create' | { renameFolderId: string }, draft: string) => {
      if (folderNameCloseTimerRef.current !== null) {
        window.clearTimeout(folderNameCloseTimerRef.current)
        folderNameCloseTimerRef.current = null
      }

      setFolderNameDraft(draft)
      setFolderNameSheetMode(mode)
      setIsFolderNameSheetOpen(true)

      if (!isCompactMobileSidebarLayout) {
        setIsFolderNameModalVisible(false)
        window.requestAnimationFrame(() => {
          setIsFolderNameModalVisible(true)
        })
      }
    },
    [isCompactMobileSidebarLayout],
  )

  const openCreateFolderSheet = useCallback(() => {
    if (!chatFoldersFeatureEnabled) {
      return
    }
    openFolderNameDialog('create', '')
  }, [chatFoldersFeatureEnabled, openFolderNameDialog])

  const openRenameFolderSheet = useCallback(
    (folder: ChatFolder) => {
      closeFolderActionMenu()
      openFolderNameDialog({ renameFolderId: folder.id }, folder.name)
    },
    [closeFolderActionMenu, openFolderNameDialog],
  )

  const closeFolderNameSheet = useCallback(() => {
    if (isCompactMobileSidebarLayout) {
      setIsFolderNameSheetOpen(false)
      setFolderNameSheetMode(null)
      setFolderNameDraft('')
      return
    }

    setIsFolderNameModalVisible(false)
    folderNameCloseTimerRef.current = window.setTimeout(() => {
      setIsFolderNameSheetOpen(false)
      setFolderNameSheetMode(null)
      setFolderNameDraft('')
      folderNameCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [isCompactMobileSidebarLayout])

  const handleFolderNameSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = folderNameDraft.trim()
      if (!trimmed) {
        return
      }
      try {
        if (folderNameSheetMode === 'create') {
          await chatFolders.createFolder(trimmed)
          pushToast('Ordner erstellt.')
        } else if (folderNameSheetMode && typeof folderNameSheetMode === 'object') {
          await chatFolders.renameFolder(folderNameSheetMode.renameFolderId, trimmed)
          pushToast('Ordner umbenannt.')
        }
        closeFolderNameSheet()
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Ordner konnte nicht gespeichert werden.')
      }
    },
    [chatFolders, closeFolderNameSheet, folderNameDraft, folderNameSheetMode, pushToast],
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      closeFolderActionMenu()
      try {
        await chatFolders.removeFolder(folderId)
        pushToast('Ordner gelöscht. Chats sind wieder ohne Ordner.')
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Ordner konnte nicht gelöscht werden.')
      }
    },
    [chatFolders, closeFolderActionMenu, pushToast],
  )

  const openFolderMoveDialog = useCallback(
    (threadId: string) => {
      if (!chatFoldersFeatureEnabled) {
        return
      }
      if (folderMoveCloseTimerRef.current !== null) {
        window.clearTimeout(folderMoveCloseTimerRef.current)
        folderMoveCloseTimerRef.current = null
      }

      setFolderMoveThreadId(threadId)

      if (!isCompactMobileSidebarLayout) {
        setIsFolderMoveModalVisible(false)
        window.requestAnimationFrame(() => {
          setIsFolderMoveModalVisible(true)
        })
      }
    },
    [chatFoldersFeatureEnabled, isCompactMobileSidebarLayout],
  )

  const closeFolderMoveDialog = useCallback(() => {
    if (isCompactMobileSidebarLayout) {
      setFolderMoveThreadId(null)
      return
    }

    setIsFolderMoveModalVisible(false)
    folderMoveCloseTimerRef.current = window.setTimeout(() => {
      setFolderMoveThreadId(null)
      folderMoveCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }, [isCompactMobileSidebarLayout])

  const handleMoveThreadToFolder = useCallback(
    async (threadId: string, folderId: string | null) => {
      closeFolderMoveDialog()
      closeThreadActionMenu()
      try {
        await chatFolders.moveThreadToFolder(threadId, folderId)
        pushToast(folderId ? 'Chat verschoben.' : 'Chat aus Ordner entfernt.')
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Chat konnte nicht verschoben werden.')
      }
    },
    [chatFolders, closeFolderMoveDialog, closeThreadActionMenu, pushToast],
  )

  useEffect(() => {
    if (!chatFoldersFeatureEnabled) {
      setOpenFolderMenuId(null)
      setFolderContextMenuPosition(null)
      setFolderMenuVariant('none')
      setFolderMoveThreadId(null)
      setIsFolderMoveModalVisible(false)
      setFolderNameSheetMode(null)
      setIsFolderNameSheetOpen(false)
      setIsFolderNameModalVisible(false)
    }
  }, [chatFoldersFeatureEnabled])

  useEffect(() => {
    return () => {
      if (renameCloseTimerRef.current !== null) {
        window.clearTimeout(renameCloseTimerRef.current)
      }
      if (folderNameCloseTimerRef.current !== null) {
        window.clearTimeout(folderNameCloseTimerRef.current)
      }
      if (folderMoveCloseTimerRef.current !== null) {
        window.clearTimeout(folderMoveCloseTimerRef.current)
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  return {
    menuWrapperRef,
    threadSheetRef,
    renameSheetRef,
    folderSheetRef,
    folderMenuWrapperRef,
    suppressThreadClickRef,
    openMenuThreadId,
    pressingThreadId,
    threadMenuVariant,
    contextMenuPosition,
    ownsThreadForMenu,
    canLeaveSharedChatForMenu,
    editingThread,
    isRenameVisible,
    renameDraft,
    setRenameDraft,
    openFolderMenuId,
    folderMenuVariant,
    folderContextMenuPosition,
    folderMoveThreadId,
    isFolderMoveModalVisible,
    folderNameSheetMode,
    folderNameDraft,
    setFolderNameDraft,
    isFolderNameSheetOpen,
    isFolderNameModalVisible,
    closeThreadActionMenu,
    closeFolderActionMenu,
    openThreadContextMenu,
    openRenameModal,
    buildThreadLongPressHandlers,
    cancelThreadLongPress,
    openFolderContextMenu,
    handleFolderLongPressTouchStart,
    handleFolderLongPressTouchMove,
    handleFolderLongPressTouchEnd,
    openCreateFolderSheet,
    openRenameFolderSheet,
    closeFolderNameSheet,
    handleFolderNameSubmit,
    handleDeleteFolder,
    openFolderMoveDialog,
    closeFolderMoveDialog,
    handleMoveThreadToFolder,
    closeRenameModal,
    handleRenameSheetClosed,
    handleRenameSubmit,
  }
}
