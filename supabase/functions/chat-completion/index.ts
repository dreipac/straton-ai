// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

type Provider = 'openai' | 'anthropic'

type InputMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type OpenAiVisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type QuizEvaluationPayload = {
  question: string
  expectedAnswer: string
  acceptableAnswers?: string[]
  userAnswer: string
}

type QuizEvaluationResult = {
  isCorrect: boolean
  feedback: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Primärmodell für Chat; Fallbacks bei 404 oder „unknown model“. */
const DEFAULT_OPENAI_CHAT_MODELS: string[] = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']

/** Nach Erreichen des Kosten-Budgets: günstigeres Modell zuerst (ohne gpt-5.4-mini). */
const ECONOMY_OPENAI_CHAT_MODELS: string[] = ['gpt-5-mini', 'gpt-4o-mini']

type UsdRates = { inPerM: number; outPerM: number }

function costFromTokens(tokens: number, usdPerMillion: number): number {
  return (Math.max(0, tokens) / 1_000_000) * usdPerMillion
}

/** Gleiche Tarif-Logik wie `src/features/auth/utils/aiModelPricing.ts` (Edge Function dupliziert). */
function openAiRatesForEstimate(model: string): UsdRates | null {
  const m = model.toLowerCase()
  const tryMatch = (predicate: (s: string) => boolean, rates: UsdRates): UsdRates | null =>
    predicate(m) ? rates : null
  return (
    tryMatch((s) => s.includes('gpt-4o-mini'), { inPerM: 0.15, outPerM: 0.6 }) ??
    tryMatch((s) => s.includes('gpt-4o-2024-05-13'), { inPerM: 5, outPerM: 15 }) ??
    tryMatch((s) => s.includes('gpt-4o') && !s.includes('mini'), { inPerM: 2.5, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-5-nano'), { inPerM: 0.05, outPerM: 0.4 }) ??
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

function anthropicRatesForEstimate(model: string): UsdRates | null {
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

function estimateAiUsageUsd(
  provider: Provider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = provider === 'anthropic' ? anthropicRatesForEstimate(model) : openAiRatesForEstimate(model)
  if (!rates) {
    return 0
  }
  return costFromTokens(inputTokens, rates.inPerM) + costFromTokens(outputTokens, rates.outPerM)
}

/**
 * Schwelle in USD: ab dieser kumulierten geschätzten Kosten wird `ECONOMY_OPENAI_CHAT_MODELS` genutzt.
 * Optional: `AI_OPENAI_COST_DOWNGRADE_THRESHOLD_USD` setzen (überschreibt CHF).
 * Sonst: `AI_OPENAI_PREMIUM_MODEL_MAX_CHF` (Default 2) × `AI_USD_PER_CHF` (Default 1.14, USD je 1 CHF).
 */
function getPremiumBudgetThresholdUsd(): number {
  const direct = Deno.env.get('AI_OPENAI_COST_DOWNGRADE_THRESHOLD_USD')?.trim()
  if (direct) {
    const n = Number(direct)
    if (Number.isFinite(n) && n > 0) {
      return n
    }
  }
  const maxChf = Number(Deno.env.get('AI_OPENAI_PREMIUM_MODEL_MAX_CHF') ?? '2')
  const usdPerChf = Number(Deno.env.get('AI_USD_PER_CHF') ?? '1.14')
  const mc = Number.isFinite(maxChf) && maxChf > 0 ? maxChf : 2
  const fx = Number.isFinite(usdPerChf) && usdPerChf > 0 ? usdPerChf : 1.14
  return mc * fx
}

function openAiChatModelsForCumulativeCost(cumulativeUsd: number): string[] {
  if (cumulativeUsd >= getPremiumBudgetThresholdUsd()) {
    return [...ECONOMY_OPENAI_CHAT_MODELS]
  }
  return [...DEFAULT_OPENAI_CHAT_MODELS]
}

async function getUserCumulativeEstimatedCostUsd(
  admin: SupabaseClient | null,
  userId: string,
): Promise<number> {
  if (!admin) {
    return 0
  }
  const { data, error } = await admin.rpc('sum_user_ai_estimated_cost_usd', { p_user_id: userId })
  if (error) {
    console.error('[chat-completion] sum_user_ai_estimated_cost_usd failed', error.message)
    return 0
  }
  const n = typeof data === 'number' ? data : Number(data)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeProvider(value: unknown): Provider {
  return value === 'anthropic' ? 'anthropic' : 'openai'
}

/** Optional: Modellreihenfolge fuer OpenAI-Chat (z. B. Lernkapitel-Hilfe = `gpt-5.4-mini`). */
function sanitizeOpenAiModelsOverride(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const t = item.trim()
    if (t.length > 0 && t.length <= 120 && out.length < 12) {
      out.push(t)
    }
  }
  return out.length > 0 ? out : null
}

function normalizeMode(
  value: unknown,
):
  | 'chat'
  | 'evaluate_quiz'
  | 'generate_title'
  | 'generate_topic_suggestions'
  | 'generate_flashcards'
  | 'generate_worksheet' {
  const v = typeof value === 'string' ? value.trim() : value
  if (v === 'evaluate_quiz') {
    return 'evaluate_quiz'
  }
  if (v === 'generate_title') {
    return 'generate_title'
  }
  if (v === 'generate_topic_suggestions') {
    return 'generate_topic_suggestions'
  }
  if (v === 'generate_flashcards') {
    return 'generate_flashcards'
  }
  if (v === 'generate_worksheet') {
    return 'generate_worksheet'
  }
  return 'chat'
}

function chapterOutlineFromBody(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const o = payload as { chapterOutline?: unknown }
  return typeof o.chapterOutline === 'string' ? o.chapterOutline.trim() : ''
}

function sanitizeQuizEvaluationPayload(value: unknown): QuizEvaluationPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Record<string, unknown>
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  const expectedAnswer = typeof payload.expectedAnswer === 'string' ? payload.expectedAnswer.trim() : ''
  const userAnswer = typeof payload.userAnswer === 'string' ? payload.userAnswer.trim() : ''
  const acceptableAnswers = Array.isArray(payload.acceptableAnswers)
    ? payload.acceptableAnswers
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined

  if (!question || !expectedAnswer || !userAnswer) {
    return null
  }

  return {
    question,
    expectedAnswer,
    acceptableAnswers,
    userAnswer,
  }
}

function parseQuizEvaluationResult(raw: string): QuizEvaluationResult {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('KI Bewertung konnte nicht als JSON gelesen werden.')
  }

  const jsonChunk = trimmed.slice(start, end + 1)
  const parsed = JSON.parse(jsonChunk) as { isCorrect?: unknown; feedback?: unknown }
  const isCorrect = parsed.isCorrect === true
  const feedback =
    typeof parsed.feedback === 'string' && parsed.feedback.trim()
      ? parsed.feedback.trim()
      : isCorrect
        ? 'Richtig.'
        : 'Nicht ganz korrekt.'

  return { isCorrect, feedback }
}

async function getProviderApiKey(
  provider: Provider,
): Promise<string> {
  const envKeyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const apiKey = String(Deno.env.get(envKeyName) ?? '').trim()
  if (!apiKey) {
    throw new Error(`API Key fuer Provider "${provider}" ist nicht als Supabase Secret gesetzt.`)
  }

  return apiKey
}

type AiCallResult = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

async function tryLogTokenUsage(
  admin: SupabaseClient | null,
  userId: string,
  provider: Provider,
  mode: string,
  result: AiCallResult,
) {
  if (!admin) {
    return
  }
  const estimated_cost_usd = estimateAiUsageUsd(
    provider,
    result.model,
    result.inputTokens,
    result.outputTokens,
  )
  const { error } = await admin.from('ai_token_usage').insert({
    user_id: userId,
    provider,
    model: result.model.slice(0, 160),
    mode: mode.slice(0, 64),
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    estimated_cost_usd,
  })
  if (error) {
    console.error('[chat-completion] ai_token_usage insert failed', error.message)
  }
}

/** GPT-5 / o-series: Chat Completions erlauben oft nur die Default-Temperatur — feste Werte wie 0.7 → HTTP 400. */
function openAiUsesDefaultTemperatureOnly(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (m.startsWith('gpt-5')) {
    return true
  }
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
    return true
  }
  return false
}

function openAiChatRequestBody(
  model: string,
  messages: InputMessage[],
  options?: { includeReasoningLow?: boolean },
): Record<string, unknown> {
  function parseVisionPayload(content: string): { text: string; imageDataUrls: string[] } {
    const imageDataUrls: string[] = []
    const visionRegex = /\[BildData:[^\]]*\]([\s\S]*?)\[\/BildData\]/g
    let text = content
    let match: RegExpExecArray | null = visionRegex.exec(content)
    while (match) {
      const maybeUrl = String(match[1] ?? '').trim()
      if (maybeUrl.startsWith('data:image/')) {
        imageDataUrls.push(maybeUrl)
      }
      match = visionRegex.exec(content)
    }
    text = text
      .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
      .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
      .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
      .trim()
    return { text, imageDataUrls: imageDataUrls.slice(0, 4) }
  }

  const body: Record<string, unknown> = {
    model,
    messages: messages.map((message) => {
      if (message.role !== 'user') {
        return {
          role: message.role,
          content: message.content,
        }
      }
      const parsed = parseVisionPayload(message.content)
      if (parsed.imageDataUrls.length === 0) {
        return {
          role: message.role,
          content: message.content,
        }
      }
      const parts: OpenAiVisionContentPart[] = []
      if (parsed.text) {
        parts.push({ type: 'text', text: parsed.text })
      } else {
        parts.push({ type: 'text', text: 'Bitte analysiere dieses Bild.' })
      }
      for (const url of parsed.imageDataUrls) {
        parts.push({
          type: 'image_url',
          image_url: { url },
        })
      }
      return {
        role: message.role,
        content: parts,
      }
    }),
  }
  if (!openAiUsesDefaultTemperatureOnly(model)) {
    body.temperature = 0.7
  }
  /** GPT-5 Standard ist «medium» — weniger Reasoning = schnellere Antworten bei Chat Completions. */
  if (options?.includeReasoningLow && model.toLowerCase().startsWith('gpt-5')) {
    body.reasoning = { effort: 'low' }
  }
  return body
}

function formatOpenAiHttpError(status: number, errorText: string): string {
  if (status === 400 || status === 403) {
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } }
      const msg = typeof parsed.error?.message === 'string' ? parsed.error.message.trim() : ''
      if (msg) {
        return `OpenAI Anfrage fehlgeschlagen (${status}): ${msg}`
      }
    } catch {
      /* ignore */
    }
  }
  return `OpenAI Anfrage fehlgeschlagen (${status}).`
}

