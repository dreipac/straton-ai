import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { ContentBottomSheetHandle } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  endChatThreadSharing,
  isThreadOwner,
  listChatThreadMembersPublic,
  type ChatThreadMemberPublic,
} from '../services/chat.collaboration'
import type { ChatThread } from '../types'
import { CHAT_PAGE_MODAL_ANIMATION_MS } from '../components/chat-page/chatPageConstants'

type UseChatPageCollaborationArgs = {
  user: { id: string } | null
  activeThread: ChatThread | undefined
  isNarrowViewport: boolean
  isChatToolbarMobile: boolean
  pushToast: (message: string) => void
  endSharingSheetRef: React.RefObject<ContentBottomSheetHandle | null>
}

export function useChatPageCollaboration({
  user,
  activeThread,
  isNarrowViewport,
  isChatToolbarMobile,
  pushToast,
  endSharingSheetRef,
}: UseChatPageCollaborationArgs) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [endSharingConfirmOpen, setEndSharingConfirmOpen] = useState(false)
  const [endSharingDesktopMounted, setEndSharingDesktopMounted] = useState(false)
  const [endSharingDesktopOpen, setEndSharingDesktopOpen] = useState(false)
  const endSharingDesktopCloseTimerRef = useRef<number | null>(null)
  const [threadMembers, setThreadMembers] = useState<ChatThreadMemberPublic[]>([])
  const [threadMembersLoading, setThreadMembersLoading] = useState(false)
  const [shareActionBusy, setShareActionBusy] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const participantsAnchorRef = useRef<HTMLDivElement | null>(null)
  const participantsSheetRef = useRef<ContentBottomSheetHandle | null>(null)

  const canInviteToActiveChat = Boolean(
    user && activeThread && !activeThread.isTemporary && isThreadOwner(activeThread, user.id),
  )
  const ownsActiveThread = Boolean(user && activeThread && isThreadOwner(activeThread, user.id))
  const showMobileTitleMenu = ownsActiveThread && Boolean(activeThread?.id)

  const isPersistedThreadParticipant = Boolean(
    activeThread &&
      !activeThread.isTemporary &&
      user &&
      (activeThread.membershipRole === 'owner' || activeThread.membershipRole === 'member'),
  )
  const showCollaborationToolbar = isPersistedThreadParticipant
  const showLearningPathToolbarChip = Boolean(user && activeThread?.id)
  const showFloatingChatToolbar =
    showLearningPathToolbarChip ||
    showCollaborationToolbar ||
    (Boolean(user) && isChatToolbarMobile && !showCollaborationToolbar)

  const hasCollaborators = useMemo(
    () => threadMembers.some((m) => m.role === 'member'),
    [threadMembers],
  )

  const membersForToolbarFull = useMemo(() => {
    return hasCollaborators ? threadMembers : threadMembers.filter((m) => m.userId !== user?.id)
  }, [threadMembers, hasCollaborators, user?.id])

  const toolbarAvatars = useMemo(() => {
    const max = 6
    const list = membersForToolbarFull.slice(0, max)
    const overflow = membersForToolbarFull.length - list.length
    return { list, overflow }
  }, [membersForToolbarFull])

  const refreshThreadMembers = useCallback(async () => {
    if (!activeThread?.id || !isPersistedThreadParticipant) {
      return
    }
    setThreadMembersLoading(true)
    try {
      const list = await listChatThreadMembersPublic(activeThread.id)
      setThreadMembers(list)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Mitglieder konnten nicht geladen werden.')
    } finally {
      setThreadMembersLoading(false)
    }
  }, [activeThread?.id, isPersistedThreadParticipant, pushToast])

  useEffect(() => {
    if (!isPersistedThreadParticipant || !activeThread?.id) {
      setThreadMembers([])
      return
    }
    void refreshThreadMembers()
  }, [isPersistedThreadParticipant, activeThread?.id, refreshThreadMembers])

  useEffect(() => {
    if (!activeThread?.id || !user?.id || !isPersistedThreadParticipant) {
      return
    }
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`chat-thread-members-live-${activeThread.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_thread_members',
          filter: `thread_id=eq.${activeThread.id}`,
        },
        () => {
          void refreshThreadMembers()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeThread?.id, user?.id, isPersistedThreadParticipant, refreshThreadMembers])

  useEffect(() => {
    setParticipantsOpen(false)
  }, [activeThread?.id])

  useEffect(() => {
    if (!participantsOpen || isNarrowViewport) {
      return
    }
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const el = participantsAnchorRef.current
      if (!el?.contains(e.target as Node)) {
        setParticipantsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
    }
  }, [participantsOpen, isNarrowViewport])

  useEffect(() => {
    if (!participantsOpen || isNarrowViewport) {
      return
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setParticipantsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [participantsOpen, isNarrowViewport])

  useEffect(() => {
    return () => {
      if (endSharingDesktopCloseTimerRef.current !== null) {
        window.clearTimeout(endSharingDesktopCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!canInviteToActiveChat && endSharingDesktopMounted) {
      if (endSharingDesktopCloseTimerRef.current !== null) {
        window.clearTimeout(endSharingDesktopCloseTimerRef.current)
        endSharingDesktopCloseTimerRef.current = null
      }
      setEndSharingDesktopMounted(false)
      setEndSharingDesktopOpen(false)
    }
  }, [canInviteToActiveChat, endSharingDesktopMounted])

  function handleEndSharingSheetExitComplete() {
    setEndSharingConfirmOpen(false)
  }

  function openEndSharingDesktopModal() {
    if (endSharingDesktopCloseTimerRef.current !== null) {
      window.clearTimeout(endSharingDesktopCloseTimerRef.current)
      endSharingDesktopCloseTimerRef.current = null
    }
    setEndSharingDesktopMounted(true)
    setEndSharingDesktopOpen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setEndSharingDesktopOpen(true)
      })
    })
  }

  function closeEndSharingDesktopModal() {
    if (endSharingDesktopCloseTimerRef.current !== null) {
      window.clearTimeout(endSharingDesktopCloseTimerRef.current)
    }
    setEndSharingDesktopOpen(false)
    endSharingDesktopCloseTimerRef.current = window.setTimeout(() => {
      setEndSharingDesktopMounted(false)
      endSharingDesktopCloseTimerRef.current = null
    }, CHAT_PAGE_MODAL_ANIMATION_MS)
  }

  function closeEndSharingConfirm() {
    if (isNarrowViewport && endSharingSheetRef.current) {
      endSharingSheetRef.current.requestClose()
      return
    }
    closeEndSharingDesktopModal()
  }

  async function confirmEndSharing() {
    if (!activeThread?.id) {
      return
    }
    setShareActionBusy(true)
    try {
      await endChatThreadSharing(activeThread.id)
      await refreshThreadMembers()
      pushToast('Freigabe beendet.')
      if (isNarrowViewport) {
        endSharingSheetRef.current?.requestClose()
      } else {
        closeEndSharingDesktopModal()
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Freigabe konnte nicht beendet werden.')
    } finally {
      setShareActionBusy(false)
    }
  }

  function handleShareChipClick() {
    if (!activeThread?.id) {
      return
    }
    setParticipantsOpen(false)
    if (hasCollaborators) {
      if (isNarrowViewport) {
        setEndSharingConfirmOpen(true)
      } else {
        openEndSharingDesktopModal()
      }
      return
    }
    setInviteModalOpen(true)
  }

  function handleToolbarAvatarsClick(e: ReactMouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (membersForToolbarFull.length === 0) {
      return
    }
    if (isNarrowViewport) {
      setParticipantsOpen(true)
    } else {
      setParticipantsOpen((open) => !open)
    }
  }

  function handleParticipantsSheetExitComplete() {
    setParticipantsOpen(false)
  }

  return {
    inviteModalOpen,
    setInviteModalOpen,
    endSharingConfirmOpen,
    endSharingDesktopMounted,
    endSharingDesktopOpen,
    threadMembersLoading,
    shareActionBusy,
    participantsOpen,
    setParticipantsOpen,
    participantsAnchorRef,
    participantsSheetRef,
    canInviteToActiveChat,
    ownsActiveThread,
    showMobileTitleMenu,
    showCollaborationToolbar,
    showLearningPathToolbarChip,
    showFloatingChatToolbar,
    hasCollaborators,
    membersForToolbarFull,
    toolbarAvatars,
    refreshThreadMembers,
    handleEndSharingSheetExitComplete,
    closeEndSharingConfirm,
    confirmEndSharing,
    handleShareChipClick,
    handleToolbarAvatarsClick,
    handleParticipantsSheetExitComplete,
  }
}
