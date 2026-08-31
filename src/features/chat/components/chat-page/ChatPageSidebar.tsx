import { type MouseEvent, type ReactNode, type RefObject, useState } from 'react'
import addIcon from '../../../../assets/icons/add.svg'
import sidebarIcon from '../../../../assets/icons/sidebar.svg'
import { MaskIcon } from '../../../../components/ui/MaskIcon'
import type { UserProfile } from '../../../auth/services/auth.service'
import type { LearnGenerationMode } from '../../../learn/services/learn.persistence'
import { ChatLearningPathsSidebarSection } from '../ChatLearningPathsSidebarSection'
import { ChatSidebarSectionHeader } from '../ChatSidebarSectionHeader'
import { ChatThreadListSkeleton } from '../ChatThreadListSkeleton'
import type { ChatThread } from '../../types'
import type { LearningPathSummary } from '../../../learn/services/learn.persistence'
import type { useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'
import { hapticLightImpact } from '../../../../utils/haptics'

type GlassPillTouch = ReturnType<typeof useGlassPillTouchFeedback>

/** Sidebar zeigt zunächst nur die neuesten Chats; «Mehr anzeigen» blendet schrittweise nach. */
const SIDEBAR_CHATS_INITIAL_COUNT = 3
const SIDEBAR_CHATS_LOAD_MORE_STEP = 10

type ChatPageSidebarProps = {
  profile: UserProfile | null
  isSidebarCollapsed: boolean
  isCompactMobileSidebarLayout: boolean
  isMobileSidebarOpen: boolean
  logoSrc: string
  displayName: string
  greetingName: string
  avatarFallback: string
  subscriptionPlanName: string | null
  showLearningPathsInSidebar: boolean
  showFriendsInSidebar: boolean
  learningPaths: LearningPathSummary[]
  activeLearnPathId: string | null
  isLearnPathCreateDisabled: boolean
  threadSkeletonMounted: boolean
  threadSkeletonExiting: boolean
  isBootstrapping: boolean
  threadsCount: number
  sidebarThreadList: ChatThread[]
  chatTourEligible: boolean
  learnFeatureInfoVisible: boolean
  newsUnreadCount: number
  friendsIncomingCount: number
  isNewsOverviewOpen: boolean
  isFriendsOverviewOpen: boolean
  isSettingsWorkspaceOpen: boolean
  isNewChatPending: boolean
  newChatTourRef: RefObject<HTMLButtonElement | null>
  learnTourRef: RefObject<HTMLDivElement | null>
  profileMenuRef: RefObject<HTMLDivElement | null>
  sidebarNewChatTouch: GlassPillTouch
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
  onOpenBetaNotice: () => void
  onGoHome: () => void
  onSidebarHeaderToggle: () => void
  onExpandSidebar: () => void
  onCreateNewChat: () => void
  onOpenSettings: () => void
  onOpenNews: () => void
  onCloseNews: () => void
  onOpenFriends: () => void
  onCloseFriends: () => void
  onOpenAdmin: () => void
  onToggleCompactProfileSheet: () => void
  onSelectLearningPath: (pathId: string) => void
  onCreateLearningPath: (generationMode?: LearnGenerationMode) => void
  openLearningPathMenuId?: string | null
  onLearningPathContextMenu?: (event: MouseEvent, pathId: string) => void
  onThreadSkeletonTransitionEnd: () => void
  onShowLearnUnavailable: () => void
}

export function ChatPageSidebar({
  profile,
  isSidebarCollapsed,
  isCompactMobileSidebarLayout,
  logoSrc,
  displayName,
  greetingName,
  avatarFallback,
  subscriptionPlanName,
  showLearningPathsInSidebar,
  showFriendsInSidebar,
  learningPaths,
  activeLearnPathId,
  isLearnPathCreateDisabled,
  threadSkeletonMounted,
  threadSkeletonExiting,
  isBootstrapping,
  threadsCount,
  sidebarThreadList,
  chatTourEligible,
  learnFeatureInfoVisible,
  newsUnreadCount,
  friendsIncomingCount,
  isNewsOverviewOpen,
  isFriendsOverviewOpen,
  isSettingsWorkspaceOpen,
  isNewChatPending,
  newChatTourRef,
  learnTourRef,
  profileMenuRef,
  sidebarNewChatTouch,
  renderThreadRow,
  onOpenBetaNotice,
  onGoHome,
  onSidebarHeaderToggle,
  onExpandSidebar,
  onCreateNewChat,
  onOpenSettings,
  onOpenNews,
  onCloseNews,
  onOpenFriends,
  onCloseFriends,
  onOpenAdmin,
  onToggleCompactProfileSheet,
    onSelectLearningPath,
    onCreateLearningPath,
    openLearningPathMenuId = null,
    onLearningPathContextMenu,
  onThreadSkeletonTransitionEnd,
  onShowLearnUnavailable,
}: ChatPageSidebarProps) {
  const [isChatsSectionExpanded, setIsChatsSectionExpanded] = useState(true)
  const [visibleChatsCount, setVisibleChatsCount] = useState(SIDEBAR_CHATS_INITIAL_COUNT)
  const [isFooterMoreExpanded, setIsFooterMoreExpanded] = useState(false)
  const [isSettingsIconFlipped, setIsSettingsIconFlipped] = useState(false)
  const [isCreatePathModeMenuOpen, setIsCreatePathModeMenuOpen] = useState(false)

  // Superadmin: Auswahl KI vs. Platzhalter (Test ohne API-Kosten) beim Erstellen eines Lernpfads.
  const canChooseCreatePathMode = profile?.is_superadmin === true

  const handleCreatePathClick = () => {
    if (isLearnPathCreateDisabled) {
      onShowLearnUnavailable()
      return
    }
    if (canChooseCreatePathMode) {
      setIsCreatePathModeMenuOpen((prev) => !prev)
      return
    }
    onCreateLearningPath('ai')
  }

  const handleChooseCreatePathMode = (mode: LearnGenerationMode) => {
    setIsCreatePathModeMenuOpen(false)
    onCreateLearningPath(mode)
  }

  return (
    <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="chat-sidebar-top">
        {!isSidebarCollapsed ? (
          <div className="chat-sidebar-header-row">
            <div className="chat-brand">
              <div
                className="chat-brand-home-button"
                role="button"
                tabIndex={0}
                aria-label="Zur Startseite"
                onClick={onGoHome}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onGoHome()
                  }
                }}
              >
                <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
                <h2>Straton</h2>
              </div>
              {!isCompactMobileSidebarLayout ? (
                <button type="button" className="ui-pill-badge ui-pill-badge--purple chat-beta-badge-button" onClick={onOpenBetaNotice}>
                  Beta
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-label={
                isCompactMobileSidebarLayout
                  ? 'Sidebar schließen'
                  : isSidebarCollapsed
                    ? 'Sidebar ausfahren'
                    : 'Sidebar einklappen'
              }
              onClick={onSidebarHeaderToggle}
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
              onExpandSidebar()
            }}
          >
            <img className="ui-icon chat-brand-logo chat-brand-logo-collapsed" src={logoSrc} alt="" aria-hidden="true" />
          </button>
        ) : null}

        <div className="learn-sidebar-top-actions">
          {showLearningPathsInSidebar ? (
            <div className="learn-new-path-wrap">
              <button
                type="button"
                className={`ui-button ui-button-primary learn-sidebar-action-button${
                  isLearnPathCreateDisabled ? ' is-disabled' : ''
                }`}
                aria-disabled={isLearnPathCreateDisabled}
                aria-expanded={canChooseCreatePathMode ? isCreatePathModeMenuOpen : undefined}
                onClick={handleCreatePathClick}
                aria-label={isSidebarCollapsed ? 'Lernpfad erstellen' : undefined}
              >
                <MaskIcon src={addIcon} className="learn-sidebar-button-plus" />
                {!isSidebarCollapsed ? <span className="learn-new-path-label">Lernpfad erstellen</span> : null}
              </button>
              {isCreatePathModeMenuOpen ? (
                <>
                  <div
                    className="learn-create-mode-backdrop"
                    onClick={() => setIsCreatePathModeMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="learn-create-mode-menu" role="menu" aria-label="Lernpfad-Erstellmodus">
                    <button
                      type="button"
                      className="learn-create-mode-option"
                      role="menuitem"
                      onClick={() => handleChooseCreatePathMode('ai')}
                    >
                      <span className="learn-create-mode-option-title">KI</span>
                      <span className="learn-create-mode-option-meta">Normaler Lernpfad mit KI-Generierung</span>
                    </button>
                    <button
                      type="button"
                      className="learn-create-mode-option"
                      role="menuitem"
                      onClick={() => handleChooseCreatePathMode('placeholder')}
                    >
                      <span className="learn-create-mode-option-title">Platzhalter</span>
                      <span className="learn-create-mode-option-meta">Testablauf ohne API-Kosten</span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <button
            ref={isCompactMobileSidebarLayout ? undefined : newChatTourRef}
            type="button"
            className={`ui-button ui-button-secondary learn-sidebar-action-button${
              chatTourEligible ? ' chat-onboarding-tour-block' : ''
            }`}
            onClick={() => void onCreateNewChat()}
            aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
          >
            <MaskIcon src={addIcon} className="learn-sidebar-button-plus" />
            {!isSidebarCollapsed ? <span className="learn-new-path-label">Neuer Chat</span> : null}
          </button>
        </div>

        {learnFeatureInfoVisible && !isSidebarCollapsed ? (
          <p className="chat-learn-feature-info chat-learn-feature-info--sidebar">Noch nicht verfügbar</p>
        ) : null}
      </div>

      <div className="chat-sidebar-list-wrap">
        {!isSidebarCollapsed ? (
          <div className="chat-thread-list">
            {showLearningPathsInSidebar ? (
              <ChatLearningPathsSidebarSection
                sectionRef={learnTourRef}
                tourHighlight={chatTourEligible}
                learningPaths={learningPaths}
                activePathId={activeLearnPathId}
                openMenuPathId={openLearningPathMenuId}
                onContextMenu={onLearningPathContextMenu}
                onSelectLearningPath={onSelectLearningPath}
              />
            ) : null}
            <div className="chat-sidebar-chats-section">
              <ChatSidebarSectionHeader
                title="Chats"
                isExpanded={isChatsSectionExpanded}
                onToggle={() => setIsChatsSectionExpanded((prev) => !prev)}
              />
              {isChatsSectionExpanded ? (
                <>
                  {threadSkeletonMounted ? (
                    <ChatThreadListSkeleton
                      exiting={threadSkeletonExiting}
                      onExitTransitionEnd={onThreadSkeletonTransitionEnd}
                    />
                  ) : null}
                  {!isBootstrapping && !threadSkeletonMounted
                    ? sidebarThreadList
                        .slice(0, visibleChatsCount)
                        .map((thread, threadIndex) => renderThreadRow(thread, threadIndex))
                    : null}
                  {!isBootstrapping && !threadSkeletonMounted && sidebarThreadList.length > visibleChatsCount ? (
                    <button
                      type="button"
                      className="chat-sidebar-chats-show-more"
                      onClick={() =>
                        setVisibleChatsCount((prev) => prev + SIDEBAR_CHATS_LOAD_MORE_STEP)
                      }
                    >
                      Mehr anzeigen
                    </button>
                  ) : null}
                  {!isBootstrapping && !threadSkeletonMounted && threadsCount === 0 ? (
                    <p className="thread-list-info">Noch keine Chats vorhanden.</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="chat-sidebar-footer-dock">
          <div className="chat-sidebar-bottom">
            <div className="chat-sidebar-footer-divider" aria-hidden="true" />

            <button
              type="button"
              className={`chat-sidebar-footer-nav-button chat-sidebar-footer-settings-button${
                isSettingsWorkspaceOpen ? ' is-active' : ''
              }`}
              onClick={() => {
                setIsSettingsIconFlipped((prev) => !prev)
                onOpenSettings()
              }}
              aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}
            >
              <span
                className={`chat-sidebar-footer-nav-icon chat-sidebar-footer-settings-icon${
                  isSettingsIconFlipped ? ' is-flipped' : ''
                }`}
                aria-hidden="true"
              />
              {!isSidebarCollapsed ? 'Einstellungen' : null}
            </button>

            {profile?.is_superadmin ? (
              <button
                type="button"
                className="chat-sidebar-footer-nav-button chat-sidebar-footer-admin-button"
                onClick={onOpenAdmin}
                aria-label={isSidebarCollapsed ? 'Administrator' : undefined}
              >
                <span className="chat-sidebar-footer-nav-icon chat-sidebar-footer-admin-icon" aria-hidden="true" />
                {!isSidebarCollapsed ? 'Administrator' : null}
              </button>
            ) : null}

            {isSidebarCollapsed ? (
              <>
                <button
                  type="button"
                  className={`chat-sidebar-footer-nav-button chat-sidebar-nav-button--news${
                    isNewsOverviewOpen ? ' is-active' : ''
                  }${newsUnreadCount > 0 ? ' is-collapsed-badge' : ''}`}
                  onClick={onOpenNews}
                  aria-label={`Updates & Neuigkeiten${newsUnreadCount > 0 ? `, ${newsUnreadCount} ungelesen` : ''}`}
                >
                  <span
                    className="chat-sidebar-footer-nav-icon chat-sidebar-footer-news-icon"
                    aria-hidden="true"
                  />
                  {newsUnreadCount > 0 ? (
                    <span className="chat-sidebar-news-badge" aria-label={`${newsUnreadCount} ungelesen`}>
                      {newsUnreadCount > 9 ? '9+' : newsUnreadCount}
                    </span>
                  ) : null}
                </button>
                {showFriendsInSidebar ? (
                  <button
                    type="button"
                    className={`chat-sidebar-footer-nav-button chat-sidebar-nav-button--friends${
                      isFriendsOverviewOpen ? ' is-active' : ''
                    }${friendsIncomingCount > 0 ? ' is-collapsed-badge' : ''}`}
                    onClick={onOpenFriends}
                    aria-label={`Freunde${
                      friendsIncomingCount > 0 ? `, ${friendsIncomingCount} eingehende Anfragen` : ''
                    }`}
                  >
                    <span
                      className="chat-sidebar-footer-nav-icon chat-sidebar-footer-friends-icon"
                      aria-hidden="true"
                    />
                    {friendsIncomingCount > 0 ? (
                      <span className="chat-sidebar-news-badge" aria-label={`${friendsIncomingCount} eingehend`}>
                        {friendsIncomingCount > 9 ? '9+' : friendsIncomingCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="chat-sidebar-footer-nav-button chat-sidebar-footer-more-button"
                  aria-expanded={isFooterMoreExpanded}
                  onClick={() => {
                    setIsFooterMoreExpanded((prev) => {
                      const next = !prev
                      if (!next && isFriendsOverviewOpen) {
                        onCloseFriends()
                      }
                      if (!next && isNewsOverviewOpen) {
                        onCloseNews()
                      }
                      return next
                    })
                  }}
                >
                  <span
                    className={`chat-sidebar-footer-more-dots${isFooterMoreExpanded ? ' is-open' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="chat-sidebar-footer-more-dot chat-sidebar-footer-more-dot--l" />
                    <span className="chat-sidebar-footer-more-dot chat-sidebar-footer-more-dot--c" />
                    <span className="chat-sidebar-footer-more-dot chat-sidebar-footer-more-dot--r" />
                  </span>
                  <span className="chat-sidebar-nav-label-row">
                    Mehr
                    {newsUnreadCount > 0 && !isFooterMoreExpanded ? (
                      <span className="chat-sidebar-news-badge" aria-label={`${newsUnreadCount} ungelesene Updates`}>
                        {newsUnreadCount > 9 ? '9+' : newsUnreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
                <div className={`chat-sidebar-footer-more-panel${isFooterMoreExpanded ? ' is-open' : ''}`}>
                  <div className="chat-sidebar-footer-more-panel-inner">
                    <button
                      type="button"
                      className={`chat-sidebar-footer-subnav-button chat-sidebar-footer-subnav-button--news${
                        isNewsOverviewOpen ? ' is-active' : ''
                      }`}
                      onClick={onOpenNews}
                    >
                      <span
                        className="chat-sidebar-footer-nav-icon chat-sidebar-footer-news-icon"
                        aria-hidden="true"
                      />
                      <span className="chat-sidebar-nav-label-row">
                        Updates & Neuigkeiten
                        {newsUnreadCount > 0 ? (
                          <span className="chat-sidebar-news-badge" aria-label={`${newsUnreadCount} ungelesen`}>
                            {newsUnreadCount > 9 ? '9+' : newsUnreadCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {showFriendsInSidebar ? (
                      <button
                        type="button"
                        className={`chat-sidebar-footer-subnav-button chat-sidebar-footer-subnav-button--friends${
                          isFriendsOverviewOpen ? ' is-active' : ''
                        }`}
                        onClick={onOpenFriends}
                      >
                        <span
                          className="chat-sidebar-footer-nav-icon chat-sidebar-footer-friends-icon"
                          aria-hidden="true"
                        />
                        <span className="chat-sidebar-nav-label-row">
                          Freunde
                          {friendsIncomingCount > 0 ? (
                            <span className="chat-sidebar-news-badge" aria-label={`${friendsIncomingCount} eingehend`}>
                              {friendsIncomingCount > 9 ? '9+' : friendsIncomingCount}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            )}

            <div className="chat-sidebar-footer-divider" aria-hidden="true" />

            <div className="account-profile-row">
              <div
                ref={profileMenuRef}
                className={`account-profile${
                  isCompactMobileSidebarLayout
                    ? ' chat-sidebar-profile-badge chat-sidebar-profile-card'
                    : ' chat-sidebar-profile-flat'
                }`}
                role={isCompactMobileSidebarLayout && !isSidebarCollapsed ? 'button' : undefined}
                tabIndex={isCompactMobileSidebarLayout && !isSidebarCollapsed ? 0 : undefined}
                onClick={
                  isCompactMobileSidebarLayout && !isSidebarCollapsed ? onToggleCompactProfileSheet : undefined
                }
                onKeyDown={
                  isCompactMobileSidebarLayout && !isSidebarCollapsed
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onToggleCompactProfileSheet()
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
                    <div className="account-name-row">
                      <p className="account-value">
                        {isCompactMobileSidebarLayout ? greetingName : displayName}
                      </p>
                      {profile?.is_superadmin && !isCompactMobileSidebarLayout ? (
                        <span className="ui-pill-badge ui-pill-badge--red">Admin</span>
                      ) : null}
                    </div>
                    {subscriptionPlanName ? (
                      <p className="account-subscription">{subscriptionPlanName}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            ref={isCompactMobileSidebarLayout ? newChatTourRef : undefined}
            className={[
              'mobile-new-chat-fab',
              'new-chat-touch-btn',
              sidebarNewChatTouch.touchStateClass,
              chatTourEligible ? 'chat-onboarding-tour-block' : '',
              isNewChatPending ? 'is-new-chat-pending' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="Neuer Chat"
            aria-busy={isNewChatPending ? true : undefined}
            onClick={() => void onCreateNewChat()}
            {...sidebarNewChatTouch.touchHandlers}
          >
            <span
              className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon mobile-new-chat-fab-icon new-chat-touch-btn__icon"
              aria-hidden="true"
            />
            <span className="mobile-new-chat-fab-label">Neuer Chat</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
