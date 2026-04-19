/**
 * Sichtbare App-Höhe als CSS-Variable (typ. visualViewport in PWA).
 * Tastatur, Rotation, Android-Nav: visualViewport passt sich an; innerHeight nur Fallback.
 */
export function initAppHeightSync(): void {
  if (typeof window === 'undefined') {
    return
  }

  const apply = () => {
    const h = window.visualViewport?.height ?? window.innerHeight
    if (h > 0) {
      document.documentElement.style.setProperty('--straton-app-height', `${Math.round(h)}px`)
    }
  }

  apply()
  window.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('resize', apply)

  window.addEventListener('orientationchange', () => {
    setTimeout(apply, 100)
    setTimeout(apply, 120)
    setTimeout(apply, 400)
  })
}
