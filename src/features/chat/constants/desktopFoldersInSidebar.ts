const STORAGE_KEY = 'straton-desktop-folders-in-sidebar'

export function readDesktopFoldersInSidebar(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    return false
  }
  return raw === '1'
}

export function writeDesktopFoldersInSidebar(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  document.documentElement.dataset.desktopFoldersInSidebar = enabled ? 'true' : 'false'
}
