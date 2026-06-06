import { type ReactNode } from 'react'
import loginIcon from '../../../../assets/icons/login.svg'
import sidebarIcon from '../../../../assets/icons/sidebar.svg'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import { ChatWindow } from '../ChatWindow'
import type { useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'
import type { useMobileSidebarEdgeSwipe } from '../../../../hooks/useMobileSidebarEdgeSwipe'
import { hapticLightImpact } from '../../../../utils/haptics'
import type { ChatComposerModelId } from '../../constants/chatComposerModels'
import type { ChatReplyMode } from '../../constants/chatReplyMode'
import type { ChatThinkingMode } from '../../constants/chatThinkingMode'
import { ChatPageMobileBottomDock } from './ChatPageMobileBottomDock'

type GlassPillTouch = ReturnType<typeof useGlassPillTouchFeedback>
type SidebarEdgeSwipe = ReturnType<typeof useMobileSidebarEdgeSwipe>

type ChatPageGuestViewProps = {
  pageEnterShellClass: string
  isSidebarCollapsed: boolean
  isMobileSidebarOpen: boolean
  isCompactMobileSidebarLayout: boolean
  isChatToolbarMobile: boolean
  logoSrc: string
  guestMobileBottomNavTabIndex: number
  guestPillAccentPulseActive: boolean
  mobileBottomNavSpring: GlassPillTouch
  mobileNewChatTouch: GlassPillTouch
  sidebarNewChatTouch: GlassPillTouch
  sidebarEdgeSwipe: SidebarEdgeSwipe
  guestComposerModelId: ChatComposerModelId
  guestChatReplyMode: ChatReplyMode
  guestChatThinkingMode: ChatThinkingMode
  mobileTopBar: ReactNode
  onNavigateLogin: () => void
  onOpenBetaNotice: () => void
  onSidebarHeaderToggle: () => void
  onExpandSidebar: () => void
  onCloseMobileSidebar: () => void
  onGuestComposerModel: (id: ChatComposerModelId) => void
  onGuestChatReplyMode: (mode: ChatReplyMode) => void
  onGuestChatThinkingMode: (mode: ChatThinkingMode) => void
  onToggleMobileSidebarFromBottomNav: () => void
}

export function ChatPageGuestView({
  pageEnterShellClass,
  isSidebarCollapsed,
  isMobileSidebarOpen,
  isCompactMobileSidebarLayout,
  isChatToolbarMobile,
  logoSrc,
  guestMobileBottomNavTabIndex,
  guestPillAccentPulseActive,
  mobileBottomNavSpring,
  mobileNewChatTouch,
  sidebarNewChatTouch,
  sidebarEdgeSwipe,
  guestComposerModelId,
  guestChatReplyMode,
  guestChatThinkingMode,
  mobileTopBar,
  onNavigateLogin,
  onOpenBetaNotice,
  onSidebarHeaderToggle,
  onExpandSidebar,
  onCloseMobileSidebar,
  onGuestComposerModel,
  onGuestChatReplyMode,
  onGuestChatThinkingMode,
  onToggleMobileSidebarFromBottomNav,
}: ChatPageGuestViewProps) {
  return (
    <main
      className={`chat-app-shell chat-app-shell-guest ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
        isMobileSidebarOpen ? 'is-mobile-sidebar-open' : ''
      }${pageEnterShellClass}`}
    >
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
            type="button"
            className="chat-sidebar-nav-button chat-sidebar-new-chat-button chat-sidebar-new-chat-button--toolbar"
            aria-label={isSidebarCollapsed ? 'Neuer Chat' : undefined}
            onClick={onNavigateLogin}
          >
            <span className="chat-sidebar-new-chat-icon chat-sidebar-top-button-icon" aria-hidden="true" />
            {!isSidebarCollapsed ? <span className="chat-sidebar-new-chat-label">Neuer Chat</span> : null}
          </button>
          <button
            type="button"
            onClick={onNavigateLogin}
            aria-label={isSidebarCollapsed ? 'Anmelden' : undefined}
          >
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
              className={['mobile-new-chat-fab', 'new-chat-touch-btn', sidebarNewChatTouch.touchStateClass]
                .filter(Boolean)
                .join(' ')}
              aria-label="Neuer Chat"
              onClick={onNavigateLogin}
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

      <section className={`chat-main chat-main-guest${isChatToolbarMobile ? ' chat-main--share-toolbar' : ''}`}>
        {isChatToolbarMobile ? mobileTopBar : null}
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
            <PrimaryButton type="button" onClick={onNavigateLogin}>
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
            onComposerModelChange={onGuestComposerModel}
            showComposerModelPicker={false}
            allowCustomChatMode={false}
            chatReplyMode={guestChatReplyMode}
            onChatReplyModeChange={onGuestChatReplyMode}
            showReplyModePicker={!isChatToolbarMobile}
            chatThinkingMode={guestChatThinkingMode}
            onChatThinkingModeChange={onGuestChatThinkingMode}
            onSendMessage={async () => {
              onNavigateLogin()
            }}
          />
        </div>
      </section>
      <ChatPageMobileBottomDock
        variant="guest"
        tabIndex={guestMobileBottomNavTabIndex}
        pillPulseActive={guestPillAccentPulseActive}
        mobileBottomNavSpring={mobileBottomNavSpring}
        mobileNewChatTouch={mobileNewChatTouch}
        isMobileSidebarOpen={isMobileSidebarOpen}
        mobileChatBottomTabActive={!isMobileSidebarOpen}
        mobileFoldersBottomTabActive={false}
        isMobileFoldersTabDisabled
        isMobileFolderDockAction={false}
        isNewChatPending={false}
        chatTourEligible={false}
        newChatTourRef={{ current: null }}
        onToggleSidebar={onToggleMobileSidebarFromBottomNav}
        onSelectTab={() => {}}
        onGuestLogin={onNavigateLogin}
        onCreateFolder={() => {}}
        onCreateChat={() => {}}
      />
      <div
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
        onClick={onCloseMobileSidebar}
        aria-hidden="true"
        {...sidebarEdgeSwipe.backdropSwipeHandlers}
      />
    </main>
  )
}