async function callOpenAi(messages: InputMessage[], apiKey: string, models?: string[]): Promise<AiCallResult> {
  const modelsToTry =
    Array.isArray(models) && models.length > 0 ? models : DEFAULT_OPENAI_CHAT_MODELS

  for (const model of modelsToTry) {
    const reasoningSteps = model.toLowerCase().startsWith('gpt-5')
      ? ([true, false] as const)
      : ([false] as const)

    for (const includeReasoningLow of reasoningSteps) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openAiChatRequestBody(model, messages, { includeReasoningLow })),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[chat-completion] OpenAI HTTP error', response.status, errorText.slice(0, 800))
        const errLower = errorText.toLowerCase()
        const reasoningRejected =
          includeReasoningLow &&
          response.status === 400 &&
          (errLower.includes('reasoning') ||
            errLower.includes('unsupported') ||
            errLower.includes('unknown parameter'))

        if (reasoningRejected) {
          continue
        }

        const modelUnavailable =
          response.status === 400 &&
          (errorText.includes('model') || errorText.includes('does not exist') || errorText.includes('not found'))

        if (modelUnavailable && model !== modelsToTry[modelsToTry.length - 1]) {
          break
        }

        throw new Error(formatOpenAiHttpError(response.status, errorText))
      }

      const data = (await response.json()) as {
        model?: string
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) {
        const usedModel = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : model
        const inputTokens = Math.max(0, Math.floor(Number(data.usage?.prompt_tokens ?? 0)))
        const outputTokens = Math.max(0, Math.floor(Number(data.usage?.completion_tokens ?? 0)))
        return { text: content, model: usedModel, inputTokens, outputTokens }
      }
      break
    }
  }

  throw new Error('OpenAI hat keine Antwort geliefert.')
}

