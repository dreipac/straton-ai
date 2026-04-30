import { getSupabaseClient } from '../../../integrations/supabase/client'

export type AppFeatureFlags = {
  show_beta_notice_on_first_login: boolean
  deployed_app_version: string | null
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

