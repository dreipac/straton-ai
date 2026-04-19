/**
 * Sichtbare App-Höhe als CSS-Variable für Layout (volle Fläche ohne unteren Balken).
 *
 * - iOS installierte PWA: `visualViewport.height` kann **kleiner** als `innerHeight` sein
 *   (Home-Indicator-Safe-Area wird doppelt / falsch berücksichtigt) → schwarzer Streifen unten.
 *   Dann: `Math.max(innerHeight, visualViewport.height)`.
 * - Tastatur / Overlay: sichtbarer Bereich schrumpft stark → nur `visualViewport.height` nutzen.
 */
function resolveAppHeightPx(): number {
  const innerH = window.innerHeight
  const vv = window.visualViewport
  const vvH = vv?.height ?? innerH

  if (!Number.isFinite(innerH) || innerH <= 0) {
    return Math.max(1, Math.round(vvH))
  }

  if (!vv) {
    return Math.round(innerH)
  }

  const delta = innerH - vvH
  // Große Differenz: typisch virtuelle Tastatur / anderer sichtbarer Ausschnitt (iOS: inner bleibt oft hoch)
  const keyboardOrStrongInsetLikely = delta > 96 || vvH < innerH * 0.78

  if (keyboardOrStrongInsetLikely) {
    return Math.max(1, Math.round(vvH))
  }

  // Normal: volle Höhe ohne iOS-Unter-Messung
  return Math.max(1, Math.round(Math.max(innerH, vvH)))
}

export function initAppHeightSync(): void {
  if (typeof window === 'undefined') {
    return
  }

  const apply = () => {
    const h = resolveAppHeightPx()
    document.documentElement.style.setProperty('--straton-app-height', `${h}px`)
  }

  apply()
  window.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)

  window.addEventListener('orientationchange', () => {
    setTimeout(apply, 100)
    setTimeout(apply, 120)
    setTimeout(apply, 400)
  })
}