async function* iterateOpenAiSseBytes(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{
  delta?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  model?: string
}> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      carry += decoder.decode(value, { stream: true })
      while (true) {
        const sep = carry.indexOf('\n\n')
        if (sep === -1) {
          break
        }
        const block = carry.slice(0, sep)
        carry = carry.slice(sep + 2)
        for (const line of block.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            return
          }
          try {
            const json = JSON.parse(data) as Record<string, unknown>
            const model = typeof json.model === 'string' ? json.model : undefined
            const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
            const choices = json.choices as Array<Record<string, unknown>> | undefined
            const delta = choices?.[0]?.delta as Record<string, unknown> | undefined
            const content = delta?.content
            const deltaText = typeof content === 'string' && content.length > 0 ? content : undefined
            if (model || deltaText || usage) {
              yield { delta: deltaText, usage, model }
            }
          } catch {
            /* unparseable line */
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** SSE an den Browser: `data: {"type":"delta","t":"..."}\n\n` und abschliessend `done` oder `error`. */
async function handleOpenAiChatStream(
  userId: string,
  admin: SupabaseClient | null,
  messages: InputMessage[],
  apiKey: string,
  openAiModels: string[],
): Promise<Response> {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  const writeSse = async (obj: unknown) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
  }

  ;(async () => {
    let closed = false
    try {
      const modelsToTry: string[] = [...openAiModels]

      outer: for (const model of modelsToTry) {
        const reasoningSteps = model.toLowerCase().startsWith('gpt-5')
          ? ([true, false] as const)
          : ([false] as const)

        inner: for (const includeReasoningLow of reasoningSteps) {
          let includeUsageFlag = true

          while (true) {
            const reqBody: Record<string, unknown> = {
              ...openAiChatRequestBody(model, messages, { includeReasoningLow }),
              stream: true,
            }
            if (includeUsageFlag) {
              reqBody.stream_options = { include_usage: true }
            }

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(reqBody),
            })

            if (!res.ok) {
              const errorText = await res.text()
              console.error('[chat-completion] OpenAI stream HTTP error', res.status, errorText.slice(0, 600))
              const errLower = errorText.toLowerCase()

              if (
                includeUsageFlag &&
                res.status === 400 &&
                (errLower.includes('stream_options') ||
                  errLower.includes('include_usage'))
              ) {
                includeUsageFlag = false
                continue
              }

              const reasoningRejected =
                includeReasoningLow &&
                res.status === 400 &&
                (errLower.includes('reasoning') ||
                  errLower.includes('unsupported') ||
                  errLower.includes('unknown parameter'))

              if (reasoningRejected) {
                continue inner
              }

              const modelUnavailable =
                res.status === 400 &&
                (errorText.includes('model') ||
                  errorText.includes('does not exist') ||
                  errorText.includes('not found'))

              if (modelUnavailable && model !== modelsToTry[modelsToTry.length - 1]) {
                continue outer
              }

              await writeSse({
                type: 'error',
                message: formatOpenAiHttpError(res.status, errorText),
              })
              closed = true
              break outer
            }

            if (!res.body) {
              continue inner
            }

            let fullText = ''
            let usedModel = model
            let inputTokens = 0
            let outputTokens = 0

            try {
              for await (const chunk of iterateOpenAiSseBytes(res.body)) {
                if (chunk.model) {
                  usedModel = chunk.model
                }
                if (chunk.delta) {
                  fullText += chunk.delta
                  await writeSse({ type: 'delta', t: chunk.delta })
                }
                if (chunk.usage) {
                  inputTokens = Math.max(0, Math.floor(Number(chunk.usage.prompt_tokens ?? 0)))
                  outputTokens = Math.max(0, Math.floor(Number(chunk.usage.completion_tokens ?? 0)))
                }
              }
            } catch (readErr) {
              console.error('[chat-completion] OpenAI stream read error', readErr)
              await writeSse({
                type: 'error',
                message: readErr instanceof Error ? readErr.message : 'Stream Lesefehler',
              })
              closed = true
              break outer
            }

            const trimmed = fullText.trim()
            if (!trimmed) {
              continue inner
            }

            await tryLogTokenUsage(admin, userId, 'openai', 'chat', {
              text: trimmed,
              model: usedModel,
              inputTokens,
              outputTokens,
            })
            await writeSse({
              type: 'done',
              model: usedModel,
              inputTokens,
              outputTokens,
            })
            closed = true
            break outer
          }
        }
      }

      if (!closed) {
        await writeSse({ type: 'error', message: 'OpenAI Streaming lieferte keinen Text.' })
      }
    } catch (e) {
      await writeSse({
        type: 'error',
        message: e instanceof Error ? e.message : 'Unbekannter Streamfehler',
      })
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Anthropic-Calls (wenn `provider: anthropic`): Sonnet (per Secret ANTHROPIC_MODEL überschreibbar).
 * Lernpfad nutzt im Client jetzt `provider: openai` + GPT-5 mini; dieser Pfad bleibt für explizite Claude-Requests.
 */
function anthropicLearnModel(): string {
  const fromEnv = Deno.env.get('ANTHROPIC_MODEL')?.trim()
  return fromEnv || 'claude-sonnet-4-6'
}

type AnthropicCallOptions = {
  maxTokens?: number
  model?: string
}

async function callAnthropic(
  messages: InputMessage[],
  apiKey: string,
  options?: AnthropicCallOptions,
): Promise<AiCallResult> {
  const model = options?.model ?? anthropicLearnModel()
  const max_tokens = options?.maxTokens ?? 4096
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      messages: messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      system:
        messages.find((message) => message.role === 'system')?.content ??
        'Du bist ein hilfreicher Assistent.',
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    if (response.status === 429) {
      throw new Error(
        'Claude Rate-Limit erreicht (zu viele Tokens pro Minute). Bitte Anfrage verkuerzen oder kurz warten.',
      )
    }
    const hint =
      response.status === 404
        ? ' (Modell-ID unbekannt/retired? Secret ANTHROPIC_MODEL prüfen oder Edge Function deployen.)'
        : ''
    throw new Error(
      `Anthropic Anfrage fehlgeschlagen (${response.status}).${hint}${errBody ? ` ${errBody.slice(0, 400)}` : ''}`,
    )
  }

  const data = (await response.json()) as {
    model?: string
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const content = data.content?.find((entry) => entry.type === 'text')?.text?.trim()
  if (!content) {
    throw new Error('Anthropic hat keine Antwort geliefert.')
  }

  const usedModel = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : model
  const inputTokens = Math.max(0, Math.floor(Number(data.usage?.input_tokens ?? 0)))
  const outputTokens = Math.max(0, Math.floor(Number(data.usage?.output_tokens ?? 0)))
  return { text: content, model: usedModel, inputTokens, outputTokens }
}

async function evaluateQuizWithAi(
  provider: Provider,
  payload: QuizEvaluationPayload,
  apiKey: string,
  openAiModels: string[],
): Promise<{ evaluation: QuizEvaluationResult; usage: AiCallResult }> {
  const acceptableAnswers = payload.acceptableAnswers?.length
    ? payload.acceptableAnswers.join(' | ')
    : '(keine)'

  const evaluationMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du bist ein strenger, aber fairer Pruefungs-Korrektor.',
        'Bewerte semantisch, nicht nur exakt wortgleich.',
        'Antworte ausschliesslich als JSON Objekt ohne weiteren Text.',
        'Schema: {"isCorrect": boolean, "feedback": string}',
        'feedback kurz halten (max 220 Zeichen), auf Deutsch.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Frage: ${payload.question}`,
        `Erwartete Antwort: ${payload.expectedAnswer}`,
        `Alternative Antworten: ${acceptableAnswers}`,
        `Antwort vom Nutzer: ${payload.userAnswer}`,
      ].join('\n'),
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(evaluationMessages, apiKey, { maxTokens: 512 })
      : await callOpenAi(evaluationMessages, apiKey, openAiModels)

  return { evaluation: parseQuizEvaluationResult(usage.text), usage }
}

function sanitizeGeneratedTitle(raw: string): string {
  const compact = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return ''
  }
  return compact.length > 42 ? compact.slice(0, 42).trim() : compact
}

async function generateTitleWithAi(
  provider: Provider,
  sourceMessages: InputMessage[],
  apiKey: string,
  openAiModels: string[],
): Promise<{ title: string; usage: AiCallResult }> {
  const transcript = sourceMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  const titleMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Erzeuge einen kurzen Chat-Titel auf Deutsch.',
        'Maximal 6 Woerter und maximal 42 Zeichen.',
        'Nur den Titel ausgeben, ohne Anfuehrungszeichen und ohne Satzzeichen am Ende.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: transcript || 'Allgemeiner Chat',
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(titleMessages, apiKey, { maxTokens: 256 })
      : await callOpenAi(titleMessages, apiKey, openAiModels)

  const cleaned = sanitizeGeneratedTitle(usage.text)
  if (!cleaned) {
    throw new Error('Titel konnte nicht generiert werden.')
  }
  return { title: cleaned, usage }
}

function sanitizeTopicSuggestions(raw: string): string[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 5)
  } catch {
    return []
  }
}

