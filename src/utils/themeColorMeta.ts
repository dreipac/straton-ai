/**
 * Browser-UI (unten/oben in installierten PWAs) an App-Hintergrund angleichen.
 * Entspricht CSS --app-background (theme.css).
 */
const THEME_COLOR_LIGHT = '#f3f5f9'
const THEME_COLOR_DARK = '#0b0f14'
const THEME_COLOR_BLACK = '#000000'

export function syncThemeColorMeta(): void {
  if (typeof document === 'undefined') {
    return
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    return
  }
  const isLight = document.documentElement.dataset.theme === 'light'
  const variant = document.documentElement.dataset.themeVariant ?? ''
  if (isLight) {
    meta.setAttribute('content', THEME_COLOR_LIGHT)
    return
  }
  if (variant === 'black') {
    meta.setAttribute('content', THEME_COLOR_BLACK)
    return
  }
  meta.setAttribute('content', THEME_COLOR_DARK)
}
