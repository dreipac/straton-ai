import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { ContentBottomSheet, type ContentBottomSheetHandle } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'

type AddFriendModalProps = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (email: string) => Promise<void>
}

export function AddFriendModal({ isOpen, onClose, onSubmit }: AddFriendModalProps) {
  const isNarrowViewport = useIsMobileViewport()
  const emailFieldId = useId()
  const sheetRef = useRef<ContentBottomSheetHandle | null>(null)
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Bitte eine E-Mail-Adresse eingeben.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      setEmail('')
      if (isNarrowViewport) {
        sheetRef.current?.requestClose()
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const formSection = (
    <form className="add-friend-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="add-friend-label" htmlFor={emailFieldId}>
        E-Mail-Adresse
      </label>
      <input
        id={emailFieldId}
        className="add-friend-input"
        type="email"
        autoComplete="email"
        placeholder="name@beispiel.ch"
        value={email}
        disabled={busy}
        onChange={(event) => setEmail(event.target.value)}
      />
      {error ? (
        <p className="error-text add-friend-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="add-friend-actions">
        {!isNarrowViewport ? (
          <SecondaryButton type="button" disabled={busy} onClick={onClose}>
            Abbrechen
          </SecondaryButton>
        ) : null}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Wird gesendet…' : 'Anfrage senden'}
        </PrimaryButton>
      </div>
    </form>
  )

  if (isNarrowViewport) {
    return (
      <ContentBottomSheet
        ref={sheetRef}
        open={isOpen}
        onExitComplete={onClose}
        title="Freund hinzufügen"
        adaptVisualViewport
        closeOnBackdrop={!busy}
        allowEscape={!busy}
      >
        {formSection}
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell isOpen={isOpen} onRequestClose={onClose} className="add-friend-modal-wrap">
      <div
        className="rename-modal add-friend-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Freund hinzufügen"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader title="Freund hinzufügen" headingLevel="h3" closeLabel="Schließen" onClose={onClose} />
        {formSection}
      </div>
    </ModalShell>
  )
}