type FlashcardPayload = {
  question: string
  answer: string
}

type WorksheetPromptPayload = {
  prompt: string
}

function stripLeadingMarkdownCodeFence(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    const firstNl = t.indexOf('\n')
    if (firstNl !== -1) {
      t = t.slice(firstNl + 1)
    }
    const fence = t.lastIndexOf('```')
    if (fence !== -1) {
      t = t.slice(0, fence).trim()
    }
  }
  return t
}

function worksheetPromptFromEntry(o: Record<string, unknown>): string {
  const keys = ['prompt', 'question', 'task', 'text', 'aufgabe', 'content', 'title'] as const
  for (const key of keys) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return ''
}

function parseWorksheetPromptsFromRaw(raw: string): WorksheetPromptPayload[] {
  const trimmed = stripLeadingMarkdownCodeFence(raw.trim())
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const out: WorksheetPromptPayload[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const prompt = worksheetPromptFromEntry(o)
      if (prompt) {
        out.push({ prompt })
      }
    }
    return out.slice(0, 24)
  } catch {
    return []
  }
}

function parseFlashcardsFromRaw(raw: string): FlashcardPayload[] {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const out: FlashcardPayload[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const question = typeof o.question === 'string' ? o.question.trim() : ''
      const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
      if (question && answer) {
        out.push({ question, answer })
      }
    }
    return out.slice(0, 24)
  } catch {
    return []
  }
}

