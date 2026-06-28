import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { type ContentBottomSheetHandle } from '../components/ui/bottom-sheet/ContentBottomSheet'
import { useAuth } from '../features/auth/context/useAuth'
import {
  getAvatarFallbackLetter,
  getGreetingFirstName,
  getUserDisplayName,
} from '../features/auth/utils/userDisplay'
import {
  parseChatDailyTierConfigFromPlan,
  parseThinkingTierConfigFromPlan,
} from '../features/chat/constants/chatDailyOpenAiTier'
import { resolveChatProfileIdentity } from '../features/chat/constants/chatProfileIdentityContext'
import { resolveChatUserIntroduction } from '../features/chat/constants/chatUserIntroductionContext'
import { resolveChatSubscriptionUsageContext } from '../features/chat/constants/chatSubscriptionUsageContext'
import { DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS } from '../features/chat/constants/mainChatContext'
import { getChatModelPolicyFromPlan } from '../features/chat/constants/chatComposerModels'
import { ChatOnboardingTour } from '../features/chat/components/ChatOnboardingTour'
import { ChatEndSharingDialogs } from '../features/chat/components/chat-page/ChatEndSharingDialogs'
import { ChatLearningPathDraftSidebar } from '../features/chat/components/chat-page/ChatLearningPathDraftSidebar'
import { ChatMainCollaborationToolbar } from '../features/chat/components/chat-page/ChatMainCollaborationToolbar'
import { ChatPageGuestView } from '../features/chat/components/chat-page/ChatPageGuestView'
import { ChatPageMobileBottomDock } from '../features/chat/components/chat-page/ChatPageMobileBottomDock'
import { ChatPageMobileTopBar } from '../features/chat/components/chat-page/ChatPageMobileTopBar'
import { ChatPageOverlays } from '../features/chat/components/chat-page/ChatPageOverlays'
import { ChatPageSidebar } from '../features/chat/components/chat-page/ChatPageSidebar'
import { ChatFoldersMobilePanel } from '../features/chat/components/ChatFoldersMobilePanel'
import { ChatFolderOverview } from '../features/chat/components/ChatFolderOverview'
import { ChatFriendsOverview } from '../features/friends/components/ChatFriendsOverview'
import { useFriends } from '../features/friends/hooks/useFriends'
import type { ChatFriendsOverviewTab } from '../features/friends/types'
import { ChatSidebarThreadRow } from '../features/chat/components/ChatSidebarThreadRow'
import { ChatWindow } from '../features/chat/components/ChatWindow'
import { InviteToChatModal } from '../features/chat/components/InviteToChatModal'
import { useChat } from '../features/chat/hooks/useChat'
import { useChatFolders } from '../features/chat/hooks/useChatFolders'
import { useChatFolderFiles } from '../features/chat/hooks/useChatFolderFiles'
import { useChatPageCollaboration } from '../features/chat/hooks/useChatPageCollaboration'
import { useChatPageFeatureFlags } from '../features/chat/hooks/useChatPageFeatureFlags'
import { useChatLearningPathDraft } from '../features/chat/hooks/useChatLearningPathDraft'
import { useChatPageMenus } from '../features/chat/hooks/useChatPageMenus'
import { useChatPageMobileShell } from '../features/chat/hooks/useChatPageMobileShell'
import { useChatPageModals } from '../features/chat/hooks/useChatPageModals'
import { useChatPageOverlayDismiss } from '../features/chat/hooks/useChatPageOverlayDismiss'
import { useGuestChatComposerPrefs } from '../features/chat/hooks/useGuestChatComposerPrefs'
import { getChatPageTokenLimitReached } from '../features/chat/utils/chatPageSubscriptionDisplay'
import { useChatPageEnter, useChatThreadListSkeletonVisibility } from '../features/chat/hooks/useChatPageEnter'
import type { ChatFolderOverviewTab, ChatThread } from '../features/chat/types'
import { createChatFolderFileSignedUrl, listChatFolderFiles } from '../features/chat/services/chat.folderFiles'
import { hapticLightImpact } from '../utils/haptics'
import { useDocumentThemeVariant } from '../hooks/useDocumentThemeVariant'
import { useChatToolbarMobileViewport } from '../hooks/useChatToolbarMobileViewport'
import { useMobileSidebarEdgeSwipe } from '../hooks/useMobileSidebarEdgeSwipe'
import { useIsMobileViewport } from '../hooks/useIsMobileViewport'
import { useToast } from '../components/toast/ToastProvider'
import { useNewsUnreadCount } from '../features/news/hooks/useNewsUnreadCount'
import { AuthSessionBootstrap } from '../features/auth/components/AuthSessionBootstrap'
import { LearnPage } from './LearnPage'
import { useLearningPathsSidebar } from '../features/learn/hooks/useLearningPathsSidebar'
import { useLearningPathSidebarMenus } from '../features/learn/hooks/useLearningPathSidebarMenus'
export function ChatPage() {
  const { user, profile, logout, isLoading, completeChatOnboarding, markBetaNoticeSeen, updateUserIntroduction, refreshProfile } = useAuth()
  const { push: pushToast } = useToast()
  const { unreadCount: newsUnreadCount } = useNewsUnreadCount(Boolean(user))
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  /** Breakpoint wie `mobile.ts` — Modale vs. Bottom Sheets (Freigabe, Beta, …). */
  const isNarrowViewport = useIsMobileViewport()
  /** Wie Freigabe-Leiste: max-width 860px — Comfort/Strict nativ in der Oberleiste. */
  const isChatToolbarMobile = useChatToolbarMobileViewport()
  const chatModelPolicy = useMemo(
    () =>
      user ? getChatModelPolicyFromPlan(profile?.subscription_plans ?? null) : getChatModelPolicyFromPlan(null),
    [user, profile?.subscription_plans],
  )
  /** Profil kommt nach Session — ohne Plan keine Modellauswahl-Flash für gesperrte Abos. */
  const isChatModelPolicyReady = !user || profile !== null
  /** Custom-Modus nur bei expliziter Abo-Freigabe. */
  const customModeAllowed = profile?.subscription_plans?.chat_allow_custom_mode === true
  const mainChatDailyTierConfig = useMemo(
    () =>
      user && profile?.subscription_plans?.chat_allow_model_choice === false
        ? parseChatDailyTierConfigFromPlan(profile.subscription_plans)
        : undefined,
    [user, profile?.subscription_plans],
  )
  const mainChatThinkingTierConfig = useMemo(
    () => parseThinkingTierConfigFromPlan(profile?.subscription_plans ?? null),
    [profile?.subscription_plans],
  )
  const mainChatContextMaxTokens = useMemo((): number | null => {
    if (!profile?.subscription_plans) {
      return DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
    }
    const v = profile.subscription_plans.chat_context_max_tokens
    if (v === null) {
      return null
    }
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return v
    }
    return DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
  }, [profile?.subscription_plans])

  const chatProfileIdentity = useMemo(
    () => resolveChatProfileIdentity(user, profile),
    [user, profile?.first_name, profile?.last_name, user?.email, user?.user_metadata],
  )

  const chatUserIntroduction = useMemo(
    () => resolveChatUserIntroduction(profile),
    [
      profile?.introduction_completed,
      profile?.introduction_mode,
      profile?.introduction_text,
      profile?.introduction_answers,
      profile?.introduction_updated_at,
    ],
  )

  const chatSubscriptionUsage = useMemo(
    () => (user ? resolveChatSubscriptionUsageContext(profile) : null),
    [user, profile?.subscription_plans, profile?.subscription_usages],
  )

  const featureFlags = useChatPageFeatureFlags({ user, profile, isLoading })
  const {
    instantAnalyzeDebugEnabled,
    chatFoldersFeatureEnabled,
    showBetaNoticeOnFirstLogin,
    isAdmin,
    isLearnPathsButtonDisabled,
    isLearnPathCreateButtonDisabled,
    chatTourEligible,
  } = featureFlags

  const chatFoldersRef = useRef<{
    folders: { id: string; name: string }[]
    getThreadFolderId: (threadId: string) => string | null
  } | null>(null)
  const resolveThreadFolderContext = useCallback(
    async (threadId: string) => {
      const foldersState = chatFoldersRef.current
      if (!user?.id || !foldersState) {
        return null
      }
      const folderId = foldersState.getThreadFolderId(threadId)
      if (!folderId) {
        return null
      }
      const folder = foldersState.folders.find((item) => item.id === folderId)
      if (!folder) {
        return null
      }
      const files = await listChatFolderFiles(user.id, folderId)
      return {
        folderId,
        folderName: folder.name,
        files,
      }
    },
    [user?.id],
  )

  const {
    threads,
    activeThreadId,
    messages,
    isSending,
    sendPhase,
    isBootstrapping,
    error,
    submitMessage,
    submitPptxEditMessage,
    applyPptxPresetSwitch,
    cancelSend,
    finalizeWordDocumentExport,
    wordFinalizeBusy,
    finalizePdfDocumentExport,
    pdfFinalizeBusy,
    finalizeExcelDocumentExport,
    excelFinalizeBusy,
    finalizePptxDocumentExport,
    pptxFinalizeBusy,
    createNewChat,
    renameChat,
    archiveChat,
    deleteChat,
    leaveSharedChatAsMember,
    selectChat,
    composerModelId,
    setComposerModelId,
    chatReplyMode,
    setChatReplyMode,
    chatThinkingMode,
    setChatThinkingMode,
    thinkingClarifyDialog,
    dismissThinkingClarify,
    thinkingCreditsRemaining,
    thinkingCreditsBlocked,
    liveInstantAnalyzeDebug,
    liveThinkingAnalyzeDebug,
  } = useChat(user?.id, profile?.auto_remove_empty_chats ?? true, chatModelPolicy, {
    persistAiChatMemory: false,
    mainChatUsedTokensToday: user ? (profile?.subscription_usages?.used_tokens ?? 0) : undefined,
    mainChatDailyTierConfig: user ? mainChatDailyTierConfig : undefined,
    mainChatThinkingTierConfig: user ? mainChatThinkingTierConfig : undefined,
    mainChatContextMaxTokens: user ? mainChatContextMaxTokens : DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS,
    webSearchCreditBalance: profile?.subscription_usages?.web_search_credit_balance ?? 0,
    isSuperadmin: profile?.is_superadmin === true,
    instantAnalyzeDebugEnabled: profile?.is_superadmin === true && instantAnalyzeDebugEnabled,
    onWebSearchCreditsConsumed: refreshProfile,
    thinkingCreditBalance: profile?.subscription_usages?.thinking_credit_balance ?? 0,
    onThinkingCreditsConsumed: refreshProfile,
    profileIdentity: chatProfileIdentity,
    userIntroduction: chatUserIntroduction,
    subscriptionUsage: chatSubscriptionUsage,
    customModeAllowed,
    resolveThreadFolderContext,
  })
  const chatFolders = useChatFolders(user?.id, threads)
  chatFoldersRef.current = chatFolders
  const folderIdFromUrl = searchParams.get('folder')
  const folderTabFromUrl: ChatFolderOverviewTab = searchParams.get('tab') === 'files' ? 'files' : 'chats'
  const isFriendsOverviewFromUrl = searchParams.get('friends') === '1'
  const learnPathIdFromUrl = searchParams.get('learnPath')
  const isLearnWorkspaceOpen = Boolean(
    user && !isLearnPathsButtonDisabled && (searchParams.get('learn') === '1' || Boolean(learnPathIdFromUrl)),
  )
  const pendingCreateLearningPath = searchParams.get('learnCreate') === '1'
  const friendsTabFromUrl: ChatFriendsOverviewTab =
    searchParams.get('friendsTab') === 'pending' ? 'pending' : 'friends'
  const activeOverviewFolder = useMemo(() => {
    if (!folderIdFromUrl) {
      return null
    }
    return chatFolders.folders.find((folder) => folder.id === folderIdFromUrl) ?? null
  }, [chatFolders.folders, folderIdFromUrl])
  const isFolderOverviewOpen = Boolean(
    activeOverviewFolder && chatFoldersFeatureEnabled && !isFriendsOverviewFromUrl && !isLearnWorkspaceOpen,
  )
  const isFriendsOverviewOpen = Boolean(user && isFriendsOverviewFromUrl && !isLearnWorkspaceOpen)
  const friendsState = useFriends(user?.id)
  const learningPathsSidebar = useLearningPathsSidebar(user?.id)
  const folderOverviewThreads = useMemo(() => {
    if (!activeOverviewFolder) {
      return []
    }
    return chatFolders.threadsByFolderId.get(activeOverviewFolder.id) ?? []
  }, [activeOverviewFolder, chatFolders.threadsByFolderId])
  const folderFilesState = useChatFolderFiles({
    userId: user?.id,
    folderId: isFolderOverviewOpen ? activeOverviewFolder?.id ?? null : null,
    maxFiles: profile?.subscription_plans?.max_files ?? null,
    usedFiles: profile?.subscription_usages?.used_files ?? 0,
  })
  const isPageEnter = useChatPageEnter()
  const {
    threadSkeletonMounted,
    threadSkeletonExiting,
    handleThreadSkeletonTransitionEnd,
  } = useChatThreadListSkeletonVisibility(isBootstrapping)

  const pageEnterShellClass = isPageEnter ? ' is-page-enter' : ''
  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId),
    [threads, activeThreadId],
  )
  const mobileToolbarChatTitle = useMemo(() => {
    const title = activeThread?.title?.trim()
    return title || 'Neuer Chat'
  }, [activeThread?.title])

  const [isNewChatPending, setIsNewChatPending] = useState(false)
  const endSharingSheetRef = useRef<ContentBottomSheetHandle | null>(null)

  const mobileShell = useChatPageMobileShell({
    chatTourEligible,
    chatFoldersFeatureEnabled,
  })

  const pageModals = useChatPageModals({
    user,
    profile,
    isCompactMobileSidebarLayout: mobileShell.isCompactMobileSidebarLayout,
    isNarrowViewport,
    showBetaNoticeOnFirstLogin,
    markBetaNoticeSeen,
    updateUserIntroduction,
    refreshProfile,
    setIsMobileSidebarOpen: mobileShell.setIsMobileSidebarOpen,
  })

  const pageMenus = useChatPageMenus({
    user,
    threads,
    chatFolders,
    chatFoldersFeatureEnabled,
    isCompactMobileSidebarLayout: mobileShell.isCompactMobileSidebarLayout,
    renameChat,
    pushToast,
  })

  const collaboration = useChatPageCollaboration({
    user,
    activeThread,
    isNarrowViewport,
    isChatToolbarMobile,
    pushToast,
    endSharingSheetRef,
  })

  const learnDraft = useChatLearningPathDraft({
    activeThreadId,
    messages,
    isLearnPathCreateButtonDisabled,
    pushToast,
  })

  const guestPrefs = useGuestChatComposerPrefs()

  const {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isMobileFoldersOpen,
    setIsMobileFoldersOpen,
    isCompactMobileSidebarLayout,
    chatTourOverlayActive,
    showFoldersInSidebar,
    isMobileFoldersTabDisabled,
    swipeOpenThreadId,
    setSwipeOpenThreadId,
    mobileBottomNavTabIndex,
    guestMobileBottomNavTabIndex,
    mobileChatBottomTabActive,
    mobileFoldersBottomTabActive,
    pillAccentPulseActive,
    guestPillAccentPulseActive,
    mobileBottomNavSpring,
    mobileNewChatTouch,
    sidebarNewChatTouch,
    mobileTopBarModeTouch,
    mobileTopBarTitleTouch,
    mobileTopBarMenuTouch,
    startPillAccentPulse,
    setOptimisticPillTabIndex,
    setGuestOptimisticPillTabIndex,
  } = mobileShell

  const sidebarThreadList = showFoldersInSidebar ? chatFolders.threadsWithoutFolder : threads

  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const sidebarEdgeSwipe = useMobileSidebarEdgeSwipe({
    enabled: isCompactMobileSidebarLayout,
    isOpen: isMobileSidebarOpen,
    swipeOpenBlocked: chatTourEligible || pageModals.mobileSheetMode !== 'closed',
    swipeCloseBlocked: chatTourEligible,
    onOpen: () => {
      setIsMobileFoldersOpen(false)
      setIsSidebarCollapsed(false)
      setIsMobileSidebarOpen(true)
      hapticLightImpact()
    },
    onClose: () => {
      setIsMobileSidebarOpen(false)
    },
  })

  useChatPageOverlayDismiss({
    isCompactMobileSidebarLayout,
    mobileSheetMode: pageModals.mobileSheetMode,
    openMenuThreadId: pageMenus.openMenuThreadId,
    openFolderMenuId: pageMenus.openFolderMenuId,
    folderMoveThreadId: pageMenus.folderMoveThreadId,
    chatTourEligible,
    menuWrapperRef: pageMenus.menuWrapperRef,
    threadSheetRef: pageMenus.threadSheetRef,
    folderMenuWrapperRef: pageMenus.folderMenuWrapperRef,
    folderSheetRef: pageMenus.folderSheetRef,
    profileMenuRef,
    profileFullSheetRef: pageModals.profileFullSheetRef,
    closeThreadActionMenu: pageMenus.closeThreadActionMenu,
    closeFolderActionMenu: pageMenus.closeFolderActionMenu,
    closeFolderMoveDialog: pageMenus.closeFolderMoveDialog,
    setIsMobileSidebarOpen,
    setIsMobileFoldersOpen,
  })

  const newChatTourRef = useRef<HTMLButtonElement | null>(null)
  const learnTourRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chatFoldersFeatureEnabled) {
      setIsMobileFoldersOpen(false)
      pageMenus.closeFolderActionMenu()
      pageMenus.closeFolderMoveDialog()
      pageMenus.closeFolderNameSheet()
      if (folderIdFromUrl) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('folder')
            next.delete('tab')
            return next
          },
          { replace: true },
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable menu closers from useChatPageMenus
  }, [chatFoldersFeatureEnabled, folderIdFromUrl])

  useEffect(() => {
    if (!folderIdFromUrl || !chatFoldersFeatureEnabled || chatFolders.isLoading) {
      return
    }
    if (!chatFolders.folders.some((folder) => folder.id === folderIdFromUrl)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('folder')
          next.delete('tab')
          return next
        },
        { replace: true },
      )
    }
  }, [chatFolders.folders, chatFolders.isLoading, chatFoldersFeatureEnabled, folderIdFromUrl, setSearchParams])

  useEffect(() => {
    if (!isFriendsOverviewFromUrl) {
      return
    }
    if (!user) {
      closeFriendsOverview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeFriendsOverview is stable URL helper
  }, [isFriendsOverviewFromUrl, user])

  function clearOverlaySearchParams(params: URLSearchParams) {
    params.delete('folder')
    params.delete('tab')
    params.delete('friends')
    params.delete('friendsTab')
    params.delete('learnPath')
    params.delete('learn')
    params.delete('learnCreate')
  }

  function dismissMainOverlays() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        clearOverlaySearchParams(next)
        return next
      },
      { replace: true },
    )
  }

  function closeFolderOverview() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('folder')
        next.delete('tab')
        return next
      },
      { replace: true },
    )
  }

  function closeLearnWorkspace() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('learnPath')
        next.delete('learn')
        next.delete('learnCreate')
        return next
      },
      { replace: true },
    )
  }

  function openLearnWorkspace(pathId?: string, options?: { create?: boolean }) {
    if (!user || isLearnPathsButtonDisabled) {
      learnDraft.showLearnFeatureUnavailableInfo()
      return
    }
    if (options?.create && searchParams.get('learnCreate') === '1') {
      return
    }
    if (
      options?.create &&
      learningPathsSidebar.learningPaths.some((path) => path.isPending || path.isRemoving)
    ) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        clearOverlaySearchParams(next)
        if (pathId) {
          next.set('learnPath', pathId)
        } else {
          next.set('learn', '1')
        }
        if (options?.create) {
          next.set('learnCreate', '1')
        }
        return next
      },
      { replace: false },
    )
    setIsMobileSidebarOpen(false)
    setIsMobileFoldersOpen(false)
    pageMenus.closeThreadActionMenu()
    pageMenus.closeFolderActionMenu()
    pageModals.profileFullSheetRef.current?.requestClose()
  }

  const learningPathMenus = useLearningPathSidebarMenus({
    learningPaths: learningPathsSidebar.learningPaths,
    setLearningPaths: learningPathsSidebar.setLearningPaths,
    activeLearnPathId: learnPathIdFromUrl,
    onDeletedActivePath: (nextPathId) => {
      if (nextPathId) {
        openLearnWorkspace(nextPathId)
        return
      }
      closeLearnWorkspace()
    },
    pushToast,
  })

  const handleLearnControlledPathIdChange = useCallback(
    (pathId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('learnPath', pathId)
          next.delete('learn')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handlePendingCreateLearningPathHandled = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('learnCreate')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  function closeFriendsOverview() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('friends')
        next.delete('friendsTab')
        return next
      },
      { replace: true },
    )
  }

  function openFriendsOverview(tab: ChatFriendsOverviewTab = 'friends') {
    if (!user) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        clearOverlaySearchParams(next)
        next.set('friends', '1')
        next.set('friendsTab', tab)
        return next
      },
      { replace: false },
    )
    setIsMobileSidebarOpen(false)
    setIsMobileFoldersOpen(false)
    pageMenus.closeThreadActionMenu()
    pageMenus.closeFolderActionMenu()
    pageModals.profileFullSheetRef.current?.requestClose()
  }

  function setFriendsOverviewTab(tab: ChatFriendsOverviewTab) {
    if (!isFriendsOverviewOpen) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('friends', '1')
        next.set('friendsTab', tab)
        return next
      },
      { replace: true },
    )
  }

  function openFolderOverview(folderId: string, tab: ChatFolderOverviewTab = 'chats') {
    if (!chatFoldersFeatureEnabled) {
      return
    }
    if (folderIdFromUrl === folderId) {
      closeFolderOverview()
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        clearOverlaySearchParams(next)
        next.set('folder', folderId)
        next.set('tab', tab)
        return next
      },
      { replace: false },
    )
    setIsMobileSidebarOpen(false)
    setIsMobileFoldersOpen(false)
    pageMenus.closeThreadActionMenu()
    pageMenus.closeFolderActionMenu()
    pageModals.profileFullSheetRef.current?.requestClose()
  }

  function setFolderOverviewTab(tab: ChatFolderOverviewTab) {
    if (!activeOverviewFolder) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('folder', activeOverviewFolder.id)
        next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }

  async function deleteThreadFromSwipe(threadId: string) {
    try {
      await deleteChat(threadId, { animateRemoval: false, optimisticListRemoval: true })
    } catch {
      /* Fehleranzeige in useChat */
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function selectMobileBottomNavTab(index: 0 | 1 | 2) {
    if (index === 2 && !chatFoldersFeatureEnabled) {
      return
    }
    setOptimisticPillTabIndex(index)
    startPillAccentPulse('main')
    if (index === 0) {
      setIsMobileFoldersOpen(false)
      setIsSidebarCollapsed(false)
      setIsMobileSidebarOpen(true)
      return
    }
    if (index === 1) {
      setIsMobileFoldersOpen(false)
      setIsMobileSidebarOpen(false)
      dismissMainOverlays()
      pageModals.profileFullSheetRef.current?.requestClose()
      pageMenus.closeThreadActionMenu()
      pageMenus.closeFolderActionMenu()
      return
    }
    setIsMobileFoldersOpen(true)
    setIsMobileSidebarOpen(false)
    pageModals.profileFullSheetRef.current?.requestClose()
    pageMenus.closeThreadActionMenu()
    pageMenus.closeFolderActionMenu()
  }

  function selectGuestMobileBottomNavTab(index: 0 | 1) {
    setGuestOptimisticPillTabIndex(index)
    startPillAccentPulse('guest')
  }

  function toggleMobileSidebarFromBottomNav() {
    if (chatTourEligible) {
      return
    }
    const nextSidebarOpen = !isMobileSidebarOpen
    if (user) {
      if (nextSidebarOpen) {
        hapticLightImpact()
      }
      selectMobileBottomNavTab(nextSidebarOpen ? 0 : 1)
      return
    }
    const nextPillIndex = nextSidebarOpen ? 0 : 1
    selectGuestMobileBottomNavTab(nextPillIndex as 0 | 1)
    setIsSidebarCollapsed(false)
    setIsMobileSidebarOpen((prev) => {
      const next = !prev
      if (!prev && next) {
        hapticLightImpact()
      }
      return next
    })
  }

  async function handleCreateNewChat() {
    setIsNewChatPending(true)
    try {
      dismissMainOverlays()
      await createNewChat()
      pageMenus.closeThreadActionMenu()
      if (isCompactMobileSidebarLayout) {
        pageModals.profileFullSheetRef.current?.requestClose()
      }
      setIsMobileSidebarOpen(false)
    } finally {
      setIsNewChatPending(false)
    }
  }

  async function handleCreateNewChatInFolder(folderId: string) {
    setIsNewChatPending(true)
    try {
      const threadId = await createNewChat({ folderId })
      if (threadId) {
        await chatFolders.moveThreadToFolder(threadId, folderId)
      }
      dismissMainOverlays()
      pageMenus.closeThreadActionMenu()
      setIsMobileSidebarOpen(false)
      setIsMobileFoldersOpen(false)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Chat konnte im Ordner nicht erstellt werden.')
    } finally {
      setIsNewChatPending(false)
    }
  }

  function handleSidebarHeaderToggleClick() {
    if (isCompactMobileSidebarLayout) {
      if (chatTourEligible) {
        return
      }
      setIsMobileSidebarOpen(false)
      pageMenus.closeThreadActionMenu()
      pageModals.profileFullSheetRef.current?.requestClose()
      return
    }
    setIsSidebarCollapsed((prev) => {
      if (prev) {
        hapticLightImpact()
      }
      return !prev
    })
    pageMenus.closeThreadActionMenu()
  }

  function handleSidebarThreadSelect(threadId: string) {
    if (pageMenus.suppressThreadClickRef.current) {
      pageMenus.suppressThreadClickRef.current = false
      return
    }
    if (swipeOpenThreadId && swipeOpenThreadId !== threadId) {
      setSwipeOpenThreadId(null)
    }
    dismissMainOverlays()
    void selectChat(threadId)
    pageMenus.closeThreadActionMenu()
    setIsMobileSidebarOpen(false)
    setIsMobileFoldersOpen(false)
  }

  function renderSidebarThreadRow(thread: ChatThread, threadIndex: number) {
    return (
      <ChatSidebarThreadRow
        key={thread.id}
        thread={thread}
        threadIndex={threadIndex}
        activeThreadId={activeThreadId}
        openMenuThreadId={pageMenus.openMenuThreadId}
        swipeOpenThreadId={swipeOpenThreadId}
        pressingThreadId={pageMenus.pressingThreadId}
        canSwipeDeleteThread={false}
        longPressHandlers={pageMenus.buildThreadLongPressHandlers(thread.id)}
        onContextMenu={pageMenus.openThreadContextMenu}
        onSwipeOpen={(id) => setSwipeOpenThreadId(id)}
        onSwipeClose={(id) => setSwipeOpenThreadId((current) => (current === id ? null : current))}
        onSelect={handleSidebarThreadSelect}
        onSwipeDeleteStart={() => {
          setSwipeOpenThreadId(null)
          pageMenus.closeThreadActionMenu()
        }}
        onDelete={(id) => void deleteThreadFromSwipe(id)}
        onSwipeGestureStart={pageMenus.cancelThreadLongPress}
      />
    )
  }

  const displayName = getUserDisplayName(user, profile)
  const greetingName = getGreetingFirstName(user, profile)
  const avatarFallback = getAvatarFallbackLetter(user, profile)
  const subscriptionPlanName = profile?.subscription_plans?.name ?? null
  const tokenLimitReached = getChatPageTokenLimitReached(profile, error)
  const themeVariant = useDocumentThemeVariant()
  const logoSrc = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return themeVariant === 'pink-glass'
      ? `${base}assets/logo/Straton-pink.png`
      : `${base}assets/logo/Straton.png`
  }, [themeVariant])

  const mobileTopBar = (
    <ChatPageMobileTopBar
      isGuest={!user}
      guestChatReplyMode={guestPrefs.guestChatReplyMode}
      chatReplyMode={chatReplyMode}
      isSending={isSending}
      mobileTopBarModeTouch={mobileTopBarModeTouch}
      mobileTopBarTitleTouch={mobileTopBarTitleTouch}
      mobileTopBarMenuTouch={mobileTopBarMenuTouch}
      showMobileTitleMenu={collaboration.showMobileTitleMenu}
      activeThread={activeThread}
      mobileToolbarChatTitle={mobileToolbarChatTitle}
      learnFeatureInfoVisible={learnDraft.learnFeatureInfoVisible}
      isLearnPathCreateButtonDisabled={isLearnPathCreateButtonDisabled}
      showCollaborationToolbar={collaboration.showCollaborationToolbar}
      canInviteToActiveChat={collaboration.canInviteToActiveChat}
      hasCollaborators={collaboration.hasCollaborators}
      shareActionBusy={collaboration.shareActionBusy}
      threadMembersLoading={collaboration.threadMembersLoading}
      toolbarAvatarCount={collaboration.toolbarAvatars.list.length}
      onGuestReplyModeChange={guestPrefs.handleGuestChatReplyMode}
      onReplyModeChange={setChatReplyMode}
      onRenameThread={pageMenus.openRenameModal}
      onArchiveThread={archiveChat}
      onDeleteThread={deleteChat}
      onOpenLearningPathDraft={learnDraft.openLearningPathDraft}
      onShareChipClick={collaboration.handleShareChipClick}
      onOpenParticipants={() => {
        if (collaboration.membersForToolbarFull.length > 0) {
          collaboration.setParticipantsOpen(true)
        }
      }}
    />
  )

  const mainMobileBottomDock = (
    <ChatPageMobileBottomDock
      variant="main"
      tabIndex={mobileBottomNavTabIndex}
      pillPulseActive={pillAccentPulseActive}
      mobileBottomNavSpring={mobileBottomNavSpring}
      mobileNewChatTouch={mobileNewChatTouch}
      isMobileSidebarOpen={isMobileSidebarOpen}
      mobileChatBottomTabActive={mobileChatBottomTabActive}
      mobileFoldersBottomTabActive={mobileFoldersBottomTabActive}
      isMobileFoldersTabDisabled={isMobileFoldersTabDisabled}
      isMobileFolderDockAction={mobileFoldersBottomTabActive}
      isNewChatPending={isNewChatPending}
      chatTourEligible={chatTourEligible}
      newChatTourRef={newChatTourRef}
      onToggleSidebar={toggleMobileSidebarFromBottomNav}
      onSelectTab={selectMobileBottomNavTab}
      onGuestLogin={() => navigate('/login')}
      onCreateFolder={pageMenus.openCreateFolderSheet}
      onCreateChat={() => void handleCreateNewChat()}
    />
  )

  if (isLoading) {
    return <AuthSessionBootstrap />
  }

  if (!user) {
    return (
      <ChatPageGuestView
        pageEnterShellClass={pageEnterShellClass}
        isSidebarCollapsed={isSidebarCollapsed}
        isMobileSidebarOpen={isMobileSidebarOpen}
        isCompactMobileSidebarLayout={isCompactMobileSidebarLayout}
        isChatToolbarMobile={isChatToolbarMobile}
        logoSrc={logoSrc}
        guestMobileBottomNavTabIndex={guestMobileBottomNavTabIndex}
        guestPillAccentPulseActive={guestPillAccentPulseActive}
        mobileBottomNavSpring={mobileBottomNavSpring}
        mobileNewChatTouch={mobileNewChatTouch}
        sidebarNewChatTouch={sidebarNewChatTouch}
        sidebarEdgeSwipe={sidebarEdgeSwipe}
        guestComposerModelId={guestPrefs.guestComposerModelId}
        guestChatReplyMode={guestPrefs.guestChatReplyMode}
        guestChatThinkingMode={guestPrefs.guestChatThinkingMode}
        mobileTopBar={mobileTopBar}
        onNavigateLogin={() => navigate('/login')}
        onOpenBetaNotice={() => pageModals.openBetaNoticeModal(false)}
        onSidebarHeaderToggle={handleSidebarHeaderToggleClick}
        onExpandSidebar={() => setIsSidebarCollapsed(false)}
        onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
        onGuestComposerModel={guestPrefs.handleGuestComposerModel}
        onGuestChatReplyMode={guestPrefs.handleGuestChatReplyMode}
        onGuestChatThinkingMode={guestPrefs.handleGuestChatThinkingMode}
        onToggleMobileSidebarFromBottomNav={toggleMobileSidebarFromBottomNav}
      />
    )
  }

  return (
    <main
      className={`chat-app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
        isMobileSidebarOpen ? 'is-mobile-sidebar-open' : ''
      }${pageEnterShellClass}`}
    >
      <ChatPageSidebar
        user={user}
        profile={profile}
        isSidebarCollapsed={isSidebarCollapsed}
        isCompactMobileSidebarLayout={isCompactMobileSidebarLayout}
        isMobileSidebarOpen={isMobileSidebarOpen}
        logoSrc={logoSrc}
        displayName={displayName}
        greetingName={greetingName}
        avatarFallback={avatarFallback}
        subscriptionPlanName={subscriptionPlanName}
        showFoldersInSidebar={showFoldersInSidebar}
        showLearningPathsInSidebar={!isLearnPathsButtonDisabled}
        learningPaths={learningPathsSidebar.learningPaths}
        activeLearnPathId={learnPathIdFromUrl}
        isLearnPathCreateDisabled={
          isLearnPathCreateButtonDisabled ||
          pendingCreateLearningPath ||
          learningPathsSidebar.learningPaths.some((path) => path.isPending || path.isRemoving)
        }
        chatFolders={chatFolders}
        openFolderMenuId={pageMenus.openFolderMenuId}
        threadSkeletonMounted={threadSkeletonMounted}
        threadSkeletonExiting={threadSkeletonExiting}
        isBootstrapping={isBootstrapping}
        threadsCount={threads.length}
        sidebarThreadList={sidebarThreadList}
        chatTourEligible={chatTourEligible}
        learnFeatureInfoVisible={learnDraft.learnFeatureInfoVisible}
        newsUnreadCount={newsUnreadCount}
        isNewChatPending={isNewChatPending}
        newChatTourRef={newChatTourRef}
        learnTourRef={learnTourRef}
        profileMenuRef={profileMenuRef}
        sidebarNewChatTouch={sidebarNewChatTouch}
        renderThreadRow={renderSidebarThreadRow}
        onOpenBetaNotice={() => pageModals.openBetaNoticeModal(false)}
        onSidebarHeaderToggle={handleSidebarHeaderToggleClick}
        onExpandSidebar={() => {
          hapticLightImpact()
          setIsSidebarCollapsed(false)
          pageMenus.closeThreadActionMenu()
          pageModals.profileFullSheetRef.current?.requestClose()
        }}
        onCreateNewChat={() => void handleCreateNewChat()}
        onOpenSettings={() => pageModals.openSettingsModal()}
        onOpenNews={pageModals.openNewsModal}
        onOpenFriends={() => openFriendsOverview('friends')}
        friendsIncomingCount={friendsState.incomingCount}
        isFriendsOverviewOpen={isFriendsOverviewOpen}
        onOpenAdmin={pageModals.openAdminModal}
        onToggleCompactProfileSheet={pageModals.toggleCompactProfileSheet}
        onCreateFolder={pageMenus.openCreateFolderSheet}
        onOpenFolder={openFolderOverview}
        onSelectLearningPath={(pathId) => openLearnWorkspace(pathId)}
        onCreateLearningPath={() => openLearnWorkspace(undefined, { create: true })}
        openLearningPathMenuId={learningPathMenus.openMenuPathId}
        onLearningPathContextMenu={learningPathMenus.openLearningPathContextMenu}
        selectedFolderId={activeOverviewFolder?.id ?? null}
        onFolderContextMenu={pageMenus.openFolderContextMenu}
        onFolderLongPressStart={pageMenus.handleFolderLongPressTouchStart}
        onFolderLongPressMove={pageMenus.handleFolderLongPressTouchMove}
        onFolderLongPressEnd={pageMenus.handleFolderLongPressTouchEnd}
        onThreadSkeletonTransitionEnd={handleThreadSkeletonTransitionEnd}
        onShowLearnUnavailable={learnDraft.showLearnFeatureUnavailableInfo}
      />

      <section
        className={`chat-main${collaboration.showFloatingChatToolbar ? ' chat-main--share-toolbar' : ''}${
          isFolderOverviewOpen ? ' is-folder-overview-active' : ''
        }${isFriendsOverviewOpen ? ' is-friends-overview-active' : ''}${
          isLearnWorkspaceOpen ? ' is-learn-workspace-active' : ''
        }`}
      >
        {isLearnWorkspaceOpen ? (
          <LearnPage
            embedded
            controlledPathId={learnPathIdFromUrl}
            onControlledPathIdChange={handleLearnControlledPathIdChange}
            hostLearningPaths={learningPathsSidebar.learningPaths}
            setHostLearningPaths={learningPathsSidebar.setLearningPaths}
            onOpenHostSidebar={() => setIsMobileSidebarOpen(true)}
            pendingCreateLearningPath={pendingCreateLearningPath}
            onPendingCreateLearningPathHandled={handlePendingCreateLearningPathHandled}
          />
        ) : null}
        {isCompactMobileSidebarLayout && user && isMobileFoldersOpen && chatFoldersFeatureEnabled && !isFolderOverviewOpen && !isFriendsOverviewOpen && !isLearnWorkspaceOpen ? (
          <ChatFoldersMobilePanel
            folders={chatFolders.folders}
            threadsByFolderId={chatFolders.threadsByFolderId}
            selectedFolderId={activeOverviewFolder?.id ?? null}
            onOpenFolder={openFolderOverview}
            onFolderContextMenu={pageMenus.openFolderContextMenu}
            onFolderLongPressStart={pageMenus.handleFolderLongPressTouchStart}
            onFolderLongPressMove={pageMenus.handleFolderLongPressTouchMove}
            onFolderLongPressEnd={pageMenus.handleFolderLongPressTouchEnd}
            renderThreadRow={renderSidebarThreadRow}
          />
        ) : null}
        {isFolderOverviewOpen && activeOverviewFolder ? (
          <ChatFolderOverview
            key={activeOverviewFolder.id}
            folder={activeOverviewFolder}
            tab={folderTabFromUrl}
            threads={folderOverviewThreads}
            files={folderFilesState.files}
            filesLoading={folderFilesState.isLoading}
            filesUploading={folderFilesState.isUploading}
            isLearnPathCreateDisabled={isLearnPathCreateButtonDisabled}
            isCompactMobile={isCompactMobileSidebarLayout}
            activeThreadId={activeThreadId}
            onSelectThread={handleSidebarThreadSelect}
            onEditFolder={() => pageMenus.openEditFolderSheet(activeOverviewFolder)}
            onTabChange={setFolderOverviewTab}
            onUploadFiles={async (fileList) => {
              try {
                await folderFilesState.uploadFiles(fileList)
                await refreshProfile()
                pushToast('Datei(en) zum Ordner hinzugefügt.')
              } catch (err) {
                pushToast(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
              }
            }}
            onDeleteFile={async (file) => {
              try {
                await folderFilesState.removeFile(file)
                pushToast('Datei entfernt.')
              } catch (err) {
                pushToast(err instanceof Error ? err.message : 'Datei konnte nicht entfernt werden.')
              }
            }}
            onDownloadFile={async (file) => {
              try {
                const url = await createChatFolderFileSignedUrl(file)
                window.open(url, '_blank', 'noopener,noreferrer')
              } catch (err) {
                pushToast(err instanceof Error ? err.message : 'Download fehlgeschlagen.')
              }
            }}
            onCreateLearningPath={() =>
              void learnDraft.openFolderLearningPathDraft({
                folderId: activeOverviewFolder.id,
                folderName: activeOverviewFolder.name,
                threads: folderOverviewThreads,
                folderFiles: folderFilesState.files,
              })
            }
            onCreateChat={() => void handleCreateNewChatInFolder(activeOverviewFolder.id)}
            onBack={closeFolderOverview}
          />
        ) : null}
        {isFriendsOverviewOpen ? (
          <ChatFriendsOverview
            tab={friendsTabFromUrl}
            friends={friendsState.friends}
            incomingRequests={friendsState.incomingRequests}
            outgoingRequests={friendsState.outgoingRequests}
            incomingCount={friendsState.incomingCount}
            isLoading={friendsState.isLoading}
            error={friendsState.error}
            isCompactMobile={isCompactMobileSidebarLayout}
            onTabChange={setFriendsOverviewTab}
            onSendRequest={friendsState.sendRequest}
            onAcceptRequest={friendsState.acceptRequest}
            onDeclineRequest={friendsState.declineRequest}
            onCancelRequest={friendsState.cancelRequest}
          />
        ) : null}
        {collaboration.showFloatingChatToolbar && isChatToolbarMobile && !isMobileFoldersOpen && !isFolderOverviewOpen && !isFriendsOverviewOpen && !isLearnWorkspaceOpen
          ? mobileTopBar
          : null}
        {collaboration.showFloatingChatToolbar && !isChatToolbarMobile && !isFolderOverviewOpen && !isFriendsOverviewOpen && !isLearnWorkspaceOpen ? (
          <ChatMainCollaborationToolbar
            isNarrowViewport={isNarrowViewport}
            participantsAnchorRef={collaboration.participantsAnchorRef}
            participantsOpen={collaboration.participantsOpen}
            threadMembersLoading={collaboration.threadMembersLoading}
            toolbarAvatars={collaboration.toolbarAvatars}
            membersForToolbarFull={collaboration.membersForToolbarFull}
            showCollaborationToolbar={collaboration.showCollaborationToolbar}
            canInviteToActiveChat={collaboration.canInviteToActiveChat}
            hasCollaborators={collaboration.hasCollaborators}
            shareActionBusy={collaboration.shareActionBusy}
            showLearningPathToolbarChip={collaboration.showLearningPathToolbarChip}
            isLearnPathCreateButtonDisabled={isLearnPathCreateButtonDisabled}
            learningPathDraftLoading={learnDraft.learningPathDraftLoading}
            learnFeatureInfoVisible={learnDraft.learnFeatureInfoVisible}
            activeThread={activeThread}
            onRenameThread={pageMenus.openRenameModal}
            onDeleteThread={(id) => void deleteChat(id)}
            onToolbarAvatarsClick={collaboration.handleToolbarAvatarsClick}
            onShareChipClick={collaboration.handleShareChipClick}
            onOpenLearningPathDraft={learnDraft.openLearningPathDraft}
          />
        ) : null}
        <ChatWindow
          threadKey={activeThreadId}
          composerUserId={user?.id ?? null}
          messages={messages}
          isSending={isSending}
          sendPhase={sendPhase}
          error={error}
          greetingName={greetingName}
          tokenLimitReached={tokenLimitReached}
          composerModelId={composerModelId}
          onComposerModelChange={setComposerModelId}
          showComposerModelPicker={
            isChatModelPolicyReady && customModeAllowed && chatThinkingMode === 'custom'
          }
          allowCustomChatMode={customModeAllowed}
          chatReplyMode={chatReplyMode}
          onChatReplyModeChange={setChatReplyMode}
          showReplyModePicker={!isChatToolbarMobile}
          chatThinkingMode={chatThinkingMode}
          onChatThinkingModeChange={setChatThinkingMode}
          thinkingClarifyDialog={thinkingClarifyDialog}
          onDismissThinkingClarify={dismissThinkingClarify}
          onSubmitThinkingClarifyAnswer={(text) => void submitMessage(text)}
          showInstantAnalyzeDebug={isAdmin && instantAnalyzeDebugEnabled}
          liveInstantAnalyzeDebug={liveInstantAnalyzeDebug}
          liveThinkingAnalyzeDebug={liveThinkingAnalyzeDebug}
          onSendMessage={submitMessage}
          onCancelSend={cancelSend}
          onFinalizeWordDocument={finalizeWordDocumentExport}
          wordFinalizeBusy={wordFinalizeBusy}
          onFinalizePdfDocument={finalizePdfDocumentExport}
          pdfFinalizeBusy={pdfFinalizeBusy}
          onFinalizeExcelDocument={finalizeExcelDocumentExport}
          excelFinalizeBusy={excelFinalizeBusy}
          onFinalizePptxDocument={finalizePptxDocumentExport}
          pptxFinalizeBusy={pptxFinalizeBusy}
          onSubmitPptxEdit={submitPptxEditMessage}
          onSwitchPptxPreset={applyPptxPresetSwitch}
          thinkingCreditsRemaining={
            profile?.is_superadmin === true ? undefined : thinkingCreditsRemaining ?? 0
          }
          thinkingCreditMax={
            profile?.is_superadmin === true
              ? undefined
              : profile?.subscription_plans?.thinking_credit_max ?? undefined
          }
          thinkingDailyGrant={
            profile?.is_superadmin === true
              ? undefined
              : profile?.subscription_plans?.thinking_daily_grant ?? null
          }
          thinkingCreditsBlocked={thinkingCreditsBlocked}
          mainChatContextMaxTokens={mainChatContextMaxTokens}
          subscriptionUsageDisplay={chatSubscriptionUsage?.display ?? null}
        />
        <ChatLearningPathDraftSidebar
          open={learnDraft.learningPathDraftOpen}
          loading={learnDraft.learningPathDraftLoading}
          step={learnDraft.learningPathDraftStep}
          context={learnDraft.learningPathDraftContext}
          files={learnDraft.learningPathDraftFiles}
          imageCount={learnDraft.learningPathDraftImages}
          proficiency={learnDraft.learningPathDraftProficiency}
          name={learnDraft.learningPathDraftName}
          onClose={() => learnDraft.setLearningPathDraftOpen(false)}
          onProficiencyChange={learnDraft.setLearningPathDraftProficiency}
          onNameChange={learnDraft.setLearningPathDraftName}
          onStepChange={learnDraft.setLearningPathDraftStep}
          onProceed={learnDraft.proceedToLearnPageFromChatDraft}
        />
      </section>

      <InviteToChatModal
        isOpen={collaboration.inviteModalOpen}
        threadId={activeThread?.id ?? null}
        threadTitle={activeThread?.title ?? ''}
        onClose={() => collaboration.setInviteModalOpen(false)}
        onSent={() => void collaboration.refreshThreadMembers()}
      />
      <ChatEndSharingDialogs
        isNarrowViewport={isNarrowViewport}
        shareActionBusy={collaboration.shareActionBusy}
        endSharingDesktopMounted={collaboration.endSharingDesktopMounted}
        endSharingDesktopOpen={collaboration.endSharingDesktopOpen}
        endSharingConfirmOpen={collaboration.endSharingConfirmOpen}
        endSharingSheetRef={endSharingSheetRef}
        participantsOpen={collaboration.participantsOpen}
        participantsSheetRef={collaboration.participantsSheetRef}
        showCollaborationToolbar={collaboration.showCollaborationToolbar}
        membersForToolbarFull={collaboration.membersForToolbarFull}
        onCloseEndSharing={collaboration.closeEndSharingConfirm}
        onConfirmEndSharing={() => void collaboration.confirmEndSharing()}
        onEndSharingSheetExitComplete={collaboration.handleEndSharingSheetExitComplete}
        onParticipantsSheetExitComplete={collaboration.handleParticipantsSheetExitComplete}
      />
      {mainMobileBottomDock}
      <div
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
        onClick={() => {
          if (chatTourEligible) {
            return
          }
          setIsMobileSidebarOpen(false)
        }}
        aria-hidden="true"
        {...sidebarEdgeSwipe.backdropSwipeHandlers}
      />

      {chatTourEligible ? (
        <ChatOnboardingTour
          newChatButtonRef={newChatTourRef}
          learnButtonRef={learnTourRef}
          active={chatTourOverlayActive}
          onComplete={completeChatOnboarding}
        />
      ) : null}

      <ChatPageOverlays
        isNarrowViewport={isNarrowViewport}
        isCompactMobileSidebarLayout={isCompactMobileSidebarLayout}
        logoSrc={logoSrc}
        profile={profile}
        displayName={displayName}
        avatarFallback={avatarFallback}
        subscriptionPlanName={subscriptionPlanName}
        threads={threads}
        chatFolders={chatFolders}
        chatFoldersFeatureEnabled={chatFoldersFeatureEnabled}
        chatTourEligible={chatTourEligible}
        isLearnPathsButtonDisabled={isLearnPathsButtonDisabled}
        profileFullSheetRef={pageModals.profileFullSheetRef}
        betaNoticeSheetRef={pageModals.betaNoticeSheetRef}
        mobileSheetMode={pageModals.mobileSheetMode}
        setMobileSheetMode={pageModals.setMobileSheetMode}
        isSettingsMounted={pageModals.isSettingsMounted}
        isSettingsVisible={pageModals.isSettingsVisible}
        settingsInitialSection={pageModals.settingsInitialSection}
        isAdminMounted={pageModals.isAdminMounted}
        isAdminVisible={pageModals.isAdminVisible}
        isNewsMounted={pageModals.isNewsMounted}
        isNewsVisible={pageModals.isNewsVisible}
        isBetaNoticeMounted={pageModals.isBetaNoticeMounted}
        isBetaNoticeVisible={pageModals.isBetaNoticeVisible}
        introductionSheetRef={pageModals.introductionSheetRef}
        isIntroductionMounted={pageModals.isIntroductionMounted}
        isIntroductionVisible={pageModals.isIntroductionVisible}
        introductionDraft={pageModals.introductionDraft}
        onIntroductionDraftChange={pageModals.setIntroductionDraft}
        isIntroductionSaving={pageModals.isIntroductionSaving}
        onSaveIntroduction={pageModals.saveIntroductionFromModal}
        onDeferIntroduction={pageModals.deferIntroductionModal}
        onIntroductionSheetExitComplete={pageModals.handleIntroductionSheetExitComplete}
        menuWrapperRef={pageMenus.menuWrapperRef}
        threadSheetRef={pageMenus.threadSheetRef}
        renameSheetRef={pageMenus.renameSheetRef}
        folderSheetRef={pageMenus.folderSheetRef}
        folderMenuWrapperRef={pageMenus.folderMenuWrapperRef}
        openMenuThreadId={pageMenus.openMenuThreadId}
        threadMenuVariant={pageMenus.threadMenuVariant}
        contextMenuPosition={pageMenus.contextMenuPosition}
        ownsThreadForMenu={pageMenus.ownsThreadForMenu}
        canLeaveSharedChatForMenu={pageMenus.canLeaveSharedChatForMenu}
        openFolderMenuId={pageMenus.openFolderMenuId}
        folderMenuVariant={pageMenus.folderMenuVariant}
        folderContextMenuPosition={pageMenus.folderContextMenuPosition}
        folderMoveThreadId={pageMenus.folderMoveThreadId}
        isFolderMoveModalVisible={pageMenus.isFolderMoveModalVisible}
        folderNameSheetMode={pageMenus.folderNameSheetMode}
        folderNameDraft={pageMenus.folderNameDraft}
        setFolderNameDraft={pageMenus.setFolderNameDraft}
        folderColorDraft={pageMenus.folderColorDraft}
        setFolderColorDraft={pageMenus.setFolderColorDraft}
        isFolderNameSheetOpen={pageMenus.isFolderNameSheetOpen}
        isFolderNameModalVisible={pageMenus.isFolderNameModalVisible}
        editingThread={pageMenus.editingThread}
        isRenameVisible={pageMenus.isRenameVisible}
        renameDraft={pageMenus.renameDraft}
        setRenameDraft={pageMenus.setRenameDraft}
        onCloseSettings={pageModals.closeSettingsModal}
        onCloseAdmin={pageModals.closeAdminModal}
        onCloseNews={pageModals.closeNewsModal}
        onNewsSheetExitComplete={pageModals.handleNewsSheetExitComplete}
        newsFullSheetRef={pageModals.newsFullSheetRef}
        onOpenSettings={pageModals.openSettingsModal}
        onOpenAdmin={pageModals.openAdminModal}
        onCloseBetaNotice={pageModals.closeBetaNoticeModal}
        onBetaNoticeSheetExitComplete={pageModals.handleBetaNoticeSheetExitComplete}
        onNavigateLearn={() => {
          openLearnWorkspace()
        }}
        onLogout={handleLogout}
        onShowLearnUnavailable={learnDraft.showLearnFeatureUnavailableInfo}
        onCloseThreadMenu={pageMenus.closeThreadActionMenu}
        onCloseFolderMenu={pageMenus.closeFolderActionMenu}
        onOpenFolderMove={pageMenus.openFolderMoveDialog}
        onOpenRenameThread={pageMenus.openRenameModal}
        onArchiveThread={archiveChat}
        onDeleteThread={deleteChat}
        onLeaveSharedThread={async (id) => {
          await leaveSharedChatAsMember(id)
          pushToast('Freigegebener Chat entfernt. Du hast keinen Zugriff mehr.')
        }}
        onMoveThreadToFolder={pageMenus.handleMoveThreadToFolder}
        onCloseFolderMove={pageMenus.closeFolderMoveDialog}
        onOpenEditFolderSheet={pageMenus.openEditFolderSheet}
        onDeleteFolder={pageMenus.handleDeleteFolder}
        onCloseFolderName={pageMenus.closeFolderNameSheet}
        onFolderNameSubmit={pageMenus.handleFolderNameSubmit}
        onCloseRenameModal={pageMenus.closeRenameModal}
        onRenameSheetClosed={pageMenus.handleRenameSheetClosed}
        onRenameSubmit={pageMenus.handleRenameSubmit}
        showLearningPathsInSidebar={!isLearnPathsButtonDisabled}
        learningPaths={learningPathsSidebar.learningPaths}
        pathMenuRef={learningPathMenus.pathMenuRef}
        learningPathRenameSheetRef={learningPathMenus.renameSheetRef}
        openMenuPathId={learningPathMenus.openMenuPathId}
        pathMenuVariant={learningPathMenus.pathMenuVariant}
        pathContextMenuPosition={learningPathMenus.contextMenuPosition}
        onCloseLearningPathMenu={learningPathMenus.closeLearningPathMenu}
        onOpenRenameLearningPath={learningPathMenus.openRenameLearningPathModal}
        onDeleteLearningPath={learningPathMenus.handleDeleteLearningPath}
        learningPathRenamingId={learningPathMenus.renamingPathId}
        isLearningPathRenameVisible={learningPathMenus.isRenameVisible}
        learningPathRenameDraft={learningPathMenus.renameDraft}
        setLearningPathRenameDraft={learningPathMenus.setRenameDraft}
        onCloseLearningPathRename={learningPathMenus.closeRenameLearningPathModal}
        onLearningPathRenameSheetClosed={learningPathMenus.handleRenameSheetClosed}
        onLearningPathRenameSubmit={learningPathMenus.handleRenameLearningPathSubmit}
      />
          </main>
  )
}
