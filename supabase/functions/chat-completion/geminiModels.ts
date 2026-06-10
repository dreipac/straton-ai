// @ts-expect-error - Deno URL import
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

/** @see src/features/chat/constants/geminiModels.ts — IDs müssen übereinstimmen. */
export const GEMINI_MODEL_FLASH_LITE = 'gemini-3.1-flash-lite'
export const GEMINI_MODEL_FLASH = 'gemini-2.5-flash'
export const GEMINI_MODEL_FLASH_3_PREVIEW = 'gemini-3-flash-preview'
export const GEMINI_DEFAULT_CHAT_MODEL = GEMINI_MODEL_FLASH_LITE
export const THINKING_GEMINI_MODEL_STANDARD_DEFAULT = GEMINI_MODEL_FLASH_LITE
export const THINKING_GEMINI_MODEL_RICH_DEFAULT = GEMINI_MODEL_FLASH_3_PREVIEW

export type ThinkingGeminiModelId =
  | typeof GEMINI_MODEL_FLASH_LITE
  | typeof GEMINI_MODEL_FLASH
  | typeof GEMINI_MODEL_FLASH_3_PREVIEW

export type ThinkingOutputTierEdge = 'standard' | 'rich'

export type ThinkingGeminiModelsConfigEdge = {
  standard: ThinkingGeminiModelId
  rich: ThinkingGeminiModelId
}

const THINKING_GEMINI_MODEL_IDS: ThinkingGeminiModelId[] = [
  GEMINI_MODEL_FLASH_LITE,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_FLASH_3_PREVIEW,
]

export function parseThinkingGeminiModelIdEdge(
  value: unknown,
  fallback: ThinkingGeminiModelId,
): ThinkingGeminiModelId {
  const model = typeof value === 'string' ? value.trim() : ''
  if (THINKING_GEMINI_MODEL_IDS.includes(model as ThinkingGeminiModelId)) {
    return model as ThinkingGeminiModelId
  }
  return fallback
}

export function resolveThinkingGeminiModelEdge(
  tier: ThinkingOutputTierEdge,
  config?: Partial<ThinkingGeminiModelsConfigEdge> | null,
  clientOverride?: unknown,
): ThinkingGeminiModelId {
  const standard = parseThinkingGeminiModelIdEdge(
    config?.standard,
    THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
  )
  const rich = parseThinkingGeminiModelIdEdge(config?.rich, THINKING_GEMINI_MODEL_RICH_DEFAULT)
  const target = tier === 'rich' ? rich : standard
  const override = parseThinkingGeminiModelIdEdge(clientOverride, target)
  return override
}

export function sanitizeThinkingOutputTierEdge(value: unknown): ThinkingOutputTierEdge {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw === 'rich' ? 'rich' : 'standard'
}

export async function fetchActiveThinkingGeminiModels(
  admin: SupabaseClient | null,
): Promise<ThinkingGeminiModelsConfigEdge> {
  if (!admin) {
    return {
      standard: THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
      rich: THINKING_GEMINI_MODEL_RICH_DEFAULT,
    }
  }
  try {
    const { data, error } = await admin
      .from('app_feature_flags')
      .select(
        'thinking_gemini_model_standard_active, thinking_gemini_model_rich_active',
      )
      .eq('id', 1)
      .maybeSingle()
    if (error || !data || typeof data !== 'object') {
      return {
        standard: THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
        rich: THINKING_GEMINI_MODEL_RICH_DEFAULT,
      }
    }
    const row = data as {
      thinking_gemini_model_standard_active?: unknown
      thinking_gemini_model_rich_active?: unknown
    }
    return {
      standard: parseThinkingGeminiModelIdEdge(
        row.thinking_gemini_model_standard_active,
        THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
      ),
      rich: parseThinkingGeminiModelIdEdge(
        row.thinking_gemini_model_rich_active,
        THINKING_GEMINI_MODEL_RICH_DEFAULT,
      ),
    }
  } catch {
    return {
      standard: THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
      rich: THINKING_GEMINI_MODEL_RICH_DEFAULT,
    }
  }
}
export const GEMINI_CONTEXT_CACHE_INTENT = 'straton-intent-v1'
export const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v2'
export const GEMINI_CONTEXT_CACHE_THINKING_ANALYZE = 'straton-thinking-analyze-gemini-v1'
export {
  GEMINI_CONTEXT_CACHE_THINKING_DRAFT_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_DRAFT_STANDARD,
  GEMINI_CONTEXT_CACHE_THINKING_REPLY_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_REPLY_STANDARD,
  GEMINI_CONTEXT_CACHE_THINKING_REVIEW_RICH,
  GEMINI_CONTEXT_CACHE_THINKING_REVIEW_STANDARD,
  resolveThinkingGeminiContextCacheKeyEdge,
} from './thinkingGeminiPromptCache.ts'
export const GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC = 'straton-learn-setup-topic-gemini-v1'
export const GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ = 'straton-learn-entry-quiz-gemini-v1'
export const GEMINI_CONTEXT_CACHE_LEARN_TUTOR = 'straton-learn-tutor-gemini-v1'
export const GEMINI_CONTEXT_CACHE_LEARN_HELP = 'straton-learn-help-gemini-v1'

export type LearnTelemetryModeEdge = 'learn_setup_topic' | 'learn_entry_quiz' | 'learn_tutor'

export function resolveLearnGeminiContextCacheKey(
  mode: LearnTelemetryModeEdge,
  clientKey?: string,
): string {
  const trimmed = typeof clientKey === 'string' ? clientKey.trim() : ''
  if (
    trimmed === GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC ||
    trimmed === GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ ||
    trimmed === GEMINI_CONTEXT_CACHE_LEARN_TUTOR ||
    trimmed === GEMINI_CONTEXT_CACHE_LEARN_HELP
  ) {
    return trimmed
  }
  if (mode === 'learn_setup_topic') {
    return GEMINI_CONTEXT_CACHE_LEARN_SETUP_TOPIC
  }
  if (mode === 'learn_entry_quiz') {
    return GEMINI_CONTEXT_CACHE_LEARN_ENTRY_QUIZ
  }
  return GEMINI_CONTEXT_CACHE_LEARN_TUTOR
}

function isGeminiInstantEnabledFromEnv(): boolean {
  const v = (Deno.env.get('GEMINI_INSTANT_ENABLED') ?? 'false').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/** Pro Request gesetzt — Quelle: `app_feature_flags.gemini_instant_enabled` (+ optional Env-Fallback). */
let requestGeminiInstantEnabled: boolean | null = null

export function setRequestGeminiInstantEnabled(enabled: boolean): void {
  requestGeminiInstantEnabled = enabled
}

export function isGeminiInstantEnabled(): boolean {
  if (requestGeminiInstantEnabled !== null) {
    return requestGeminiInstantEnabled
  }
  return isGeminiInstantEnabledFromEnv()
}

export async function fetchGeminiInstantEnabled(admin: SupabaseClient | null): Promise<boolean> {
  if (admin) {
    try {
      const { data, error } = await admin
        .from('app_feature_flags')
        .select('gemini_instant_enabled')
        .eq('id', 1)
        .maybeSingle()
      if (!error && data && typeof data === 'object') {
        const enabled = (data as { gemini_instant_enabled?: unknown }).gemini_instant_enabled
        if (enabled === true) {
          return true
        }
        if (enabled === false) {
          return isGeminiInstantEnabledFromEnv()
        }
      }
    } catch {
      /* fallback env */
    }
  }
  return isGeminiInstantEnabledFromEnv()
}