async function generateFlashcardsWithAi(
  provider: Provider,
  chapterOutline: string,
  apiKey: string,
  openAiModels: string[],
): Promise<{ flashcards: FlashcardPayload[]; usage: AiCallResult }> {
  const outline = chapterOutline.trim()
  if (!outline) {
    throw new Error('Keine Kapiteldaten fuer Lernkarten.')
  }

  const flashcardMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst Lernkarten (Karteikarten) fuer Berufsschule/EFZ Informatik.',
        'Nutze NUR den mitgelieferten Kapiteltext — erfinde keine neuen Themen.',
        'Antworte ausschliesslich mit einem JSON-Array, kein Text davor oder danach.',
        'Schema: [{"question":"kurze Frage","answer":"kurze Antwort (1-3 Saetze)"}]',
        'Maximal 16 Karten, auf Deutsch, fachlich korrekt, verschiedene Aspekte abdecken.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Gespeicherte Kapitelinhalte (Auszug):\n\n${outline.slice(0, 28000)}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(flashcardMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(flashcardMessages, apiKey, openAiModels)

  const cards = parseFlashcardsFromRaw(usage.text)
  if (cards.length === 0) {
    throw new Error('Lernkarten konnten nicht aus der KI-Antwort gelesen werden.')
  }
  return { flashcards: cards, usage }
}

