import { useMemo } from 'react'
import { useDocumentThemeVariant } from '../../../hooks/useDocumentThemeVariant'

/** Neutraler Startbildschirm — kein Login-Flash, bis die Session aus dem Speicher gelesen ist. */
export function AuthSessionBootstrap() {
  const themeVariant = useDocumentThemeVariant()
  const logoSrc = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return themeVariant === 'pink-glass'
      ? `${base}assets/logo/Straton-pink.png`
      : `${base}assets/logo/Straton.png`
  }, [themeVariant])

  return (
    <main className="auth-session-bootstrap" role="status" aria-live="polite" aria-label="Straton wird geladen">
      <img className="auth-session-bootstrap-logo" src={logoSrc} alt="" aria-hidden="true" />
      <span className="auth-session-bootstrap-wordmark">Straton</span>
    </main>
  )
}
