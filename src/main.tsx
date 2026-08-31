import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App.tsx'
import {
  ACCENT_STORAGE_KEY,
  applyAccentPalette,
  DEFAULT_ACCENT_PALETTE_ID,
} from './features/settings/constants/accentPalettes'
import { initViewportDebug } from './utils/viewportDebug'
import {
  subscribeSidebarScaleViewportSync,
  themeModeToDatasetVariant,
  type ThemeMode,
} from './features/settings/constants/uiSettings'
import { syncThemeColorMeta } from './utils/themeColorMeta'
import './styles/theme.css'
import './styles/squircle.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/menus.css'
import './styles/layout.css'
import './styles/chat.css'
import './styles/chat-folders.css'
import './styles/chat-learn-workspace.css'
import './styles/chat-folder-overview.css'
import './styles/chat-friends-overview.css'
import './styles/chat-news-overview.css'
import './styles/chat-home-dashboard.css'
import './styles/chat-due-flashcards.css'
import './styles/learn.css'
import './styles/learn-map.css'
import './styles/learn-brain.css'
import './styles/settings.css'
import './styles/chat-settings-workspace.css'
import './styles/auth.css'
import './styles/mobile.css'
import './styles/toast.css'
import './styles/news.css'

initViewportDebug()

const persistedTheme = window.localStorage.getItem('straton-theme')
const initialThemeMode: ThemeMode =
  persistedTheme === 'light' ||
  persistedTheme === 'dark' ||
  persistedTheme === 'pink-glass' ||
  persistedTheme === 'black'
    ? (persistedTheme as ThemeMode)
    : 'light'
document.documentElement.dataset.theme = initialThemeMode === 'light' ? 'light' : 'dark'
document.documentElement.dataset.themeVariant = themeModeToDatasetVariant(initialThemeMode)
syncThemeColorMeta()

subscribeSidebarScaleViewportSync()

const persistedChatBackground = window.localStorage.getItem('straton-chat-background')
const initialChatBackground = persistedChatBackground === 'space-stars' ? 'space-stars' : 'space-dark'
document.documentElement.dataset.chatBackground = initialChatBackground

const persistedAccentPaletteId = window.localStorage.getItem(ACCENT_STORAGE_KEY)
const initialAccentPaletteId = applyAccentPalette(persistedAccentPaletteId ?? DEFAULT_ACCENT_PALETTE_ID)
window.localStorage.setItem(ACCENT_STORAGE_KEY, initialAccentPaletteId)

const persistedLanguage = window.localStorage.getItem('straton-language')
document.documentElement.lang =
  persistedLanguage === 'en' ||
  persistedLanguage === 'hr' ||
  persistedLanguage === 'it' ||
  persistedLanguage === 'sq' ||
  persistedLanguage === 'es-PE'
    ? persistedLanguage
    : 'de'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
