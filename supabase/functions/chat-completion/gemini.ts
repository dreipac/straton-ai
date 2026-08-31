/**
 * Google Gemini API (Smart Instant): generateContent + streamGenerateContent.
 * API-Key: Supabase Secret `GEMINI_API_KEY` (Google AI Studio).
 */

export const DEFAULT_GEMINI_CHAT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
] as const

export const DEFAULT_GEMINI_INSTANT_ANALYZE_MODELS = DEFAULT_GEMINI_CHAT_MODELS

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export type GeminiInputMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type GeminiCallResult = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export function sanitizeGeminiModelsOverride(value: unknown): string[] | null {
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

export function geminiRatesForEstimate(model: string): { inPerM: number; outPerM: number } | null {
  const m = model.toLowerCase()
  if (m.includes('flash-lite') || m.includes('flash_lite')) {
    return { inPerM: 0.25, outPerM: 1.5 }
  }
  if (m.includes('flash')) {
    return { inPerM: 0.35, outPerM: 2.0 }
  }
  return null
}

function parseDataUrlForGeminiInline(dataUrl: string): { mimeType: string; data: string } | null {
  let t = dataUrl.trim().replace(/^data:image\/jpg;/i, 'data:image/jpeg;')
  const m = t.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i)
  if (!m) {
    return null
  }
  const data = m[2].replace(/\s/g, '')
  if (data.length < 32) {
    return null
  }
  return { mimeType: m[1].toLowerCase(), data }
}

function stripBildDataBlocks(content: string): string {
  let out = ''
  let cursor = 0
  const closeTag = '[/BildData]'
  while (cursor < content.length) {
    const openIdx = content.indexOf('[BildData:', cursor)
    if (openIdx === -1) {
      out += content.slice(cursor)
      break
    }
    out += content.slice(cursor, openIdx)
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      break
    }
    cursor = closeIdx + closeTag.length
  }
  return out.trim()
}

function extractVisionDataUrlFromContent(content: string): string | null {
  const closeTag = '[/BildData]'
  let searchFrom = 0
  while (searchFrom < content.length) {
    const openIdx = content.indexOf('[BildData:', searchFrom)
    if (openIdx === -1) {
      break
    }
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      break
    }
    const inner = content.slice(openIdx, closeIdx + closeTag.length)
    if (inner.includes('data:image/')) {
      const dataIdx = inner.indexOf('data:image/')
      const slice = inner.slice(dataIdx)
      const end = slice.search(/\s|\[/)
      const candidate = end === -1 ? slice : slice.slice(0, end)
      if (candidate.startsWith('data:image/')) {
        return candidate
      }
    }
    searchFrom = closeIdx + closeTag.length
  }
  const inline = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/i)
  return inline?.[0]?.replace(/\s/g, '') ?? null
}

function buildGeminiParts(
  content: string,
  visionOverrideUrl?: string | null,
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = []
  const text = stripBildDataBlocks(content)
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/gi, '')
    .trim()
  if (text) {
    parts.push({ text })
  }
  const visionUrl =
    (typeof visionOverrideUrl === 'string' && visionOverrideUrl.trim().startsWith('data:image/')
      ? visionOverrideUrl.trim()
      : null) ?? extractVisionDataUrlFromContent(content)
  if (visionUrl) {
    const inline = parseDataUrlForGeminiInline(visionUrl)
    if (inline) {
      parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } })
    }
  }
  if (parts.length === 0) {
    parts.push({ text: 'Bitte antworte auf die Anfrage.' })
  }
  return parts
}

