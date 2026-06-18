import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  ANALYZE_MODEL_DEFAULT,
  parseAnalyzeModelId,
  parseThinkingGeminiModelId,
  THINKING_GEMINI_MODEL_RICH_DEFAULT,
  THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
  type AnalyzeModelId,
  type ThinkingGeminiModelId,
} from '../../chat/constants/geminiModels'
import {
  parseChatIntentModelRoutingRows,
  type ChatIntentModelRoutingRow,
} from '../../chat/constants/chatIntentModelRouting'

export type LearnAiProvider = 'openai' | 'anthropic' | 'gemini'

export type LearnAiModelId =
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5-mini'
  | 'gpt-4o-mini'
  | 'claude-sonnet-4-6'
  | 'claude-3-5-haiku-latest'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.1-flash-lite-preview'

/** Standard-OpenAI-Modell für den Lernbereich (Setup, Quiz, Kapitel, …). */
export const LEARN_AI_DEFAULT_OPENAI_MODEL: LearnAiModelId = 'gpt-5-mini'

export type AppFeatureFlags = {
  show_beta_notice_on_first_login: boolean
  deployed_app_version: string | null
  learn_paths_enabled: boolean
  learn_path_create_enabled: boolean
  learn_ai_provider_active: LearnAiProvider
  learn_ai_provider_draft: LearnAiProvider
  learn_ai_model_active: LearnAiModelId
  learn_ai_model_draft: LearnAiModelId
  learn_area_banner_enabled: boolean
  learn_area_banner_text: string
  instant_analyze_debug_enabled: boolean
  chat_folders_enabled: boolean
  gemini_instant_enabled: boolean
  thinking_gemini_model_standard_active: ThinkingGeminiModelId
  thinking_gemini_model_standard_draft: ThinkingGeminiModelId
  thinking_gemini_model_rich_active: ThinkingGeminiModelId
  thinking_gemini_model_rich_draft: ThinkingGeminiModelId
  instant_analyze_model_active: AnalyzeModelId
  instant_analyze_model_draft: AnalyzeModelId
  thinking_analyze_model_active: AnalyzeModelId
  thinking_analyze_model_draft: AnalyzeModelId
}

export type ThinkingGeminiModelsDraft = {
  standard: ThinkingGeminiModelId
  rich: ThinkingGeminiModelId
}

function parseLearnAiProvider(raw: unknown): LearnAiProvider {
  if (raw === 'anthropic' || raw === 'gemini') {
    return raw
  }
  return 'openai'
}

function parseLearnAiModel(raw: unknown): LearnAiModelId {
  return raw === 'gpt-5.4' ||
    raw === 'gpt-5.4-mini' ||
    raw === 'gpt-5-mini' ||
    raw === 'gpt-4o-mini' ||
    raw === 'claude-sonnet-4-6' ||
    raw === 'claude-3-5-haiku-latest' ||
    raw === 'gemini-3.1-flash-lite' ||
    raw === 'gemini-3.1-flash-lite-preview'
    ? raw
    : LEARN_AI_DEFAULT_OPENAI_MODEL
}

export async function getAppFeatureFlags(): Promise<AppFeatureFlags> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('get_app_feature_flags')

  if (error) {
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    show_beta_notice_on_first_login: Boolean(row?.show_beta_notice_on_first_login),
    deployed_app_version:
      typeof row?.deployed_app_version === 'string' && row.deployed_app_version.trim().length > 0
        ? row.deployed_app_version.trim()
        : null,
    learn_paths_enabled: row?.learn_paths_enabled !== false,
    learn_path_create_enabled: row?.learn_path_create_enabled !== false,
    learn_ai_provider_active: parseLearnAiProvider(row?.learn_ai_provider_active),
    learn_ai_provider_draft: parseLearnAiProvider(row?.learn_ai_provider_draft),
    learn_ai_model_active: parseLearnAiModel(row?.learn_ai_model_active),
    learn_ai_model_draft: parseLearnAiModel(row?.learn_ai_model_draft),
    learn_area_banner_enabled: row?.learn_area_banner_enabled === true,
    learn_area_banner_text:
      typeof row?.learn_area_banner_text === 'string' ? row.learn_area_banner_text.trim().slice(0, 500) : '',
    instant_analyze_debug_enabled: row?.instant_analyze_debug_enabled === true,
    chat_folders_enabled: row?.chat_folders_enabled !== false,
    gemini_instant_enabled: row?.gemini_instant_enabled === true,
    thinking_gemini_model_standard_active: parseThinkingGeminiModelId(
      row?.thinking_gemini_model_standard_active,
      THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
    ),
    thinking_gemini_model_standard_draft: parseThinkingGeminiModelId(
      row?.thinking_gemini_model_standard_draft,
      THINKING_GEMINI_MODEL_STANDARD_DEFAULT,
    ),
    thinking_gemini_model_rich_active: parseThinkingGeminiModelId(
      row?.thinking_gemini_model_rich_active,
      THINKING_GEMINI_MODEL_RICH_DEFAULT,
    ),
    thinking_gemini_model_rich_draft: parseThinkingGeminiModelId(
      row?.thinking_gemini_model_rich_draft,
      THINKING_GEMINI_MODEL_RICH_DEFAULT,
    ),
    instant_analyze_model_active: parseAnalyzeModelId(row?.instant_analyze_model_active, ANALYZE_MODEL_DEFAULT),
    instant_analyze_model_draft: parseAnalyzeModelId(row?.instant_analyze_model_draft, ANALYZE_MODEL_DEFAULT),
    thinking_analyze_model_active: parseAnalyzeModelId(row?.thinking_analyze_model_active, ANALYZE_MODEL_DEFAULT),
    thinking_analyze_model_draft: parseAnalyzeModelId(row?.thinking_analyze_model_draft, ANALYZE_MODEL_DEFAULT),
  }
}

