/** Abgleich mit `mobile.css` / Breakpoints in `layout.css` (Sidebar-Overlay). */
export const MOBILE_BREAKPOINT_MAX_PX = 768

export function mobileMediaQuery(): string {
  return `(max-width: ${MOBILE_BREAKPOINT_MAX_PX}px)`
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia(mobileMediaQuery()).matches
}
