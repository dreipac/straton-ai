import { applyAccentPalette, DEFAULT_ACCENT_PALETTE_ID } from './constants/accentPalettes'
import { applyHoverPalette, DEFAULT_HOVER_PALETTE_ID } from './constants/hoverPalettes'
import { applyLearnPathTitleColorMode, type LearnPathTitleColorMode } from './constants/learnPathTitleColor'
import { applyMessageBoxPalette, DEFAULT_MESSAGE_BOX_PALETTE_ID } from './constants/messageBoxPalettes'
import { writeAssistantEmojisEnabled } from '../chat/constants/chatAssistantStyle'
import { syncThemeColorMeta } from '../../utils/themeColorMeta'

export type ThemeMode = 'light' | 'dark' | 'pink-glass'
export type ChatBackgroundMode = 'space-dark' | 'space-stars'

/** Gleicher Breakpoint wie Chat/Sidebar mobil (`layout.css` / Settings). */
export const SIDEBAR_SCALE_MOBILE_LOCK_MQ = '(max-width: 860px)' as const

export function parseStoredSidebarPreference(): '100' | '75' {
  const raw = window.localStorage.getItem('straton-sidebar-scale')
  return raw === '100' ? '100' : '75'
}

/** Nur Anzeige: mobil immer 100 %, Desktop = gespeicherte Nutzerwahl. Schreibt nicht nach localStorage. */
export function applySidebarPreferenceToDocument(preference: '100' | '75'): void {
  const locked = window.matchMedia(SIDEBAR_SCALE_MOBILE_LOCK_MQ).matches
  document.documentElement.dataset.sidebarScale = locked ? '100' : preference
}

/** Nur die gewünschte Sidebar-Skalierung persistieren — nie «100» nur wegen Mobil-Viewport. */
export function persistSidebarPreferenceToStorage(preference: '100' | '75'): void {
  window.localStorage.setItem('straton-sidebar-scale', preference)
}

/** Bei Fensterbreiten-Wechsel: DOM anpassen, localStorage unverändert (enthält Desktop-Präferenz). */
export function subscribeSidebarScaleViewportSync(): () => void {
  const mq = window.matchMedia(SIDEBAR_SCALE_MOBILE_LOCK_MQ)
  const sync = () => {
    applySidebarPreferenceToDocument(parseStoredSidebarPreference())
  }
  sync()
  mq.addEventListener('change', sync)
  return () => {
    mq.removeEventListener('change', sync)
  }
}

export type UiSettingsV1 = {
  theme: ThemeMode
  sidebarScale: '100' | '75'
  chatBackground: ChatBackgroundMode
  accentPaletteId: string
  hoverPaletteId: string
  messageBoxPaletteId: string
  learnPathTitleColorMode: LearnPathTitleColorMode
  assistantEmojis: boolean
}

export function defaultUiSettings(): UiSettingsV1 {
  return {
    theme: 'dark',
    sidebarScale: '75',
    chatBackground: 'space-dark',
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
  const chatBackground =
    o.chatBackground === 'space-stars' || o.chatBackground === 'space-dark' ? o.chatBackground : d.chatBackground
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
    chatBackground,
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

  persistSidebarPreferenceToStorage(settings.sidebarScale)
  applySidebarPreferenceToDocument(settings.sidebarScale)

  document.documentElement.dataset.chatBackground = settings.chatBackground
  window.localStorage.setItem('straton-chat-background', settings.chatBackground)

  const accentId = applyAccentPalette(settings.accentPaletteId)
  window.localStorage.setItem('straton-accent-palette', accentId)

  const hoverId = applyHoverPalette(settings.hoverPaletteId)
  window.localStorage.setItem('straton-hover-palette', hoverId)

  const msgId = applyMessageBoxPalette(settings.messageBoxPaletteId)
  window.localStorage.setItem('straton-message-box-palette', msgId)

  applyLearnPathTitleColorMode(settings.learnPathTitleColorMode)

  writeAssistantEmojisEnabled(settings.assistantEmojis)

  syncThemeColorMeta()
}
