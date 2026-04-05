import { applyAccentPalette, DEFAULT_ACCENT_PALETTE_ID } from './constants/accentPalettes'
import { applyHoverPalette, DEFAULT_HOVER_PALETTE_ID } from './constants/hoverPalettes'
import { applyLearnPathTitleColorMode, type LearnPathTitleColorMode } from './constants/learnPathTitleColor'
import { applyMessageBoxPalette, DEFAULT_MESSAGE_BOX_PALETTE_ID } from './constants/messageBoxPalettes'
import { writeAssistantEmojisEnabled } from '../chat/constants/chatAssistantStyle'

export type ThemeMode = 'light' | 'dark' | 'pink-glass'

export type UiSettingsV1 = {
  theme: ThemeMode
  sidebarScale: '100' | '75'
  accentPaletteId: string
  hoverPaletteId: string
  messageBoxPaletteId: string
  learnPathTitleColorMode: LearnPathTitleColorMode
  assistantEmojis: boolean
}

export function defaultUiSettings(): UiSettingsV1 {
  return {
    theme: 'dark',
    sidebarScale: '100',
    accentPaletteId: DEFAULT_ACCENT_PALETTE_ID,
    hoverPaletteId: DEFAULT_HOVER_PALETTE_ID,
    messageBoxPaletteId: DEFAULT_MESSAGE_BOX_PALETTE_ID,
    learnPathTitleColorMode: 'neutral',
    assistantEmojis: true,
  }
}

const THEMES: ThemeMode[] = ['light', 'dark', 'pink-glass']

function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && (THEMES as string[]).includes(v)
}

export function parseUiSettings(raw: unknown): UiSettingsV1 {
  const d = defaultUiSettings()
  if (!raw || typeof raw !== 'object') {
    return d
  }
  const o = raw as Record<string, unknown>
  const theme = isThemeMode(o.theme) ? o.theme : d.theme
  const sidebarScale = o.sidebarScale === '75' || o.sidebarScale === '100' ? o.sidebarScale : d.sidebarScale
  const accentPaletteId = typeof o.accentPaletteId === 'string' && o.accentPaletteId.trim() ? o.accentPaletteId : d.accentPaletteId
  const hoverPaletteId = typeof o.hoverPaletteId === 'string' && o.hoverPaletteId.trim() ? o.hoverPaletteId : d.hoverPaletteId
  const messageBoxPaletteId =
    typeof o.messageBoxPaletteId === 'string' && o.messageBoxPaletteId.trim()
      ? o.messageBoxPaletteId
      : d.messageBoxPaletteId
  const learnPathTitleColorMode =
    o.learnPathTitleColorMode === 'accent' || o.learnPathTitleColorMode === 'neutral'
      ? o.learnPathTitleColorMode
      : d.learnPathTitleColorMode
  const assistantEmojis = o.assistantEmojis === false ? false : o.assistantEmojis === true ? true : d.assistantEmojis

  return {
    theme,
    sidebarScale,
    accentPaletteId,
    hoverPaletteId,
    messageBoxPaletteId,
    learnPathTitleColorMode,
    assistantEmojis,
  }
}

/** DOM + localStorage (wie bisherige SettingsPage-Effekte). */
export function applyUiSettingsToDocument(settings: UiSettingsV1): void {
  const baseTheme = settings.theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = baseTheme
  document.documentElement.dataset.themeVariant = settings.theme === 'pink-glass' ? 'pink-glass' : ''
  window.localStorage.setItem('straton-theme', settings.theme)

  document.documentElement.dataset.sidebarScale = settings.sidebarScale
  window.localStorage.setItem('straton-sidebar-scale', settings.sidebarScale)

  const accentId = applyAccentPalette(settings.accentPaletteId)
  window.localStorage.setItem('straton-accent-palette', accentId)

  const hoverId = applyHoverPalette(settings.hoverPaletteId)
  window.localStorage.setItem('straton-hover-palette', hoverId)

  const msgId = applyMessageBoxPalette(settings.messageBoxPaletteId)
  window.localStorage.setItem('straton-message-box-palette', msgId)

  applyLearnPathTitleColorMode(settings.learnPathTitleColorMode)

  writeAssistantEmojisEnabled(settings.assistantEmojis)
}
