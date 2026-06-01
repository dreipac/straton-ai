import { type ReactNode, type RefObject } from 'react'
import accountIcon from '../../../../assets/icons/account.svg'
import learnIcon from '../../../../assets/icons/learn-outlined.svg'
import settingsIcon from '../../../../assets/icons/settings.svg'
import sidebarIcon from '../../../../assets/icons/sidebar.svg'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../../auth/services/auth.service'
import { ChatFolderSidebarSection } from '../ChatFolderSidebarSection'
import { ChatThreadListSkeleton } from '../ChatThreadListSkeleton'
import type { ChatFolder, ChatThread } from '../../types'
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
  chatFolders: ChatFoldersState
  openFolderMenuId: string | null
  threadSkeletonMounted: boolean
  threadSkeletonExiting: boolean
  isBootstrapping: boolean
  threadsCount: number
  sidebarThreadList: ChatThread[]
  chatTourEligible: boolean
  isLearnPathsButtonDisabled: boolean
  learnFeatureInfoVisible: boolean
  isNewChatPending: boolean
  newChatTourRef: RefObject<HTMLButtonElement | null>
  learnTourRef: RefObject<HTMLButtonElement | null>
  profileMenuRef: RefObject<HTMLDivElement | null>
  sidebarNewChatTouch: GlassPillTouch
  renderThreadRow: (thread: ChatThread, threadIndex: number) => ReactNode
  onOpenBetaNotice: () => void
  onSidebarHeaderToggle: () => void
  onExpandSidebar: () => void
  onCreateNewChat: () => void
  onOpenSettings: () => void
  onNavigateLearn: () => void
  onOpenAdmin: () => void
  onToggleCompactProfileSheet: () => void
  onCreateFolder: () => void
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
  chatFolders,
  openFolderMenuId,
  threadSkeletonMounted,
  threadSkeletonExiting,
  isBootstrapping,
  threadsCount,
  sidebarThreadList,
  chatTourEligible,
  isLearnPathsButtonDisabled,
  learnFeatureInfoVisible,
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
  onNavigateLearn,
  onOpenAdmin,
  onToggleCompactProfileSheet,
  onCreateFolder,
  onFolderContextMenu,
  onFolderLongPressStart,
  onFolderLongPressMove,
  onFolderLongPressEnd,
  onThreadSkeletonTransitionEnd,
  onShowLearnUnavailable,
}: ChatPageSidebarProps) {
  return (
    <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="chat-sidebar-top">
        {!isSidebarCollapsed ? (
          <div className="chat-sidebar-header-row">
            <div className="chat-brand">
              <img className="ui-icon chat-brand-logo" src={logoSrc} alt="" aria-hidden="true" />
              <h2>Straton</h2>
              {!isCompactMobileSidebarLayout ? (
                <button type="button" className="chat-beta-badge chat-beta-badge-button" onClick={onOpenBetaNotice}>
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
          ref={learnTourRef}
          type="button"
          className={`chat-sidebar-nav-button chat-sidebar-learn-button${chatTourEligible ? ' chat-onboarding-tour-block' : ''}${
            isLearnPathsButtonDisabled ? ' is-disabled' : ''
          }`}
          aria-disabled={isLearnPathsButtonDisabled}
          onClick={() => {
            if (isLearnPathsButtonDisabled) {
              onShowLearnUnavailable()
              return
            }
            onNavigateLearn()
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
                openFolderMenuId={openFolderMenuId}
                onCreateFolder={onCreateFolder}
                onFolderContextMenu={onFolderContextMenu}
                onFolderLongPressStart={onFolderLongPressStart}
                onFolderLongPressMove={onFolderLongPressMove}
                onFolderLongPressEnd={onFolderLongPressEnd}
                renderThreadRow={renderThreadRow}
              />
            ) : null}
            <p className="thread-list-info">Chats</p>
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
                        <span className="account-admin-badge">Admin</span>
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
