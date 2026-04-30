import { getSupabaseClient } from '../../../integrations/supabase/client'

import {
  parseSubscriptionImageGenerationModelId,
  type SubscriptionImageGenerationModelId,
} from '../constants/subscriptionImageGenerationModels'

export type VisibleSubscriptionPlan = {
  id: string
  name: string
  max_tokens: number | null
  max_images: number | null
  max_files: number | null
  image_generation_model: SubscriptionImageGenerationModelId
}

export async function listVisibleSubscriptionPlans(): Promise<VisibleSubscriptionPlan[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plan_showcase_slots')
    .select(
      'slot_index, plan_id, subscription_plans(id, name, max_tokens, max_images, max_files, image_generation_model)',
    )
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
          image_generation_model: string | null
        }
      | Array<{
          id: string
          name: string
          max_tokens: number | null
          max_images: number | null
          max_files: number | null
          image_generation_model: string | null
        }>
      | null
  }>

  return rows
    .map((row) => (Array.isArray(row.subscription_plans) ? row.subscription_plans[0] : row.subscription_plans))
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan))
    .map(
      (plan): VisibleSubscriptionPlan => ({
        id: plan.id,
        name: plan.name,
        max_tokens: plan.max_tokens,
        max_images: plan.max_images,
        max_files: plan.max_files,
        image_generation_model: parseSubscriptionImageGenerationModelId(plan.image_generation_model),
      }),
    )
}
