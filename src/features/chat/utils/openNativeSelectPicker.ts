/** System-Auswahl für `<select>` (iOS/PWA, Android). */
export function openNativeSelectPicker(select: HTMLSelectElement): void {
  if (typeof select.showPicker === 'function') {
    try {
      select.showPicker()
      return
    } catch {
      // showPicker kann trotz User-Geste fehlschlagen
    }
  }
  select.focus({ preventScroll: true })
  select.click()
}
