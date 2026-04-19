/**
 * Browser-UI (unten/oben in installierten PWAs) an App-Hintergrund angleichen.
 * Entspricht CSS --app-background: Hell #f3f5f9, Dunkel/Pink-Glass #0b0f14 (theme.css).
 */
const THEME_COLOR_LIGHT = '#f3f5f9'
const THEME_COLOR_DARK = '#0b0f14'

export function syncThemeColorMeta(): void {
  if (typeof document === 'undefined') {
    return
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    return
  }
  const isLight = document.documentElement.dataset.theme === 'light'
  meta.setAttribute('content', isLight ? THEME_COLOR_LIGHT : THEME_COLOR_DARK)
}
