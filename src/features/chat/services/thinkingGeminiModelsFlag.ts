import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'
import {
  parseThinkingGeminiModelId,
  THINKING_GEMINI_MODEL_RICH_DEFAULT,
  THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
  type ThinkingGeminiModelsConfig,
} from '../constants/geminiModels'

let thinkingGeminiModelsFromSupabase: ThinkingGeminiModelsConfig | null = null
let thinkingGeminiModelsLoadPromise: Promise<void> | null = null

export function setThinkingGeminiModelsFromSupabase(config: ThinkingGeminiModelsConfig): void {
  thinkingGeminiModelsFromSupabase = config
}

export function clearThinkingGeminiModelsCache(): void {
  thinkingGeminiModelsFromSupabase = null
}

export function getThinkingGeminiModelsConfig(): ThinkingGeminiModelsConfig {
  return (
    thinkingGeminiModelsFromSupabase ?? {
      standard: THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
      rich: THINKING_GEMINI_MODEL_RICH_DEFAULT,
    }
  )
}

export function isThinkingGeminiModelsLoaded(): boolean {
  return thinkingGeminiModelsFromSupabase !== null
}

export async function ensureThinkingGeminiModelsLoaded(): Promise<void> {
  if (thinkingGeminiModelsFromSupabase !== null) {
    return
  }
  if (!thinkingGeminiModelsLoadPromise) {
    thinkingGeminiModelsLoadPromise = getAppFeatureFlags()
      .then((flags) => {
        setThinkingGeminiModelsFromSupabase({
          standard: parseThinkingGeminiModelId(
            flags.thinking_gemini_model_standard_active,
            THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
          ),
          rich: parseThinkingGeminiModelId(
            flags.thinking_gemini_model_rich_active,
            THINKING_GEMINI_MODEL_RICH_DEFAULT,
          ),
        })
      })
      .catch(() => {
        setThinkingGeminiModelsFromSupabase({
          standard: THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
          rich: THINKING_GEMINI_MODEL_RICH_DEFAULT,
        })
      })
      .finally(() => {
        thinkingGeminiModelsLoadPromise = null
      })
  }
  await thinkingGeminiModelsLoadPromise
}
