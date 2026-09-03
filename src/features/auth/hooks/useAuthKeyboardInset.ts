import { useEffect } from 'react'

/** Muss zur Klasse in `auth.css` passen (Elevated-Look, solange das Feld angehoben ist). */
const LIFTED_CLASS = 'auth-login-field--lifted'

/** Abstand, den das angehobene Feld mindestens zur Tastatur / zum oberen Rand behält. */
const BOTTOM_MARGIN_PX = 16
const TOP_MARGIN_PX = 12

function isAuthField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (!target.matches('input, textarea')) {
    return false
  }
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    return false
  }
  return target.closest('.auth-login-page') != null
}

/** Label + Input gemeinsam anheben, nicht nur das nackte `<input>` — sonst fehlt der Kontext. */
function fieldWrapperFor(field: HTMLElement): HTMLElement {
  return (field.closest('.auth-login-field') as HTMLElement | null) ?? field
}

/**
 * Hebt NUR das aktuell fokussierte Feld per `transform: translateY()` über die Tastatur — Titel,
 * andere Felder, Button bleiben exakt an ihrer Position. Kein Scrollen von irgendetwas: die Seite
 * (`.auth-login-page`) bewegt sich nie, und es wird bewusst kein `scrollIntoView` verwendet, um
 * keine Interaktion mit dem nativen Scroll-/Tastatur-Verhalten des Browsers auszulösen (das war
 * der wahrscheinlichste Grund, warum das Überlagern der Tastatur nach dem ersten Fokus/Blur-Zyklus
 * nicht mehr sauber griff).
 *
 * `transform` statt `padding`/`height` animieren läuft rein im Compositor (GPU) — kein Reflow pro
 * Frame, dadurch auch unter iOS-Stromsparmodus (gedrosselte CPU) ruckelfrei.
 *
 * Setzt `interactive-widget=overlays-content` in `index.html` voraus — ohne das würde der Browser
 * selbst schon den Viewport verschieben und mit dieser Logik kollidieren.
 */
export function useAuthKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) {
      return undefined
    }

    let raf = 0
    let liftedEl: HTMLElement | null = null

    function clearLift() {
      if (!liftedEl) {
        return
      }
      liftedEl.style.transform = ''
      liftedEl.classList.remove(LIFTED_CLASS)
      liftedEl = null
    }

    function apply() {
      if (!liftedEl || !vv) {
        return
      }
      const rect = liftedEl.getBoundingClientRect()
      const visibleTop = vv.offsetTop + TOP_MARGIN_PX
      const visibleBottom = vv.offsetTop + vv.height - BOTTOM_MARGIN_PX
      const overflow = rect.bottom - visibleBottom
      if (overflow <= 0) {
        liftedEl.style.transform = ''
        return
      }
      // Nie so weit heben, dass die Oberkante des Felds über den sichtbaren Bereich hinausrutscht.
      const maxLift = Math.max(0, rect.top - visibleTop)
      const lift = Math.min(overflow, maxLift)
      liftedEl.style.transform = lift > 0 ? `translateY(-${Math.ceil(lift)}px)` : ''
    }

    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }

    function onFocusIn(event: FocusEvent) {
      if (!isAuthField(event.target)) {
        return
      }
      if (liftedEl && liftedEl !== fieldWrapperFor(event.target)) {
        clearLift()
      }
      liftedEl = fieldWrapperFor(event.target)
      liftedEl.classList.add(LIFTED_CLASS)
      schedule()
    }

    function onFocusOut(event: FocusEvent) {
      if (!isAuthField(event.target)) {
        return
      }
      if (liftedEl === fieldWrapperFor(event.target)) {
        clearLift()
      }
    }

    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      cancelAnimationFrame(raf)
      clearLift()
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
}