function geminiRequestBody(
  messages: GeminiInputMessage[],
  options: {
    maxOutputTokens?: number
    thinkingLevel?: string
    visionOverrideUrl?: string | null
  },
): Record<string, unknown> {
  const systemLines: string[] = []
  const turns: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []
  let lastUserIdx = -1
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === 'user') {
      lastUserIdx = i
    }
  }

  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]!
    if (m.role === 'system') {
      systemLines.push(m.content)
      continue
    }
    const role = m.role === 'assistant' ? 'model' : 'user'
    const visionUrl = i === lastUserIdx ? options.visionOverrideUrl : null
    turns.push({ role, parts: buildGeminiParts(m.content, visionUrl) })
  }

  const merged: typeof turns = []
  for (const turn of turns) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) {
      const prevText = (last.parts.find((p) => typeof (p as { text?: string }).text === 'string') as
        | { text?: string }
        | undefined)?.text ?? ''
      const nextText = (turn.parts.find((p) => typeof (p as { text?: string }).text === 'string') as
        | { text?: string }
        | undefined)?.text ?? ''
      const combined = [prevText, nextText].filter(Boolean).join('\n\n')
      const inlineParts = turn.parts.filter((p) => 'inlineData' in p)
      last.parts = [{ text: combined || '…' }, ...inlineParts]
    } else {
      merged.push({ role: turn.role, parts: [...turn.parts] })
    }
  }

  if (merged.length > 0 && merged[0]!.role === 'model') {
    merged.unshift({ role: 'user', parts: [{ text: 'Hallo.' }] })
  }

  const body: Record<string, unknown> = {
    contents: merged.map((t) => ({ role: t.role, parts: t.parts })),
    generationConfig: {
      maxOutputTokens: Math.min(32768, Math.max(16, Math.floor(options.maxOutputTokens ?? 8192))),
      thinkingConfig: { thinkingLevel: options.thinkingLevel ?? 'minimal' },
    },
  }
  if (systemLines.length > 0) {
    body.systemInstruction = { parts: [{ text: systemLines.join('\n\n') }] }
  }
  return body
}

function parseGeminiGenerateResponse(
  data: Record<string, unknown>,
  fallbackModel: string,
): GeminiCallResult | null {
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined
  const parts = (candidates?.[0]?.content as { parts?: Array<{ text?: string }> } | undefined)?.parts
  const text = parts
    ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
  if (!text) {
    return null
  }
  const usage = data.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number }
    | undefined
  const model =
    typeof data.modelVersion === 'string' && data.modelVersion.trim()
      ? data.modelVersion.trim()
      : fallbackModel
  return {
    text,
    model,
    inputTokens: Math.max(0, Math.floor(Number(usage?.promptTokenCount ?? 0))),
    outputTokens: Math.max(0, Math.floor(Number(usage?.candidatesTokenCount ?? 0))),
  }
}

function formatGeminiHttpError(status: number, errorText: string): string {
  let detail = errorText.slice(0, 500)
  try {
    const j = JSON.parse(errorText) as { error?: { message?: string } }
    if (typeof j.error?.message === 'string' && j.error.message.trim()) {
      detail = j.error.message.trim()
    }
  } catch {
    /* raw */
  }
  return `Gemini Anfrage fehlgeschlagen (${status}): ${detail}`
}

function isGeminiModelUnavailable(status: number, errorText: string): boolean {
  if (status !== 404 && status !== 400) {
    return false
  }
  const e = errorText.toLowerCase()
  return e.includes('model') || e.includes('not found') || e.includes('does not exist')
}

export async function callGemini(
  messages: GeminiInputMessage[],
  apiKey: string,
  models?: string[],
  maxOutputTokens?: number,
  visionOverrideUrl?: string | null,
): Promise<GeminiCallResult> {
  const modelsToTry =
    Array.isArray(models) && models.length > 0 ? models : [...DEFAULT_GEMINI_CHAT_MODELS]

  for (const model of modelsToTry) {
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(
        geminiRequestBody(messages, {
          maxOutputTokens,
          thinkingLevel: 'minimal',
          visionOverrideUrl,
        }),
      ),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[chat-completion] Gemini HTTP error', response.status, errorText.slice(0, 800))
      if (isGeminiModelUnavailable(response.status, errorText) && model !== modelsToTry[modelsToTry.length - 1]) {
        continue
      }
      throw new Error(formatGeminiHttpError(response.status, errorText))
    }

    const data = (await response.json()) as Record<string, unknown>
    const parsed = parseGeminiGenerateResponse(data, model)
    if (parsed) {
      return parsed
    }
  }

  throw new Error('Gemini hat keine Antwort geliefert.')
}

