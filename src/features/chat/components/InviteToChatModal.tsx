import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { ContentBottomSheet, type ContentBottomSheetHandle } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'
import { inviteUserToChatThread } from '../services/chat.collaboration'

type InviteToChatModalProps = {
  isOpen: boolean
  threadId: string | null
  threadTitle: string
  onClose: () => void
  onSent?: () => void
}

export function InviteToChatModal({
  isOpen,
  threadId,
  threadTitle,
  onClose,
  onSent,
}: InviteToChatModalProps) {
  const isNarrowViewport = useIsMobileViewport()
  const emailFieldId = useId()
  const inviteSheetRef = useRef<ContentBottomSheetHandle | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setError(null)
      setBusy(false)
    }
  }, [isOpen])

  function requestCloseInviteSheet() {
    if (inviteSheetRef.current) {
      inviteSheetRef.current.requestClose()
    } else {
      onClose()
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!threadId?.trim()) {
      return
    }
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Bitte eine E-Mail-Adresse eingeben.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await inviteUserToChatThread(threadId, trimmed)
      setEmail('')
      onSent?.()
      if (isNarrowViewport) {
        inviteSheetRef.current?.requestClose()
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einladung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const formSection = (
    <>
      <p className="invite-chat-thread-label">
        Chat: <strong>{threadTitle}</strong>
      </p>
      <form className="invite-chat-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="invite-chat-label" htmlFor={emailFieldId}>
          E-Mail des Nutzers
        </label>
        <input
          id={emailFieldId}
          type="email"
          autoComplete="email"
          className="invite-chat-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@beispiel.de"
          disabled={busy}
        />
        {error ? (
          <p className="error-text invite-chat-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="invite-chat-actions">
          <SecondaryButton
            type="button"
            onClick={() => (isNarrowViewport ? requestCloseInviteSheet() : onClose())}
            disabled={busy}
          >
            Abbrechen
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Senden…' : 'Einladung senden'}
          </PrimaryButton>
        </div>
      </form>
    </>
  )

  if (isNarrowViewport) {
    return (
      <ContentBottomSheet
        ref={inviteSheetRef}
        open={isOpen}
        onExitComplete={onClose}
        title="Person einladen"
        adaptVisualViewport
        closeOnBackdrop={!busy}
        allowEscape={!busy}
        panelClassName="invite-chat-bottom-sheet-panel"
        bodyClassName="invite-chat-bottom-sheet-body"
      >
        {formSection}
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell isOpen={isOpen} onRequestClose={onClose} className="invite-chat-modal-wrap">
      <div
        className="rename-modal invite-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Person einladen"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader title="Person einladen" headingLevel="h3" closeLabel="Schließen" onClose={onClose} />
        {formSection}
      </div>
    </ModalShell>
  )
}
