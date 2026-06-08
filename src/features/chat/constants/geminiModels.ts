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
export const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v2' as const

/** Thinking-Pipeline (Analyse, Entwurf, Review, finale Antwort). */
export const GEMINI_CONTEXT_CACHE_THINKING_ANALYZE = 'straton-thinking-analyze-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT = 'straton-thinking-draft-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW = 'straton-thinking-review-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY = 'straton-thinking-reply-gemini-v1' as const

/** Lernpfad: stabiler Systemprompt (Context Cache) — getrennt je Aufgabentyp. */
export const GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC = 'straton-learn-setup-topic-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ = 'straton-learn-entry-quiz-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_TUTOR = 'straton-learn-tutor-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_HELP = 'straton-learn-help-gemini-v1' as const

export type LearnTelemetryMode = 'learn_setup_topic' | 'learn_entry_quiz' | 'learn_tutor'

export function resolveLearnGeminiPromptCacheKey(
  mode: LearnTelemetryMode,
  options?: { learnPathSystemPromptMode?: 'default' | 'tutor_only' },
): string {
  if (mode === 'learn_setup_topic') {
    return GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC
  }
  if (mode === 'learn_entry_quiz') {
    return GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ
  }
  if (options?.learnPathSystemPromptMode === 'tutor_only') {
    return GEMINI_CONTEXT_CACHE_LEARN_TUTOR
  }
  return GEMINI_CONTEXT_CACHE_LEARN_HELP
}

export function resolveLearnOpenAiPromptCacheKey(
  mode: LearnTelemetryMode,
  options?: { learnPathSystemPromptMode?: 'default' | 'tutor_only' },
): string {
  if (mode === 'learn_setup_topic') {
    return 'straton-learn-setup-openai-v1'
  }
  if (mode === 'learn_entry_quiz') {
    return 'straton-learn-entry-quiz-openai-v1'
  }
  if (options?.learnPathSystemPromptMode === 'tutor_only') {
    return 'straton-learn-tutor-openai-v1'
  }
  return 'straton-learn-help-openai-v1'
}

export { isGeminiInstantEnabled } from '../services/geminiInstantFlag'

export function resolveGeminiModelForInstantReply(
  instantAnalyze?: { escalate_model?: boolean } | null,
): GeminiChatModelId {
  return instantAnalyze?.escalate_model === true ? GEMINI_MODEL_FLASH : GEMINI_MODEL_FLASH_LITE
}
