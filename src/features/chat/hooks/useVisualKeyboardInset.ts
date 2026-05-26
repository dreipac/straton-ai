import { useEffect } from 'react'

let visualKeyboardInsetSync: (() => void) | null = null

/** Nach Composer-Höhenänderung (z. B. Referenz-Einbettung) erneut layouten — v. a. iOS. */
export function requestVisualKeyboardInsetSync(): void {
  visualKeyboardInsetSync?.()
}

let revealComposerAboveKeyboard: (() => void) | null = null

/** Thread + Composer nach Tastatur-Layout in den sichtbaren Bereich scrollen. */
export function requestRevealComposerAboveKeyboard(): void {
  revealComposerAboveKeyboard?.()
}

const MOBILE_KEYBOARD_READY_MIN_OBSCURED_PX = 72
const MOBILE_KEYBOARD_READY_MAX_WAIT_MS = 560
const MOBILE_KEYBOARD_READY_SETTLE_MS = 96

/**
 * Wartet bis die Tastatur den Visual Viewport verkleinert hat (oder Timeout).
 * Für Referenz-Einbettung: erst Composer über Tastatur, dann Quote anzeigen.
 */
export function waitForVisualKeyboardReady(onReady: () => void): () => void {
  const vv = window.visualViewport
  if (!vv) {
    const fallbackId = window.setTimeout(onReady, 400)
    return () => window.clearTimeout(fallbackId)
  }

  let cancelled = false
  let settleTimer = 0
  let maxTimer = 0

  const layoutHeight = () => Math.max(window.innerHeight, document.documentElement.clientHeight)
  const obscuredBottomPx = () =>
    Math.max(0, Math.ceil(layoutHeight() - (vv.offsetTop + vv.height)))

  const cleanup = () => {
    if (settleTimer !== 0) {
      window.clearTimeout(settleTimer)
      settleTimer = 0
    }
    if (maxTimer !== 0) {
      window.clearTimeout(maxTimer)
      maxTimer = 0
    }
    vv.removeEventListener('resize', onViewportChange)
  }

  const finish = () => {
    if (cancelled) {
      return
    }
    cancelled = true
    cleanup()
    onReady()
  }

  const scheduleFinish = () => {
    if (cancelled) {
      return
    }
    if (settleTimer !== 0) {
      window.clearTimeout(settleTimer)
    }
    settleTimer = window.setTimeout(finish, MOBILE_KEYBOARD_READY_SETTLE_MS)
  }

  function onViewportChange() {
    if (obscuredBottomPx() >= MOBILE_KEYBOARD_READY_MIN_OBSCURED_PX) {
      scheduleFinish()
    }
  }

  maxTimer = window.setTimeout(finish, MOBILE_KEYBOARD_READY_MAX_WAIT_MS)
  vv.addEventListener('resize', onViewportChange)
  requestVisualKeyboardInsetSync()

  if (obscuredBottomPx() >= MOBILE_KEYBOARD_READY_MIN_OBSCURED_PX) {
    scheduleFinish()
  }

  return () => {
    cancelled = true
    cleanup()
  }
}

const CSS_VAR = '--chat-visual-keyboard-inset'
/** Kürzt `html`/`body` auf die untere Kante des Visual Viewports — siehe mobile.css. */
const LAYOUT_HEIGHT_VAR = '--straton-visual-layout-height'
const VIEWPORT_OFFSET_TOP_VAR = '--chat-visual-viewport-offset-top'
const VIEWPORT_HEIGHT_VAR = '--chat-visual-viewport-height'
const COMPOSER_ANCHOR_HEIGHT_VAR = '--chat-composer-anchor-height'
const COMPOSER_KEYBOARD_LIFT_VAR = '--chat-mobile-keyboard-composer-lift'
const KEYBOARD_ANCHOR_CLASS = 'is-chat-composer-keyboard-anchored'

