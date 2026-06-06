export const CHAT_THINKING_MODE_STORAGE_KEY = 'straton-chat-thinking-mode'

export type ChatThinkingMode = 'normal' | 'thinking' | 'custom'

export const CHAT_THINKING_MODE_OPTIONS: { id: ChatThinkingMode; label: string }[] = [
  { id: 'normal', label: 'Smart Instant' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'custom', label: 'Custom' },
]

export function parseStoredChatThinkingMode(raw: string | null): ChatThinkingMode {
  if (raw === 'thinking' || raw === 'normal' || raw === 'custom') {
    return raw
  }
  return 'normal'
}

export function isMainChatThinkingMode(mode: ChatThinkingMode): boolean {
  return mode === 'thinking'
}

export function isMainChatCustomMode(mode: ChatThinkingMode): boolean {
  return mode === 'custom'
}

/** Smart Instant + Custom: Intent Analyze, kein Thinking-Pipeline. */
export function isMainChatInstantAnalyzeMode(mode: ChatThinkingMode): boolean {
  return mode === 'normal' || mode === 'custom'
}

export function filterChatThinkingModeOptions(allowCustomMode: boolean) {
  return CHAT_THINKING_MODE_OPTIONS.filter((option) => option.id !== 'custom' || allowCustomMode)
}
