import { useEffect, useMemo } from 'react'
import { useDocumentThemeVariant } from '../hooks/useDocumentThemeVariant'
import { Navigate } from 'react-router-dom'
import cornerTopRight from '../assets/png/login-pattern-top-right.png'
import cornerBottomLeft from '../assets/png/login-pattern-bottom-left.png'
import { LoginForm } from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/context/useAuth'

export function LoginPage() {
  const { user, profile, isLoading } = useAuth()
  const themeVariant = useDocumentThemeVariant()
  const loginLogoSrc = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return themeVariant === 'pink-glass'
      ? `${base}assets/logo/Straton-pink.png`
      : `${base}assets/logo/Straton.png`
  }, [themeVariant])

  /* iOS/PWA: Seite nicht wegrutschen / grauen Hintergrund zeigen; bei Tastatur-Fokus wieder normal */
  useEffect(() => {
    if (user) {
      return undefined
    }

    const html = document.documentElement
    let blurTimeout: ReturnType<typeof setTimeout> | null = null

    const clearBlurTimeout = () => {
      if (blurTimeout != null) {
        clearTimeout(blurTimeout)
        blurTimeout = null
      }
    }

    const setKeyboardActive = (active: boolean) => {
      html.classList.toggle('auth-login-keyboard-active', active)
    }

    const handleFocusIn = (event: FocusEvent) => {
      const el = event.target
      if (el instanceof HTMLElement && el.matches('input, textarea, select')) {
        clearBlurTimeout()
        setKeyboardActive(true)
      }
    }

    const handleFocusOut = () => {
      clearBlurTimeout()
      blurTimeout = window.setTimeout(() => {
        blurTimeout = null
        const active = document.activeElement
        if (!(active instanceof HTMLElement && active.matches('input, textarea, select'))) {
          setKeyboardActive(false)
        }
      }, 120)
    }

    html.classList.add('auth-login-scroll-lock')

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      clearBlurTimeout()
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      html.classList.remove('auth-login-scroll-lock', 'auth-login-keyboard-active')
    }
  }, [user])

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
