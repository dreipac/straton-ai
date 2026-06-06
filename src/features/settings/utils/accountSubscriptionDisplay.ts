import { MAX_IMAGE_CREDIT_BALANCE } from '../../auth/constants/imageCredits'
import { MAX_TOKEN_BALANCE } from '../../auth/constants/tokenBalance'
import { DEFAULT_THINKING_CREDIT_MAX } from '../../auth/constants/thinkingCredits'
import { labelForSubscriptionImageGenerationModel } from '../../auth/constants/subscriptionImageGenerationModels'
import { DEFAULT_WEB_SEARCH_CREDIT_MAX } from '../../chat/constants/webSearchCredits'

export type AccountSubscriptionPlanInput = {
  name: string
  max_tokens: number | null
  instant_token_balance_max?: number | null
  max_images: number | null
  max_files: number | null
  image_generation_model?: string | null
  image_credit_max?: number | null
  thinking_daily_grant?: number | null
  thinking_credit_max?: number | null
  web_search_daily_grant?: number | null
  web_search_credit_max?: number | null
}

export type AccountSubscriptionUsageInput = {
  used_tokens: number
  used_images: number
  used_files: number
  image_credit_balance: number
  token_balance: number
  web_search_credit_balance?: number
  used_web_searches?: number
  thinking_credit_balance?: number
  used_thinking_requests?: number
}

export type AccountSubscriptionDetailRow = {
  label: string
  value: string
}

export type AccountSubscriptionUsageCard = {
  id: string
  title: string
  headline: string
  subline?: string
  meterPercent: number | null
  meterLabel?: string
  details: AccountSubscriptionDetailRow[]
  tone?: 'default' | 'muted' | 'warning'
}

export type AccountSubscriptionMetaRow = {
  label: string
  value: string
}

export type AccountSubscriptionDisplay = {
  planName: string
  cards: AccountSubscriptionUsageCard[]
  meta: AccountSubscriptionMetaRow[]
}

/** Flache Fakten für KI-Systemprompt (gleiche Quelle wie Konto-Karten). */
export function formatAccountSubscriptionDisplayForAi(display: AccountSubscriptionDisplay): string {
  const lines = [`Abo: ${display.planName}`]
  for (const card of display.cards) {
    lines.push(`${card.title}: ${card.headline}`)
    if (card.subline) {
      lines.push(`  ${card.subline}`)
    }
    for (const row of card.details) {
      lines.push(`  ${row.label}: ${row.value}`)
    }
  }
  for (const row of display.meta) {
    lines.push(`${row.label}: ${row.value}`)
  }
  return lines.join('\n')
}

function formatInt(value: number): string {
  return value.toLocaleString('de-CH')
}

function clampPercent(used: number, total: number): number {
  if (total <= 0) {
    return used > 0 ? 100 : 0
  }
  return Math.min(100, Math.round((used / total) * 100))
}

/** Balken = nur heutiger Verbrauch; leer bei 0 heute; voll wenn Guthaben aufgebraucht. */
function creditPoolTodayMeter(
  usedToday: number,
  balance: number,
): { percent: number; label: string } {
  const accessible = usedToday + balance
  if (accessible <= 0) {
    return {
      percent: usedToday > 0 ? 100 : 0,
      label: `${formatInt(usedToday)} heute verbraucht`,
    }
  }
  return {
    percent: clampPercent(usedToday, accessible),
    label: `${formatInt(usedToday)} / ${formatInt(accessible)} heute verbraucht`,
  }
}

function dailyGrantHint(grant: number, suffix = 'pro Tag (UTC)'): string | undefined {
  if (grant <= 0) {
    return 'Keine tägliche Aufladung'
  }
  return `+${formatInt(grant)} ${suffix}, ungenutztes läuft mit`
}

function buildInstantCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const used = usage.used_tokens ?? 0
  const carryover = usage.token_balance ?? 0
  const carryoverMax = plan.instant_token_balance_max ?? MAX_TOKEN_BALANCE

  if (plan.max_tokens == null) {
    return {
      id: 'instant',
      title: 'Smart Instant',
      headline: `${formatInt(used)} Tokens heute`,
      subline: 'Unbegrenzt — nur Verbrauchsanzeige',
      meterPercent: null,
      details: [
        { label: 'Guthaben (Übertrag)', value: `${formatInt(carryover)} (max. ${formatInt(carryoverMax)})` },
      ],
    }
  }

  const dailyAllowance = plan.max_tokens
  const totalToday = carryover + dailyAllowance
  const remaining = Math.max(0, totalToday - used)

  return {
    id: 'instant',
    title: 'Smart Instant',
    headline: `${formatInt(remaining)} von ${formatInt(totalToday)} Tokens übrig`,
    subline: `${formatInt(used)} heute verbraucht`,
    meterPercent: clampPercent(used, totalToday),
    meterLabel: `${formatInt(used)} / ${formatInt(totalToday)} verbraucht`,
    details: [
      { label: 'Guthaben (Übertrag)', value: `${formatInt(carryover)} (max. ${formatInt(carryoverMax)})` },
      { label: 'Tageszuschuss', value: formatInt(dailyAllowance) },
      { label: 'Verfügbar heute', value: formatInt(totalToday) },
    ],
  }
}

function buildImageCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const usedToday = usage.used_images ?? 0
  const dailyGrant = plan.max_images

  if (dailyGrant == null) {
    return {
      id: 'images',
      title: 'KI-Bildgenerierung',
      headline: `${formatInt(usedToday)} Bilder heute`,
      subline: 'Unbegrenzt — kein Guthaben-Pool',
      meterPercent: null,
      details: [],
    }
  }

  const balance = usage.image_credit_balance ?? 0
  const maxBalance = plan.image_credit_max ?? MAX_IMAGE_CREDIT_BALANCE
  const meter = creditPoolTodayMeter(usedToday, balance)

  return {
    id: 'images',
    title: 'KI-Bildgenerierung',
    headline: `${formatInt(balance)} / ${formatInt(maxBalance)} Guthaben`,
    subline: dailyGrantHint(dailyGrant),
    meterPercent: meter.percent,
    meterLabel: meter.label,
    details: [
      { label: 'Heute erzeugt', value: formatInt(usedToday) },
      { label: 'Tägliche Aufladung', value: `+${formatInt(dailyGrant)}` },
    ],
  }
}

function buildWebSearchCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const maxBalance =
    typeof plan.web_search_credit_max === 'number'
      ? plan.web_search_credit_max
      : DEFAULT_WEB_SEARCH_CREDIT_MAX
  const dailyGrant = plan.web_search_daily_grant ?? 0
  const balance = usage.web_search_credit_balance ?? 0
  const usedToday = usage.used_web_searches ?? 0

  if (maxBalance <= 0 && dailyGrant <= 0) {
    return {
      id: 'web-search',
      title: 'Websuche',
      headline: 'Nicht im Abo enthalten',
      meterPercent: null,
      tone: 'muted',
      details: [{ label: 'Heute genutzt', value: formatInt(usedToday) }],
    }
  }

  const meter = creditPoolTodayMeter(usedToday, balance)

  return {
    id: 'web-search',
    title: 'Websuche',
    headline: `${formatInt(balance)} / ${formatInt(maxBalance)} Guthaben`,
    subline: dailyGrantHint(dailyGrant),
    meterPercent: meter.percent,
    meterLabel: meter.label,
    details: [{ label: 'Heute genutzt', value: formatInt(usedToday) }],
  }
}

function buildThinkingCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const maxBalance =
    typeof plan.thinking_credit_max === 'number'
      ? plan.thinking_credit_max
      : DEFAULT_THINKING_CREDIT_MAX
  const dailyGrant = plan.thinking_daily_grant ?? 0
  const balance = usage.thinking_credit_balance ?? 0
  const usedToday = usage.used_thinking_requests ?? 0

  if (maxBalance <= 0 && dailyGrant <= 0) {
    return {
      id: 'thinking',
      title: 'Thinking',
      headline: 'Nicht im Abo enthalten',
      meterPercent: null,
      tone: 'muted',
      details: [{ label: 'Heute genutzt', value: `${formatInt(usedToday)} Anfragen` }],
    }
  }

  const meter = creditPoolTodayMeter(usedToday, balance)

  return {
    id: 'thinking',
    title: 'Thinking',
    headline: `${formatInt(balance)} / ${formatInt(maxBalance)} Guthaben`,
    subline: dailyGrantHint(dailyGrant),
    meterPercent: meter.percent,
    meterLabel: meter.label,
    details: [{ label: 'Heute genutzt', value: `${formatInt(usedToday)} Anfragen` }],
  }
}

function buildFilesCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const used = usage.used_files ?? 0
  const maxFiles = plan.max_files

  if (maxFiles == null) {
    return {
      id: 'files',
      title: 'Dateien',
      headline: `${formatInt(used)} heute hochgeladen`,
      subline: 'Unbegrenzt pro Tag',
      meterPercent: null,
      details: [],
    }
  }

  const remaining = Math.max(0, maxFiles - used)

  return {
    id: 'files',
    title: 'Dateien',
    headline: `${formatInt(remaining)} von ${formatInt(maxFiles)} übrig`,
    subline: `${formatInt(used)} heute hochgeladen`,
    meterPercent: clampPercent(used, maxFiles),
    meterLabel: `${formatInt(used)} / ${formatInt(maxFiles)} verbraucht`,
    details: [],
  }
}

export function buildAccountSubscriptionDisplay(
  plan: AccountSubscriptionPlanInput | null,
  usage: AccountSubscriptionUsageInput | null,
): AccountSubscriptionDisplay | null {
  if (!plan) {
    return null
  }

  const safeUsage: AccountSubscriptionUsageInput = usage ?? {
    used_tokens: 0,
    used_images: 0,
    used_files: 0,
    image_credit_balance: 0,
    token_balance: 0,
    web_search_credit_balance: 0,
    used_web_searches: 0,
    thinking_credit_balance: 0,
    used_thinking_requests: 0,
  }

  return {
    planName: plan.name,
    cards: [
      buildInstantCard(plan, safeUsage),
      buildImageCard(plan, safeUsage),
      buildWebSearchCard(plan, safeUsage),
      buildThinkingCard(plan, safeUsage),
      buildFilesCard(plan, safeUsage),
    ],
    meta: [
      {
        label: 'Bildgenerator',
        value: labelForSubscriptionImageGenerationModel(plan.image_generation_model),
      },
    ],
  }
}
