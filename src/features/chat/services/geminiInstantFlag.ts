import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'

/**
 * Smart Instant Gemini — Schalter aus Supabase (`app_feature_flags.gemini_instant_enabled`).
 * Wird nach Login per `get_app_feature_flags` gesetzt (lokal + Produktion gleich).
 */
let geminiInstantEnabledFromSupabase: boolean | null = null
let geminiInstantFlagLoadPromise: Promise<void> | null = null

export function setGeminiInstantEnabledFromSupabase(enabled: boolean): void {
  geminiInstantEnabledFromSupabase = enabled
}

export function clearGeminiInstantEnabledCache(): void {
  geminiInstantEnabledFromSupabase = null
}

export function isGeminiInstantEnabled(): boolean {
  return geminiInstantEnabledFromSupabase === true
}

export function isGeminiInstantFlagLoaded(): boolean {
  return geminiInstantEnabledFromSupabase !== null
}

/** Vor dem ersten Chat-Send: Flag aus Supabase (verhindert OpenAI-Stream + Gemini-JSON-Mismatch). */
export async function ensureGeminiInstantFlagLoaded(): Promise<void> {
  if (geminiInstantEnabledFromSupabase !== null) {
    return
  }
  if (!geminiInstantFlagLoadPromise) {
    geminiInstantFlagLoadPromise = getAppFeatureFlags()
      .then((flags) => {
        setGeminiInstantEnabledFromSupabase(flags.gemini_instant_enabled)
      })
      .catch(() => {
        setGeminiInstantEnabledFromSupabase(false)
      })
      .finally(() => {
        geminiInstantFlagLoadPromise = null
      })
  }
  await geminiInstantFlagLoadPromise
}