async function* iterateGeminiSseBytes(body: ReadableStream<Uint8Array>): AsyncGenerator<{
  delta?: string
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number }
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
      const lines = carry.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) {
          continue
        }
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') {
          continue
        }
        try {
          const json = JSON.parse(data) as Record<string, unknown>
          const model =
            typeof json.modelVersion === 'string' ? json.modelVersion : undefined
          const usage = json.usageMetadata as
            | { promptTokenCount?: number; candidatesTokenCount?: number }
            | undefined
          const candidates = json.candidates as Array<Record<string, unknown>> | undefined
          const parts = (candidates?.[0]?.content as { parts?: Array<{ text?: string }> } | undefined)
            ?.parts
          const deltaText = parts
            ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
            .join('')
          if (model || deltaText || usage) {
            yield {
              delta: deltaText && deltaText.length > 0 ? deltaText : undefined,
              usage,
              model,
            }
          }
        } catch {
          /* unparseable */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function handleGeminiChatStream(
  userId: string,
  admin: { from: (table: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } } | null,
  messages: GeminiInputMessage[],
  apiKey: string,
  geminiModels: string[],
  maxOutputTokens: number | undefined,
  visionOverrideUrl: string | null | undefined,
  corsHeaders: Record<string, string>,
  logUsage: (
    admin: typeof admin,
    userId: string,
    result: GeminiCallResult,
  ) => Promise<void>,
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
      const modelsToTry = geminiModels.length > 0 ? geminiModels : [...DEFAULT_GEMINI_CHAT_MODELS]

      outer: for (const model of modelsToTry) {
        const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(
            geminiRequestBody(messages, {
              maxOutputTokens,
              thinkingLevel: 'minimal',
              visionOverrideUrl,
            }),
          ),
        })

        if (!res.ok) {
          const errorText = await res.text()
          console.error('[chat-completion] Gemini stream HTTP error', res.status, errorText.slice(0, 600))
          if (isGeminiModelUnavailable(res.status, errorText) && model !== modelsToTry[modelsToTry.length - 1]) {
            continue outer
          }
          await writeSse({
            type: 'error',
            message: formatGeminiHttpError(res.status, errorText),
          })
          closed = true
          break outer
        }

        if (!res.body) {
          continue outer
        }

        let fullText = ''
        let usedModel = model
        let inputTokens = 0
        let outputTokens = 0

        try {
          for await (const chunk of iterateGeminiSseBytes(res.body)) {
            if (chunk.model) {
              usedModel = chunk.model
            }
            if (chunk.delta) {
              fullText += chunk.delta
              await writeSse({ type: 'delta', t: chunk.delta })
            }
            if (chunk.usage) {
              inputTokens = Math.max(
                inputTokens,
                Math.max(0, Math.floor(Number(chunk.usage.promptTokenCount ?? 0))),
              )
              outputTokens = Math.max(
                outputTokens,
                Math.max(0, Math.floor(Number(chunk.usage.candidatesTokenCount ?? 0))),
              )
            }
          }
        } catch (readErr) {
          console.error('[chat-completion] Gemini stream read error', readErr)
          await writeSse({
            type: 'error',
            message: readErr instanceof Error ? readErr.message : 'Stream Lesefehler',
          })
          closed = true
          break outer
        }

        const trimmed = fullText.trim()
        if (!trimmed) {
          continue outer
        }

        const usageResult: GeminiCallResult = {
          text: trimmed,
          model: usedModel,
          inputTokens,
          outputTokens,
        }
        await logUsage(admin, userId, usageResult)
        await writeSse({
          type: 'done',
          model: usedModel,
          inputTokens,
          outputTokens,
        })
        closed = true
        break outer
      }

      if (!closed) {
        await writeSse({ type: 'error', message: 'Gemini Streaming lieferte keinen Text.' })
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
