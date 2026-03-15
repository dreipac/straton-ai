import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import deleteIcon from '../assets/icons/delete.svg'
import editIcon from '../assets/icons/edit.svg'
import loginIcon from '../assets/icons/login.svg'
import logoutIcon from '../assets/icons/logout.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import accountIcon from '../assets/icons/account.svg'
import settingsIcon from '../assets/icons/settings.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import triangleIcon from '../assets/icons/triangle.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import { ChatWindow } from '../features/chat/components/ChatWindow'
import { useChat } from '../features/chat/hooks/useChat'
import type { ChatThread } from '../features/chat/types'
import { AdministratorModal } from './AdminPage'
import { SettingsModal } from './SettingsPage'

export function ChatPage() {
  const MODAL_ANIMATION_MS = 220
  const { user, profile, logout } = useAuth()
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
  } = useChat(user?.id, profile?.auto_remove_empty_chats ?? true)
  const navigate = useNavigate()
  const [isSettingsMounted, setIsSettingsMounted] = useState(false)
  const [isSettingsVisible, setIsSettingsVisible] = useState(false)
  const [isAdminMounted, setIsAdminMounted] = useState(false)
  const [isAdminVisible, setIsAdminVisible] = useState(false)
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [editingThread, setEditingThread] = useState<ChatThread | null>(null)
  const [isRenameVisible, setIsRenameVisible] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const menuWrapperRef = useRef<HTMLDivElement | null>(null)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const settingsCloseTimerRef = useRef<number | null>(null)
  const adminCloseTimerRef = useRef<number | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openMenuThreadId && !isProfileMenuOpen) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      const isInsideThreadMenu = menuWrapperRef.current?.contains(target) ?? false
      const isInsideProfileMenu = profileMenuRef.current?.contains(target) ?? false

      if (!isInsideThreadMenu && openMenuThreadId) {
        setOpenMenuThreadId(null)
        setContextMenuPosition(null)
      }

      if (!isInsideProfileMenu && isProfileMenuOpen) {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [openMenuThreadId, isProfileMenuOpen])

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
    }
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  function openSettingsModal() {
    setIsMobileSidebarOpen(false)
    if (settingsCloseTimerRef.current) {
      window.clearTimeout(settingsCloseTimerRef.current)
      settingsCloseTimerRef.current = null
    }

    setIsSettingsMounted(true)
    window.requestAnimationFrame(() => {
      setIsSettingsVisible(true)
    })
  }

  function closeSettingsModal() {
    setIsSettingsVisible(false)
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setIsSettingsMounted(false)
      settingsCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openAdminModal() {
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
    setIsMobileSidebarOpen(false)
    if (renameCloseTimerRef.current) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }

    setEditingThread(thread)
    setRenameDraft(thread.title)
    setIsRenameVisible(false)
    window.requestAnimationFrame(() => {
      setIsRenameVisible(true)
    })
    setOpenMenuThreadId(null)
    setContextMenuPosition(null)
  }

  function closeRenameModal() {
    setIsRenameVisible(false)
    renameCloseTimerRef.current = window.setTimeout(() => {
      setEditingThread(null)
      renameCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingThread) {
      return
    }

    await renameChat(editingThread.id, renameDraft)
    closeRenameModal()
  }

  function openThreadContextMenu(event: ReactMouseEvent, threadId: string) {
    event.preventDefault()
    event.stopPropagation()
    setOpenMenuThreadId(threadId)
    setContextMenuPosition({
      x: event.clientX,
      y: event.clientY,
    })
  }

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.first_name ||
    user?.email ||
    'Unbekannter Nutzer'
  const greetingName = profile?.first_name || displayName.split(' ')[0] || 'da'

  const avatarFallback = (profile?.first_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()
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
                </div>
                <button
                  type="button"
                  className="sidebar-toggle-button"
                  aria-label={isSidebarCollapsed ? 'Sidebar ausfahren' : 'Sidebar einklappen'}
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
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
                onClick={() => setIsSidebarCollapsed(false)}
              >
                <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={() => navigate('/login')} aria-label={isSidebarCollapsed ? 'Anmelden' : undefined}>
              <img className="ui-icon chat-sidebar-top-button-icon" src={loginIcon} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? 'Anmelden' : null}
            </button>
            <button type="button" aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined} onClick={() => navigate('/login')}>
              <img className="ui-icon chat-sidebar-top-button-icon" src={newMessageIcon} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? 'Neuer Chat' : null}
            </button>
          </div>

          {!isSidebarCollapsed ? (
            <div className="chat-thread-list">
              <p className="thread-list-info">Melde dich an, um deine Chats in der Sidebar zu sehen.</p>
            </div>
          ) : null}
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
              messages={[]}
              isSending={false}
              error={null}
              greetingName="da"
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
            setIsMobileSidebarOpen((prev) => !prev)
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
              </div>
              <button
                type="button"
                className="sidebar-toggle-button"
                aria-label={isSidebarCollapsed ? 'Sidebar ausfahren' : 'Sidebar einklappen'}
                onClick={() => {
                  setIsSidebarCollapsed((prev) => !prev)
                  setOpenMenuThreadId(null)
                  setContextMenuPosition(null)
                  setIsProfileMenuOpen(false)
                }}
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
                setIsSidebarCollapsed(false)
                setOpenMenuThreadId(null)
                setContextMenuPosition(null)
                setIsProfileMenuOpen(false)
              }}
            >
              <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={openSettingsModal}
            aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={settingsIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Einstellungen' : null}
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
          <button
            type="button"
            onClick={createNewChat}
            aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={newMessageIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Neuer Chat' : null}
          </button>
        </div>

        {!isSidebarCollapsed ? (
          <div className="chat-thread-list">
            {isBootstrapping ? <p className="thread-list-info">Lade Chats...</p> : null}
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={`chat-thread-row ${thread.id === activeThreadId ? 'is-active' : ''} ${
                  openMenuThreadId === thread.id ? 'has-open-menu' : ''
                } ${thread.isTemporary ? 'is-temporary' : ''} ${thread.isRemoving ? 'is-removing' : ''}`}
                onContextMenu={(event) => openThreadContextMenu(event, thread.id)}
              >
                <div
                  className={`chat-thread-item ${thread.id === activeThreadId ? 'is-active' : ''}`}
                  onClick={() => {
                    selectChat(thread.id)
                    setOpenMenuThreadId(null)
                    setContextMenuPosition(null)
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

        <div className="chat-sidebar-bottom">
          <div className="account-profile-row">
            <div className="account-profile">
              {profile?.avatar_url ? (
                <img className="account-avatar" src={profile.avatar_url} alt="Profilbild" />
              ) : (
                <div className="account-avatar-fallback">{avatarFallback}</div>
              )}
              {!isSidebarCollapsed ? (
                <div className="account-meta">
                  <div className="account-name-row">
                    <p className="account-value">{displayName}</p>
                    {profile?.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
                  </div>
                  <p className="account-email">{user?.email ?? ''}</p>
                </div>
              ) : null}
            </div>

            {!isSidebarCollapsed ? (
              <div ref={profileMenuRef} className="account-menu-anchor">
                <button
                  type="button"
                  className="account-menu-trigger"
                  aria-label="Profil Aktionen"
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                >
                  <img className="ui-icon account-menu-icon" src={triangleIcon} alt="" aria-hidden="true" />
                </button>

                {isProfileMenuOpen ? (
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
            ) : null}
          </div>
        </div>
      </aside>

      <section className="chat-main">
        <ChatWindow
          messages={messages}
          isSending={isSending}
          error={error}
          greetingName={greetingName}
          onSendMessage={submitMessage}
        />
      </section>
      <button
        type="button"
        className={`mobile-sidebar-pill ${isMobileSidebarOpen ? 'is-open' : ''}`}
        aria-label={isMobileSidebarOpen ? 'Sidebar schliessen' : 'Sidebar oeffnen'}
        onClick={() => {
          setIsSidebarCollapsed(false)
          setIsMobileSidebarOpen((prev) => !prev)
        }}
      >
        <img className="ui-icon mobile-sidebar-pill-icon" src={sidebarIcon} alt="" aria-hidden="true" />
      </button>
      <div
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
        aria-hidden="true"
      />

      {isSettingsMounted ? (
        <ModalShell isOpen={isSettingsVisible}>
          <SettingsModal onClose={closeSettingsModal} />
        </ModalShell>
      ) : null}
      {isAdminMounted ? (
        <ModalShell isOpen={isAdminVisible}>
          <AdministratorModal onClose={closeAdminModal} />
        </ModalShell>
      ) : null}
      {openMenuThreadId && contextMenuPosition ? (
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
              await deleteChat(openMenuThreadId)
              setOpenMenuThreadId(null)
              setContextMenuPosition(null)
            }}
          >
            Löschen
          </MenuItem>
        </ContextMenu>
      ) : null}
      {editingThread ? (
        <ModalShell isOpen={isRenameVisible}>
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
    </main>
  )
}
