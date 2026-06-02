// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type PlanRow = {
  image_generation_model: string | null
  max_images: number | null
}

function openAiImageModelFromPlan(raw: string | null): 'gpt-image-1' | 'gpt-image-2' {
  const t = (raw ?? '').trim()
  if (t === 'gpt_image_2') {
    return 'gpt-image-2'
  }
  return 'gpt-image-1'
}

/** Näherung an OpenAI GPT-Image-Tarife (USD pro 1M Input-/Output-Tokens laut API-usage). */
function estimateGptImageUsageUsd(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase()
  const gpt2 = m.includes('gpt-image-2')
  const inPerM = 5
  const outPerM = gpt2 ? 10 : 8.5
  return (
    (Math.max(0, inputTokens) / 1_000_000) * inPerM +
    (Math.max(0, outputTokens) / 1_000_000) * outPerM
  )
}

const MAX_DIRECT_PROMPT_CHARS = 4000
const MAX_FULL_PROMPT_CHARS = 14000
const MAX_CONTEXT_MESSAGES = 28
const MAX_CONTEXT_MESSAGE_CHARS = 3200
const IMAGE_OUTPUT_SIZE = '1024x1024'
const MAX_SOURCE_IMAGE_DATA_URL_CHARS = 6_500_000

function stripHeavyMediaForContext(s: string): string {
  return s
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, '[Bild]')
    .replace(/@chat-media:[^\s)\]]+/gi, '[Generiertes Bild]')
}

type ContextTurn = { role: string; content: string }

function normalizeContextMessages(raw: unknown): ContextTurn[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: ContextTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') {
      continue
    }
    if (typeof content !== 'string') {
      continue
    }
    const trimmed = stripHeavyMediaForContext(content).trim()
    if (!trimmed.length) {
      continue
    }
    out.push({
      role,
      content: trimmed.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
    })
  }
  return out
}

/** Kontext + aktuelle Bildbitte zu einem Prompt für die Images-API (ein Feld). */
function buildFullImagePrompt(directPrompt: string, turns: ContextTurn[]): string {
  if (turns.length === 0) {
    return directPrompt.slice(0, MAX_FULL_PROMPT_CHARS)
  }
  const header =
    'Chat-Verlauf (nur Kontext: Stil, Motive, frühere Bildwünsche und Anpassungen). Die «Aktuelle Bildbitte» am Ende ist das Wesentliche:\n\n'
  const tail = `\n---\nAktuelle Bildbitte (primär umsetzen): ${directPrompt}`
  let body = ''
  const recent = turns.slice(-MAX_CONTEXT_MESSAGES)
  for (const t of recent) {
    const tag = t.role === 'user' ? 'Nutzer' : 'Assistent'
    const piece = `${tag}: ${t.content}\n\n`
    if (header.length + body.length + piece.length + tail.length > MAX_FULL_PROMPT_CHARS) {
      break
    }
    body += piece
  }
  return (header + body + tail).slice(0, MAX_FULL_PROMPT_CHARS)
}

function buildEditImagePrompt(directPrompt: string, turns: ContextTurn[]): string {
  const header =
    'Bearbeite das angehängte Referenzbild gemäss der Anweisung. Behalte Komposition und erkennbare Motive bei, sofern nicht anders verlangt.\n\n'
  const base = buildFullImagePrompt(directPrompt, turns)
  return `${header}${base}`.slice(0, MAX_FULL_PROMPT_CHARS)
}

function sanitizeSourceImageDataUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const t = raw.trim()
  if (!t.startsWith('data:image/') || t.length < 96 || t.length > MAX_SOURCE_IMAGE_DATA_URL_CHARS) {
    return null
  }
  if (!/;base64,/i.test(t)) {
    return null
  }
  return t
}

