/**
 * Kurzes haptisches Feedback (Web Vibration API).
 * Unterstützt u. a. Chrome/Android und einige Desktop-Browser.
 * Safari auf iOS (inkl. „Zum Home-Bildschirm“-PWA) bietet diese API in der Regel nicht — dann passiert schlicht nichts.
 */
export function hapticLightImpact(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14)
    }
  } catch {
    // ignorieren (z. B. unsichere Kontexte)
  }
}
