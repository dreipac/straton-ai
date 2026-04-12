import { type FormEvent, useState } from 'react'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useAuth } from '../context/useAuth'
import { clearMustChangePasswordOnFirstLogin } from '../services/auth.service'

/**
 * Blockiert die App bis ein neues Passwort gesetzt ist (Erstanmeldung).
 * Kein Schliessen per X oder Overlay — nur erfolgreiches Speichern.
 */
export function FirstLoginPasswordModal() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mustChange = Boolean(user && profile?.must_change_password_on_first_login)
  const isOpen = Boolean(!isLoading && mustChange && user && profile)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    if (password.length < 8) {
      setFormError('Passwort mindestens 8 Zeichen.')
      return
    }
    if (password !== confirm) {
      setFormError('Passwoerter stimmen nicht ueberein.')
      return
    }

    setIsSubmitting(true)
    try {
      const supabase = getSupabaseClient()
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) {
        throw pwError
      }
      await clearMustChangePasswordOnFirstLogin()
      await refreshProfile()
      setPassword('')
      setConfirm('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Passwort konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
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
          closeLabel="Dialog schliessen"
          showCloseButton={false}
        />
        <p id="first-login-password-modal-desc" className="first-login-password-intro">
          Bitte waehle ein eigenes Passwort fuer dein Konto, bevor du fortfaehrst.
        </p>

        <form className="rename-form" onSubmit={handleSubmit}>
          <label htmlFor="first-login-password">Neues Passwort</label>
          <input
            id="first-login-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />

          <label htmlFor="first-login-password-confirm">Passwort bestaetigen</label>
          <input
            id="first-login-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={isSubmitting}
          />

          {formError ? <p className="error-text">{formError}</p> : null}

          <div className="rename-actions">
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Speichern…' : 'Passwort speichern'}
            </PrimaryButton>
          </div>
        </form>
      </section>
    </ModalShell>
  )
}