async function generateWorksheetWithAi(
  provider: Provider,
  chapterOutline: string,
  apiKey: string,
  openAiModels: string[],
): Promise<{ prompts: WorksheetPromptPayload[]; usage: AiCallResult }> {
  const outline = chapterOutline.trim()
  if (!outline) {
    throw new Error('Keine Kapiteldaten fuer Arbeitsblatt.')
  }

  const worksheetMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst ein Arbeitsblatt mit Aufgaben (nur Fragen/Aufgabenstellungen, keine Musterloesung im JSON).',
        'Nutze NUR den mitgelieferten Kapiteltext — erfinde keine neuen Themen.',
        'Antworte ausschliesslich mit einem JSON-Array, kein Text davor oder danach.',
        'Schema: [{"prompt":"klare Aufgabenstellung in 1-3 Saetzen"}]',
        'Maximal 14 Aufgaben, auf Deutsch, fachlich korrekt, zum handschriftlichen Bearbeiten geeignet.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Gespeicherte Kapitelinhalte (Auszug):\n\n${outline.slice(0, 28000)}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(worksheetMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(worksheetMessages, apiKey, openAiModels)

  const items = parseWorksheetPromptsFromRaw(usage.text)
  if (items.length === 0) {
    throw new Error('Arbeitsblatt konnte nicht aus der KI-Antwort gelesen werden.')
  }
  return { prompts: items, usage }
}

