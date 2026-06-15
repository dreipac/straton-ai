import { type MouseEvent, type ReactNode, type RefObject, useState } from 'react'
import accountIcon from '../../../../assets/icons/account.svg'
import newsIcon from '../../../../assets/icons/news.svg'
import userAddIcon from '../../../../assets/icons/userAdd.svg'
import settingsIcon from '../../../../assets/icons/settings.svg'
import sidebarIcon from '../../../../assets/icons/sidebar.svg'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../../auth/services/auth.service'
import { ChatFolderSidebarSection } from '../ChatFolderSidebarSection'
import { ChatLearningPathsSidebarSection } from '../ChatLearningPathsSidebarSection'
import { ChatSidebarSectionHeader } from '../ChatSidebarSectionHeader'
import { ChatThreadListSkeleton } from '../ChatThreadListSkeleton'
import type { ChatFolder, ChatThread } from '../../types'
import type { LearningPathSummary } from '../../../learn/services/learn.persistence'
import type { useChatFolders } from '../../hooks/useChatFolders'
import type { useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'
import { hapticLightImpact } from '../../../../utils/haptics'

type GlassPillTouch = ReturnType<typeof useGlassPillTouchFeedback>
type ChatFoldersState = ReturnType<typeof useChatFolders>

type ChatPageSidebarProps = {
  user: User
  profile: UserProfile | null
  isSidebarCollapsed: boolean
  isCompactMobileSidebarLayout: boolean
  isMobileSidebarOpen: boolean
  logoSrc: string
  displayName: string
  greetingName: string
  avatarFallback: string
  subscriptionPlanName: string | null
  showFoldersInSidebar: boolean
  showLearningPathsInSidebar: boolean
  learningPaths: LearningPathSummary[]
  activeLearnPathId: string | null
  isLearnPathCreateDisabled: boolean
  chatFolders: ChatFoldersState
  openFolderMenuId: string | null
  threadSkeletonMounted: boolean
  threadSkeletonExiting: boolean
  isBootstrapping: boolean
  threadsCount: number
  sidebarThreadList: ChatThread[]
  chatTourEligible: boolean
  learnFeatureInfoVisible: boolean
  newsUnreadCount: number
  friendsIncomingCount: number
  isFriendsOverviewOpen: boolean
  isNewChatPending: boolean
  newChatTourRef: RefObject<HTMLButtonElement | null>
  learnTourRef: RefObject<HTMLDivElement | null>
  profileMenuRef: RefObject<HTMLDivElement | null>
  sidebarNewChatTouch: GlassPillTouch
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
  onOpenBetaNotice: () => void
  onSidebarHeaderToggle: () => void
  onExpandSidebar: () => void
  onCreateNewChat: () => void
  onOpenSettings: () => void
  onOpenNews: () => void
  onOpenFriends: () => void
  onOpenAdmin: () => void
  onToggleCompactProfileSheet: () => void
  onCreateFolder: () => void
  onOpenFolder: (folderId: string) => void
  onSelectLearningPath: (pathId: string) => void
  onCreateLearningPath: () => void
  openLearningPathMenuId?: string | null
  onLearningPathContextMenu?: (event: MouseEvent, pathId: string) => void
  selectedFolderId?: string | null
  onFolderContextMenu: (folder: ChatFolder, event: React.MouseEvent) => void
  onFolderLongPressStart: (folder: ChatFolder, event: React.TouchEvent) => void
  onFolderLongPressMove: (event: React.TouchEvent) => void
  onFolderLongPressEnd: () => void
  onThreadSkeletonTransitionEnd: () => void
  onShowLearnUnavailable: () => void
}

export function ChatPageSidebar({
  user,
  profile,
  isSidebarCollapsed,
  isCompactMobileSidebarLayout,
  logoSrc,
  displayName,
  greetingName,
  avatarFallback,
  subscriptionPlanName,
  showFoldersInSidebar,
  showLearningPathsInSidebar,
  learningPaths,
  activeLearnPathId,
  isLearnPathCreateDisabled,
  chatFolders,
  openFolderMenuId,
  threadSkeletonMounted,
  threadSkeletonExiting,
  isBootstrapping,
  threadsCount,
  sidebarThreadList,
  chatTourEligible,
  learnFeatureInfoVisible,
  newsUnreadCount,
  friendsIncomingCount,
  isFriendsOverviewOpen,
  isNewChatPending,
  newChatTourRef,
  learnTourRef,
  profileMenuRef,
  sidebarNewChatTouch,
  renderThreadRow,
  onOpenBetaNotice,
  onSidebarHeaderToggle,
  onExpandSidebar,
  onCreateNewChat,
  onOpenSettings,
  onOpenNews,
  onOpenFriends,
  onOpenAdmin,
  onToggleCompactProfileSheet,
    onCreateFolder,
    onOpenFolder,
    onSelectLearningPath,
    onCreateLearningPath,
    openLearningPathMenuId = null,
    onLearningPathContextMenu,
    selectedFolderId = null,
    onFolderContextMenu,
  onFolderLongPressStart,
  onFolderLongPressMove,
  onFolderLongPressEnd,
  onThreadSkeletonTransitionEnd,
  onShowLearnUnavailable,
}: ChatPageSidebarProps) {
  const [isChatsSectionExpanded, setIsChatsSectionExpanded] = useState(true)

  return (
    <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="chat-sidebar-top">
        {!isSidebarCollapsed ? (
          <div className="chat-sidebar-header-row">
            <div className="chat-brand">
              <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
              <h2>Straton</h2>
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
        <button
          ref={isCompactMobileSidebarLayout ? undefined : newChatTourRef}
          type="button"
          className={`chat-sidebar-nav-button chat-sidebar-new-chat-button chat-sidebar-new-chat-button--toolbar${
            chatTourEligible ? ' chat-onboarding-tour-block' : ''
          }`}
          onClick={() => void onCreateNewChat()}
          aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
        >
          <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon" aria-hidden="true" />
          {!isSidebarCollapsed ? <span className="chat-sidebar-new-chat-label">Neuer Chat</span> : null}
        </button>
        <button
          type="button"
          className="chat-sidebar-nav-button"
          onClick={onOpenSettings}
          aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}
        >
          <img className="ui-icon chat-sidebar-top-button-icon" src={settingsIcon} alt="" aria-hidden="true" />
          {!isSidebarCollapsed ? 'Einstellungen' : null}
        </button>
        <button
          type="button"
          className={`chat-sidebar-nav-button chat-sidebar-nav-button--news${
            isSidebarCollapsed && newsUnreadCount > 0 ? ' is-collapsed-badge' : ''
          }`}
          onClick={onOpenNews}
          aria-label={
            isSidebarCollapsed
              ? `Updates & Neuigkeiten${newsUnreadCount > 0 ? `, ${newsUnreadCount} ungelesen` : ''}`
              : undefined
          }
        >
          <img className="ui-icon chat-sidebar-top-button-icon" src={newsIcon} alt="" aria-hidden="true" />
          {!isSidebarCollapsed ? (
            <span className="chat-sidebar-nav-label-row">
              Updates & Neuigkeiten
              {newsUnreadCount > 0 ? (
                <span className="chat-sidebar-news-badge" aria-label={`${newsUnreadCount} ungelesen`}>
                  {newsUnreadCount > 9 ? '9+' : newsUnreadCount}
                </span>
              ) : null}
            </span>
          ) : newsUnreadCount > 0 ? (
            <span className="chat-sidebar-news-badge" aria-label={`${newsUnreadCount} ungelesen`}>
              {newsUnreadCount > 9 ? '9+' : newsUnreadCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`chat-sidebar-nav-button chat-sidebar-nav-button--friends${
            isFriendsOverviewOpen ? ' is-active' : ''
          }${isSidebarCollapsed && friendsIncomingCount > 0 ? ' is-collapsed-badge' : ''}`}
          onClick={onOpenFriends}
          aria-label={
            isSidebarCollapsed
              ? `Freunde${friendsIncomingCount > 0 ? `, ${friendsIncomingCount} eingehende Anfragen` : ''}`
              : undefined
          }
        >
          <img className="ui-icon chat-sidebar-top-button-icon" src={userAddIcon} alt="" aria-hidden="true" />
          {!isSidebarCollapsed ? (
            <span className="chat-sidebar-nav-label-row">
              Freunde
              {friendsIncomingCount > 0 ? (
                <span className="chat-sidebar-news-badge" aria-label={`${friendsIncomingCount} eingehend`}>
                  {friendsIncomingCount > 9 ? '9+' : friendsIncomingCount}
                </span>
              ) : null}
            </span>
          ) : friendsIncomingCount > 0 ? (
            <span className="chat-sidebar-news-badge" aria-label={`${friendsIncomingCount} eingehend`}>
              {friendsIncomingCount > 9 ? '9+' : friendsIncomingCount}
            </span>
          ) : null}
        </button>
        {profile?.is_superadmin ? (
          <button
            type="button"
            className="chat-sidebar-nav-button"
            onClick={onOpenAdmin}
            aria-label={isSidebarCollapsed ? 'Administrator' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={accountIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Administrator' : null}
          </button>
        ) : null}
        {learnFeatureInfoVisible && !isSidebarCollapsed ? (
          <p className="chat-learn-feature-info chat-learn-feature-info--sidebar">Noch nicht verfügbar</p>
        ) : null}
      </div>

      <div className="chat-sidebar-list-wrap">
        {!isSidebarCollapsed ? (
          <div className="chat-thread-list">
            {user && showFoldersInSidebar ? (
              <ChatFolderSidebarSection
                folders={chatFolders.folders}
                threadsByFolderId={chatFolders.threadsByFolderId}
                selectedFolderId={selectedFolderId}
                openFolderMenuId={openFolderMenuId}
                onCreateFolder={onCreateFolder}
                onOpenFolder={onOpenFolder}
                onFolderContextMenu={onFolderContextMenu}
                onFolderLongPressStart={onFolderLongPressStart}
                onFolderLongPressMove={onFolderLongPressMove}
                onFolderLongPressEnd={onFolderLongPressEnd}
                renderThreadRow={renderThreadRow}
              />
            ) : null}
            {showLearningPathsInSidebar ? (
              <ChatLearningPathsSidebarSection
                sectionRef={learnTourRef}
                tourHighlight={chatTourEligible}
                learningPaths={learningPaths}
                activePathId={activeLearnPathId}
                openMenuPathId={openLearningPathMenuId}
                onContextMenu={onLearningPathContextMenu}
                isCreateDisabled={isLearnPathCreateDisabled}
                onCreateLearningPath={onCreateLearningPath}
                onSelectLearningPath={onSelectLearningPath}
                onCreateDisabledClick={onShowLearnUnavailable}
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
                    ? sidebarThreadList.map((thread, threadIndex) => renderThreadRow(thread, threadIndex))
                    : null}
                  {!isBootstrapping && !threadSkeletonMounted && threadsCount === 0 ? (
                    <p className="thread-list-info">Noch keine Chats vorhanden.</p>
                  ) : null}
                  {!isBootstrapping &&
                  !threadSkeletonMounted &&
                  showFoldersInSidebar &&
                  threadsCount > 0 &&
                  chatFolders.threadsWithoutFolder.length === 0 ? (
                    <p className="thread-list-info thread-list-info--muted">Alle Chats sind in Ordnern.</p>
                  ) : null}
                </>
              ) : null}
            </div>
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
