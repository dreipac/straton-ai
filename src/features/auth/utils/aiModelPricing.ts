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
    /* Die GPT-5.6-Reihe deckt drei Stufen ab und muss einzeln aufgeführt werden: zwischen Luna und
       Sol liegt Faktor 25 im Input. Ohne eigene Zweige liefen alle drei in den allgemeinen
       gpt-5-Tarif (1.25/10) weiter unten. */
    tryMatch((s) => s.includes('gpt-5.6-sol'), { inPerM: 5, outPerM: 30 }) ??
    tryMatch((s) => s.includes('gpt-5.6-terra'), { inPerM: 2, outPerM: 12 }) ??
    tryMatch((s) => s.includes('gpt-5.6-luna'), { inPerM: 0.2, outPerM: 1.2 }) ??
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
  /* Opus 5 und Opus 4.8 kosten ein Drittel der älteren Opus-Generation. Ohne eigenen Eintrag
     liefe beides in den 15/75-Tarif unten und der Credit-Verbrauch fiele dreimal zu hoch aus. */
  if (m.includes('opus-5') || m.includes('opus-4-8')) {
    return { inPerM: 5, outPerM: 25 }
  }
  if (m.includes('opus')) {
    return { inPerM: 15, outPerM: 75 }
  }
  /* Befristeter Einführungspreis von Anthropic. Läuft er aus, diesen Zweig entfernen — dann greift
     wieder der reguläre Sonnet-Tarif 3/15 unten. Dasselbe gilt für die Zeile in ai_model_pricing. */
  if (m.includes('sonnet-5')) {
    return { inPerM: 2, outPerM: 10 }
  }
  if (m.includes('haiku')) {
    return { inPerM: 0.8, outPerM: 4 }
  }
  if (m.includes('claude') || m.includes('sonnet')) {
    return { inPerM: 3, outPerM: 15 }
  }
  return null
}

function geminiRates(model: string): Rates | null {
  const m = model.toLowerCase()
  if (m.includes('2.5-flash') && !m.includes('lite')) {
    return { inPerM: 0.3, outPerM: 2.5 }
  }
  if (m.includes('flash-lite') || m.includes('3.1-flash-lite')) {
    return { inPerM: 0.25, outPerM: 1.5 }
  }
  if (m.includes('flash')) {
    return { inPerM: 0.3, outPerM: 2.5 }
  }
  return { inPerM: 0.25, outPerM: 1.5 }
}

/**
 * `cacheReadTokens`/`cacheWriteTokens`: nur Anthropic (`cached_input_tokens` / `cache_write_input_tokens`
 * aus `ai_token_usage`). Ein Cache-Treffer kostet 0.1x, eine Cache-Neuanlage (1h-ttl) 2x des
 * Input-Tarifs — dieselben Faktoren wie in `estimate_ai_cost_usd` (SQL). Ohne diese beiden Parameter
 * wurden Anthropic-Chats in der Admin-Übersicht/Letzte-Nutzung-Tabelle als „günstiger als real"
 * angezeigt, weil gecachte Tokens schlicht fehlten statt zu ihrem reduzierten/erhöhten Satz gezählt
 * zu werden (straton-caching-fix-plan.md, Befund 3/4 Nachtrag).
 */
export function estimateAiTokenCostsUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): AiCostEstimate {
  const p = provider.toLowerCase().trim()
  let rates: Rates | null = null
  if (p === 'openai') {
    rates = openAiRates(model)
  } else if (p === 'anthropic') {
    rates = anthropicRates(model)
  } else if (p === 'gemini') {
    rates = geminiRates(model)
  }

  if (!rates) {
    return { inputUsd: 0, outputUsd: 0, totalUsd: 0, known: false }
  }

  const inputUsd =
    costFromTokens(inputTokens, rates.inPerM) +
    costFromTokens(cacheReadTokens, rates.inPerM * 0.1) +
    costFromTokens(cacheWriteTokens, rates.inPerM * 2)
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
