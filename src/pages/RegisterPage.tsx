import { Link } from 'react-router-dom'

/** Platzhalter bis eine echte Selbstregistrierung existiert */
export function RegisterPage() {
  return (
    <main className="auth-register-page">
      <div className="auth-register-inner">
        <h1 className="auth-register-title">Konto erstellen</h1>
        <p className="auth-register-lead">
          Aktuell erfolgt die Freischaltung über einen Administrator. Bei Fragen wende dich bitte an den Support deiner Organisation.
        </p>
        <Link to="/login" className="auth-login-register-link">
          Zurück zum Login
        </Link>
      </div>
    </main>
  )
}
