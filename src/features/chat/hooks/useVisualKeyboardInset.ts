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
  /*
   * clientHeight kann auf iOS minimal von innerHeight abweichen; für «Rest unter dem VisualViewport»
   * konservativ das Maximum nutzen — sonst fehlen wenige px (~wie oft gemeldete «~5px»).
   */
  const layoutH = Math.max(window.innerHeight, document.documentElement.clientHeight)
  const visibleBottom = vv.offsetTop + vv.height
  /** Ceil statt round: nie die Überdeckung nach unten runden (Retina-Subpixel). */
  let obscured = Math.max(0, Math.ceil(layoutH - visibleBottom))
  /*
   * iOS Safari / installierte PWA: Die Leiste mit «Weiter / Zurück / Fertig» oberhalb der Tastatur
   * wird oft nur als sehr kleines obscured gemeldet — ohne Nachschlag bleibt der Composer unter der Leiste.
   */
  if (obscured > 0 && obscured < 64) {
    obscured = Math.max(obscured, 56)
  }
  return obscured
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
      /** Etwas Luft unter der Message Box; zu knapp = Abschneiden an Accessory/Tastatur (PWA). */
      const padded = px > 0 ? px + 24 : 0
      document.documentElement.style.setProperty(CSS_VAR, `${padded}px`)
    }

    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }

    function syncWithDelays() {
      schedule()
      ;[48, 160, 360, 520, 720, 960].forEach((ms) => {
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
