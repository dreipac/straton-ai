import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { useAuth } from '../context/useAuth'
import { checkInviteTokenValid, redeemInviteToken } from '../services/inviteTokens.service'

type TokenState = 'checking' | 'valid' | 'invalid'

const MIN_PASSWORD_LENGTH = 8

export function RegisterForm() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') ?? '').trim()
  const [tokenState, setTokenState] = useState<TokenState>(token ? 'checking' : 'invalid')

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { signIn, refreshProfile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      return
    }
    let isMounted = true
    void (async () => {
      setTokenState('checking')
      try {
        const isValid = await checkInviteTokenValid(token)
        if (isMounted) {
          setTokenState(isValid ? 'valid' : 'invalid')
        }
      } catch {
        if (isMounted) {
          setTokenState('invalid')
        }
      }
    })()
    return () => {
      isMounted = false
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setFormError('Bitte E-Mail und Passwort ausfüllen.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`)
      return
    }
    if (password !== confirmPassword) {
      setFormError('Die Passwörter stimmen nicht überein.')
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      await redeemInviteToken({
        token,
        email: trimmedEmail,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      await signIn(trimmedEmail, password, true)
      await refreshProfile()
      navigate('/chat', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.')
      setIsSubmitting(false)
    }
  }

  if (tokenState === 'checking') {
    return (
      <div className="form-panel">
        <h1 className="auth-login-heading">Konto erstellen</h1>
        <p className="auth-login-lead">Einladungslink wird geprüft…</p>
      </div>
    )
  }

  if (tokenState === 'invalid') {
    return (
      <div className="form-panel">
        <h1 className="auth-login-heading">Konto erstellen</h1>
        <p className="auth-login-lead">
          Die Registrierung ist nur über einen persönlichen Einladungslink möglich. Dieser Link ist ungültig,
          abgelaufen oder bereits verwendet. Bitte wende dich an die Person, die dich eingeladen hat.
        </p>
        <p className="auth-login-register-hint">
          <Link to="/login" className="auth-login-register-link">
            Zurück zum Login
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h1 className="auth-login-heading">Du wurdest eingeladen!</h1>
      <p className="auth-login-lead">Registrieren</p>

      <div className="auth-register-name-row">
        <div className="auth-login-field">
          <label htmlFor="register-first-name">Vorname (optional)</label>
          <input
            id="register-first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="auth-login-field">
          <label htmlFor="register-last-name">Nachname (optional)</label>
          <input
            id="register-last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="auth-login-field">
        <label htmlFor="register-email">E-Mail</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          placeholder="example@hotmail.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="auth-login-field">
        <label htmlFor="register-password">Passwort</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="auth-login-field">
        <label htmlFor="register-password-confirm">Passwort bestätigen</label>
        <input
          id="register-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {formError ? <p className="error-text">{formError}</p> : null}

      <PrimaryButton
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className={isSubmitting ? 'auth-login-submit--busy' : undefined}
      >
        {isSubmitting ? (
          <>
            <span className="auth-login-submit-spinner" aria-hidden="true" />
            <span className="auth-login-sr-only">Konto wird erstellt</span>
          </>
        ) : (
          'Konto erstellen'
        )}
      </PrimaryButton>

      <p className="auth-login-register-hint">
        Schon ein Konto?{' '}
        <Link to="/login" className="auth-login-register-link">
          Jetzt anmelden
        </Link>
      </p>
    </form>
  )
}
