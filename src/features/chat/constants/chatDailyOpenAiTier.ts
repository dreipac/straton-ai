import type { ChatDailyTierOpenAiModelId } from './chatComposerModels'

/** Fallback wenn kein Abo / keine Spalten (entspricht früherem Standard). */
export const DEFAULT_CHAT_DAILY_OPENAI_TIER = {
  tier1ModelId: 'gpt-5.4' as ChatDailyTierOpenAiModelId,
  tier1TokenBudget: 50_000,
  tier2ModelId: 'gpt-5.4-mini' as ChatDailyTierOpenAiModelId,
}

export type ChatDailyOpenAiTierConfig = {
  tier1ModelId: ChatDailyTierOpenAiModelId
  tier1TokenBudget: number
  tier2ModelId: ChatDailyTierOpenAiModelId
}

export function parseChatDailyTierOpenAiModelId(raw: unknown): ChatDailyTierOpenAiModelId {
  if (raw === 'gpt-5.4' || raw === 'gpt-5.4-mini') {
    return raw
  }
  return DEFAULT_CHAT_DAILY_OPENAI_TIER.tier1ModelId
}

export function parseChatDailyTierConfigFromPlan(plan: {
  chat_daily_tier1_openai_model_id?: string | null
  chat_daily_tier1_token_budget?: number | null
  chat_daily_tier2_openai_model_id?: string | null
} | null): ChatDailyOpenAiTierConfig {
  if (!plan) {
    return { ...DEFAULT_CHAT_DAILY_OPENAI_TIER }
  }
  const budgetRaw = plan.chat_daily_tier1_token_budget
  const budget =
    typeof budgetRaw === 'number' && Number.isFinite(budgetRaw) ? Math.max(0, Math.floor(budgetRaw)) : DEFAULT_CHAT_DAILY_OPENAI_TIER.tier1TokenBudget
  return {
    tier1ModelId: parseChatDailyTierOpenAiModelId(plan.chat_daily_tier1_openai_model_id),
    tier1TokenBudget: budget,
    tier2ModelId: parseChatDailyTierOpenAiModelId(plan.chat_daily_tier2_openai_model_id),
  }
}

export function openAiApiChainForTierModel(modelId: ChatDailyTierOpenAiModelId): string[] {
  if (modelId === 'gpt-5.4-mini') {
    return ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']
  }
  return ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']
}

/** Modellkette für Hauptchat gemäß Tages-Verbrauch und Abo-Tiers (`subscription_usages.used_tokens`). */
export function buildMainChatOpenAiModelChain(
  usedTokensToday: number,
  tier?: ChatDailyOpenAiTierConfig | null,
): string[] {
  const used = Number.isFinite(usedTokensToday) && usedTokensToday >= 0 ? usedTokensToday : 0
  const cfg = tier ?? DEFAULT_CHAT_DAILY_OPENAI_TIER
  const threshold = Math.max(0, cfg.tier1TokenBudget)
  if (used >= threshold) {
    return [...openAiApiChainForTierModel(cfg.tier2ModelId)]
  }
  return [...openAiApiChainForTierModel(cfg.tier1ModelId)]
}