type OpenAiImagesResponse = {
  error?: { message?: string }
  data?: Array<{ b64_json?: string }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

async function callOpenAiImageGeneration(
  apiKey: string,
  apiModel: string,
  prompt: string,
): Promise<{ dataUrl: string; usage: OpenAiImagesResponse['usage'] }> {
  const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiModel,
      prompt,
      n: 1,
      size: IMAGE_OUTPUT_SIZE,
      quality: 'medium',
    }),
  })

  const openAiJson = (await openAiRes.json()) as OpenAiImagesResponse
  if (!openAiRes.ok) {
    const detail =
      typeof openAiJson?.error?.message === 'string'
        ? openAiJson.error.message
        : `OpenAI Images (${openAiRes.status})`
    throw new Error(`Bildgenerierung fehlgeschlagen: ${detail}`)
  }

  const b64 = openAiJson?.data?.[0]?.b64_json
  if (typeof b64 !== 'string' || !b64.trim()) {
    throw new Error('OpenAI hat kein Bild geliefert.')
  }

  return {
    dataUrl: `data:image/png;base64,${b64.trim()}`,
    usage: openAiJson.usage,
  }
}

async function callOpenAiImageEdit(
  apiKey: string,
  apiModel: string,
  prompt: string,
  sourceImageDataUrl: string,
): Promise<{ dataUrl: string; usage: OpenAiImagesResponse['usage'] }> {
  const openAiRes = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiModel,
      prompt,
      images: [{ image_url: sourceImageDataUrl }],
      n: 1,
      size: IMAGE_OUTPUT_SIZE,
      quality: 'medium',
    }),
  })

  const openAiJson = (await openAiRes.json()) as OpenAiImagesResponse
  if (!openAiRes.ok) {
    const detail =
      typeof openAiJson?.error?.message === 'string'
        ? openAiJson.error.message
        : `OpenAI Image Edit (${openAiRes.status})`
    throw new Error(`Bildbearbeitung fehlgeschlagen: ${detail}`)
  }

  const b64 = openAiJson?.data?.[0]?.b64_json
  if (typeof b64 !== 'string' || !b64.trim()) {
    throw new Error('OpenAI hat kein bearbeitetes Bild geliefert.')
  }

  return {
    dataUrl: `data:image/png;base64,${b64.trim()}`,
    usage: openAiJson.usage,
  }
}

function normalizeImageUsage(
  usage: OpenAiImagesResponse['usage'] | undefined,
): { inputTokens: number; outputTokens: number } {
  let inputTokens =
    typeof usage?.input_tokens === 'number' && Number.isFinite(usage.input_tokens)
      ? Math.max(0, Math.floor(usage.input_tokens))
      : 0
  let outputTokens =
    typeof usage?.output_tokens === 'number' && Number.isFinite(usage.output_tokens)
      ? Math.max(0, Math.floor(usage.output_tokens))
      : 0
  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    typeof usage?.total_tokens === 'number' &&
    Number.isFinite(usage.total_tokens) &&
    usage.total_tokens > 0
  ) {
    const total = Math.floor(usage.total_tokens)
    inputTokens = Math.min(total, Math.max(1, Math.floor(total * 0.15)))
    outputTokens = Math.max(0, total - inputTokens)
  }
  return { inputTokens, outputTokens }
}

