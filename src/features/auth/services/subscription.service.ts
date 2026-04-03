import { getSupabaseClient } from '../../../integrations/supabase/client'

export type SubscriptionUsage = {
  used_tokens: number
  used_images: number
  used_files: number
}

export async function incrementMySubscriptionUsage(args: {
  userId: string
  usedTokensDelta?: number
  usedImagesDelta?: number
  usedFilesDelta?: number
}): Promise<SubscriptionUsage> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.rpc('user_increment_subscription_usage', {
    p_user_id: args.userId,
    p_used_tokens_delta: args.usedTokensDelta ?? 0,
    p_used_images_delta: args.usedImagesDelta ?? 0,
    p_used_files_delta: args.usedFilesDelta ?? 0,
  })

  if (error) {
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  return row as SubscriptionUsage
}

