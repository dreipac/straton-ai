import { useMemo } from 'react'
import { useDocumentThemeVariant } from '../hooks/useDocumentThemeVariant'
import { Navigate } from 'react-router-dom'
import cornerTopRight from '../assets/png/login-pattern-top-right.png'
import cornerBottomLeft from '../assets/png/login-pattern-bottom-left.png'
import { LoginForm } from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/context/useAuth'
import { useAuthPageChrome } from '../features/auth/hooks/useAuthPageChrome'
import { useAuthKeyboardInset } from '../features/auth/hooks/useAuthKeyboardInset'

export function LoginPage() {
  const { user, profile, isLoading } = useAuth()
  const themeVariant = useDocumentThemeVariant()
  const loginLogoSrc = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return themeVariant === 'pink-glass'
      ? `${base}assets/logo/Straton-pink.png`
      : `${base}assets/logo/Straton.png`
  }, [themeVariant])

  useAuthPageChrome(!user)
  useAuthKeyboardInset()

  if (isLoading) {
    return null
  }

  if (user && profile?.must_change_password_on_first_login) {
    return <Navigate to="/chat" replace />
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return (
    <main className="auth-login-page">
      <img
        className="auth-login-corner auth-login-corner--top-right"
        src={cornerTopRight}
        alt=""
        aria-hidden="true"
      />
      <img
        className="auth-login-corner auth-login-corner--bottom-left"
        src={cornerBottomLeft}
        alt=""
        aria-hidden="true"
      />

      <div className="auth-login-stack">
        <div className="auth-login-brand-row">
          <img className="auth-login-logo" src={loginLogoSrc} alt="Straton" />
          <span className="auth-login-wordmark" aria-hidden="true">
            Straton
          </span>
        </div>
        <div className="auth-login-card">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
