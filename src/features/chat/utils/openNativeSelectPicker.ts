/** System-Auswahl für `<select>` (iOS/PWA, Android) — wie Toolbar-Titel/Menü. */
export function openNativeSelectPicker(select: HTMLSelectElement): void {
  const prevPointerEvents = select.style.pointerEvents
  select.style.pointerEvents = 'auto'
  select.focus({ preventScroll: true })

  if (typeof select.showPicker === 'function') {
    try {
      select.showPicker()
      select.style.pointerEvents = prevPointerEvents
      return
    } catch {
      /* showPicker schlägt auf iOS oft fehl — click() unten */
    }
  }

  select.click()
  select.style.pointerEvents = prevPointerEvents
}
