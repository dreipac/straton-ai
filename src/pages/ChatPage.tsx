import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import deleteIcon from '../assets/icons/delete.svg'
import editIcon from '../assets/icons/edit.svg'
import loginIcon from '../assets/icons/login.svg'
import logoutIcon from '../assets/icons/logout.svg'
import accountIcon from '../assets/icons/account.svg'
import learnIcon from '../assets/icons/learn.svg'
import settingsIcon from '../assets/icons/settings.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import triangleIcon from '../assets/icons/triangle.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ActionBottomSheet } from '../components/ui/bottom-sheet/ActionBottomSheet'
import {
  ProfileFullSheet,
  type ProfileFullSheetHandle,
} from '../components/ui/bottom-sheet/ProfileFullSheet'
import {
  RenameBottomSheet,
  type RenameBottomSheetHandle,
} from '../components/ui/bottom-sheet/RenameBottomSheet'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import {
  getAvatarFallbackLetter,
  getGreetingFirstName,
  getUserDisplayName,
} from '../features/auth/utils/userDisplay'
import { getAppFeatureFlags } from '../features/auth/services/appFeatureFlags.service'
import {
  CHAT_COMPOSER_MODEL_STORAGE_KEY,
  type ChatComposerModelId,
  parseStoredComposerModelId,
} from '../features/chat/constants/chatComposerModels'
import { ChatOnboardingTour } from '../features/chat/components/ChatOnboardingTour'
import { ChatWindow } from '../features/chat/components/ChatWindow'
import { useChat } from '../features/chat/hooks/useChat'
import type { ChatThread } from '../features/chat/types'
import { hapticLightImpact } from '../utils/haptics'
import { isMobileViewport } from '../utils/mobile'
import { AdministratorModal } from './AdminPage'
import { SettingsModal, type SettingsSectionId } from './SettingsPage'

/** Gleicher Breakpoint wie `layout.css` Mobile-Sidebar (`max-width: 860px`). */
const COMPACT_MOBILE_SIDEBAR_MAX_PX = 860

/** Menüpunkt-Labels wie in den Desktop-Einstellungen (DE), Reihenfolge: Konto zuerst. */
const PROFILE_SETTINGS_SHEET_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'account', label: 'Konto' },
  { id: 'general', label: 'Allgemein' },
  { id: 'chat', label: 'Chat Einstellungen' },
  { id: 'personalize', label: 'Personalisieren' },
  { id: 'ai', label: 'KI Provider' },
  { id: 'status', label: 'Status' },
  { id: 'feedback', label: 'Feedback' },
]

