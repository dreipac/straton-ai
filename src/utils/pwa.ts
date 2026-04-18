/**
 * True wenn die App als installierte PWA läuft (Android/Desktop Chrome + iOS „Zum Home-Bildschirm“).
 */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  if (standalone === true) {
    return true
  }

  const displayModes = ['standalone', 'fullscreen', 'minimal-ui'] as const
  for (const mode of displayModes) {
    try {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) {
        return true
      }
    } catch {
      /* ältere Engines */
    }
  }

  return false
}
