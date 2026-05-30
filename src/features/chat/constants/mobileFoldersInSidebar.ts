const STORAGE_KEY = 'straton-mobile-folders-in-sidebar'

export function readMobileFoldersInSidebar(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function writeMobileFoldersInSidebar(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  document.documentElement.dataset.mobileFoldersInSidebar = enabled ? 'true' : 'false'
}
