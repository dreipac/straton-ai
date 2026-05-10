import { useEffect } from 'react'

const CSS_VAR = '--chat-visual-keyboard-inset'
/** Kürzt `html`/`body` auf die untere Kante des Visual Viewports — siehe mobile.css. */
const LAYOUT_HEIGHT_VAR = '--straton-visual-layout-height'

function isChatInputFocused(): boolean {
  const el = document.activeElement
  return el instanceof HTMLTextAreaElement && el.classList.contains('chat-input')
}

/** iPadOS / iPhone / iPod Touch Safari & WKWebView (installierte PWA). */
function isLikelyIosWebKit(): boolean {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Abgedeckter Bereich am unteren Rand des *Layout*-Viewports (iPhone-Tastatur, Accessory-Bar).
 * `innerHeight − (visualViewport.offsetTop + visualViewport.height)` — gleiche Idee wie ContentBottomSheet.
 *
 * **Warum es trotzdem «ein paar Pixel» knapp werden kann (z. B. Screenshot mit Accessory-Leiste):**
 * WebKit legt die Input-Accessory (Prev/Next/Fertig) und Teile der Tastatur-UI **über** den Web-Inhalt,
 * während `visualViewport.height` den **sichtbaren Web-Bereich** nicht immer exakt auf die Linie
 * bringt, **unter der keine native UI mehr zeichnet**. Dann ist die Formel minimal zu klein — typisch
 * wenige px, bisweilen bis zur vollen Accessory-Höhe (vgl. WICG/visual-viewport #78, WebKit-Historie).
 *
 * Darum: konservative Rundung + zusätzlicher Puffer unten (nicht nur `keyboard-inset` env — Safari iOS
 * unterstützt die VirtualKeyboard-`env()`-Variablen nicht zuverlässig).
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
      if (!vv) {
        return
      }
      /*
       * Wenn nur `--chat-visual-keyboard-inset` am Panel nutzt: `html`/`body` bleiben bei PWA trotzdem
       * auf vollem `--straton-app-height` (100lvh). Der Composer sitzt im Grid zwar über Padding,
       * aber WKWebView meldet `visualViewport` / obscured inkonsistent — wenige px bis zur Accessory-Leiste.
       *
       * Zuverlässiger: Solange das Chat-Textfeld fokussiert ist, Layout-Höhe = untere Kante des
       * Visual Viewports (`offsetTop + height`). Dann endet der Dokumentbaum exakt oberhalb von
       * Tastatur + Accessory (nicht nur «Padding nachrechnen»). `--chat-visual-keyboard-inset` = 0.
       */
      if (isChatInputFocused()) {
        const layoutH = Math.max(window.innerHeight, document.documentElement.clientHeight)
        const visibleBottom = vv.offsetTop + vv.height
        /*
         * WKWebView meldet die untere vv-Kante oft noch *über* der Accessory-Leiste (Prev/Next/Fertig).
         * Dann ist `offsetTop + height` zu groß → `--straton-visual-layout-height` zu groß → Composer wird vom
         * Native-Layer beschnitten. Scrollen im Thread hilft nicht: der Composer liegt nicht in `.chat-messages`.
         */
        const iosExtra = isLikelyIosWebKit() ? 34 : 14
        const blockHeight = Math.max(
          120,
          Math.min(layoutH, Math.max(0, Math.floor(visibleBottom - iosExtra))),
        )
        document.documentElement.style.setProperty(LAYOUT_HEIGHT_VAR, `${blockHeight}px`)
        document.documentElement.style.setProperty(CSS_VAR, '0px')
        return
      }

      document.documentElement.style.removeProperty(LAYOUT_HEIGHT_VAR)
      const px = obscuredBottomPx()
      const padded =
        px > 0 ? px + 16 + (typeof navigator !== 'undefined' && isLikelyIosWebKit() ? 8 : 6) : 0
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
      document.documentElement.style.removeProperty(LAYOUT_HEIGHT_VAR)
    }
  }, [])
}
