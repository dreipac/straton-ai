// @ts-expect-error - Deno URL import
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

/** @see src/features/chat/constants/geminiModels.ts — IDs müssen übereinstimmen. */
export const GEMINI_MODEL_FLASH_LITE = 'gemini-3.1-flash-lite'
export const GEMINI_MODEL_FLASH = 'gemini-2.5-flash'
export const GEMINI_DEFAULT_CHAT_MODEL = GEMINI_MODEL_FLASH_LITE
export const GEMINI_CONTEXT_CACHE_INTENT = 'straton-intent-v1'
export const GEMINI_CONTEXT_CACHE_INSTANT_REPLY = 'straton-instant-reply-v2'
export const GEMINI_CONTEXT_CACHE_THINKING_ANALYZE = 'straton-thinking-analyze-gemini-v1'
export const GEMINI_CONTEXT_CACHE_THINKING_DRAFT = 'straton-thinking-draft-gemini-v1'
export const GEMINI_CONTEXT_CACHE_THINKING_REVIEW = 'straton-thinking-review-gemini-v1'
export const GEMINI_CONTEXT_CACHE_THINKING_REPLY = 'straton-thinking-reply-gemini-v1'
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
