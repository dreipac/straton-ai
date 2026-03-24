export const LEARN_PATH_TITLE_COLOR_STORAGE_KEY = 'straton-learn-path-title-color'

export type LearnPathTitleColorMode = 'neutral' | 'accent'

export function readPersistedLearnPathTitleColorMode(): LearnPathTitleColorMode {
  const raw = window.localStorage.getItem(LEARN_PATH_TITLE_COLOR_STORAGE_KEY)
  return raw === 'accent' ? 'accent' : 'neutral'
}

export function applyLearnPathTitleColorMode(mode: LearnPathTitleColorMode): void {
  document.documentElement.dataset.learnPathTitleColor = mode
  window.localStorage.setItem(LEARN_PATH_TITLE_COLOR_STORAGE_KEY, mode)
}
