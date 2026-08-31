export const CHAT_THINKING_MODE_STORAGE_KEY = 'straton-chat-thinking-mode'

/**
 * Der Verarbeitungsweg eines Turns. Die Modellwahl liegt daneben in `composerModelId` — ein
 * ausgewähltes Modell läuft über denselben Weg wie `normal`, nur mit festem Modell.
 */
export type ChatThinkingMode = 'normal' | 'thinking'

export const CHAT_THINKING_MODE_OPTIONS: { id: ChatThinkingMode; label: string }[] = [
  { id: 'normal', label: 'Smart Instant' },
  { id: 'thinking', label: 'Thinking' },
]

export function parseStoredChatThinkingMode(raw: string | null): ChatThinkingMode {
  if (raw === 'thinking' || raw === 'normal') {
    return raw
  }
  return 'normal'
}

export function isMainChatThinkingMode(mode: ChatThinkingMode): boolean {
  return mode === 'thinking'
}

/** Smart Instant — mit und ohne festes Modell: Intent Analyze statt Thinking-Pipeline. */
export function isMainChatInstantAnalyzeMode(mode: ChatThinkingMode): boolean {
  return mode === 'normal'
}
