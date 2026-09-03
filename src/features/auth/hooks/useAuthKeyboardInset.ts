import { useEffect } from 'react'

/**
 * Von `.auth-login-stack` als `padding-bottom` gelesen (siehe `auth.css`) — schiebt das Formular
 * über die Tastatur, ohne dass `.auth-login-page` selbst sich bewegt oder neu layoutet.
 */
const KEYBOARD_INSET_VAR = '--auth-keyboard-inset'

/**
 * Wie oft ein kleines gemeldetes `obscured` (z. B. nur die iOS-Zubehörleiste, Tastatur noch nicht
 * ausgefahren) auf einen sinnvollen Mindestwert angehoben wird — gleiche Herleitung wie
 * `MOBILE_KEYBOARD_READY_MIN_OBSCURED_PX` in `useVisualKeyboardInset` (Chat).
 */
const MIN_OBSCURED_CORRECTION_PX = 56
const SMALL_OBSCURED_CEILING_PX = 64

/**
 * Zusätzlicher Puffer für die iOS-Tastatur-Zubehörleiste (Zurück/Weiter/Fertig), die WebKit oft
 * NICHT in `visualViewport.height` einrechnet — gleicher Wert wie `IOS_CHAT_FOCUS_LAYOUT_SLOP_PX`
 * im Chat-Hook, dort bereits gegen echte Geräte austariert.
 */
const IOS_ACCESSORY_BAR_SLOP_PX = 60

function isLikelyIosWebKit(): boolean {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function isAuthField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (!target.matches('input, textarea')) {
    return false
  }
  return target.closest('.auth-login-page') != null
}

/** Von der Tastatur (+ Zubehörleiste) verdeckter Bereich am unteren Rand, in px. */
function obscuredBottomPx(): number {
  const vv = window.visualViewport
  if (!vv) {
    return 0
  }
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight)
  const visibleBottom = vv.offsetTop + vv.height
  let obscured = Math.max(0, Math.ceil(layoutHeight - visibleBottom))
  if (obscured > 0 && obscured < SMALL_OBSCURED_CEILING_PX) {
    obscured = Math.max(obscured, MIN_OBSCURED_CORRECTION_PX)
  }
  if (obscured > 0 && isLikelyIosWebKit()) {
    obscured += IOS_ACCESSORY_BAR_SLOP_PX
  }
  return obscured
}

/**
 * Setzt `--auth-keyboard-inset` auf `documentElement`, solange ein Feld innerhalb
 * `.auth-login-page`/`.auth-register-page` fokussiert und von der Tastatur verdeckt ist, und
 * scrollt das Feld danach innerhalb von `.auth-login-stack` in Sicht.
 *
 * Setzt `interactive-widget=overlays-content` in `index.html` voraus — ohne das würde der Browser
 * selbst schon den (Layout- oder Visual-)Viewport verschieben und mit dieser Logik kollidieren.
 */
export function useAuthKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) {
      return undefined
    }

    let raf = 0
    let focusedField: HTMLElement | null = null

    function apply() {
      const inset = focusedField ? obscuredBottomPx() : 0
      document.documentElement.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`)
    }

    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }

    function revealFocusedField() {
      focusedField?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }

    function onFocusIn(event: FocusEvent) {
      if (!isAuthField(event.target)) {
        return
      }
      focusedField = event.target
      schedule()
      /*
       * Erst wenn `--auth-keyboard-inset` angewendet ist (ein Frame nach `apply()`, siehe rAF in
       * `schedule()`), scrollen — sonst rechnet der Browser noch mit dem alten, zu kleinen
       * Scroll-Bereich und das Feld landet knapp über/unter der Tastatur statt exakt davor.
       */
      requestAnimationFrame(() => requestAnimationFrame(revealFocusedField))
    }

    function onFocusOut(event: FocusEvent) {
      if (focusedField && event.target === focusedField) {
        focusedField = null
        schedule()
      }
    }

    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.documentElement.style.removeProperty(KEYBOARD_INSET_VAR)
    }
  }, [])
}
