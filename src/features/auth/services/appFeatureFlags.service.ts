import { getSupabaseClient } from '../../../integrations/supabase/client'

export type AppFeatureFlags = {
  show_beta_notice_on_first_login: boolean
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

