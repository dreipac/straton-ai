import { type RefObject } from 'react'
import type { useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'

type GlassPillTouch = ReturnType<typeof useGlassPillTouchFeedback>

type ChatPageMobileBottomDockProps = {
  variant: 'guest' | 'main'
  tabIndex: number
  pillPulseActive: boolean
  mobileBottomNavSpring: GlassPillTouch
  mobileNewChatTouch: GlassPillTouch
  isMobileSidebarOpen: boolean
  mobileChatBottomTabActive: boolean
  mobileFoldersBottomTabActive: boolean
  isMobileFoldersTabDisabled: boolean
  isMobileFolderDockAction: boolean
  isNewChatPending: boolean
  chatTourEligible: boolean
  newChatTourRef: RefObject<HTMLButtonElement | null>
  onToggleSidebar: () => void
  onSelectTab: (index: 0 | 1 | 2) => void
  onGuestLogin: () => void
  onCreateFolder: () => void
  onCreateChat: () => void
}

export function ChatPageMobileBottomDock({
  variant,
  tabIndex,
  pillPulseActive,
  mobileBottomNavSpring,
  mobileNewChatTouch,
  isMobileSidebarOpen,
  mobileChatBottomTabActive,
  mobileFoldersBottomTabActive,
  isMobileFoldersTabDisabled,
  isMobileFolderDockAction,
  isNewChatPending,
  chatTourEligible,
  newChatTourRef,
  onToggleSidebar,
  onSelectTab,
  onGuestLogin,
  onCreateFolder,
  onCreateChat,
}: ChatPageMobileBottomDockProps) {
  return (
    <div className="chat-mobile-bottom-dock">
      <nav
        className={[
          'chat-mobile-bottom-nav',
          'tap-spring-surface',
          mobileBottomNavSpring.touchStateClass,
          pillPulseActive ? 'is-pill-accent-pulse' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Chat Navigation"
        style={{ ['--chat-active-tab-index' as any]: tabIndex }}
        {...mobileBottomNavSpring.touchHandlers}
      >
        <button
          type="button"
          className={`chat-mobile-bottom-tab chat-mobile-bottom-tab--sidebar${isMobileSidebarOpen ? ' is-active' : ''}`}
          aria-label={isMobileSidebarOpen ? 'Sidebar schließen' : 'Sidebar öffnen'}
          onClick={onToggleSidebar}
        >
          <span className="chat-mobile-bottom-tab-icon-slot">
            <span
              className="chat-mobile-bottom-tab-icon-accent chat-mobile-bottom-tab-icon-accent--sidebar"
              aria-hidden="true"
            />
          </span>
          <span className="chat-mobile-bottom-tab-label">Menü</span>
        </button>
        {variant === 'guest' ? (
          <>
            <button
              type="button"
              className={`chat-mobile-bottom-tab chat-mobile-bottom-tab--chat${!isMobileSidebarOpen ? ' is-active' : ''}`}
              aria-label="Chat"
            >
              <span className="chat-mobile-bottom-tab-icon-slot">
                <span
                  className={`chat-mobile-bottom-tab-icon-accent ${
                    !isMobileSidebarOpen
                      ? 'chat-mobile-bottom-tab-icon-accent--chat-filled'
                      : 'chat-mobile-bottom-tab-icon-accent--chat-outlined'
                  }`}
                  aria-hidden="true"
                />
              </span>
              <span className="chat-mobile-bottom-tab-label">Chat</span>
            </button>
            <button
              type="button"
              className="chat-mobile-bottom-tab chat-mobile-bottom-tab--placeholder"
              aria-label="Platzhalter"
            >
              <span className="chat-mobile-bottom-tab-icon-slot">
                <span
                  className="chat-mobile-bottom-tab-icon-accent chat-mobile-bottom-tab-icon-accent--status"
                  aria-hidden="true"
                />
              </span>
              <span className="chat-mobile-bottom-tab-label">N. Verfügbar</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`chat-mobile-bottom-tab chat-mobile-bottom-tab--chat${mobileChatBottomTabActive ? ' is-active' : ''}`}
              aria-label="Chat — Standardmodus"
              onClick={() => onSelectTab(1)}
            >
              <span className="chat-mobile-bottom-tab-icon-slot">
                <span
                  className={`chat-mobile-bottom-tab-icon-accent ${
                    mobileChatBottomTabActive
                      ? 'chat-mobile-bottom-tab-icon-accent--chat-filled'
                      : 'chat-mobile-bottom-tab-icon-accent--chat-outlined'
                  }`}
                  aria-hidden="true"
                />
              </span>
              <span className="chat-mobile-bottom-tab-label">Chat</span>
            </button>
            <button
              type="button"
              className={`chat-mobile-bottom-tab chat-mobile-bottom-tab--folders${
                mobileFoldersBottomTabActive ? ' is-active' : ''
              }${isMobileFoldersTabDisabled ? ' is-disabled' : ''}`}
              aria-label="Ordner"
              disabled={isMobileFoldersTabDisabled}
              aria-disabled={isMobileFoldersTabDisabled}
              onClick={() => {
                if (isMobileFoldersTabDisabled) {
                  return
                }
                onSelectTab(2)
              }}
            >
              <span className="chat-mobile-bottom-tab-icon-slot">
                <span
                  className={`chat-mobile-bottom-tab-icon-accent ${
                    mobileFoldersBottomTabActive
                      ? 'chat-mobile-bottom-tab-icon-accent--folder-filled'
                      : 'chat-mobile-bottom-tab-icon-accent--folder-outlined'
                  }`}
                  aria-hidden="true"
                />
              </span>
              <span className="chat-mobile-bottom-tab-label">Ordner</span>
            </button>
          </>
        )}
      </nav>
      <button
        type="button"
        ref={variant === 'main' && !isMobileFolderDockAction ? newChatTourRef : undefined}
        className={[
          'chat-mobile-new-chat-btn',
          'new-chat-touch-btn',
          isMobileFolderDockAction ? 'chat-mobile-new-chat-btn--folder' : '',
          mobileNewChatTouch.touchStateClass,
          variant === 'main' && !isMobileFolderDockAction && isNewChatPending ? 'is-new-chat-pending' : '',
          variant === 'main' && !isMobileFolderDockAction && chatTourEligible ? 'chat-onboarding-tour-block' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={
          variant === 'guest' ? 'Anmelden' : isMobileFolderDockAction ? 'Neuer Ordner' : 'Neuer Chat'
        }
        aria-busy={variant === 'main' && !isMobileFolderDockAction && isNewChatPending ? true : undefined}
        onClick={() => {
          if (variant === 'guest') {
            onGuestLogin()
            return
          }
          if (isMobileFolderDockAction) {
            onCreateFolder()
            return
          }
          onCreateChat()
        }}
        {...mobileNewChatTouch.touchHandlers}
      >
        <span
          className={`chat-mobile-new-chat-btn-icon new-chat-touch-btn__icon${
            isMobileFolderDockAction ? ' chat-mobile-new-chat-btn-icon--folder' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
