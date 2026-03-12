import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { useAuth } from '../context/useAuth'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signIn, error, isConfigured } = useAuth()
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
      await signIn(email.trim(), password)
      navigate('/chat', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login fehlgeschlagen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <h1>Login</h1>
      <p>Straton AI Prototyp - E-Mail/Passwort via Supabase.</p>

      <label htmlFor="email">E-Mail</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={!isConfigured || isSubmitting}
      />

      <label htmlFor="password">Passwort</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={!isConfigured || isSubmitting}
      />

      {formError ? <p className="error-text">{formError}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <PrimaryButton type="submit" disabled={isSubmitting || !isConfigured}>
        {isSubmitting ? 'Anmeldung laeuft...' : 'Anmelden'}
      </PrimaryButton>
    </form>
  )
}
