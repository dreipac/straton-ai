import { type MouseEvent as ReactMouseEvent, type RefObject, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import deleteIcon from '../../../../assets/icons/delete.svg'
import learnIcon from '../../../../assets/icons/learn-outlined.svg'
import userAddIcon from '../../../../assets/icons/userAdd.svg'
import { PopoverContextMenu } from '../../../../components/ui/menu/PopoverContextMenu'
import type { ChatThread } from '../../types'
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
  activeThread: ChatThread | undefined
  onRenameThread: (thread: ChatThread) => void
  onDeleteThread: (threadId: string) => void
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
  activeThread,
  onRenameThread,
  onDeleteThread,
  onToolbarAvatarsClick,
  onShareChipClick,
  onOpenLearningPathDraft,
}: ChatMainCollaborationToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const chevronBtnRef = useRef<HTMLButtonElement>(null)

  const handleMenuClose = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const handleChevronClick = useCallback(() => {
    if (menuOpen) { setMenuOpen(false); return }
    const rect = chevronBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({ x: rect.left, y: rect.bottom + 6 })
    setMenuOpen(true)
  }, [menuOpen])

  return (
    <div className="chat-main-toolbar">
      {/* Chat name — direct child of toolbar, left side, outside the pill */}
      {activeThread ? (
        <div className="chat-main-toolbar-title-wrap">
          <span className="chat-main-toolbar-title" title={activeThread.title}>
            {activeThread.title}
          </span>
          <button
            ref={chevronBtnRef}
            type="button"
            className={`chat-main-toolbar-title-btn${menuOpen ? ' is-open' : ''}`}
            onMouseDown={(e) => { if (menuOpen) e.stopPropagation() }}
            onClick={handleChevronClick}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Chat-Aktionen"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="#64748b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {createPortal(
            <PopoverContextMenu
              ref={menuRef}
              open={menuOpen}
              position={menuPos}
              onClose={handleMenuClose}
              ariaLabel="Chat-Aktionen"
            >
              <button
                type="button"
                role="menuitem"
                className="thread-menu-item"
                onClick={() => {
                  handleMenuClose()
                  onRenameThread(activeThread)
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  style={{ marginRight: '0.4rem', flexShrink: 0 }}
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Umbenennen
              </button>
              <button
                type="button"
                role="menuitem"
                className="thread-menu-item is-danger"
                onClick={() => {
                  handleMenuClose()
                  onDeleteThread(activeThread.id)
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  style={{ marginRight: '0.4rem', flexShrink: 0 }}
                >
                  <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Löschen
              </button>
            </PopoverContextMenu>,
            document.body,
          )}
        </div>
      ) : null}

      {/* Chips — direct child of toolbar, right side, inside the glass pill */}
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
