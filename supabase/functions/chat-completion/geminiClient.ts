import {
  GEMINI_DEFAULT_CHAT_MODEL,
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_FLASH_LITE,
} from './geminiModels.ts'

export type GeminiModelId = typeof GEMINI_MODEL_FLASH_LITE | typeof GEMINI_MODEL_FLASH

export type GeminiUsage = {
  inputTokens: number
  outputTokens: number
  /** Aus `usageMetadata.cachedContentTokenCount` (expliziter Context Cache). */
  cachedInputTokens?: number
}

export type GeminiGenerateOptions = {
  model?: GeminiModelId
  systemInstruction?: string
  /** Statischer Prefix-Name für Context Caching (z. B. straton-intent-v1). */
  contextCacheKey?: string
  temperature?: number
  maxOutputTokens?: number
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_CONTEXT_CACHE_TTL = '86400s'

/** Warme Edge-Isolates: list/create pro displayName nur einmal pro Lebensdauer. */
const hotCachedContentByKey = new Map<string, string>()

function normalizeGeminiModel(model: string | undefined): GeminiModelId {
  const m = (model ?? '').trim()
  if (m === GEMINI_MODEL_FLASH) {
    return GEMINI_MODEL_FLASH
  }
  return GEMINI_MODEL_FLASH_LITE
}

export function getGeminiApiKey(): string {
  const key = (Deno.env.get('GEMINI_API_KEY') ?? '').trim()
  if (!key) {
    throw new Error('API Key für Provider "gemini" ist nicht als Supabase Secret gesetzt (GEMINI_API_KEY).')
  }
  return key
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableGeminiStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function formatGeminiApiError(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } }
    const apiMessage = parsed.error?.message?.trim()
    if (status === 503 || parsed.error?.status === 'UNAVAILABLE') {
      return 'Das KI-Modell (Gemini) ist gerade stark ausgelastet. Straton versucht es automatisch erneut — bitte kurz warten und nochmal senden.'
    }
    if (status === 429) {
      return 'Zu viele Anfragen an Gemini. Bitte in ein paar Sekunden erneut versuchen.'
    }
    if (apiMessage) {
      return `Gemini-Anfrage fehlgeschlagen (${status}): ${apiMessage}`
    }
  } catch {
    // Roh-JSON nicht parsebar
  }
  return `Gemini-Anfrage fehlgeschlagen (${status}). Bitte später erneut versuchen.`
}

/** Transiente Gemini-Ausfälle — Fallback auf OpenAI möglich. */
export function isGeminiTransientFailure(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }
  const message = err.message
  return (
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('429') ||
    message.includes('UNAVAILABLE') ||
    message.includes('stark ausgelastet') ||
    message.includes('Zu viele Anfragen an Gemini')
  )
}

async function geminiJson<T>(url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const maxAttempts = 3
  let lastStatus = 500
  let lastRaw = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    const raw = await res.text()
    if (res.ok) {
      return JSON.parse(raw) as T
    }

    lastStatus = res.status
    lastRaw = raw

    if (isRetryableGeminiStatus(res.status) && attempt < maxAttempts) {
      await sleep(450 * attempt)
      continue
    }

    throw new Error(formatGeminiApiError(res.status, raw))
  }

  throw new Error(formatGeminiApiError(lastStatus, lastRaw))
}

async function sha256Hex8(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
}

/** displayName + Hash: Wiederverwendung nur bei identischem Systemprompt (z. B. gleiches Datum). */
async function buildContextCacheDisplayName(
  cacheKey: string,
  systemInstruction: string,
): Promise<string> {
  const hash = await sha256Hex8(systemInstruction)
  return `${cacheKey}-${hash}`.slice(0, 128)
}

type CachedContentListEntry = {
  name?: string
  displayName?: string
  model?: string
  expireTime?: string
}

