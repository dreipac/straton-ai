import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
import App from './App.tsx'
import {
  ACCENT_STORAGE_KEY,
  applyAccentPalette,
  DEFAULT_ACCENT_PALETTE_ID,
} from './features/settings/constants/accentPalettes'
import {
  applyHoverPalette,
  DEFAULT_HOVER_PALETTE_ID,
  HOVER_STORAGE_KEY,
} from './features/settings/constants/hoverPalettes'
import {
  applyMessageBoxPalette,
  DEFAULT_MESSAGE_BOX_PALETTE_ID,
  MESSAGE_BOX_STORAGE_KEY,
} from './features/settings/constants/messageBoxPalettes'
import {
  applyLearnPathTitleColorMode,
  readPersistedLearnPathTitleColorMode,
} from './features/settings/constants/learnPathTitleColor'
import { initViewportDebug } from './utils/viewportDebug'
import { subscribeSidebarScaleViewportSync } from './features/settings/uiSettings'
import { syncThemeColorMeta } from './utils/themeColorMeta'
import './styles/theme.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/menus.css'
import './styles/layout.css'
import './styles/chat.css'
import './styles/learn.css'
import './styles/settings.css'
import './styles/auth.css'
import './styles/mobile.css'

initViewportDebug()

const persistedTheme = window.localStorage.getItem('straton-theme')
const initialThemeMode =
  persistedTheme === 'light' || persistedTheme === 'dark' || persistedTheme === 'pink-glass'
    ? persistedTheme
    : 'dark'
document.documentElement.dataset.theme = initialThemeMode === 'light' ? 'light' : 'dark'
document.documentElement.dataset.themeVariant = initialThemeMode === 'pink-glass' ? 'pink-glass' : ''
syncThemeColorMeta()

subscribeSidebarScaleViewportSync()

const persistedChatBackground = window.localStorage.getItem('straton-chat-background')
const initialChatBackground = persistedChatBackground === 'space-stars' ? 'space-stars' : 'space-dark'
document.documentElement.dataset.chatBackground = initialChatBackground

const persistedAccentPaletteId = window.localStorage.getItem(ACCENT_STORAGE_KEY)
const initialAccentPaletteId = applyAccentPalette(persistedAccentPaletteId ?? DEFAULT_ACCENT_PALETTE_ID)
window.localStorage.setItem(ACCENT_STORAGE_KEY, initialAccentPaletteId)

const persistedHoverPaletteId = window.localStorage.getItem(HOVER_STORAGE_KEY)
const initialHoverPaletteId = applyHoverPalette(persistedHoverPaletteId ?? DEFAULT_HOVER_PALETTE_ID)
window.localStorage.setItem(HOVER_STORAGE_KEY, initialHoverPaletteId)

const persistedMessageBoxPaletteId = window.localStorage.getItem(MESSAGE_BOX_STORAGE_KEY)
const initialMessageBoxPaletteId = applyMessageBoxPalette(persistedMessageBoxPaletteId ?? DEFAULT_MESSAGE_BOX_PALETTE_ID)
window.localStorage.setItem(MESSAGE_BOX_STORAGE_KEY, initialMessageBoxPaletteId)

applyLearnPathTitleColorMode(readPersistedLearnPathTitleColorMode())

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
