import type { ChatThread } from '../../types'
import { ChatToolbarMobileMenuSelect } from '../ChatToolbarMobileMenuSelect'
import { ChatToolbarReplyModeSelect } from '../ChatToolbarReplyModeSelect'
import { ChatToolbarTitleMenuSelect } from '../ChatToolbarTitleMenuSelect'
import { glassPillTouchClass, type useGlassPillTouchFeedback } from '../../../../hooks/useGlassPillTouchFeedback'
import type { ChatReplyMode } from '../../constants/chatReplyMode'

type GlassPillTouch = ReturnType<typeof useGlassPillTouchFeedback>

type ChatPageMobileTopBarProps = {
  isGuest: boolean
  guestChatReplyMode: ChatReplyMode
  chatReplyMode: ChatReplyMode
  isSending: boolean
  mobileTopBarModeTouch: GlassPillTouch
  mobileTopBarTitleTouch: GlassPillTouch
  mobileTopBarMenuTouch: GlassPillTouch
  showMobileTitleMenu: boolean
  activeThread: ChatThread | undefined
  mobileToolbarChatTitle: string
  learnFeatureInfoVisible: boolean
  isLearnPathCreateButtonDisabled: boolean
  showCollaborationToolbar: boolean
  canInviteToActiveChat: boolean
  hasCollaborators: boolean
  shareActionBusy: boolean
  threadMembersLoading: boolean
  toolbarAvatarCount: number
  onGuestReplyModeChange: (mode: ChatReplyMode) => void
  onReplyModeChange: (mode: ChatReplyMode) => void
  onRenameThread: (thread: ChatThread) => void
  onDeleteThread: (threadId: string) => void
  onOpenLearningPathDraft: () => void
  onShareChipClick: () => void
  onOpenParticipants: () => void
}

export function ChatPageMobileTopBar({
  isGuest,
  guestChatReplyMode,
  chatReplyMode,
  isSending,
  mobileTopBarModeTouch,
  mobileTopBarTitleTouch,
  mobileTopBarMenuTouch,
  showMobileTitleMenu,
  activeThread,
  mobileToolbarChatTitle,
  learnFeatureInfoVisible,
  isLearnPathCreateButtonDisabled,
  showCollaborationToolbar,
  canInviteToActiveChat,
  hasCollaborators,
  shareActionBusy,
  threadMembersLoading,
  toolbarAvatarCount,
  onGuestReplyModeChange,
  onReplyModeChange,
  onRenameThread,
  onDeleteThread,
  onOpenLearningPathDraft,
  onShareChipClick,
  onOpenParticipants,
}: ChatPageMobileTopBarProps) {
  return (
    <div className="chat-main-toolbar chat-main-toolbar--mobile">
      <div className="chat-mobile-top-bar">
        <div className="chat-mobile-top-bar__start">
          <div
            className={glassPillTouchClass(
              mobileTopBarModeTouch,
              'chat-mobile-top-bar-pill chat-mobile-top-bar-pill--mode',
            )}
            {...mobileTopBarModeTouch.touchHandlers}
          >
            <ChatToolbarReplyModeSelect
              value={isGuest ? guestChatReplyMode : chatReplyMode}
              onChange={isGuest ? onGuestReplyModeChange : onReplyModeChange}
              disabled={!isGuest && isSending}
            />
          </div>
        </div>
        <div className="chat-mobile-top-bar__center">
          <div
            className={glassPillTouchClass(
              mobileTopBarTitleTouch,
              'chat-mobile-top-bar-pill chat-mobile-top-bar-pill--title',
            )}
            {...mobileTopBarTitleTouch.touchHandlers}
          >
            {showMobileTitleMenu && activeThread ? (
              <ChatToolbarTitleMenuSelect
                title={mobileToolbarChatTitle}
                onSelectRename={() => onRenameThread(activeThread)}
                onSelectDelete={async () => {
                  if (activeThread.id) {
                    await onDeleteThread(activeThread.id)
                  }
                }}
              />
            ) : (
              <span
                className="chat-mobile-top-bar-title"
                title={isGuest ? 'Neuer Chat' : mobileToolbarChatTitle}
              >
                {isGuest ? 'Neuer Chat' : mobileToolbarChatTitle}
              </span>
            )}
          </div>
        </div>
        <div className="chat-mobile-top-bar__end">
          {!isGuest ? (
            <div
              className={glassPillTouchClass(
                mobileTopBarMenuTouch,
                'chat-mobile-top-bar-pill chat-mobile-top-bar-pill--menu',
              )}
              {...mobileTopBarMenuTouch.touchHandlers}
            >
              <ChatToolbarMobileMenuSelect
                onSelectLearnPath={onOpenLearningPathDraft}
                learnPathDisabled={isLearnPathCreateButtonDisabled}
                onSelectShare={
                  showCollaborationToolbar && canInviteToActiveChat ? onShareChipClick : undefined
                }
                shareLabel={hasCollaborators ? 'Freigabe beenden' : 'Freigeben'}
                shareDisabled={shareActionBusy}
                showParticipantsOption={
                  showCollaborationToolbar && !threadMembersLoading && toolbarAvatarCount > 0
                }
                onSelectParticipants={onOpenParticipants}
              />
            </div>
          ) : (
            <span className="chat-mobile-top-bar__end-spacer" aria-hidden="true" />
          )}
        </div>
        {!isGuest && learnFeatureInfoVisible ? (
          <p className="chat-learn-feature-info chat-learn-feature-info--mobile-bar">Noch nicht verfügbar</p>
        ) : null}
      </div>
    </div>
  )
}