function isCachedContentStillValid(expireTime: string | undefined): boolean {
  if (!expireTime) {
    return true
  }
  const ms = Date.parse(expireTime)
  return Number.isFinite(ms) && ms > Date.now() + 30_000
}

function modelMatchesCachedEntry(model: GeminiModelId, entryModel: string | undefined): boolean {
  const expected = `models/${model}`
  const raw = (entryModel ?? '').trim()
  return raw === expected || raw.endsWith(`/${model}`)
}

/** GET cachedContents — list hat kein displayName-Filter, daher clientseitig. */
async function findReusableCachedContentName(
  apiKey: string,
  model: GeminiModelId,
  displayName: string,
): Promise<string | null> {
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      key: apiKey,
      pageSize: '100',
    })
    if (pageToken) {
      params.set('pageToken', pageToken)
    }
    const list = await geminiJson<{
      cachedContents?: CachedContentListEntry[]
      nextPageToken?: string
    }>(`${GEMINI_API_BASE}/cachedContents?${params.toString()}`, apiKey)

    for (const entry of list.cachedContents ?? []) {
      if (entry.displayName !== displayName) {
        continue
      }
      if (!modelMatchesCachedEntry(model, entry.model)) {
        continue
      }
      if (!isCachedContentStillValid(entry.expireTime)) {
        continue
      }
      if (typeof entry.name === 'string' && entry.name.length > 0) {
        return entry.name
      }
    }

    pageToken = list.nextPageToken
  } while (pageToken)

  return null
}

async function createCachedContentName(
  apiKey: string,
  model: GeminiModelId,
  systemInstruction: string,
  displayName: string,
  cacheKey: string,
): Promise<string | null> {
  try {
    const created = await geminiJson<{ name?: string }>(
      `${GEMINI_API_BASE}/cachedContents?key=${encodeURIComponent(apiKey)}`,
      apiKey,
      {
        method: 'POST',
        body: JSON.stringify({
          model: `models/${model}`,
          displayName,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          ttl: GEMINI_CONTEXT_CACHE_TTL,
        }),
      },
    )
    return typeof created.name === 'string' ? created.name : null
  } catch (err) {
    console.warn('[gemini] context cache create failed', cacheKey, err)
    return null
  }
}

/**
 * Expliziter Context Cache: vorhandene Resource wiederverwenden (list + displayName),
 * sonst einmalig anlegen (TTL 24h). Geht über die offizielle cachedContents-API.
 */
async function resolveCachedContentName(
  apiKey: string,
  model: GeminiModelId,
  systemInstruction: string,
  cacheKey: string,
): Promise<string | null> {
  const displayName = await buildContextCacheDisplayName(cacheKey, systemInstruction)
  const hotKey = `${model}|${displayName}`
  const hot = hotCachedContentByKey.get(hotKey)
  if (hot) {
    return hot
  }

  const existing = await findReusableCachedContentName(apiKey, model, displayName)
  if (existing) {
    hotCachedContentByKey.set(hotKey, existing)
    console.log('[gemini] context cache reuse', cacheKey, displayName)
    return existing
  }

  const created = await createCachedContentName(
    apiKey,
    model,
    systemInstruction,
    displayName,
    cacheKey,
  )
  if (created) {
    hotCachedContentByKey.set(hotKey, created)
    console.log('[gemini] context cache create', cacheKey, displayName)
  }
  return created
}

export type GeminiInlineDataPart = {
  inlineData: { mimeType: string; data: string }
}

export type GeminiTextPart = { text: string }

export type GeminiContentPart = GeminiTextPart | GeminiInlineDataPart

export type GeminiContentTurn = {
  role: 'user' | 'model'
  parts: GeminiContentPart[]
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    cachedContentTokenCount?: number
  }
}

function parseUsageFromResponse(data: GenerateContentResponse): GeminiUsage {
  const cachedInputTokens = Math.max(
    0,
    Math.floor(Number(data.usageMetadata?.cachedContentTokenCount ?? 0)),
  )
  return {
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
  }
}