export function ChatPage() {
  const DEFAULT_NO_PLAN_MAX_TOKENS = 100
  const MODAL_ANIMATION_MS = 220
  const { user, profile, logout, isLoading, completeChatOnboarding, markBetaNoticeSeen, refreshProfile } = useAuth()
  const {
    threads,
    activeThreadId,
    messages,
    isSending,
    isBootstrapping,
    error,
    submitMessage,
    createNewChat,
    renameChat,
    deleteChat,
    selectChat,
    composerModelId,
    setComposerModelId,
  } = useChat(user?.id, profile?.auto_remove_empty_chats ?? true)
  const [guestComposerModelId, setGuestComposerModelId] = useState<ChatComposerModelId>(() =>
    parseStoredComposerModelId(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_COMPOSER_MODEL_STORAGE_KEY) : null,
    ),
  )

  function handleGuestComposerModel(id: ChatComposerModelId) {
    setGuestComposerModelId(id)
    try {
      localStorage.setItem(CHAT_COMPOSER_MODEL_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }
  const navigate = useNavigate()
  const [isSettingsMounted, setIsSettingsMounted] = useState(false)
  const [isSettingsVisible, setIsSettingsVisible] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId>('general')
  const [isAdminMounted, setIsAdminMounted] = useState(false)
  const [isAdminVisible, setIsAdminVisible] = useState(false)
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [threadMenuVariant, setThreadMenuVariant] = useState<'none' | 'context' | 'sheet'>('none')
  const [editingThread, setEditingThread] = useState<ChatThread | null>(null)
  const [isRenameVisible, setIsRenameVisible] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  /** Nur Compact-Mobile: gleiches ProfileFullSheet, Inhalt Profil-Liste oder Einstellungen */
  const [mobileSheetMode, setMobileSheetMode] = useState<'closed' | 'profile' | 'settings'>('closed')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [showBetaNoticeOnFirstLogin, setShowBetaNoticeOnFirstLogin] = useState(true)
  const [isBetaNoticeMounted, setIsBetaNoticeMounted] = useState(false)
  const [isBetaNoticeVisible, setIsBetaNoticeVisible] = useState(false)
  const [betaNoticeShouldMarkSeen, setBetaNoticeShouldMarkSeen] = useState(false)
  /** Beta-Hinweis kommt vor der Einstiegstour — Tour blockieren, solange Beta noch angezeigt werden muss. */
  const tourBlockedByBeta = Boolean(
    user && profile && showBetaNoticeOnFirstLogin && !profile.beta_notice_seen,
  )
  const showChatTour = Boolean(
    user &&
      profile &&
      profile.chat_onboarding_completed === false &&
      !isLoading &&
      profile.must_change_password_on_first_login !== true &&
      !tourBlockedByBeta,
  )
  const [isCompactMobileSidebarLayout, setIsCompactMobileSidebarLayout] = useState(false)
  const menuWrapperRef = useRef<HTMLDivElement | null>(null)
  const threadSheetRef = useRef<HTMLDivElement | null>(null)
  const renameSheetRef = useRef<RenameBottomSheetHandle | null>(null)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const profileFullSheetRef = useRef<ProfileFullSheetHandle | null>(null)
  const settingsCloseTimerRef = useRef<number | null>(null)
  const adminCloseTimerRef = useRef<number | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)
  const betaNoticeCloseTimerRef = useRef<number | null>(null)
  const newChatTourRef = useRef<HTMLButtonElement | null>(null)
  const learnTourRef = useRef<HTMLButtonElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressThreadClickRef = useRef(false)

  const LONG_PRESS_MS = 520
  const LONG_PRESS_MOVE_CANCEL_PX = 14

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function toggleCompactProfileSheet() {
    if (!isCompactMobileSidebarLayout) {
      return
    }
    if (mobileSheetMode !== 'closed') {
      profileFullSheetRef.current?.requestClose()
    } else {
      setMobileSheetMode('profile')
    }
  }

  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent | TouchEvent) {
      const compactSheetOpen = isCompactMobileSidebarLayout && mobileSheetMode !== 'closed'
      if (!openMenuThreadId && !isProfileMenuOpen && !compactSheetOpen) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      const isInsideThreadMenu = menuWrapperRef.current?.contains(target) ?? false
      const isInsideThreadSheet = threadSheetRef.current?.contains(target) ?? false
      const isInsideProfileMenu = profileMenuRef.current?.contains(target) ?? false

      if (!isInsideThreadMenu && !isInsideThreadSheet && openMenuThreadId) {
        setOpenMenuThreadId(null)
        setContextMenuPosition(null)
        setThreadMenuVariant('none')
      }

      if (!isInsideProfileMenu && (isProfileMenuOpen || compactSheetOpen)) {
        if (isCompactMobileSidebarLayout) {
          const insideSheet = profileFullSheetRef.current?.containsNode(target) ?? false
          if (!insideSheet) {
            profileFullSheetRef.current?.requestClose()
          }
        } else {
          setIsProfileMenuOpen(false)
        }
      }
    }

    document.addEventListener('mousedown', handleOutsidePointer)
    document.addEventListener('touchstart', handleOutsidePointer, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer)
      document.removeEventListener('touchstart', handleOutsidePointer)
    }
  }, [openMenuThreadId, isProfileMenuOpen, isCompactMobileSidebarLayout, mobileSheetMode])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${COMPACT_MOBILE_SIDEBAR_MAX_PX}px)`)
    function syncCompactSidebarLayout() {
      setIsCompactMobileSidebarLayout(mq.matches)
    }
    syncCompactSidebarLayout()
    mq.addEventListener('change', syncCompactSidebarLayout)
    return () => mq.removeEventListener('change', syncCompactSidebarLayout)
  }, [])

  useEffect(() => {
    return () => {
      if (settingsCloseTimerRef.current) {
        window.clearTimeout(settingsCloseTimerRef.current)
      }
      if (adminCloseTimerRef.current) {
        window.clearTimeout(adminCloseTimerRef.current)
      }
      if (renameCloseTimerRef.current) {
        window.clearTimeout(renameCloseTimerRef.current)
      }
      if (betaNoticeCloseTimerRef.current) {
        window.clearTimeout(betaNoticeCloseTimerRef.current)
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setShowBetaNoticeOnFirstLogin(true)
      return
    }

    let isMounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!isMounted) {
          return
        }
        setShowBetaNoticeOnFirstLogin(flags.show_beta_notice_on_first_login)
      } catch {
        if (!isMounted) {
          return
        }
        setShowBetaNoticeOnFirstLogin(true)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || showChatTour) {
        return
      }
      setIsMobileSidebarOpen(false)
      if (openMenuThreadId) {
        setOpenMenuThreadId(null)
        setContextMenuPosition(null)
        setThreadMenuVariant('none')
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showChatTour, openMenuThreadId])

  useEffect(() => {
    if (!showChatTour) {
      return
    }
    setIsSidebarCollapsed(false)
    setIsMobileSidebarOpen(true)
  }, [showChatTour])

  useEffect(() => {
    const shouldShowBetaNotice = Boolean(
      user &&
        profile &&
        profile.must_change_password_on_first_login !== true &&
        !profile.beta_notice_seen &&
        showBetaNoticeOnFirstLogin,
    )

    if (!shouldShowBetaNotice) {
      return
    }

    if (betaNoticeCloseTimerRef.current) {
      window.clearTimeout(betaNoticeCloseTimerRef.current)
      betaNoticeCloseTimerRef.current = null
    }

    setBetaNoticeShouldMarkSeen(true)
    setIsBetaNoticeMounted(true)
    window.requestAnimationFrame(() => {
      setIsBetaNoticeVisible(true)
    })
  }, [user, profile, showBetaNoticeOnFirstLogin])

  function openBetaNoticeModal(markSeenOnClose: boolean) {
    if (betaNoticeCloseTimerRef.current) {
      window.clearTimeout(betaNoticeCloseTimerRef.current)
      betaNoticeCloseTimerRef.current = null
    }
    setBetaNoticeShouldMarkSeen(markSeenOnClose)
    setIsBetaNoticeMounted(true)
    window.requestAnimationFrame(() => {
      setIsBetaNoticeVisible(true)
    })
  }

  function openSettingsModal(section: SettingsSectionId = 'general') {
    setSettingsInitialSection(section)
    void refreshProfile().catch(() => {
      // Falls Refresh fehlschlaegt, oeffnen wir trotzdem die Settings mit dem zuletzt geladenen Profil.
    })
    setIsMobileSidebarOpen(false)
    if (settingsCloseTimerRef.current) {
      window.clearTimeout(settingsCloseTimerRef.current)
      settingsCloseTimerRef.current = null
    }

    if (isCompactMobileSidebarLayout) {
      setMobileSheetMode('settings')
      return
    }

    setIsProfileMenuOpen(false)
    setIsSettingsMounted(true)
    window.requestAnimationFrame(() => {
      setIsSettingsVisible(true)
    })
  }

  function closeSettingsModal() {
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
      return
    }
    setIsSettingsVisible(false)
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setIsSettingsMounted(false)
      settingsCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openAdminModal() {
    setIsProfileMenuOpen(false)
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
    }
    setIsMobileSidebarOpen(false)
    if (adminCloseTimerRef.current) {
      window.clearTimeout(adminCloseTimerRef.current)
      adminCloseTimerRef.current = null
    }

    setIsAdminMounted(true)
    window.requestAnimationFrame(() => {
      setIsAdminVisible(true)
    })
  }

  function closeAdminModal() {
    setIsAdminVisible(false)
    adminCloseTimerRef.current = window.setTimeout(() => {
      setIsAdminMounted(false)
      adminCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openRenameModal(thread: ChatThread) {
    if (renameCloseTimerRef.current) {
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
  }

  function handleRenameSheetClosed() {
    if (renameCloseTimerRef.current) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }
    setEditingThread(null)
    setIsRenameVisible(false)
  }

  function closeRenameModal() {
    if (isMobileViewport()) {
      renameSheetRef.current?.requestClose()
      return
    }
    setIsRenameVisible(false)
    renameCloseTimerRef.current = window.setTimeout(() => {
      setEditingThread(null)
      renameCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  async function closeBetaNoticeModal() {
    setIsBetaNoticeVisible(false)
    try {
      if (betaNoticeShouldMarkSeen) {
        await markBetaNoticeSeen()
      }
    } finally {
      betaNoticeCloseTimerRef.current = window.setTimeout(() => {
        setIsBetaNoticeMounted(false)
        betaNoticeCloseTimerRef.current = null
      }, MODAL_ANIMATION_MS)
    }
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
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
  }

  async function handleCreateNewChat() {
    await createNewChat()
    closeThreadActionMenu()
    setIsProfileMenuOpen(false)
    if (isCompactMobileSidebarLayout) {
      profileFullSheetRef.current?.requestClose()
    }
    setIsMobileSidebarOpen(false)
  }

  function closeThreadActionMenu() {
    setOpenMenuThreadId(null)
    setContextMenuPosition(null)
    setThreadMenuVariant('none')
  }

  function handleSidebarHeaderToggleClick() {
    if (isCompactMobileSidebarLayout) {
      if (showChatTour) {
        return
      }
      setIsMobileSidebarOpen(false)
      closeThreadActionMenu()
      setIsProfileMenuOpen(false)
      profileFullSheetRef.current?.requestClose()
      return
    }
    setIsSidebarCollapsed((prev) => {
      if (prev) {
        hapticLightImpact()
      }
      return !prev
    })
    closeThreadActionMenu()
    setIsProfileMenuOpen(false)
  }

  function openThreadContextMenuAt(threadId: string, clientX: number, clientY: number) {
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
  }

  function openThreadContextMenu(event: ReactMouseEvent, threadId: string) {
    event.preventDefault()
    event.stopPropagation()
    openThreadContextMenuAt(threadId, event.clientX, event.clientY)
  }

  function handleThreadLongPressTouchStart(threadId: string, event: ReactTouchEvent) {
    if (event.touches.length !== 1) {
      return
    }
    const touch = event.touches[0]
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      suppressThreadClickRef.current = true
      openThreadContextMenuAt(threadId, touch.clientX, touch.clientY)
      hapticLightImpact()
    }, LONG_PRESS_MS)
  }

  function handleThreadLongPressTouchMove(event: ReactTouchEvent) {
    if (!longPressStartRef.current || longPressTimerRef.current === null) {
      return
    }
    if (event.touches.length === 0) {
      return
    }
    const touch = event.touches[0]
    const dx = Math.abs(touch.clientX - longPressStartRef.current.x)
    const dy = Math.abs(touch.clientY - longPressStartRef.current.y)
    if (dx > LONG_PRESS_MOVE_CANCEL_PX || dy > LONG_PRESS_MOVE_CANCEL_PX) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
      longPressStartRef.current = null
    }
  }

  function handleThreadLongPressTouchEnd() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }

  const displayName = getUserDisplayName(user, profile)
  const greetingName = getGreetingFirstName(user, profile)
  const avatarFallback = getAvatarFallbackLetter(user, profile)
  const subscriptionPlanName = profile?.subscription_plans?.name ?? null
  const hasAssignedPlan = profile?.subscription_plan_id != null
  const usedTokensToday = profile?.subscription_usages?.used_tokens ?? 0
  const maxTokensToday = hasAssignedPlan
    ? (profile?.subscription_plans?.max_tokens ?? null)
    : DEFAULT_NO_PLAN_MAX_TOKENS
  const hasTokenLimit = maxTokensToday !== null
  const tokenLimitReachedByUsage = hasTokenLimit && maxTokensToday !== null && usedTokensToday >= maxTokensToday
  const tokenLimitReachedByError = hasTokenLimit && (error ?? '').toLowerCase().includes('token limit')
  const tokenLimitReached = tokenLimitReachedByUsage || tokenLimitReachedByError
  const logoSrc = `${import.meta.env.BASE_URL}assets/logo/Straton.png`

  if (!user) {
    return (
      <main
        className={`chat-app-shell chat-app-shell-guest ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
          isMobileSidebarOpen ? 'is-mobile-sidebar-open' : ''
        }`}
      >
        <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className="chat-sidebar-top">
            {!isSidebarCollapsed ? (
              <div className="chat-sidebar-header-row">
                <div className="chat-brand">
                  <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
                  <h2>Straton</h2>
                  <button
                    type="button"
                    className="chat-beta-badge chat-beta-badge-button"
                    onClick={() => openBetaNoticeModal(false)}
                  >
                    Beta
                  </button>
                </div>
                <button
                  type="button"
                  className="sidebar-toggle-button"
                  aria-label={
                    isCompactMobileSidebarLayout ? 'Sidebar schliessen' : isSidebarCollapsed ? 'Sidebar ausfahren' : 'Sidebar einklappen'
                  }
                  onClick={handleSidebarHeaderToggleClick}
                >
                  <img
                    className="ui-icon chat-sidebar-top-button-icon sidebar-toggle-icon"
                    src={sidebarIcon}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </div>
            ) : null}
            {isSidebarCollapsed ? (
              <button
                type="button"
                className="sidebar-logo-button"
                aria-label="Sidebar ausfahren"
                onClick={() => {
                  hapticLightImpact()
                  setIsSidebarCollapsed(false)
                }}
              >
                <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="chat-sidebar-new-chat-button chat-sidebar-new-chat-button--toolbar"
              aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
              onClick={() => navigate('/login')}
            >
              <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon" aria-hidden="true" />
              {!isSidebarCollapsed ? <span className="chat-sidebar-new-chat-label">Neuer Chat</span> : null}
            </button>
            <button type="button" onClick={() => navigate('/login')} aria-label={isSidebarCollapsed ? 'Anmelden' : undefined}>
              <img className="ui-icon chat-sidebar-top-button-icon" src={loginIcon} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? 'Anmelden' : null}
            </button>
          </div>

          <div className="chat-sidebar-list-wrap">
            {!isSidebarCollapsed ? (
              <div className="chat-thread-list">
                <p className="thread-list-info">Chats</p>
                <p className="thread-list-info">Melde dich an, um deine Chats in der Sidebar zu sehen.</p>
              </div>
            ) : null}
            <div className="chat-sidebar-footer-dock chat-sidebar-footer-dock--fab-only">
              <button
                type="button"
                className="mobile-new-chat-fab"
                aria-label="Neuer Chat"
                onClick={() => navigate('/login')}
              >
                <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon mobile-new-chat-fab-icon" aria-hidden="true" />
                <span className="mobile-new-chat-fab-label">Chat</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="chat-main chat-main-guest">
          <header className="guest-chat-header">
            <h1>Straton</h1>
            <div className="guest-chat-actions">
              <SecondaryButton
                type="button"
                onClick={() => {
                  document.getElementById('guest-chat-info')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Mehr erfahren
              </SecondaryButton>
              <PrimaryButton type="button" onClick={() => navigate('/login')}>
                Anmelden
              </PrimaryButton>
            </div>
          </header>

          <div className="guest-chat-panel">
            <p id="guest-chat-info" className="guest-chat-info">
              Du bist im Gastmodus. Melde dich an, um Chats zu speichern und deine Einstellungen zu synchronisieren.
            </p>
            <ChatWindow
              threadKey={null}
              messages={[]}
              isSending={false}
              error={null}
              greetingName="da"
              tokenLimitReached={false}
              composerModelId={guestComposerModelId}
              onComposerModelChange={handleGuestComposerModel}
              onSendMessage={async () => {
                navigate('/login')
              }}
            />
          </div>
        </section>
        <button
          type="button"
          className={`mobile-sidebar-pill ${isMobileSidebarOpen ? 'is-open' : ''}`}
          aria-label={isMobileSidebarOpen ? 'Sidebar schliessen' : 'Sidebar oeffnen'}
          onClick={() => {
            setIsSidebarCollapsed(false)
            setIsMobileSidebarOpen((prev) => {
              const next = !prev
              if (!prev && next) {
                hapticLightImpact()
              }
              return next
            })
          }}
        >
          <img className="ui-icon mobile-sidebar-pill-icon" src={sidebarIcon} alt="" aria-hidden="true" />
        </button>
        <div
          className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      </main>
    )
  }

  return (
    <main
      className={`chat-app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
        isMobileSidebarOpen ? 'is-mobile-sidebar-open' : ''
      }`}
    >
      <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="chat-sidebar-top">
          {!isSidebarCollapsed ? (
            <div className="chat-sidebar-header-row">
              <div className="chat-brand">
                <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
                <h2>Straton</h2>
                <button
                  type="button"
                  className="chat-beta-badge chat-beta-badge-button"
                  onClick={() => openBetaNoticeModal(false)}
                >
                  Beta
                </button>
              </div>
              <button
                type="button"
                className="sidebar-toggle-button"
                aria-label={
                  isCompactMobileSidebarLayout ? 'Sidebar schliessen' : isSidebarCollapsed ? 'Sidebar ausfahren' : 'Sidebar einklappen'
                }
                onClick={handleSidebarHeaderToggleClick}
              >
                <img className="ui-icon chat-sidebar-top-button-icon sidebar-toggle-icon" src={sidebarIcon} alt="" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {isSidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-logo-button"
              aria-label="Sidebar ausfahren"
              onClick={() => {
                hapticLightImpact()
                setIsSidebarCollapsed(false)
                closeThreadActionMenu()
                setIsProfileMenuOpen(false)
                profileFullSheetRef.current?.requestClose()
              }}
            >
              <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
            </button>
          ) : null}
          <button
            ref={isCompactMobileSidebarLayout ? undefined : newChatTourRef}
            type="button"
            className={`chat-sidebar-new-chat-button chat-sidebar-new-chat-button--toolbar${
              showChatTour ? ' chat-onboarding-tour-block' : ''
            }`}
            onClick={() => {
              void handleCreateNewChat()
            }}
            aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
          >
            <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon" aria-hidden="true" />
            {!isSidebarCollapsed ? <span className="chat-sidebar-new-chat-label">Neuer Chat</span> : null}
          </button>
          <button
            type="button"
            onClick={() => openSettingsModal()}
            aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={settingsIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Einstellungen' : null}
          </button>
          <button
            ref={learnTourRef}
            type="button"
            className={showChatTour ? 'chat-onboarding-tour-block' : undefined}
            onClick={() => {
              navigate('/learn')
              setIsMobileSidebarOpen(false)
            }}
            aria-label={isSidebarCollapsed ? 'Lernpfade' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={learnIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? (
              <>
                Lernpfade
                <span className="chat-dev-badge">In Entwicklung</span>
              </>
            ) : null}
          </button>
          {profile?.is_superadmin ? (
            <button
              type="button"
              onClick={openAdminModal}
              aria-label={isSidebarCollapsed ? 'Administrator' : undefined}
            >
              <img className="ui-icon chat-sidebar-top-button-icon" src={accountIcon} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? 'Administrator' : null}
            </button>
          ) : null}
        </div>

        <div className="chat-sidebar-list-wrap">
          {!isSidebarCollapsed ? (
            <div className="chat-thread-list">
              <p className="thread-list-info">Chats</p>
              {isBootstrapping ? <p className="thread-list-info">Lade Chats...</p> : null}
              {threads.map((thread) => (
              <div
                key={thread.id}
                className={`chat-thread-row ${thread.id === activeThreadId ? 'is-active' : ''} ${
                  openMenuThreadId === thread.id ? 'has-open-menu' : ''
                } ${thread.isTemporary ? 'is-temporary' : ''} ${thread.isRemoving ? 'is-removing' : ''}`}
                onContextMenu={(event) => openThreadContextMenu(event, thread.id)}
                onTouchStart={(event) => handleThreadLongPressTouchStart(thread.id, event)}
                onTouchMove={handleThreadLongPressTouchMove}
                onTouchEnd={handleThreadLongPressTouchEnd}
                onTouchCancel={handleThreadLongPressTouchEnd}
              >
                <div
                  className={`chat-thread-item ${thread.id === activeThreadId ? 'is-active' : ''}`}
                  onClick={() => {
                    if (suppressThreadClickRef.current) {
                      suppressThreadClickRef.current = false
                      return
                    }
                    selectChat(thread.id)
                    closeThreadActionMenu()
                    setIsMobileSidebarOpen(false)
                  }}
                  onContextMenu={(event) => openThreadContextMenu(event, thread.id)}
                >
                  <span className="chat-thread-title">{thread.title}</span>
                </div>
              </div>
            ))}
              {!isBootstrapping && threads.length === 0 ? (
                <p className="thread-list-info">Noch keine Chats vorhanden.</p>
              ) : null}
            </div>
          ) : null}

          <div className="chat-sidebar-footer-dock">
            <div className="chat-sidebar-bottom">
              <div className="account-profile-row">
                <div
                  ref={profileMenuRef}
                  className={`account-profile chat-sidebar-profile-card${isCompactMobileSidebarLayout ? ' chat-sidebar-profile-badge' : ''}`}
                  role={isCompactMobileSidebarLayout && !isSidebarCollapsed ? 'button' : undefined}
                  tabIndex={isCompactMobileSidebarLayout && !isSidebarCollapsed ? 0 : undefined}
                  onClick={
                    isCompactMobileSidebarLayout && !isSidebarCollapsed ? () => toggleCompactProfileSheet() : undefined
                  }
                  onKeyDown={
                    isCompactMobileSidebarLayout && !isSidebarCollapsed
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleCompactProfileSheet()
                          }
                        }
                      : undefined
                  }
                >
                  {profile?.avatar_url ? (
                    <img className="account-avatar" src={profile.avatar_url} alt="Profilbild" />
                  ) : (
                    <div className="account-avatar-fallback">{avatarFallback}</div>
                  )}
                  {!isSidebarCollapsed ? (
                    <div className="account-meta">
                      {profile?.is_superadmin && !isCompactMobileSidebarLayout ? (
                        <span className="account-admin-badge">Admin</span>
                      ) : null}
                      <div className="account-name-row">
                        <p className="account-value">
                          {isCompactMobileSidebarLayout ? greetingName : displayName}
                        </p>
                      </div>
                      {subscriptionPlanName ? (
                        <p className="account-subscription">{subscriptionPlanName}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {!isSidebarCollapsed && !isCompactMobileSidebarLayout ? (
                    <div className="account-menu-anchor">
                      <button
                        type="button"
                        className="account-menu-trigger"
                        aria-label="Profil Aktionen"
                        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                      >
                        <img className="ui-icon account-menu-icon" src={triangleIcon} alt="" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  {!isSidebarCollapsed && isProfileMenuOpen && !isCompactMobileSidebarLayout ? (
                    <ContextMenu className="account-thread-menu">
                      <MenuItem
                        iconSrc={logoutIcon}
                        danger
                        onClick={async () => {
                          setIsProfileMenuOpen(false)
                          await handleLogout()
                        }}
                      >
                        Logout
                      </MenuItem>
                    </ContextMenu>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              ref={isCompactMobileSidebarLayout ? newChatTourRef : undefined}
              className={`mobile-new-chat-fab${showChatTour ? ' chat-onboarding-tour-block' : ''}`}
              aria-label="Neuer Chat"
              onClick={() => void handleCreateNewChat()}
            >
              <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon mobile-new-chat-fab-icon" aria-hidden="true" />
              <span className="mobile-new-chat-fab-label">Chat</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="chat-main">
        <ChatWindow
          threadKey={activeThreadId}
          messages={messages}
          isSending={isSending}
          error={error}
          greetingName={greetingName}
          tokenLimitReached={tokenLimitReached}
          composerModelId={composerModelId}
          onComposerModelChange={setComposerModelId}
          onSendMessage={submitMessage}
        />
      </section>
      <button
        type="button"
        className={`mobile-sidebar-pill ${isMobileSidebarOpen ? 'is-open' : ''}`}
        aria-label={isMobileSidebarOpen ? 'Sidebar schliessen' : 'Sidebar oeffnen'}
        onClick={() => {
          if (showChatTour) {
            return
          }
          setIsSidebarCollapsed(false)
          setIsMobileSidebarOpen((prev) => {
            const next = !prev
            if (!prev && next) {
              hapticLightImpact()
            }
            return next
          })
        }}
      >
        <img className="ui-icon mobile-sidebar-pill-icon" src={sidebarIcon} alt="" aria-hidden="true" />
      </button>
      <div
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
        onClick={() => {
          if (showChatTour) {
            return
          }
          setIsMobileSidebarOpen(false)
        }}
        aria-hidden="true"
      />

      {showChatTour ? (
        <ChatOnboardingTour
          newChatButtonRef={newChatTourRef}
          learnButtonRef={learnTourRef}
          active
          onComplete={completeChatOnboarding}
        />
      ) : null}

      {isCompactMobileSidebarLayout && mobileSheetMode !== 'closed' ? (
        <ProfileFullSheet
          ref={profileFullSheetRef}
          open
          bodyClassName={mobileSheetMode === 'settings' ? 'is-settings-mode' : undefined}
          onClose={() => {
            setMobileSheetMode('closed')
          }}
        >
          {mobileSheetMode === 'profile' ? (
            <>
              <div className="profile-full-sheet-hero">
                {profile?.avatar_url ? (
                  <img className="profile-full-sheet-avatar" src={profile.avatar_url} alt="Profilbild" />
                ) : (
                  <div className="profile-full-sheet-avatar-fallback" aria-hidden="true">
                    {avatarFallback}
                  </div>
                )}
                <p className="profile-full-sheet-name">{displayName}</p>
                {subscriptionPlanName ? <p className="profile-full-sheet-plan">{subscriptionPlanName}</p> : null}
                {profile?.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
              </div>
              <nav className="profile-full-sheet-nav" aria-label="Einstellungen">
                {PROFILE_SETTINGS_SHEET_SECTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className="profile-full-sheet-row"
                    onClick={() => {
                      openSettingsModal(id)
                    }}
                  >
                    <span className="profile-full-sheet-row-label">{label}</span>
                    <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`profile-full-sheet-row${showChatTour ? ' chat-onboarding-tour-block' : ''}`}
                  onClick={() => {
                    setMobileSheetMode('closed')
                    navigate('/learn')
                    setIsMobileSidebarOpen(false)
                  }}
                >
                  <span className="profile-full-sheet-row-label">
                    Lernpfade
                    <span className="chat-dev-badge">In Entwicklung</span>
                  </span>
                  <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
                {profile?.is_superadmin ? (
                  <button
                    type="button"
                    className="profile-full-sheet-row"
                    onClick={() => {
                      openAdminModal()
                    }}
                  >
                    <span className="profile-full-sheet-row-label">Administrator</span>
                    <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="profile-full-sheet-row is-danger"
                  onClick={async () => {
                    await handleLogout()
                  }}
                >
                  <span className="profile-full-sheet-row-label">Logout</span>
                  <span className="profile-full-sheet-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </nav>
            </>
          ) : (
            <SettingsModal
              variant="sheet"
              onClose={closeSettingsModal}
              initialSection={settingsInitialSection}
            />
          )}
        </ProfileFullSheet>
      ) : null}

      {isSettingsMounted && !isCompactMobileSidebarLayout ? (
        <ModalShell isOpen={isSettingsVisible} onRequestClose={closeSettingsModal}>
          <SettingsModal variant="modal" onClose={closeSettingsModal} initialSection={settingsInitialSection} />
        </ModalShell>
      ) : null}
      {isAdminMounted ? (
        <ModalShell isOpen={isAdminVisible} closeOnOverlayClick={false}>
          <AdministratorModal onClose={closeAdminModal} />
        </ModalShell>
      ) : null}
      {threadMenuVariant === 'sheet' && openMenuThreadId ? (
        <ActionBottomSheet
          ref={threadSheetRef}
          open
          ariaLabel="Chat-Aktionen"
          title={threads.find((t) => t.id === openMenuThreadId)?.title}
          onClose={closeThreadActionMenu}
          actions={[
            {
              id: 'edit',
              label: 'Bearbeiten',
              iconSrc: editIcon,
              onClick: () => {
                const targetThread = threads.find((thread) => thread.id === openMenuThreadId)
                if (targetThread) {
                  openRenameModal(targetThread)
                }
              },
            },
            {
              id: 'delete',
              label: 'Löschen',
              iconSrc: deleteIcon,
              variant: 'danger',
              onClick: async () => {
                const id = openMenuThreadId
                closeThreadActionMenu()
                if (id) {
                  await deleteChat(id)
                }
              },
            },
          ]}
        />
      ) : null}
      {threadMenuVariant === 'context' && openMenuThreadId && contextMenuPosition ? (
        <ContextMenu
          ref={menuWrapperRef}
          className="thread-menu-context-global"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        >
          <MenuItem
            iconSrc={editIcon}
            onClick={() => {
              const targetThread = threads.find((thread) => thread.id === openMenuThreadId)
              if (targetThread) {
                openRenameModal(targetThread)
              }
            }}
          >
            Bearbeiten
          </MenuItem>
          <MenuItem
            iconSrc={deleteIcon}
            danger
            onClick={async () => {
              const id = openMenuThreadId
              closeThreadActionMenu()
              if (id) {
                await deleteChat(id)
              }
            }}
          >
            Löschen
          </MenuItem>
        </ContextMenu>
      ) : null}
      {editingThread && isMobileViewport() ? (
        <RenameBottomSheet
          ref={renameSheetRef}
          open
          onClose={handleRenameSheetClosed}
          heading="Chat bearbeiten"
          inputLabel="Chat-Name"
          inputId="chat-title-input"
          value={renameDraft}
          onChange={setRenameDraft}
          placeholder="Neuer Chatname"
          onSubmit={handleRenameSubmit}
        />
      ) : editingThread ? (
        <ModalShell isOpen={isRenameVisible} onRequestClose={closeRenameModal}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Chat umbenennen">
            <ModalHeader
              title="Chat bearbeiten"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={closeRenameModal}
              closeLabel="Chat bearbeiten schliessen"
            />

            <form className="rename-form" onSubmit={handleRenameSubmit}>
              <label htmlFor="chat-title-input">Chat-Name</label>
              <input
                id="chat-title-input"
                type="text"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="Neuer Chatname"
              />

              <div className="rename-actions">
                <button type="submit" disabled={!renameDraft.trim()}>
                  Speichern
                </button>
              </div>
            </form>
          </section>
        </ModalShell>
      ) : null}
      {isBetaNoticeMounted ? (
        <ModalShell isOpen={isBetaNoticeVisible} onRequestClose={() => void closeBetaNoticeModal()}>
          <section className="rename-modal beta-notice-modal" role="dialog" aria-modal="true" aria-label="Beta Hinweis">
            <header className="beta-notice-header">
              <div className="beta-notice-brand">
                <img className="ui-icon chat-brand-logo beta-notice-logo" src={logoSrc} alt="" aria-hidden="true" />
                <h2>Straton</h2>
              </div>
              <button
                type="button"
                className="settings-close-button"
                onClick={() => void closeBetaNoticeModal()}
                aria-label="Beta Hinweis schliessen"
              >
                <span className="ui-icon settings-close-icon" aria-hidden="true" />
              </button>
            </header>
            <h3 className="beta-notice-title">Beta Version</h3>
            <p className="beta-notice-text">
              Du nutzt aktuell eine Beta-Version. Inhalte, Funktionen und Design koennen sich in den naechsten
              Updates noch aendern. Dein Feedback hilft uns sehr, Straton schneller und besser zu machen.
            </p>
            <div className="rename-actions">
              <PrimaryButton type="button" onClick={() => void closeBetaNoticeModal()}>
                Verstanden
              </PrimaryButton>
            </div>
          </section>
        </ModalShell>
      ) : null}
    </main>
  )
}
