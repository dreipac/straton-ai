/**
 * Obergrenze für `profiles.ai_chat_memory` in **Tokens** (grobe Schätzung wie
 * `estimate_tokens_from_text` in Postgres: ceil(zeichen/4)).
 * Muss mit der Edge Function `chat-completion` (Merge + Einlesen) übereinstimmen.
 */
export const AI_CHAT_MEMORY_MAX_TOKENS = 1000

/** Obsolete Namensgebung — historisch Zeichen; Nutze {@link clipAiChatMemoryToMaxTokens}. */
export const AI_CHAT_MEMORY_MAX_CHARS = AI_CHAT_MEMORY_MAX_TOKENS * 4

function estimateTokensFromCharLength(length: number): number {
  return Math.max(1, Math.ceil(length / 4))
}

/**
 * Kürzt Text so, dass die Token-Schätzung ≤ {@link AI_CHAT_MEMORY_MAX_TOKENS} bleibt.
 */
export function clipAiChatMemoryToMaxTokens(raw: string): string {
  const t = raw.trim()
  if (t.length === 0) {
    return t
  }
  if (estimateTokensFromCharLength(t.length) <= AI_CHAT_MEMORY_MAX_TOKENS) {
    return t
  }
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (estimateTokensFromCharLength(mid) <= AI_CHAT_MEMORY_MAX_TOKENS) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return t.slice(0, lo)
}
