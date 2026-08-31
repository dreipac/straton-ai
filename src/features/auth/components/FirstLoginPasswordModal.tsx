import { type FormEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { ContentBottomSheet } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useAuth } from '../context/useAuth'
import { clearMustChangePasswordOnFirstLogin } from '../services/auth.service'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'

type BusyPhase = 'idle' | 'saving' | 'syncing'

/**
 * Blockiert die App bis ein neues Passwort gesetzt ist (Erstanmeldung).
 * Desktop: Modal. Mobil: Bottom Sheet (kein Schließen ohne erfolgreiches Speichern).
 */
export function FirstLoginPasswordModal() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const isMobileUi = useIsMobileViewport()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busyPhase, setBusyPhase] = useState<BusyPhase>('idle')

  const mustChange = Boolean(user && profile?.must_change_password_on_first_login)
  const isOpen = Boolean(!isLoading && mustChange && user && profile)
  const isBusy = busyPhase !== 'idle'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (password.length < 8) {
      setFormError('Passwort mindestens 8 Zeichen.')
      return
    }
    if (password !== confirm) {
      setFormError('Passwörter stimmen nicht überein.')
      return
    }

    setBusyPhase('saving')
    try {
      const supabase = getSupabaseClient()
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) {
        throw pwError
      }
      setBusyPhase('syncing')
      await clearMustChangePasswordOnFirstLogin()
      await refreshProfile()
      setPassword('')
      setConfirm('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Passwort konnte nicht gespeichert werden.')
    } finally {
      setBusyPhase('idle')
    }
  }

  const busyOverlay =
    typeof document !== 'undefined' && isBusy
      ? createPortal(
          <div className="first-login-password-busy-overlay" role="status" aria-live="polite">
            <div className="first-login-password-busy-card">
              <span className="first-login-password-busy-spinner" aria-hidden="true" />
              <p className="first-login-password-busy-label">
                {busyPhase === 'syncing' ? 'Konto wird aktualisiert…' : 'Passwort wird gespeichert…'}
              </p>
            </div>
          </div>,
          document.body,
        )
      : null

  if (!isOpen) {
    return null
  }

  const formInner = (
    <>
      <p id="first-login-password-modal-desc" className="first-login-password-intro">
        Bitte wähle ein eigenes Passwort für dein Konto, bevor du fortfährst.
      </p>

      <form className={isMobileUi ? 'rename-bottom-sheet-form first-login-password-sheet-form' : 'rename-form'} onSubmit={handleSubmit}>
        <label className={isMobileUi ? 'rename-bottom-sheet-label' : undefined} htmlFor="first-login-password">
          Neues Passwort
        </label>
        <input
          id="first-login-password"
          className={isMobileUi ? 'rename-bottom-sheet-input' : undefined}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isBusy}
        />

        <label className={isMobileUi ? 'rename-bottom-sheet-label' : undefined} htmlFor="first-login-password-confirm">
          Passwort bestätigen
        </label>
        <input
          id="first-login-password-confirm"
          className={isMobileUi ? 'rename-bottom-sheet-input' : undefined}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={isBusy}
        />

        {formError ? <p className="error-text">{formError}</p> : null}

        <PrimaryButton
          type="submit"
          className={isMobileUi ? 'rename-bottom-sheet-save' : undefined}
          disabled={isBusy}
        >
          {busyPhase === 'saving' || busyPhase === 'syncing' ? 'Bitte warten…' : 'Passwort speichern'}
        </PrimaryButton>
      </form>
    </>
  )

  return (
    <>
      {busyOverlay}
      {isMobileUi ? (
        <ContentBottomSheet
          open={isOpen}
          title="Neues Passwort setzen"
          showCloseButton={false}
          closeOnBackdrop={false}
          allowEscape={false}
          adaptVisualViewport
          bodyClassName="first-login-password-sheet-body"
        >
          {formInner}
        </ContentBottomSheet>
      ) : (
        <ModalShell isOpen={true} closeOnOverlayClick={false}>
          <section
            className="rename-modal first-login-password-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Neues Passwort setzen"
            aria-describedby="first-login-password-modal-desc"
          >
            <ModalHeader
              title="Neues Passwort setzen"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={() => {}}
              closeLabel="Dialog schließen"
              showCloseButton={false}
            />
            {formInner}
          </section>
        </ModalShell>
      )}
    </>
  )
}
