import { useEffect } from 'react'

const CSS_VAR = '--chat-visual-keyboard-inset'

/**
 * Abgedeckter Bereich am unteren Rand des *Layout*-Viewports (iPhone-Tastatur, Accessory-Bar).
 * `innerHeight − (visualViewport.offsetTop + visualViewport.height)` — gleiche Idee wie ContentBottomSheet.
 * Zusätzlich: `resize`/`focusin`-Sync und kurze Delays (iOS blendet die Tastatur verzögert ein).
 */
function obscuredBottomPx(): number {
  const vv = window.visualViewport
  if (!vv) {
    return 0
  }
  const layoutH = window.innerHeight
  const visibleBottom = vv.offsetTop + vv.height
  return Math.max(0, Math.round(layoutH - visibleBottom))
}

export function useVisualKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) {
      return
    }

    let raf = 0
    const timers: number[] = []

    function apply() {
      const px = obscuredBottomPx()
      /** Kleiner Puffer; zu groß = zu viel Luft zur Tastatur im leeren Chat (Inset liegt dort am Compose). */
      const padded = px > 0 ? px + 4 : 0
      document.documentElement.style.setProperty(CSS_VAR, `${padded}px`)
    }

    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }

    function syncWithDelays() {
      schedule()
      ;[48, 160, 360, 520].forEach((ms) => {
        timers.push(window.setTimeout(schedule, ms))
      })
    }

    function onFocusIn(ev: FocusEvent) {
      const t = ev.target
      if (t instanceof HTMLTextAreaElement && t.classList.contains('chat-input')) {
        syncWithDelays()
      }
    }

    function onFocusOut() {
      window.setTimeout(schedule, 80)
    }

    schedule()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.documentElement.style.removeProperty(CSS_VAR)
    }
  }, [])
}
