/**
 * Setzt `--straton-app-height` auf die tatsächliche Viewport-Höhe (px).
 * Auf Android-PWAs weichen `dvh`/`vh` oft von `window.innerHeight` ab — unten bleibt
 * dann eine Zone, die nur per theme-color gefüllt wirkt, ohne dass die App dort endet.
 */
export function initAppHeightSync(): void {
  if (typeof window === 'undefined') {
    return
  }

  const apply = () => {
    const h = window.innerHeight
    if (h > 0) {
      document.documentElement.style.setProperty('--straton-app-height', `${h}px`)
    }
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => {
    setTimeout(apply, 120)
    setTimeout(apply, 400)
  })
}
