import type { UserProfile } from '../../auth/services/auth.service'

/** Muss mit `public.no_plan_ai_credits_daily_grant()` (Migration) übereinstimmen. */
const DEFAULT_NO_PLAN_AI_CREDITS_DAILY_GRANT = 5

/** Name historisch "Token"-Limit — prüft seit dem Credits-System das KI-Credits-Guthaben (Chat + Denken). */
export function getChatPageTokenLimitReached(
  profile: UserProfile | null,
  error: string | null,
): boolean {
  const hasAssignedPlan = profile?.subscription_plan_id != null
  const usedCreditsToday = profile?.subscription_usages?.used_ai_credits_today ?? 0
  const creditsBalance = profile?.subscription_usages?.ai_credits_balance ?? 0
  const dailyGrant = hasAssignedPlan
    ? (profile?.subscription_plans?.ai_credits_daily_grant ?? null)
    : DEFAULT_NO_PLAN_AI_CREDITS_DAILY_GRANT
  const hasCreditsLimit = dailyGrant !== null
  const totalCreditsPoolToday = hasCreditsLimit && dailyGrant !== null ? creditsBalance + dailyGrant : null
  const limitReachedByUsage =
    hasCreditsLimit && totalCreditsPoolToday !== null && usedCreditsToday >= totalCreditsPoolToday
  const limitReachedByError =
    hasCreditsLimit && (error ?? '').toLowerCase().includes('ki-credits-guthaben')
  return limitReachedByUsage || limitReachedByError
}
