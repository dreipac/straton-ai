import { getSupabaseClient } from '../../../integrations/supabase/client'

export type AdminUser = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  is_superadmin: boolean
  created_at: string
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_admin_profiles')

  if (error) {
    throw error
  }

  return (data ?? []) as AdminUser[]
}
