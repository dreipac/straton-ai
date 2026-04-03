import { getSupabaseClient } from '../../../integrations/supabase/client'

export type VisibleSubscriptionPlan = {
  id: string
  name: string
  max_tokens: number | null
  max_images: number | null
  max_files: number | null
}

export async function listVisibleSubscriptionPlans(): Promise<VisibleSubscriptionPlan[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plan_showcase_slots')
    .select('slot_index, plan_id, subscription_plans(id, name, max_tokens, max_images, max_files)')
    .order('slot_index', { ascending: true })

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Array<{
    slot_index: number
    plan_id: string | null
    subscription_plans:
      | {
          id: string
          name: string
          max_tokens: number | null
          max_images: number | null
          max_files: number | null
        }
      | Array<{
          id: string
          name: string
          max_tokens: number | null
          max_images: number | null
          max_files: number | null
        }>
      | null
  }>

  return rows
    .map((row) => (Array.isArray(row.subscription_plans) ? row.subscription_plans[0] : row.subscription_plans))
    .filter((plan): plan is VisibleSubscriptionPlan => Boolean(plan))
}
