import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { getLoginRememberPreference } from '../../../integrations/supabase/client'
import { useAuth } from '../context/useAuth'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rememberLogin, setRememberLogin] = useState(() => getLoginRememberPreference())
  const { signIn, refreshProfile, error, isConfigured } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim() || !password.trim()) {
      setFormError('Bitte E-Mail und Passwort ausfuellen.')
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      await signIn(email.trim(), password, rememberLogin)
      await refreshProfile()
      navigate('/chat', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login fehlgeschlagen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h1 className="auth-login-heading">Login</h1>
      <p className="auth-login-lead">Melde dich mit deinem Konto an.</p>

      <div className="auth-login-field">
        <label htmlFor="email">E-Mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!isConfigured || isSubmitting}
        />
      </div>

      <div className="auth-login-field">
        <label htmlFor="password">Passwort</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!isConfigured || isSubmitting}
        />
      </div>

      <label className="auth-login-remember">
        <input
          type="checkbox"
          checked={rememberLogin}
          onChange={(event) => setRememberLogin(event.target.checked)}
          disabled={!isConfigured || isSubmitting}
        />
        <span>Login merken</span>
      </label>

      {formError ? <p className="error-text">{formError}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <PrimaryButton
        type="submit"
        disabled={isSubmitting || !isConfigured}
        aria-busy={isSubmitting}
        className={isSubmitting ? 'auth-login-submit--busy' : undefined}
      >
        {isSubmitting ? (
          <>
            <span className="auth-login-submit-spinner" aria-hidden="true" />
            <span className="auth-login-sr-only">Anmeldung läuft</span>
          </>
        ) : (
          'Anmelden'
        )}
      </PrimaryButton>

      <p className="auth-login-register-hint">
        Neu bei uns?{' '}
        <Link to="/register" className="auth-login-register-link">
          Jetzt registrieren
        </Link>
      </p>
    </form>
  )
}