function extractTextFromResponse(data: GenerateContentResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

/**
 * Text-Completion über Gemini REST (`generateContent`).
 * Context Cache optional bei `contextCacheKey` + `systemInstruction`.
 */
export async function geminiGenerateText(
  userPrompt: string,
  options?: GeminiGenerateOptions,
): Promise<{ text: string; usage: GeminiUsage; model: GeminiModelId }> {
  const apiKey = getGeminiApiKey()
  const model = normalizeGeminiModel(options?.model)
  const systemInstruction = (options?.systemInstruction ?? '').trim()

  let cachedContent: string | null = null
  if (systemInstruction && options?.contextCacheKey) {
    cachedContent = await resolveCachedContentName(
      apiKey,
      model,
      systemInstruction,
      options.contextCacheKey,
    )
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.2,
      maxOutputTokens: options?.maxOutputTokens ?? 4096,
    },
  }

  if (cachedContent) {
    body.cachedContent = cachedContent
  } else if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const data = await geminiJson<GenerateContentResponse>(
    `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    apiKey,
    { method: 'POST', body: JSON.stringify(body) },
  )

  const text = extractTextFromResponse(data)
  if (!text) {
    throw new Error('Gemini hat keine Textantwort geliefert.')
  }

  return { text, usage: parseUsageFromResponse(data), model }
}

/** Mehrturn-Chat inkl. `inlineData` (Fotos) über Gemini REST. */
export async function geminiGenerateContents(
  contents: GeminiContentTurn[],
  options?: GeminiGenerateOptions,
): Promise<{ text: string; usage: GeminiUsage; model: GeminiModelId }> {
  if (contents.length === 0) {
    throw new Error('Keine gültigen Nachrichten für Gemini.')
  }

  const apiKey = getGeminiApiKey()
  const model = normalizeGeminiModel(options?.model)
  const systemInstruction = (options?.systemInstruction ?? '').trim()

  let cachedContent: string | null = null
  if (systemInstruction && options?.contextCacheKey) {
    cachedContent = await resolveCachedContentName(
      apiKey,
      model,
      systemInstruction,
      options.contextCacheKey,
    )
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options?.temperature ?? 0.35,
      maxOutputTokens: options?.maxOutputTokens ?? 8192,
    },
  }

  if (cachedContent) {
    body.cachedContent = cachedContent
  } else if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const data = await geminiJson<GenerateContentResponse>(
    `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    apiKey,
    { method: 'POST', body: JSON.stringify(body) },
  )

  const text = extractTextFromResponse(data)
  if (!text) {
    throw new Error('Gemini hat keine Textantwort geliefert.')
  }

  return { text, usage: parseUsageFromResponse(data), model }
}

/** PDF-OCR-Abgleich: fehlender Text aus Scan/Bildern ergänzen (sparsam, nur bei dünnem Textlayer). */
export async function geminiReconcilePdfText(
  pdfBytes: Uint8Array,
  textLayer: string,
): Promise<string> {
  const apiKey = getGeminiApiKey()
  const model = GEMINI_DEFAULT_CHAT_MODEL
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < pdfBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize))
  }
  const b64 = btoa(binary)

  const prompt = [
    'Du erhältst ein PDF und einen bereits extrahierten Textlayer.',
    'Liefere NUR Text, der im PDF vorkommt, aber im Textlayer fehlt (z. B. eingescannte Seiten, Bilder mit Schrift).',
    'Keine Meta-Kommentare. Schweizer Hochdeutsch (ss statt ß).',
    'Wenn nichts fehlt: antworte exakt mit: KEIN_ZUSATZTEXT',
    '',
    '--- Textlayer ---',
    textLayer.slice(0, 120_000),
  ].join('\n')

  const data = await geminiJson<GenerateContentResponse>(
    `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: b64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    },
  )

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()

  if (!text || text === 'KEIN_ZUSATZTEXT') {
    return ''
  }
  return text
}
