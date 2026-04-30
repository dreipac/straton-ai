/**
 * Geschätzte API-Kosten in USD (Listenpreise, Standard-Tarif).
 * Quellen: https://platform.openai.com/docs/pricing (Stand laut Abruf 2026),
 * https://docs.anthropic.com/en/about-claude/pricing (Claude Sonnet / Haiku / Opus).
 * Keine Garantie — Anbieter ändern Preise; bei unbekanntem Modell keine Schätzung.
 */

export type AiCostEstimate = {
  inputUsd: number
  outputUsd: number
  totalUsd: number
  /** false, wenn kein bekannter Tarif gefunden wurde */
  known: boolean
}

type Rates = { inPerM: number; outPerM: number }

function costFromTokens(tokens: number, usdPerMillion: number): number {
  return (Math.max(0, tokens) / 1_000_000) * usdPerMillion
}

/** OpenAI: Reihenfolge von spezifisch zu allgemein */
function openAiRates(model: string): Rates | null {
  const m = model.toLowerCase()

  const tryMatch = (predicate: (s: string) => boolean, rates: Rates): Rates | null =>
    predicate(m) ? rates : null

  return (
    tryMatch((s) => s.includes('gpt-image-2'), { inPerM: 5, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-image-1'), { inPerM: 5, outPerM: 8.5 }) ??
    tryMatch((s) => s.includes('gpt-4o-mini'), { inPerM: 0.15, outPerM: 0.6 }) ??
    tryMatch((s) => s.includes('gpt-4o-2024-05-13'), { inPerM: 5, outPerM: 15 }) ??
    tryMatch((s) => s.includes('gpt-4o') && !s.includes('mini'), { inPerM: 2.5, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-5-nano'), { inPerM: 0.05, outPerM: 0.4 }) ??
    tryMatch((s) => s === 'gpt-5.4', { inPerM: 4, outPerM: 16 }) ??
    tryMatch((s) => s.includes('gpt-5.4-mini'), { inPerM: 0.75, outPerM: 4.5 }) ??
    tryMatch((s) => s.includes('gpt-5-mini'), { inPerM: 0.25, outPerM: 2 }) ??
    tryMatch((s) => s.includes('gpt-5-pro'), { inPerM: 15, outPerM: 120 }) ??
    tryMatch((s) => /gpt-5(\.|$|-)/.test(s) || s === 'gpt-5', { inPerM: 1.25, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-4.1-nano'), { inPerM: 0.1, outPerM: 0.4 }) ??
    tryMatch((s) => s.includes('gpt-4.1-mini'), { inPerM: 0.4, outPerM: 1.6 }) ??
    tryMatch((s) => s.includes('gpt-4.1'), { inPerM: 2, outPerM: 8 }) ??
    tryMatch((s) => s.includes('o4-mini'), { inPerM: 1.1, outPerM: 4.4 }) ??
    tryMatch((s) => s.includes('o3-mini') || s.includes('o1-mini'), { inPerM: 1.1, outPerM: 4.4 }) ??
    tryMatch((s) => s.includes('gpt-3.5-turbo'), { inPerM: 0.5, outPerM: 1.5 }) ??
    null
  )
}

function anthropicRates(model: string): Rates | null {
  const m = model.toLowerCase()
  if (m.includes('opus')) {
    return { inPerM: 15, outPerM: 75 }
  }
  if (m.includes('haiku')) {
    return { inPerM: 0.8, outPerM: 4 }
  }
  if (m.includes('claude') || m.includes('sonnet')) {
    return { inPerM: 3, outPerM: 15 }
  }
  return null
}

export function estimateAiTokenCostsUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): AiCostEstimate {
  const p = provider.toLowerCase().trim()
  let rates: Rates | null = null
  if (p === 'openai') {
    rates = openAiRates(model)
  } else if (p === 'anthropic') {
    rates = anthropicRates(model)
  }

  if (!rates) {
    return { inputUsd: 0, outputUsd: 0, totalUsd: 0, known: false }
  }

  const inputUsd = costFromTokens(inputTokens, rates.inPerM)
  const outputUsd = costFromTokens(outputTokens, rates.outPerM)
  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
    known: true,
  }
}

export function formatUsdEstimate(amount: number, known: boolean): string {
  if (!known) {
    return '—'
  }
  if (amount === 0) {
    return '$0.00'
  }
  const digits = amount < 0.01 ? 4 : amount < 1 ? 3 : 2
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(amount)
}
