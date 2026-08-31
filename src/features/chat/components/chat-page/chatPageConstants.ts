import type { SettingsSectionId } from '../../../../pages/SettingsPage'

/** Gleicher Breakpoint wie `layout.css` Mobile-Sidebar (`max-width: 860px`). */
export const COMPACT_MOBILE_SIDEBAR_MAX_PX = 860

export const CHAT_PAGE_MODAL_ANIMATION_MS = 220

export const CHAT_PAGE_LONG_PRESS_MS = 520

export const CHAT_PAGE_LONG_PRESS_MOVE_CANCEL_PX = 14

/** Pastell-Akzente für Toolbar-Avatare (stabil pro userId). */
export const CHAT_TOOLBAR_AVATAR_ACCENTS = [
  '#e0e7ff',
  '#dbeafe',
  '#cffafe',
  '#d1fae5',
  '#fef9c3',
  '#ffedd5',
  '#fce7f3',
  '#ede9fe',
  '#f3e8ff',
]

/** Menüpunkt-Labels wie in den Desktop-Einstellungen (DE), Reihenfolge: Konto zuerst. */
export const PROFILE_SETTINGS_SHEET_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'account', label: 'Mein Konto' },
  { id: 'billing', label: 'Nutzung & Abonnement' },
  { id: 'security', label: 'Sicherheit & Login' },
  { id: 'introduction', label: 'Personalisieren' },
  { id: 'general', label: 'Allgemein' },
  { id: 'personalize', label: 'Erscheinungsbild' },
  { id: 'feedback', label: 'Problem melden' },
  { id: 'straton', label: 'Straton' },
]
