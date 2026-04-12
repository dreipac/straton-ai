import { getSupabaseClient } from '../../../integrations/supabase/client'

export type AdminUser = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  is_superadmin: boolean
  created_at: string
  subscription_plan_id: string | null
  subscription_plan_name: string | null
  /** false, wenn in auth.users vorhanden, aber noch keine Zeile in public.profiles */
  has_profile: boolean
  /** null = noch nie angemeldet; nach erster Anmeldung gesetzt */
  last_sign_in_at: string | null
  must_change_password_on_first_login: boolean
}

export type SubscriptionPlanRow = {
  id: string
  name: string
  max_tokens: number | null
  max_images: number | null
  max_files: number | null
  created_at: string
}

export type SubscriptionAssignmentDraftRow = {
  user_id: string
  subscription_plan_id: string | null
  subscription_plan_name: string | null
  updated_at: string
  updated_by: string
}

export type SubscriptionPlanShowcaseSlotRow = {
  slot_index: 1 | 2 | 3
  plan_id: string | null
}

export type AdminAiTokenUsageRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
}

/** Neueste Zeile aus `ai_token_usage` pro Nutzer (exakter Modell-String der API). */
export type AdminUserLastAiUsageRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  provider: string
  model: string
  mode: string
  input_tokens: number
  output_tokens: number
  last_used_at: string
}

function toSafeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }
  return 0
}

export async function listAdminAiTokenUsageSummary(): Promise<AdminAiTokenUsageRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_admin_ai_token_usage_summary')

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => ({
    user_id: String(row.user_id ?? ''),
    email: typeof row.email === 'string' ? row.email : null,
    first_name: typeof row.first_name === 'string' ? row.first_name : null,
    last_name: typeof row.last_name === 'string' ? row.last_name : null,
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    input_tokens: toSafeInt(row.input_tokens),
    output_tokens: toSafeInt(row.output_tokens),
  }))
}

export async function listAdminUserLastAiUsage(): Promise<AdminUserLastAiUsageRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_admin_user_last_ai_usage')

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => ({
    user_id: String(row.user_id ?? ''),
    email: typeof row.email === 'string' ? row.email : null,
    first_name: typeof row.first_name === 'string' ? row.first_name : null,
    last_name: typeof row.last_name === 'string' ? row.last_name : null,
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    mode: String(row.mode ?? ''),
    input_tokens: toSafeInt(row.input_tokens),
    output_tokens: toSafeInt(row.output_tokens),
    last_used_at: typeof row.last_used_at === 'string' ? row.last_used_at : String(row.last_used_at ?? ''),
  }))
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_admin_profiles')

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    email: typeof row.email === 'string' ? row.email : null,
    first_name: typeof row.first_name === 'string' ? row.first_name : null,
    last_name: typeof row.last_name === 'string' ? row.last_name : null,
    is_superadmin: Boolean(row.is_superadmin),
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    subscription_plan_id: typeof row.subscription_plan_id === 'string' ? row.subscription_plan_id : null,
    subscription_plan_name: typeof row.subscription_plan_name === 'string' ? row.subscription_plan_name : null,
    has_profile: row.has_profile !== false,
    last_sign_in_at:
      row.last_sign_in_at === null || row.last_sign_in_at === undefined
        ? null
        : String(row.last_sign_in_at),
    must_change_password_on_first_login: row.must_change_password_on_first_login === true,
  }))
}

export async function adminSetMustChangePasswordOnFirstLogin(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_must_change_password_on_first_login', {
    p_user_id: userId,
    p_enabled: enabled,
  })
  if (error) {
    throw error
  }
}

export async function adminSetUserProfileNames(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_user_profile_names', {
    p_user_id: userId,
    p_first_name: firstName,
    p_last_name: lastName,
  })
  if (error) {
    throw error
  }
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_delete_user', {
    p_user_id: userId,
  })
  if (error) {
    throw error
  }
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlanRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, name, max_tokens, max_images, max_files, created_at')
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as SubscriptionPlanRow[]
}

export async function createSubscriptionPlan(params: {
  name: string
  maxTokens: number | null
  maxImages: number | null
  maxFiles: number | null
}): Promise<SubscriptionPlanRow> {
  const supabase = getSupabaseClient()
  const trimmed = params.name.trim()
  if (!trimmed) {
    throw new Error('Name darf nicht leer sein.')
  }
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert({
      name: trimmed,
      max_tokens: params.maxTokens,
      max_images: params.maxImages,
      max_files: params.maxFiles,
    })
    .select('id, name, max_tokens, max_images, max_files, created_at')
    .single()

  if (error) {
    throw error
  }

  return data as SubscriptionPlanRow
}

export async function deleteSubscriptionPlan(planId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('subscription_plans').delete().eq('id', planId)

  if (error) {
    throw error
  }
}

export async function adminSetUserSubscriptionPlan(userId: string, planId: string | null): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_user_subscription_plan', {
    p_user_id: userId,
    p_plan_id: planId,
  })

  if (error) {
    throw error
  }
}

export async function listSubscriptionAssignmentDrafts(): Promise<SubscriptionAssignmentDraftRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_assignment_drafts')
    .select('user_id, subscription_plan_id, updated_at, updated_by, subscription_plans(name)')
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Array<{
    user_id: string
    subscription_plan_id: string | null
    updated_at: string
    updated_by: string
    subscription_plans: { name: string } | { name: string }[] | null
  }>

  return rows.map((row) => {
    const relation = row.subscription_plans
    const relationRow = Array.isArray(relation) ? relation[0] : relation
    return {
      user_id: row.user_id,
      subscription_plan_id: row.subscription_plan_id,
      subscription_plan_name: relationRow?.name ?? null,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    }
  })
}

export async function saveSubscriptionAssignmentDraft(userId: string, planId: string | null): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('subscription_assignment_drafts').upsert(
    {
      user_id: userId,
      subscription_plan_id: planId,
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw error
  }
}

export async function deploySubscriptionAssignmentDrafts(): Promise<number> {
  const supabase = getSupabaseClient()
  const drafts = await listSubscriptionAssignmentDrafts()
  if (drafts.length === 0) {
    return 0
  }

  for (const draft of drafts) {
    const { error } = await supabase.rpc('admin_set_user_subscription_plan', {
      p_user_id: draft.user_id,
      p_plan_id: draft.subscription_plan_id,
    })
    if (error) {
      throw error
    }
  }

  const userIds = drafts.map((draft) => draft.user_id)
  const { error: deleteError } = await supabase
    .from('subscription_assignment_drafts')
    .delete()
    .in('user_id', userIds)

  if (deleteError) {
    throw deleteError
  }

  return drafts.length
}

export async function listSubscriptionPlanShowcaseSlots(): Promise<SubscriptionPlanShowcaseSlotRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plan_showcase_slots')
    .select('slot_index, plan_id')
    .order('slot_index', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as SubscriptionPlanShowcaseSlotRow[]
}

export async function saveSubscriptionPlanShowcaseSlots(
  slots: SubscriptionPlanShowcaseSlotRow[],
): Promise<void> {
  const supabase = getSupabaseClient()
  const payload = slots.map((slot) => ({
    slot_index: slot.slot_index,
    plan_id: slot.plan_id,
  }))

  const { error } = await supabase.from('subscription_plan_showcase_slots').upsert(payload, {
    onConflict: 'slot_index',
  })

  if (error) {
    throw error
  }
}
