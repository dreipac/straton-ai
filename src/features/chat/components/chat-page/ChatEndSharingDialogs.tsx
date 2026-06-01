import { type RefObject } from 'react'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import {
  ContentBottomSheet,
  type ContentBottomSheetHandle,
} from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import type { ChatThreadMemberPublic } from '../../services/chat.collaboration'
import { ChatParticipantsStrip } from './ChatParticipantsStrip'

type ChatEndSharingDialogsProps = {
  isNarrowViewport: boolean
  shareActionBusy: boolean
  endSharingDesktopMounted: boolean
  endSharingDesktopOpen: boolean
  endSharingConfirmOpen: boolean
  endSharingSheetRef: RefObject<ContentBottomSheetHandle | null>
  participantsOpen: boolean
  participantsSheetRef: RefObject<ContentBottomSheetHandle | null>
  showCollaborationToolbar: boolean
  membersForToolbarFull: ChatThreadMemberPublic[]
  onCloseEndSharing: () => void
  onConfirmEndSharing: () => void
  onEndSharingSheetExitComplete: () => void
  onParticipantsSheetExitComplete: () => void
}

export function ChatEndSharingDialogs({
  isNarrowViewport,
  shareActionBusy,
  endSharingDesktopMounted,
  endSharingDesktopOpen,
  endSharingConfirmOpen,
  endSharingSheetRef,
  participantsOpen,
  participantsSheetRef,
  showCollaborationToolbar,
  membersForToolbarFull,
  onCloseEndSharing,
  onConfirmEndSharing,
  onEndSharingSheetExitComplete,
  onParticipantsSheetExitComplete,
}: ChatEndSharingDialogsProps) {
  const confirmText = (
    <p className="chat-end-sharing-confirm-text">
      Alle eingeladenen Nutzer verlieren den Zugriff auf diesen Chat. Ausstehende Einladungen werden
      zurückgezogen.
    </p>
  )

  const confirmActions = (sheet: boolean) => (
    <div
      className={
        sheet
          ? 'chat-end-sharing-confirm-actions chat-end-sharing-confirm-actions--sheet'
          : 'chat-end-sharing-confirm-actions'
      }
    >
      <SecondaryButton type="button" onClick={onCloseEndSharing} disabled={shareActionBusy}>
        Abbrechen
      </SecondaryButton>
      <button
        type="button"
        className="ui-button chat-end-sharing-danger-btn"
        disabled={shareActionBusy}
        onClick={onConfirmEndSharing}
      >
        {shareActionBusy ? 'Wird beendet…' : 'Freigabe beenden'}
      </button>
    </div>
  )

  return (
    <>
      {endSharingDesktopMounted && !isNarrowViewport ? (
        <ModalShell
          isOpen={endSharingDesktopOpen}
          onRequestClose={onCloseEndSharing}
          className="invite-chat-modal-wrap"
        >
          <div
            className="rename-modal invite-chat-modal chat-end-sharing-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Freigabe beenden"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title="Freigabe beenden"
              headingLevel="h3"
              closeLabel="Schließen"
              onClose={onCloseEndSharing}
            />
            {confirmText}
            {confirmActions(false)}
          </div>
        </ModalShell>
      ) : null}
      {endSharingConfirmOpen && isNarrowViewport ? (
        <ContentBottomSheet
          ref={endSharingSheetRef}
          open={endSharingConfirmOpen}
          onExitComplete={onEndSharingSheetExitComplete}
          title="Freigabe beenden"
          closeOnBackdrop={!shareActionBusy}
          allowEscape={!shareActionBusy}
          showCloseButton={false}
          panelClassName="chat-end-sharing-bottom-sheet-panel"
        >
          {confirmText}
          {confirmActions(true)}
        </ContentBottomSheet>
      ) : null}
      {isNarrowViewport && showCollaborationToolbar ? (
        <ContentBottomSheet
          ref={participantsSheetRef}
          open={participantsOpen}
          onExitComplete={onParticipantsSheetExitComplete}
          title="Teilnehmer"
          showCloseButton={false}
          panelClassName="chat-participants-bottom-sheet-panel"
          bodyClassName="chat-participants-bottom-sheet-body"
        >
          <ChatParticipantsStrip
            members={membersForToolbarFull}
            extraClassName="chat-participants-strip--sheet"
          />
        </ContentBottomSheet>
      ) : null}
    </>
  )
}
