import { Navigate } from 'react-router-dom'
import loginPicture from '../assets/png/picture-1.png'
import { LoginForm } from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/context/useAuth'

const loginLogoSrc = `${import.meta.env.BASE_URL}assets/logo/Straton.png`

export function LoginPage() {
  const { user, profile } = useAuth()

  if (user && profile?.must_change_password_on_first_login) {
    return <Navigate to="/chat" replace />
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return (
    <main className="auth-login-page">
      <div className="auth-login-visual" aria-hidden="true">
        <img className="auth-login-visual-img" src={loginPicture} alt="" />
      </div>

      <div className="auth-login-mobile-hero">
        <div className="auth-login-mobile-hero-media" aria-hidden="true">
          <img className="auth-login-mobile-hero-img" src={loginPicture} alt="" />
        </div>
        <div className="auth-login-mobile-hero-scrim" aria-hidden="true" />
        <div className="auth-login-mobile-hero-brand">
          <img className="auth-login-logo auth-login-logo--mobile-hero" src={loginLogoSrc} alt="Straton" />
          <span className="auth-login-mobile-wordmark" aria-hidden="true">
            Straton
          </span>
        </div>
      </div>

      <div className="auth-login-form-column">
        <div className="auth-login-brand-row auth-login-brand-row--desktop">
          <img className="auth-login-logo" src={loginLogoSrc} alt="Straton" />
          <span className="auth-login-wordmark" aria-hidden="true">
            Straton
          </span>
        </div>
        <div className="auth-login-form-wrap">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
