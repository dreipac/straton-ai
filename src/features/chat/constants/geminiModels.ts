/**
 * Offizielle Gemini-API-Modell-IDs (Google AI / Vertex).
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite
 */
export const GEMINI_MODEL_FLASH_LITE = 'gemini-3.1-flash-lite' as const

/** Sparsam: komplexe Multi-Dokument-/Tabellen-Merge-Fälle (Whitelist im Intent). */
export const GEMINI_MODEL_FLASH = 'gemini-2.5-flash' as const

export type GeminiChatModelId = typeof GEMINI_MODEL_FLASH_LITE | typeof GEMINI_MODEL_FLASH

export const GEMINI_DEFAULT_CHAT_MODEL: GeminiChatModelId = GEMINI_MODEL_FLASH_LITE

/** Stabiler Systemprompt-Prefix für Context Caching (Intent / Instant). */
export const GEMINI_CONTEXT_CACHE_INTENT = 'straton-intent-v1' as const

/** Hauptchat-Antwort (Instant, statischer Systemteil). */
export const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v1' as const

/** Thinking-Pipeline (Analyse, Entwurf, Review, finale Antwort). */
export const GEMINI_CONTEXT_CACHE_THINKING_ANALYZE = 'straton-thinking-analyze-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT = 'straton-thinking-draft-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW = 'straton-thinking-review-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY = 'straton-thinking-reply-gemini-v1' as const

export { isGeminiInstantEnabled } from '../services/geminiInstantFlag'

export function resolveGeminiModelForInstantReply(
  instantAnalyze?: { escalate_model?: boolean } | null,
): GeminiChatModelId {
  return instantAnalyze?.escalate_model === true ? GEMINI_MODEL_FLASH : GEMINI_MODEL_FLASH_LITE
}
