/** Abgleich mit `mobile.css` / Breakpoints in `layout.css` (Sidebar-Overlay). */
export const MOBILE_BREAKPOINT_MAX_PX = 768

/** Chat-Oberleiste (Freigabe-Pille, Antwortmodus) — `layout.css` / `chat.css` @media max-width 860px. */
export const CHAT_TOOLBAR_BREAKPOINT_MAX_PX = 860

export function mobileMediaQuery(): string {
  return `(max-width: ${MOBILE_BREAKPOINT_MAX_PX}px)`
}

export function chatToolbarMobileMediaQuery(): string {
  return `(max-width: ${CHAT_TOOLBAR_BREAKPOINT_MAX_PX}px)`
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia(mobileMediaQuery()).matches
}

export function isChatToolbarMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia(chatToolbarMobileMediaQuery()).matches
}
