import { useEffect } from 'react'

const LOCK_CLASS = 'auth-login-scroll-lock'

/**
 * iOS/PWA: verhindert grauen/weißen Blitz an Overscroll-Rändern und beim Ein-/Ausblenden der
 * Safari-Toolbar — reine Hintergrund-/Rubber-Band-Kosmetik von `html`/`body` (siehe `auth.css`).
 * Kein Fokus-/Tastatur-Zustand mehr — das übernimmt `useAuthKeyboardInset` direkt auf der Seite.
 *
 * `active`: `false` überspringt das Setzen (z. B. während ein eingeloggter Nutzer schon
 * wegnavigiert wird) — spiegelt den früheren `if (user) return` in `LoginPage`.
 */
export function useAuthPageChrome(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined
    }

    document.documentElement.classList.add(LOCK_CLASS)

    return () => {
      document.documentElement.classList.remove(LOCK_CLASS)
    }
  }, [active])
}