async function generateTopicSuggestionsWithAi(
  provider: Provider,
  topic: string,
  apiKey: string,
  openAiModels: string[],
): Promise<{ suggestions: string[]; usage: AiCallResult }> {
  const suggestionMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst konkrete Unterthemen fuer Lernen.',
        'Antworte nur als JSON-Array mit Strings.',
        'Liefere maximal 5 kurze, konkrete Unterthemen auf Deutsch.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Thema: ${topic}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(suggestionMessages, apiKey, { maxTokens: 1024 })
      : await callOpenAi(suggestionMessages, apiKey, openAiModels)

  const suggestions = sanitizeTopicSuggestions(usage.text)
  if (suggestions.length === 0) {
    throw new Error('Unterthemen konnten nicht generiert werden.')
  }
  return { suggestions, usage }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }

  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungueltig.' }, 401)
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin: SupabaseClient | null = serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null

  const cumulativeUsd = await getUserCumulativeEstimatedCostUsd(admin, user.id)
  const openAiModelsFromCost = openAiChatModelsForCumulativeCost(cumulativeUsd)

  try {
    const body = (await req.json()) as {
      mode?: unknown
      provider?: unknown
      messages?: unknown
      payload?: { messages?: unknown; topic?: unknown } | unknown
      /** Optional: max. Ausgabe-Tokens (v. a. Anthropic Chat / Excel-Spec). */
      maxTokens?: unknown
      /** `true`: nur OpenAI-Hauptchat — SSE (`text/event-stream`) statt JSON. */
      stream?: unknown
      /** Optional: OpenAI-Modellreihenfolge (Chat); sonst Budget-basierte Liste. */
      openAiModels?: unknown
    }
    const openAiModelsOverride = sanitizeOpenAiModelsOverride(body.openAiModels)
    const openAiModels = openAiModelsOverride ?? openAiModelsFromCost
    let mode = normalizeMode(body.mode)
    const outlinePreview = chapterOutlineFromBody(body.payload)
    // Ohne gueltigen mode landet ein Lernkarten-Request sonst im Chat-Zweig (leere messages → 400).
    if (mode === 'chat' && outlinePreview) {
      mode = 'generate_flashcards'
    }
    const provider = normalizeProvider(body.provider)
    const apiKey = await getProviderApiKey(provider)
    if (mode === 'evaluate_quiz') {
      const payload = sanitizeQuizEvaluationPayload(body.payload)
      if (!payload) {
        return jsonResponse({ error: 'Ungueltige Bewertungsdaten uebermittelt.' }, 400)
      }

      const { evaluation, usage } = await evaluateQuizWithAi(provider, payload, apiKey, openAiModels)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ evaluation })
    }

    if (mode === 'generate_topic_suggestions') {
      const topic = typeof (body.payload as { topic?: unknown } | undefined)?.topic === 'string'
        ? String((body.payload as { topic?: unknown }).topic).trim()
        : ''
      if (!topic) {
        return jsonResponse({ error: 'Kein gueltiges Thema uebermittelt.' }, 400)
      }
      const { suggestions, usage } = await generateTopicSuggestionsWithAi(provider, topic, apiKey, openAiModels)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ suggestions })
    }

    if (mode === 'generate_flashcards') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext fuer Lernkarten uebermittelt.' }, 400)
      }
      const { flashcards, usage } = await generateFlashcardsWithAi(provider, outline, apiKey, openAiModels)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ flashcards })
    }

    if (mode === 'generate_worksheet') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext fuer Arbeitsblatt uebermittelt.' }, 400)
      }
      const { prompts, usage } = await generateWorksheetWithAi(provider, outline, apiKey, openAiModels)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ worksheetItems: prompts })
    }

    const inputMessages =
      mode === 'generate_title'
        ? Array.isArray((body.payload as { messages?: unknown } | undefined)?.messages)
          ? ((body.payload as { messages?: unknown }).messages as unknown[])
          : []
        : Array.isArray(body.messages)
          ? body.messages
          : []

    const messages: InputMessage[] = inputMessages
      .map((message) => {
        const role = typeof message?.role === 'string' ? message.role : 'user'
        const content = typeof message?.content === 'string' ? message.content.trim() : ''
        if (!content) {
          return null
        }
        if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          return null
        }
        return {
          role,
          content,
        } as InputMessage
      })
      .filter((entry): entry is InputMessage => entry !== null)

    if (messages.length === 0) {
      return jsonResponse({ error: 'Keine gueltigen Nachrichten uebermittelt.' }, 400)
    }

    if (mode === 'generate_title') {
      const { title, usage } = await generateTitleWithAi(provider, messages, apiKey, openAiModels)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ title })
    }

    if (body.stream === true && mode === 'chat' && provider === 'openai') {
      return await handleOpenAiChatStream(user.id, admin, messages, apiKey, openAiModels)
    }

    const rawMax = body.maxTokens
    const chatMaxTokens =
      typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 64
        ? Math.min(16384, Math.floor(rawMax))
        : undefined

    const chatUsage =
      provider === 'anthropic'
        ? await callAnthropic(messages, apiKey, { maxTokens: chatMaxTokens ?? 8192 })
        : await callOpenAi(messages, apiKey, openAiModels)

    await tryLogTokenUsage(admin, user.id, provider, mode, chatUsage)

    return jsonResponse({
      assistantMessage: {
        role: 'assistant',
        content: chatUsage.text,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})