/** Input-Accessory (Pfeile/Fertig) oberhalb der Tastatur — `fixed`-Composer braucht extra Abstand. */
const IOS_KEYBOARD_COMPOSER_LIFT_PX = 54

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
    let composeResizeObserver: ResizeObserver | null = null

    function clearViewportVars() {
      document.documentElement.style.removeProperty(VIEWPORT_OFFSET_TOP_VAR)
      document.documentElement.style.removeProperty(VIEWPORT_HEIGHT_VAR)
    }

    function syncViewportVars() {
      const offsetTop = Math.max(0, Math.floor(vv!.offsetTop))
      const height = Math.max(0, Math.floor(vv!.height))
      document.documentElement.style.setProperty(VIEWPORT_OFFSET_TOP_VAR, `${offsetTop}px`)
      document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`)
    }

    function clearComposerKeyboardAnchor() {
      document.documentElement.classList.remove(KEYBOARD_ANCHOR_CLASS)
      document.documentElement.style.removeProperty(COMPOSER_KEYBOARD_LIFT_VAR)
      document.querySelectorAll('.chat-panel').forEach((panel) => {
        if (panel instanceof HTMLElement) {
          panel.style.removeProperty(COMPOSER_ANCHOR_HEIGHT_VAR)
        }
      })
    }

    function updateComposerKeyboardAnchor() {
      const panel = document.querySelector('.chat-panel:not(.is-empty)')
      const stack = panel?.querySelector('.chat-composer-stack')
      if (!(panel instanceof HTMLElement) || !(stack instanceof HTMLElement)) {
        return
      }
      const height = Math.ceil(stack.getBoundingClientRect().height)
      if (height > 0) {
        panel.style.setProperty(COMPOSER_ANCHOR_HEIGHT_VAR, `${height}px`)
      }
    }

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
        syncViewportVars()
        document.documentElement.classList.add(KEYBOARD_ANCHOR_CLASS)
        document.documentElement.style.setProperty(
          COMPOSER_KEYBOARD_LIFT_VAR,
          isLikelyIosWebKit() ? `${IOS_KEYBOARD_COMPOSER_LIFT_PX}px` : '10px',
        )
        /*
         * Composer am Visual-Viewport verankern (`position:fixed` + bottom aus vv-Vars).
         * Body-Höhe kürzen allein reicht auf iOS nicht — `fixed` bezieht sich auf den Layout-Viewport.
         */
        document.documentElement.style.removeProperty(LAYOUT_HEIGHT_VAR)
        document.documentElement.style.setProperty(CSS_VAR, '0px')
        updateComposerKeyboardAnchor()
        const messages = document.querySelector('.chat-messages')
        if (messages instanceof HTMLElement) {
          messages.scrollTop = messages.scrollHeight
        }
        return
      }

      clearComposerKeyboardAnchor()
      clearViewportVars()
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

    function disconnectComposeResizeObserver() {
      composeResizeObserver?.disconnect()
      composeResizeObserver = null
    }

    function connectComposeResizeObserver(fromTarget: EventTarget | null) {
      disconnectComposeResizeObserver()
      const stack =
        fromTarget instanceof Element
          ? fromTarget.closest('.chat-composer-stack')
          : document.querySelector('.chat-composer-stack')
      if (!stack) {
        return
      }
      composeResizeObserver = new ResizeObserver(() => {
        schedule()
      })
      composeResizeObserver.observe(stack)
    }

    visualKeyboardInsetSync = syncWithDelays

    revealComposerAboveKeyboard = () => {
      const messages = document.querySelector('.chat-messages')
      if (messages instanceof HTMLElement) {
        messages.scrollTop = messages.scrollHeight
      }
      updateComposerKeyboardAnchor()
      schedule()
    }

    function onFocusIn(ev: FocusEvent) {
      const t = ev.target
      if (t instanceof HTMLTextAreaElement && t.classList.contains('chat-input')) {
        connectComposeResizeObserver(t)
        syncWithDelays()
        if (isLikelyIosWebKit()) {
          requestAnimationFrame(() => revealComposerAboveKeyboard?.())
          timers.push(window.setTimeout(() => revealComposerAboveKeyboard?.(), 180))
          timers.push(window.setTimeout(() => revealComposerAboveKeyboard?.(), 400))
        }
      }
    }

    function onFocusOut() {
      disconnectComposeResizeObserver()
      window.setTimeout(schedule, 80)
    }

    schedule()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      if (visualKeyboardInsetSync === syncWithDelays) {
        visualKeyboardInsetSync = null
      }
      if (revealComposerAboveKeyboard) {
        revealComposerAboveKeyboard = null
      }
      disconnectComposeResizeObserver()
      cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      clearComposerKeyboardAnchor()
      document.documentElement.style.removeProperty(CSS_VAR)
      document.documentElement.style.removeProperty(LAYOUT_HEIGHT_VAR)
      clearViewportVars()
    }
  }, [])
}
