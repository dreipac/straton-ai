import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
import './styles/base.css'
import './styles/ui.css'
import './styles/menus.css'
import './styles/layout.css'
import './styles/chat.css'
import './styles/settings.css'
import './styles/auth.css'

const persistedTheme = window.localStorage.getItem('straton-theme')
const initialTheme =
  persistedTheme === 'light' || persistedTheme === 'dark' ? persistedTheme : 'dark'
document.documentElement.dataset.theme = initialTheme

const persistedSidebarScale = window.localStorage.getItem('straton-sidebar-scale')
const initialSidebarScale = persistedSidebarScale === '75' ? '75' : '100'
document.documentElement.dataset.sidebarScale = initialSidebarScale

const persistedAccentPaletteId = window.localStorage.getItem(ACCENT_STORAGE_KEY)
const initialAccentPaletteId = applyAccentPalette(persistedAccentPaletteId ?? DEFAULT_ACCENT_PALETTE_ID)
window.localStorage.setItem(ACCENT_STORAGE_KEY, initialAccentPaletteId)

const persistedHoverPaletteId = window.localStorage.getItem(HOVER_STORAGE_KEY)
const initialHoverPaletteId = applyHoverPalette(persistedHoverPaletteId ?? DEFAULT_HOVER_PALETTE_ID)
window.localStorage.setItem(HOVER_STORAGE_KEY, initialHoverPaletteId)

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
