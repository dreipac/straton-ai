/**
 * Offizielle Gemini-API-Modell-IDs (Google AI / Vertex).
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite
 */
export const GEMINI_MODEL_FLASH_LITE = 'gemini-3.1-flash-lite' as const

/** Sparsam: komplexe Multi-Dokument-/Tabellen-Merge-Fälle (Whitelist im Intent). */
export const GEMINI_MODEL_FLASH = 'gemini-2.5-flash' as const

/** Thinking Rich-Tier: Zusammenfassungen und komplexe Aufgaben. */
export const GEMINI_MODEL_FLASH_3_PREVIEW = 'gemini-3-flash-preview' as const

export const THINKING_GEMINI_MODEL_IDS = [
  GEMINI_MODEL_FLASH_LITE,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_FLASH_3_PREVIEW,
] as const

export type ThinkingGeminiModelId = (typeof THINKING_GEMINI_MODEL_IDS)[number]

export const THINKING_GEMINI_MODEL_STANDARD_DEFAULT: ThinkingGeminiModelId = GEMINI_MODEL_FLASH_LITE
export const THINKING_GEMINI_MODEL_RICH_DEFAULT: ThinkingGeminiModelId = GEMINI_MODEL_FLASH_3_PREVIEW

export type ThinkingGeminiModelsConfig = {
  standard: ThinkingGeminiModelId
  rich: ThinkingGeminiModelId
}

export type GeminiChatModelId =
  | typeof GEMINI_MODEL_FLASH_LITE
  | typeof GEMINI_MODEL_FLASH
  | typeof GEMINI_MODEL_FLASH_3_PREVIEW

export const GEMINI_DEFAULT_CHAT_MODEL: GeminiChatModelId = GEMINI_MODEL_FLASH_LITE

/** Stabiler Systemprompt-Prefix für Context Caching (Intent / Instant). */
export const GEMINI_CONTEXT_CACHE_INTENT = 'straton-intent-v4' as const

/** Hauptchat-Antwort (Instant, statischer Systemteil). */
export const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v3' as const

/** Thinking-Pipeline (Analyse). */
export const GEMINI_CONTEXT_CACHE_THINKING_ANALYZE = 'straton-thinking-analyze-gemini-v1' as const

export {
  GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD,
  GEMINI_CONTEXT_CACHE_THINKING_REPLY_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_REPLY_STANDARD,
  GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD,
  resolveThinkingGeminiContextCacheKey,
  type ThinkingGeminiCacheMode,
} from './thinkingGeminiPromptCache'

/** @deprecated Legacy — nutze tier-spezifische Keys via resolveThinkingGeminiContextCacheKey. */
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT =
  'straton-thinking-draft-standard-gemini-v1' as const
/** @deprecated Legacy — nutze tier-spezifische Keys via resolveThinkingGeminiContextCacheKey. */
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW =
  'straton-thinking-review-standard-gemini-v1' as const
/** @deprecated Legacy — nutze tier-spezifische Keys via resolveThinkingGeminiContextCacheKey. */
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY =
  'straton-thinking-reply-standard-gemini-v1' as const

/** Lernpfad: stabiler Systemprompt (Context Cache) — getrennt je Aufgabentyp. */
export const GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC = 'straton-learn-setup-topic-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ = 'straton-learn-entry-quiz-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_TUTOR = 'straton-learn-tutor-gemini-v1' as const
export const GEMINI_CONTEXT_CACHE_LEARN_HELP = 'straton-learn-help-gemini-v1' as const

export type LearnTelemetryMode = 'learn_setup_topic' | 'learn_entry_quiz' | 'learn_tutor' | 'learn_syllabus'

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
  if (mode === 'learn_syllabus') {
    return GEMINI_CONTEXT_CACHE_LEARN_TUTOR
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
  if (mode === 'learn_syllabus') {
    return 'straton-learn-syllabus-openai-v1'
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

export function parseThinkingGeminiModelId(
  value: unknown,
  fallback: ThinkingGeminiModelId,
): ThinkingGeminiModelId {
  const model = typeof value === 'string' ? value.trim() : ''
  if (THINKING_GEMINI_MODEL_IDS.includes(model as ThinkingGeminiModelId)) {
    return model as ThinkingGeminiModelId
  }
  return fallback
}

export function resolveThinkingGeminiModel(
  tier: 'standard' | 'rich',
  config?: Partial<ThinkingGeminiModelsConfig> | null,
): ThinkingGeminiModelId {
  const standard = parseThinkingGeminiModelId(
    config?.standard,
    THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
  )
  const rich = parseThinkingGeminiModelId(config?.rich, THINKING_GEMINI_MODEL_RICH_DEFAULT)
  return tier === 'rich' ? rich : standard
}

/** Admin-konfigurierbares Modell für die Intent-Analyze-Stufen (Instant/Thinking). */
export const ANALYZE_MODEL_IDS = [
  GEMINI_MODEL_FLASH_LITE,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_FLASH_3_PREVIEW,
  'gpt-4o-mini',
  'gpt-5-mini',
  'gpt-5.4-mini',
  'gpt-5.4',
] as const

export type AnalyzeModelId = (typeof ANALYZE_MODEL_IDS)[number]

export const ANALYZE_MODEL_DEFAULT: AnalyzeModelId = GEMINI_MODEL_FLASH_LITE

export function parseAnalyzeModelId(
  value: unknown,
  fallback: AnalyzeModelId = ANALYZE_MODEL_DEFAULT,
): AnalyzeModelId {
  const v = typeof value === 'string' ? value.trim() : ''
  return (ANALYZE_MODEL_IDS as readonly string[]).includes(v) ? (v as AnalyzeModelId) : fallback
}
