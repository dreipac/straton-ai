import type { ChatMessage } from '../types'

export function messageHasVisionPayload(content: string): boolean {
  return content.includes('[BildData:') || content.includes('@chat-media:')
}

/**
 * Fallback, wenn kein Abo zugewiesen ist: Chat-Verlauf auf geschätzte Tokens begrenzen.
 * Mit Abo: Wert aus `subscription_plans.chat_context_max_tokens` (NULL dort = unbegrenzt).
 */
export const DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS = 12_000

/** Ab dieser Nachrichtenzahl zusätzlich RAG-lite (Stichwort-Snippets aus älteren Turns). */
export const MAIN_CHAT_RAG_OVERFLOW_MESSAGE_COUNT = 200

/** Vision-Kontext: letzte N User-Nachrichten mit Bild vollständig an das Modell. */
export const VISION_CONTEXT_IMAGE_LIMIT = 2

/** Grobe Vision-Kosten pro Bild (`detail: low`, komprimiertes JPEG). */
export const BILDDATA_BLOCK_ESTIMATED_TOKENS = 1_200

export function estimateMessageTokensFromCharLength(length: number): number {
  return Math.max(1, Math.ceil(length / 4))
}

export function estimateMessageContentTokens(content: string): number {
  if (!content.includes('[BildData:')) {
    return estimateMessageTokensFromCharLength(content.length)
  }
  const textOnly = content.replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, ' ').trim()
  const blockCount = (content.match(/\[BildData:[^\]]*\]/g) ?? []).length
  return (
    estimateMessageTokensFromCharLength(textOnly.length) +
    Math.max(1, blockCount) * BILDDATA_BLOCK_ESTIMATED_TOKENS
  )
}

/** Anzahl User-Nachrichten mit Bild im Thread (für Reserve vor Token-Clip). */
export function countVisionUserMessagesInThread(messages: ChatMessage[]): number {
  let n = 0
  for (const m of messages) {
    if (m.role === 'user' && messageHasVisionPayload(m.content)) {
      n += 1
    }
  }
  return n
}

export function computeVisionTokenReserve(
  messages: ChatMessage[],
  pendingVisionImages = 0,
): number {
  const inThread = countVisionUserMessagesInThread(messages)
  const count = Math.min(VISION_CONTEXT_IMAGE_LIMIT, inThread + pendingVisionImages)
  return count * BILDDATA_BLOCK_ESTIMATED_TOKENS
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
    const t = estimateMessageContentTokens(c)
    if (total + t <= maxTokens) {
      kept.unshift(m)
      total += t
    } else if (kept.length === 0) {
      const clippedContent = c.includes('[BildData:')
        ? c
        : clipTextToMaxEstimatedTokens(c, maxTokens)
      kept.unshift({ ...m, content: clippedContent })
      break
    } else {
      break
    }
  }

  return kept
}

export type ThreadContextUsageEstimate = {
  usedTokens: number
  maxTokens: number | null
  percent: number | null
  messageCountInContext: number
  totalMessageCount: number
  visionImagesInContext: number
  ragOverflowActive: boolean
}