async function logAiTokenUsage(
  admin: SupabaseClient | null,
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  mode: 'generate_chat_image' | 'generate_chat_image_edit' = 'generate_chat_image',
) {
  if (!admin) {
    return
  }
  const estimated_cost_usd = estimateGptImageUsageUsd(model, inputTokens, outputTokens)
  const { error } = await admin.from('ai_token_usage').insert({
    user_id: userId,
    provider: 'openai',
    model: model.slice(0, 160),
    mode,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd,
  })
  if (error) {
    console.error('[generate-chat-image] ai_token_usage insert failed', error.message)
  }
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
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }
  if (!openAiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY fehlt.' }, 500)
  }
  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  let bodyJson: { prompt?: unknown; contextMessages?: unknown; sourceImageDataUrl?: unknown }
  try {
    bodyJson = (await req.json()) as {
      prompt?: unknown
      contextMessages?: unknown
      sourceImageDataUrl?: unknown
    }
  } catch {
    return jsonResponse({ error: 'Ungültiger JSON-Body.' }, 400)
  }

  const directPrompt =
    typeof bodyJson.prompt === 'string'
      ? bodyJson.prompt.trim().slice(0, MAX_DIRECT_PROMPT_CHARS)
      : ''
  if (!directPrompt.length) {
    return jsonResponse({ error: 'Bitte einen Bild-Prompt angeben (kurzer Text).' }, 400)
  }

  const contextTurns = normalizeContextMessages(bodyJson.contextMessages)
  const sourceImageDataUrl = sanitizeSourceImageDataUrl(bodyJson.sourceImageDataUrl)
  const isEdit = Boolean(sourceImageDataUrl)
  const prompt = isEdit
    ? buildEditImagePrompt(directPrompt, contextTurns)
    : buildFullImagePrompt(directPrompt, contextTurns)

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungültig.' }, 401)
  }

  const adminClient = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null

  const { data: profileRow, error: profileErr } = await userClient
    .from('profiles')
    .select(
      'is_superadmin, subscription_plan_id, subscription_plans ( image_generation_model, max_images )',
    )
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return jsonResponse({ error: 'Profil konnte nicht geladen werden.' }, 500)
  }

  const isSuperadmin = profileRow?.is_superadmin === true
  const nested = profileRow?.subscription_plans as PlanRow | PlanRow[] | null | undefined
  const plan: PlanRow | null = Array.isArray(nested) ? (nested[0] ?? null) : nested ?? null

  const apiModel = openAiImageModelFromPlan(plan?.image_generation_model ?? null)

  if (!isSuperadmin && plan?.max_images != null) {
    await userClient.rpc('subscription_usage_reset_if_new_day', { p_user_id: user.id })

    const { data: usageRow } = await userClient
      .from('subscription_usages')
      .select('image_credit_balance')
      .eq('user_id', user.id)
      .maybeSingle()

    const balance =
      typeof usageRow?.image_credit_balance === 'number' ? usageRow.image_credit_balance : 0
    if (balance < 1) {
      return jsonResponse(
        {
          error:
            'Kein Bild-Guthaben mehr. Dein Kontingent lädt täglich auf (bis zu 60 angespart).',
        },
        429,
      )
    }
  }

  let dataUrl: string
  let inputTokens = 0
  let outputTokens = 0
  try {
    const result = isEdit
      ? await callOpenAiImageEdit(openAiKey, apiModel, prompt, sourceImageDataUrl!)
      : await callOpenAiImageGeneration(openAiKey, apiModel, prompt)
    dataUrl = result.dataUrl
    const normalized = normalizeImageUsage(result.usage)
    inputTokens = normalized.inputTokens
    outputTokens = normalized.outputTokens
  } catch (imageErr) {
    const message = imageErr instanceof Error ? imageErr.message : 'Bildverarbeitung fehlgeschlagen.'
    return jsonResponse({ error: message }, 502)
  }

  await logAiTokenUsage(
    adminClient,
    user.id,
    apiModel,
    inputTokens,
    outputTokens,
    isEdit ? 'generate_chat_image_edit' : 'generate_chat_image',
  )

  /** Immer Zähler erhöhen (auch Superadmin): RPC setzt bei Superadmin keine Limits, nur Statistik/Guthaben-Logik. */
  const { error: quotaErr } = await userClient.rpc('user_increment_subscription_usage', {
    p_user_id: user.id,
    p_used_tokens_delta: 0,
    p_used_images_delta: 1,
    p_used_files_delta: 0,
  })
  if (quotaErr) {
    const msg =
      typeof quotaErr.message === 'string' && quotaErr.message.includes('Bilder Limit')
        ? 'Bild-Limit erreicht.'
        : 'Nutzungszähler konnte nicht aktualisiert werden.'
    return jsonResponse({ error: msg }, 429)
  }

  const assistantMarkdown = `![Generiertes Bild](${dataUrl})`

  return jsonResponse({
    assistantMarkdown,
    openAiModel: apiModel,
    imageMode: isEdit ? 'edit' : 'generate',
    outputSize: IMAGE_OUTPUT_SIZE,
  })
})
