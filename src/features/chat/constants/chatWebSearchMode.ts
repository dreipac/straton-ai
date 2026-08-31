export const CHAT_WEB_SEARCH_MODE_STORAGE_KEY = 'straton-chat-web-search-mode'

/**
 * Steuert, ob ein Turn im Hauptchat die Live-Websuche nutzt.
 * - `auto`: die Analyse entscheidet pro Frage (Standard, bisheriges Verhalten)
 * - `on`: immer suchen, auch wenn die Analyse es nicht für nötig hält
 * - `off`: nie suchen
 */
export type ChatWebSearchMode = 'off' | 'auto' | 'on'

export const CHAT_WEB_SEARCH_MODE_OPTIONS: { id: ChatWebSearchMode; label: string }[] = [
  { id: 'off', label: 'Aus' },
  { id: 'auto', label: 'Automatisch' },
  { id: 'on', label: 'Ein' },
]

/** Kurzform neben dem Menüeintrag — dort ist wenig Platz. */
const SHORT_LABELS: Record<ChatWebSearchMode, string> = {
  off: 'Aus',
  auto: 'Auto',
  on: 'Ein',
}

export function getChatWebSearchModeShortLabel(mode: ChatWebSearchMode): string {
  return SHORT_LABELS[mode]
}

export function parseStoredChatWebSearchMode(raw: string | null): ChatWebSearchMode {
  if (raw === 'off' || raw === 'auto' || raw === 'on') {
    return raw
  }
  return 'auto'
}
