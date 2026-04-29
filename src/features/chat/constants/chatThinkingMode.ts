export const CHAT_THINKING_MODE_STORAGE_KEY = 'straton-chat-thinking-mode'

export type ChatThinkingMode = 'normal' | 'thinking'

export const CHAT_THINKING_MODE_OPTIONS: { id: ChatThinkingMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'thinking', label: 'Thinking' },
]

export function parseStoredChatThinkingMode(raw: string | null): ChatThinkingMode {
  if (raw === 'thinking' || raw === 'normal') {
    return raw
  }
  return 'normal'
}
