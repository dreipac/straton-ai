const STORAGE_KEY = 'straton-mobile-composer-compact'

export function readMobileComposerCompact(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function writeMobileComposerCompact(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  document.documentElement.dataset.mobileComposerCompact = enabled ? 'true' : 'false'
}
