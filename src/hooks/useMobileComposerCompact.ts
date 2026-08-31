import { useSyncExternalStore } from 'react'
import { readMobileComposerCompact } from '../features/chat/constants/mobileComposerCompact'

function subscribeMobileComposerCompact(onStoreChange: () => void) {
  const el = document.documentElement
  const obs = new MutationObserver(onStoreChange)
  obs.observe(el, { attributes: true, attributeFilter: ['data-mobile-composer-compact'] })
  return () => obs.disconnect()
}

function getMobileComposerCompactSnapshot(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  const fromDom = document.documentElement.dataset.mobileComposerCompact
  if (fromDom === 'true') {
    return true
  }
  if (fromDom === 'false') {
    return false
  }
  return readMobileComposerCompact()
}

/** Nutzerwahl aus Einstellungen (nur sinnvoll unter Mobile-Breakpoint). */
export function useMobileComposerCompact(): boolean {
  return useSyncExternalStore(
    subscribeMobileComposerCompact,
    getMobileComposerCompactSnapshot,
    () => false,
  )
}