export async function adminSetThinkingGeminiModelsDraft(
  draft: ThinkingGeminiModelsDraft,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_thinking_gemini_models_draft', {
    p_standard_model: draft.standard,
    p_rich_model: draft.rich,
  })
  if (error) {
    throw error
  }
}

export async function adminDeployThinkingGeminiModelsDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_thinking_gemini_models_draft')
  if (error) {
    throw error
  }
}

export async function adminSetGeminiInstantEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_gemini_instant_enabled', {
    p_enabled: enabled,
  })
  if (error) {
    throw error
  }
}

export async function adminSetInstantAnalyzeDebugEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_instant_analyze_debug_enabled', {
    p_enabled: enabled,
  })
  if (error) {
    throw error
  }
}

export async function adminSetChatFoldersEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_chat_folders_enabled', {
    p_enabled: enabled,
  })
  if (error) {
    throw error
  }
}

export async function adminSetBetaNoticeEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_beta_notice_enabled', {
    p_enabled: enabled,
  })

  if (error) {
    throw error
  }
}

export async function adminSetDeployedAppVersion(version: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_deployed_app_version', {
    p_version: version,
  })

  if (error) {
    throw error
  }
}

export async function adminSetLearnPathsEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_paths_enabled', {
    p_enabled: enabled,
  })

  if (error) {
    throw error
  }
}

export async function adminSetLearnPathCreateEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_path_create_enabled', {
    p_enabled: enabled,
  })

  if (error) {
    throw error
  }
}

export async function adminSetLearnAiProviderDraft(provider: LearnAiProvider): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_ai_provider_draft', {
    p_provider: provider,
  })
  if (error) {
    throw error
  }
}

export async function adminDeployLearnAiProviderDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_learn_ai_provider_draft')
  if (error) {
    throw error
  }
}

export async function adminSetLearnAiModelDraft(model: LearnAiModelId): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_ai_model_draft', {
    p_model: model,
  })
  if (error) {
    throw error
  }
}

export async function adminDeployLearnAiModelDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_learn_ai_model_draft')
  if (error) {
    throw error
  }
}

export async function adminSetLearnAreaBanner(enabled: boolean, text: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_area_banner', {
    p_enabled: enabled,
    p_text: text.trim().slice(0, 500),
  })
  if (error) {
    throw error
  }
}

export async function adminSetInstantAnalyzeModelDraft(model: AnalyzeModelId): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_instant_analyze_model_draft', { p_model: model })
  if (error) {
    throw error
  }
}

export async function adminDeployInstantAnalyzeModelDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_instant_analyze_model_draft')
  if (error) {
    throw error
  }
}

export async function adminSetThinkingAnalyzeModelDraft(model: AnalyzeModelId): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_thinking_analyze_model_draft', { p_model: model })
  if (error) {
    throw error
  }
}

export async function adminDeployThinkingAnalyzeModelDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_thinking_analyze_model_draft')
  if (error) {
    throw error
  }
}

export async function adminSetChatIntentModelRoutingDraft(
  category: string,
  action: string,
  model: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_chat_intent_model_routing_draft', {
    p_category: category,
    p_action: action,
    p_model: model,
  })
  if (error) {
    throw error
  }
}

export async function adminDeployChatIntentModelRoutingDraft(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_deploy_chat_intent_model_routing_draft')
  if (error) {
    throw error
  }
}

export async function getChatIntentModelRouting(): Promise<ChatIntentModelRoutingRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('get_chat_intent_model_routing')
  if (error) {
    throw error
  }
  return parseChatIntentModelRoutingRows(data)
}

