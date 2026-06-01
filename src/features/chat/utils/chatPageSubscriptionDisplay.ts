import type { UserProfile } from '../../auth/services/auth.service'

const DEFAULT_NO_PLAN_MAX_TOKENS = 100

export function getChatPageTokenLimitReached(
  profile: UserProfile | null,
  error: string | null,
): boolean {
  const hasAssignedPlan = profile?.subscription_plan_id != null
  const usedTokensToday = profile?.subscription_usages?.used_tokens ?? 0
  const tokenBalance = profile?.subscription_usages?.token_balance ?? 0
  const maxTokensToday = hasAssignedPlan
    ? (profile?.subscription_plans?.max_tokens ?? null)
    : DEFAULT_NO_PLAN_MAX_TOKENS
  const hasTokenLimit = maxTokensToday !== null
  const totalTokenPoolToday =
    hasTokenLimit && maxTokensToday !== null ? tokenBalance + maxTokensToday : null
  const tokenLimitReachedByUsage =
    hasTokenLimit &&
    totalTokenPoolToday !== null &&
    usedTokensToday >= totalTokenPoolToday
  const tokenLimitReachedByError = hasTokenLimit && (error ?? '').toLowerCase().includes('token limit')
  return tokenLimitReachedByUsage || tokenLimitReachedByError
}
