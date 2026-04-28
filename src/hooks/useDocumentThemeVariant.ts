import { useSyncExternalStore } from 'react'

/** Entspricht `document.documentElement.dataset.themeVariant` (`data-theme-variant`). */
function subscribeThemeVariant(onStoreChange: () => void) {
  const el = document.documentElement
  const obs = new MutationObserver(onStoreChange)
  obs.observe(el, { attributes: true, attributeFilter: ['data-theme-variant'] })
  return () => obs.disconnect()
}

function getThemeVariantSnapshot(): string {
  return document.documentElement.dataset.themeVariant ?? ''
}

/**
 * Reagiert auf Theme-Wechsel (z. B. Pink Glass), ohne Profil/Context zu duplizieren.
 */
export function useDocumentThemeVariant(): string {
  return useSyncExternalStore(subscribeThemeVariant, getThemeVariantSnapshot, getThemeVariantSnapshot)
}
