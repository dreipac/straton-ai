export const CHAT_REPLY_MODE_STORAGE_KEY = 'straton-chat-reply-mode'

export type ChatReplyMode = 'comfort' | 'strict'

export const CHAT_REPLY_MODE_OPTIONS: { id: ChatReplyMode; label: string }[] = [
  { id: 'comfort', label: 'Comfort' },
  { id: 'strict', label: 'Strict' },
]

export function parseStoredChatReplyMode(raw: string | null): ChatReplyMode {
  if (raw === 'strict' || raw === 'comfort') {
    return raw
  }
  return 'comfort'
}
