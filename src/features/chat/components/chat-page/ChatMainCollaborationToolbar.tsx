import { type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import deleteIcon from '../../../../assets/icons/delete.svg'
import learnIcon from '../../../../assets/icons/learn-outlined.svg'
import userAddIcon from '../../../../assets/icons/userAdd.svg'
import type { ChatThreadMemberPublic } from '../../services/chat.collaboration'
import {
  displayNameForMember,
  letterForMemberLabel,
  toolbarAvatarAccentForUser,
} from './chatCollaborationDisplay'
import { ChatParticipantsStrip } from './ChatParticipantsStrip'

type ChatMainCollaborationToolbarProps = {
  isNarrowViewport: boolean
  participantsAnchorRef: RefObject<HTMLDivElement | null>
  participantsOpen: boolean
  threadMembersLoading: boolean
  toolbarAvatars: { list: ChatThreadMemberPublic[]; overflow: number }
  membersForToolbarFull: ChatThreadMemberPublic[]
  showCollaborationToolbar: boolean
  canInviteToActiveChat: boolean
  hasCollaborators: boolean
  shareActionBusy: boolean
  showLearningPathToolbarChip: boolean
  isLearnPathCreateButtonDisabled: boolean
  learningPathDraftLoading: boolean
  learnFeatureInfoVisible: boolean
  onToolbarAvatarsClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onShareChipClick: () => void
  onOpenLearningPathDraft: () => void
}

export function ChatMainCollaborationToolbar({
  isNarrowViewport,
  participantsAnchorRef,
  participantsOpen,
  threadMembersLoading,
  toolbarAvatars,
  membersForToolbarFull,
  showCollaborationToolbar,
  canInviteToActiveChat,
  hasCollaborators,
  shareActionBusy,
  showLearningPathToolbarChip,
  isLearnPathCreateButtonDisabled,
  learningPathDraftLoading,
  learnFeatureInfoVisible,
  onToolbarAvatarsClick,
  onShareChipClick,
  onOpenLearningPathDraft,
}: ChatMainCollaborationToolbarProps) {
  return (
    <div className="chat-main-toolbar">
      <div className="chat-main-toolbar-share-row">
        {showCollaborationToolbar && !threadMembersLoading && toolbarAvatars.list.length > 0 ? (
          <div ref={participantsAnchorRef} className="chat-toolbar-participants-anchor">
            <button
              type="button"
              className="chat-main-toolbar-avatars-trigger"
              onClick={onToolbarAvatarsClick}
              aria-expanded={participantsOpen}
              aria-haspopup="dialog"
              aria-label="Alle Teilnehmer anzeigen"
            >
              <div className="chat-main-toolbar-avatars" aria-hidden="true">
                {toolbarAvatars.list.map((m, index) => {
                  const name = displayNameForMember(m)
                  const accent = toolbarAvatarAccentForUser(m.userId)
                  return (
                    <div
                      key={m.userId}
                      className="chat-main-toolbar-avatar-wrap"
                      style={{
                        zIndex: index + 1,
                        ['--chat-toolbar-avatar-accent' as string]: accent,
                      }}
                      title={name}
                    >
                      {m.avatarUrl ? (
                        <img className="chat-main-toolbar-avatar-img" src={m.avatarUrl} alt="" />
                      ) : (
                        <span className="chat-main-toolbar-avatar-fallback" aria-hidden="true">
                          {letterForMemberLabel(name)}
                        </span>
                      )}
                    </div>
                  )
                })}
                {toolbarAvatars.overflow > 0 ? (
                  <span className="chat-main-toolbar-avatar-overflow">+{toolbarAvatars.overflow}</span>
                ) : null}
              </div>
            </button>
            {participantsOpen && !isNarrowViewport ? (
              <div className="chat-participants-popover" role="dialog" aria-label="Teilnehmer im Chat">
                <ChatParticipantsStrip members={membersForToolbarFull} />
              </div>
            ) : null}
          </div>
        ) : null}
        {showCollaborationToolbar && canInviteToActiveChat ? (
          <button
            type="button"
            className="chat-main-invite-chip"
            onClick={onShareChipClick}
            disabled={shareActionBusy}
            aria-label={hasCollaborators ? 'Freigabe beenden' : 'Freigeben'}
          >
            <img
              className="ui-icon ui-icon-md chat-main-invite-chip-icon"
              src={hasCollaborators ? deleteIcon : userAddIcon}
              alt=""
              aria-hidden="true"
            />
            <span>{hasCollaborators ? 'Freigabe beenden' : 'Freigeben'}</span>
          </button>
        ) : null}
        {showLearningPathToolbarChip ? (
          <button
            type="button"
            className={`chat-main-invite-chip chat-main-invite-chip--learn${
              isLearnPathCreateButtonDisabled ? ' is-disabled' : ''
            }`}
            onClick={onOpenLearningPathDraft}
            disabled={learningPathDraftLoading}
            aria-disabled={isLearnPathCreateButtonDisabled}
            aria-label="Lernpfad erstellen"
          >
            <img
              className="ui-icon ui-icon-md chat-main-invite-chip-icon"
              src={learnIcon}
              alt=""
              aria-hidden="true"
            />
            <span>Lernpfad erstellen</span>
          </button>
        ) : null}
        {learnFeatureInfoVisible ? (
          <p className="chat-learn-feature-info">Noch nicht verfügbar</p>
        ) : null}
      </div>
    </div>
  )
}
