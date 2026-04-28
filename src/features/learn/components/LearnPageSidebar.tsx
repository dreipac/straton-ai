import { useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { useDocumentThemeVariant } from '../../../hooks/useDocumentThemeVariant'
import settingsIcon from '../../../assets/icons/settings.svg'
import sidebarIcon from '../../../assets/icons/sidebar.svg'
import statusIcon from '../../../assets/icons/status.svg'
import type { LearningPathSummary } from '../services/learn.persistence'
import { getDisplayPathTitle } from '../utils/learnPageHelpers'
import { hapticLightImpact } from '../../../utils/haptics'

type ProfileLite = {
  avatar_url?: string | null
  first_name?: string | null
  last_name?: string | null
  is_superadmin?: boolean | null
} | null

export type LearnPageSidebarProps = {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  onCreateLearningPath: () => void
  onOpenSettings: () => void
  learningPaths: LearningPathSummary[]
  activePathId: string
  onSelectLearningPath: (pathId: string) => void
  onLearningPathContextMenu: (event: ReactMouseEvent, pathId: string) => void
  onNavigateToChat: () => void
  profile: ProfileLite
  displayName: string
  avatarFallback: string
  subscriptionPlanName: string | null
}

export function LearnPageSidebar(props: LearnPageSidebarProps) {
  const {
    isSidebarCollapsed,
    onToggleSidebar,
    onCreateLearningPath,
    onOpenSettings,
    learningPaths,
    activePathId,
    onSelectLearningPath,
    onLearningPathContextMenu,
    onNavigateToChat,
    profile,
    displayName,
    avatarFallback,
    subscriptionPlanName,
  } = props

  const themeVariant = useDocumentThemeVariant()
  const logoSrc = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return themeVariant === 'pink-glass'
      ? `${base}assets/logo/Straton-pink.png`
      : `${base}assets/logo/Straton.png`
  }, [themeVariant])

  const expandFromCollapsed = () => {
    hapticLightImpact()
    onToggleSidebar()
  }

  return (
    <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="chat-sidebar-top">
        <div className="chat-sidebar-header-row">
          {isSidebarCollapsed ? (
            <button type="button" className="sidebar-logo-button" aria-label="Sidebar ausfahren" onClick={expandFromCollapsed}>
              <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
            </button>
          ) : (
            <>
              <div className="chat-brand">
                <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
                <h2>Lernbereich</h2>
              </div>
              <button type="button" className="sidebar-toggle-button" aria-label="Sidebar einklappen" onClick={() => onToggleSidebar()}>
                <img className="ui-icon chat-sidebar-top-button-icon sidebar-toggle-icon" src={sidebarIcon} alt="" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          className="learn-primary-sidebar-button"
          onClick={onCreateLearningPath}
          aria-label={isSidebarCollapsed ? 'Neuer Lernpfad' : undefined}
        >
          <span className="learn-new-path-icon chat-sidebar-top-button-icon" aria-hidden="true" />
          {!isSidebarCollapsed ? <span className="learn-new-path-label">Neuer Lernpfad</span> : null}
        </button>
        <button type="button" onClick={onOpenSettings} aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}>
          <img className="ui-icon chat-sidebar-top-button-icon" src={settingsIcon} alt="" aria-hidden="true" />
          {!isSidebarCollapsed ? 'Einstellungen' : null}
        </button>
      </div>

      {!isSidebarCollapsed ? (
        <div className="chat-thread-list">
          <p className="thread-list-info">Lernpfade</p>
          {learningPaths.map((path) => (
            <button
              key={path.id}
              type="button"
              className={`chat-thread-item ${path.id === activePathId ? 'is-active' : ''}`}
              onClick={() => {
                void onSelectLearningPath(path.id)
              }}
              onContextMenu={(event) => onLearningPathContextMenu(event, path.id)}
            >
              <span className="chat-thread-title">{getDisplayPathTitle(path.title)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-sidebar-bottom">
        <div className={`learn-sidebar-account-combined${isSidebarCollapsed ? ' learn-sidebar-account-combined--profile-only' : ''}`}>
          {!isSidebarCollapsed ? (
            <button type="button" className="learn-mode-switch-button" onClick={onNavigateToChat}>
              <img className="ui-icon chat-sidebar-top-button-icon" src={statusIcon} alt="" aria-hidden="true" />
              <span className="learn-mode-switch-copy">
                <span className="learn-mode-switch-title">Standardmodus</span>
                <span className="learn-mode-switch-subtitle">Bereich wechseln</span>
              </span>
            </button>
          ) : null}
          <div className="account-profile-row">
            <div className="account-profile chat-sidebar-profile-card">
              {profile?.avatar_url ? (
                <img className="account-avatar" src={profile.avatar_url} alt="Profilbild" />
              ) : (
                <div className="account-avatar-fallback">{avatarFallback}</div>
              )}
              {!isSidebarCollapsed ? (
                <div className="account-meta">
                  {profile?.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
                  <div className="account-name-row">
                    <p className="account-value">{displayName}</p>
                  </div>
                  {subscriptionPlanName ? <p className="account-subscription">{subscriptionPlanName}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
