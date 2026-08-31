import { MAX_IMAGE_CREDIT_BALANCE } from '../../auth/constants/imageCredits'
import { DEFAULT_AI_CREDITS_BALANCE_MAX } from '../../auth/constants/aiCredits'
import { labelForSubscriptionImageGenerationModel } from '../../auth/constants/subscriptionImageGenerationModels'
import { DEFAULT_WEB_SEARCH_CREDIT_MAX } from '../../chat/constants/webSearchCredits'

export type AccountSubscriptionPlanInput = {
  name: string
  max_images: number | null
  max_files: number | null
  image_generation_model?: string | null
  image_credit_max?: number | null
  web_search_daily_grant?: number | null
  web_search_credit_max?: number | null
  /** Tägliches KI-Credits-Kontingent (Chat + Denken zusammen), kostenbasiert. NULL = unbegrenzt. */
  ai_credits_daily_grant?: number | null
  /** Maximal ansparbares KI-Credits-Guthaben (Übertrag/Carryover-Deckel). */
  ai_credits_balance_max?: number | null
}

export type AccountSubscriptionUsageInput = {
  used_images: number
  used_files: number
  image_credit_balance: number
  web_search_credit_balance?: number
  used_web_searches?: number
  /** Heute verbrauchte KI-Credits (Chat + Denken zusammen, kostenbasiert). */
  used_ai_credits_today?: number
  /** Übertragenes KI-Credits-Guthaben (Carryover). */
  ai_credits_balance?: number
}

export type AccountSubscriptionDetailRow = {
  label: string
  value: string
}

/** Dieselbe Angabe wie `meterLabel`, nur zerlegt — für Ansichten, die die Teile eigen stylen. */
export type AccountSubscriptionMeterParts = {
  used: string
  total: string
  caption: string
}

export type AccountSubscriptionUsageCard = {
  id: string
  title: string
  headline: string
  subline?: string
  meterPercent: number | null
  meterLabel?: string
  meterParts?: AccountSubscriptionMeterParts
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
): { percent: number; label: string; parts?: AccountSubscriptionMeterParts } {
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
    parts: {
      used: formatInt(usedToday),
      total: formatInt(accessible),
      caption: 'verbraucht',
    },
  }
}

function dailyGrantHint(grant: number, suffix = 'pro Tag (UTC)'): string | undefined {
  if (grant <= 0) {
    return 'Keine tägliche Aufladung'
  }
  return `+${formatInt(grant)} ${suffix}, ungenutztes läuft mit`
}

/** KI-Credits: gemeinsamer Pool für Chat + Denken, kostenbasiert (siehe credits-system-plan.md). */
function buildAiCreditsCard(
  plan: AccountSubscriptionPlanInput,
  usage: AccountSubscriptionUsageInput,
): AccountSubscriptionUsageCard {
  const used = usage.used_ai_credits_today ?? 0
  const carryover = usage.ai_credits_balance ?? 0
  const carryoverMax = plan.ai_credits_balance_max ?? DEFAULT_AI_CREDITS_BALANCE_MAX

  if (plan.ai_credits_daily_grant == null) {
    return {
      id: 'ai-credits',
      title: 'KI-Credits',
      headline: `${formatInt(used)} Credits heute`,
      subline: 'Unbegrenzt — nur Verbrauchsanzeige (Chat + Denken)',
      meterPercent: null,
      details: [
        { label: 'Guthaben (Übertrag)', value: `${formatInt(carryover)} (max. ${formatInt(carryoverMax)})` },
      ],
    }
  }

  const dailyAllowance = plan.ai_credits_daily_grant
  const totalToday = carryover + dailyAllowance
  const remaining = Math.max(0, totalToday - used)

  return {
    id: 'ai-credits',
    title: 'KI-Credits',
    headline: `${formatInt(remaining)} von ${formatInt(totalToday)} Credits übrig`,
    subline: `${formatInt(used)} heute verbraucht (Chat + Denken)`,
    meterPercent: clampPercent(used, totalToday),
    meterLabel: `${formatInt(used)} / ${formatInt(totalToday)} verbraucht`,
    meterParts: { used: formatInt(used), total: formatInt(totalToday), caption: 'verbraucht' },
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
    /* Der Pool zählt hier ganze Bilder, keine kostenbasierten Credits — deshalb «Bilder». */
    headline: `${formatInt(balance)} / ${formatInt(maxBalance)} Bilder`,
    subline: dailyGrantHint(dailyGrant),
    meterPercent: meter.percent,
    meterLabel: meter.label,
    meterParts: meter.parts,
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
    headline: `${formatInt(balance)} / ${formatInt(maxBalance)} Credits`,
    subline: dailyGrantHint(dailyGrant),
    meterPercent: meter.percent,
    meterLabel: meter.label,
    meterParts: meter.parts,
    details: [{ label: 'Heute genutzt', value: formatInt(usedToday) }],
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
    used_images: 0,
    used_files: 0,
    image_credit_balance: 0,
    web_search_credit_balance: 0,
    used_web_searches: 0,
    used_ai_credits_today: 0,
    ai_credits_balance: 0,
  }

  return {
    planName: plan.name,
    cards: [
      buildAiCreditsCard(plan, safeUsage),
      buildImageCard(plan, safeUsage),
      buildWebSearchCard(plan, safeUsage),
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
