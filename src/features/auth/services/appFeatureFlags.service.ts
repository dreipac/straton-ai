import { getSupabaseClient } from '../../../integrations/supabase/client'

export type AppFeatureFlags = {
  show_beta_notice_on_first_login: boolean
  deployed_app_version: string | null
  learn_paths_enabled: boolean
  learn_path_create_enabled: boolean
  learn_ai_provider_active: 'openai' | 'anthropic'
  learn_ai_provider_draft: 'openai' | 'anthropic'
  learn_ai_model_active: 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5-mini' | 'gpt-4o-mini' | 'claude-sonnet-4-6' | 'claude-3-5-haiku-latest'
  learn_ai_model_draft: 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5-mini' | 'gpt-4o-mini' | 'claude-sonnet-4-6' | 'claude-3-5-haiku-latest'
  learn_area_banner_enabled: boolean
  learn_area_banner_text: string
  instant_analyze_debug_enabled: boolean
}

function parseLearnAiModel(raw: unknown): AppFeatureFlags['learn_ai_model_active'] {
  return raw === 'gpt-5.4' ||
    raw === 'gpt-5.4-mini' ||
    raw === 'gpt-5-mini' ||
    raw === 'gpt-4o-mini' ||
    raw === 'claude-sonnet-4-6' ||
    raw === 'claude-3-5-haiku-latest'
    ? raw
    : 'gpt-5.4-mini'
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
    learn_ai_provider_active: row?.learn_ai_provider_active === 'anthropic' ? 'anthropic' : 'openai',
    learn_ai_provider_draft: row?.learn_ai_provider_draft === 'anthropic' ? 'anthropic' : 'openai',
    learn_ai_model_active: parseLearnAiModel(row?.learn_ai_model_active),
    learn_ai_model_draft: parseLearnAiModel(row?.learn_ai_model_draft),
    learn_area_banner_enabled: row?.learn_area_banner_enabled === true,
    learn_area_banner_text:
      typeof row?.learn_area_banner_text === 'string' ? row.learn_area_banner_text.trim().slice(0, 500) : '',
    instant_analyze_debug_enabled: row?.instant_analyze_debug_enabled === true,
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

export async function adminSetLearnAiProviderDraft(provider: 'openai' | 'anthropic'): Promise<void> {
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

export async function adminSetLearnAiModelDraft(
  model: AppFeatureFlags['learn_ai_model_draft'],
): Promise<void> {
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

