import { useEffect } from 'react'

let visualKeyboardInsetSync: (() => void) | null = null

/** Nach Composer-Höhenänderung (z. B. Referenz-Einbettung) erneut layouten — v. a. iOS. */
export function requestVisualKeyboardInsetSync(): void {
  visualKeyboardInsetSync?.()
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

/**
 * Zusätzlicher Abstand unterhalb der von WebKit gemeldeten Visual-Viewport-Unterkante, solange das
 * Chat-Textfeld fokussiert ist. Die Input-Accessory (Prev/Next/Fertig) liegt oft **über** dem Bereich,
 * den `visualViewport.height` noch als „Web-Inhalt“ zählt — zu kleiner Slop → Composer wird beschnitten.
 * Größenordnung wie `obscuredBottomPx()` (dort Mindestpuffer 56px bei kleinem obscured); etwas höher, weil
 * wir hier zusätzlich `IOS_FOCUS_SUBPIXEL_BUFFER_PX` abziehen (s. unten).
 */
const IOS_CHAT_FOCUS_LAYOUT_SLOP_PX = 60

/**
 * Noch ein paar Pixel unter `visibleBottom − IOS_CHAT_FOCUS_LAYOUT_SLOP_PX`: `Math.floor` auf
 * `offsetTop + height`, Retina-Subpixel und leicht verschobene resize-Ticks lassen sonst oft **2–6px**
 * des Composers unter der Accessory-Leiste stehen (nicht messbar „falsch“, aber sichtbar am unteren Rand).
 */
const IOS_FOCUS_SUBPIXEL_BUFFER_PX = 4

function isChatInputFocused(): boolean {
  const el = document.activeElement
  return el instanceof HTMLTextAreaElement && el.classList.contains('chat-input')
}

function measureComposerStack(): { height: number; bottom: number } | null {
  const stack = document.querySelector('.chat-composer-stack')
  if (!(stack instanceof HTMLElement)) {
    return null
  }
  const rect = stack.getBoundingClientRect()
  if (rect.height <= 0) {
    return null
  }
  return { height: rect.height, bottom: rect.bottom }
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
        const iosExtra =
          isLikelyIosWebKit() ? IOS_CHAT_FOCUS_LAYOUT_SLOP_PX + IOS_FOCUS_SUBPIXEL_BUFFER_PX : 14
        const targetComposeBottom = visibleBottom - iosExtra
        let blockHeight = Math.max(
          120,
          Math.min(layoutH, Math.max(0, Math.floor(targetComposeBottom))),
        )
        /*
         * Referenz-Einbettung vergrößert `.chat-composer-stack` nachträglich — ohne Nachzug
         * bleibt die Message Box unter Tastatur/Accessory (nur bei Swipe-Referenz sichtbar).
         */
        const compose = measureComposerStack()
        if (compose && compose.bottom > targetComposeBottom + 1) {
          const overflow = Math.ceil(compose.bottom - targetComposeBottom)
          blockHeight = Math.max(120, blockHeight - overflow)
        }
        syncViewportVars()
        document.documentElement.style.setProperty(LAYOUT_HEIGHT_VAR, `${blockHeight}px`)
        document.documentElement.style.setProperty(CSS_VAR, '0px')
        return
      }

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

    function onFocusIn(ev: FocusEvent) {
      const t = ev.target
      if (t instanceof HTMLTextAreaElement && t.classList.contains('chat-input')) {
        connectComposeResizeObserver(t)
        syncWithDelays()
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
      disconnectComposeResizeObserver()
      cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.documentElement.style.removeProperty(CSS_VAR)
      document.documentElement.style.removeProperty(LAYOUT_HEIGHT_VAR)
      clearViewportVars()
    }
  }, [])
}
