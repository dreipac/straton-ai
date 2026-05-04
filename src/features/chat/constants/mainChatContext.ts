import type { ChatMessage } from '../types'

/**
 * Fallback, wenn kein Abo zugewiesen ist: Chat-Verlauf auf geschätzte Tokens begrenzen.
 * Mit Abo: Wert aus `subscription_plans.chat_context_max_tokens` (NULL dort = unbegrenzt).
 */
export const DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS = 12_000

export function estimateMessageTokensFromCharLength(length: number): number {
  return Math.max(1, Math.ceil(length / 4))
}

function clipTextToMaxEstimatedTokens(raw: string, maxTokens: number): string {
  const t = raw
  if (t.length === 0) {
    return t
  }
  if (estimateMessageTokensFromCharLength(t.length) <= maxTokens) {
    return t
  }
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (estimateMessageTokensFromCharLength(mid) <= maxTokens) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return t.slice(0, lo)
}

/**
 * Behält die neuesten Nachrichten, bis die Summe der geschätzten Tokens ≤ `maxTokens`.
 * Eine einzelne riesige Nachricht wird am Anfang gekürzt (neueste zuerst).
 */
export function clipChatMessagesToEstimatedTokenBudget(
  messages: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  if (messages.length === 0 || maxTokens <= 0) {
    return messages
  }

  let total = 0
  const kept: ChatMessage[] = []

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!
    const c = typeof m.content === 'string' ? m.content : ''
    const t = estimateMessageTokensFromCharLength(c.length)
    if (total + t <= maxTokens) {
      kept.unshift(m)
      total += t
    } else if (kept.length === 0) {
      const clippedContent = clipTextToMaxEstimatedTokens(c, maxTokens)
      kept.unshift({ ...m, content: clippedContent })
      break
    } else {
      break
    }
  }

  return kept
}
