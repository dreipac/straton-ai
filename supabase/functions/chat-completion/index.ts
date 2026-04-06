// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

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

async function callOpenAi(messages: InputMessage[], apiKey: string, models?: string[]): Promise<string> {
  const modelsToTry =
    Array.isArray(models) && models.length > 0 ? models : (['gpt-5-mini', 'gpt-4o-mini'] as string[])

  for (const model of modelsToTry) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const modelUnavailable =
        response.status === 400 &&
        (errorText.includes('model') || errorText.includes('does not exist') || errorText.includes('not found'))

      if (modelUnavailable && model !== modelsToTry[modelsToTry.length - 1]) {
        continue
      }

      throw new Error(`OpenAI Anfrage fehlgeschlagen (${response.status}).`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (content) {
      return content
    }
  }

  throw new Error('OpenAI hat keine Antwort geliefert.')
}

/**
 * Lernpfad: Claude Sonnet (per Secret ANTHROPIC_MODEL überschreibbar).
 * Default: claude-sonnet-4-6 (ältere IDs wie claude-3-5-sonnet-20241022 sind bei Anthropic retired → oft HTTP 404).
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
): Promise<string> {
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
    const hint =
      response.status === 404
        ? ' (Modell-ID unbekannt/retired? Secret ANTHROPIC_MODEL prüfen oder Edge Function deployen.)'
        : ''
    throw new Error(
      `Anthropic Anfrage fehlgeschlagen (${response.status}).${hint}${errBody ? ` ${errBody.slice(0, 400)}` : ''}`,
    )
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const content = data.content?.find((entry) => entry.type === 'text')?.text?.trim()
  if (!content) {
    throw new Error('Anthropic hat keine Antwort geliefert.')
  }

  return content
}

async function evaluateQuizWithAi(
  provider: Provider,
  payload: QuizEvaluationPayload,
  apiKey: string,
): Promise<QuizEvaluationResult> {
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

  const raw =
    provider === 'anthropic'
      ? await callAnthropic(evaluationMessages, apiKey, { maxTokens: 512 })
      : await callOpenAi(evaluationMessages, apiKey)

  return parseQuizEvaluationResult(raw)
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
): Promise<string> {
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

  const raw =
    provider === 'anthropic'
      ? await callAnthropic(titleMessages, apiKey, { maxTokens: 256 })
      : await callOpenAi(titleMessages, apiKey)

  const cleaned = sanitizeGeneratedTitle(raw)
  if (!cleaned) {
    throw new Error('Titel konnte nicht generiert werden.')
  }
  return cleaned
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
): Promise<FlashcardPayload[]> {
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

  const raw =
    provider === 'anthropic'
      ? await callAnthropic(flashcardMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(flashcardMessages, apiKey, ['gpt-4o-mini', 'gpt-4o'])

  const cards = parseFlashcardsFromRaw(raw)
  if (cards.length === 0) {
    throw new Error('Lernkarten konnten nicht aus der KI-Antwort gelesen werden.')
  }
  return cards
}

async function generateWorksheetWithAi(
  provider: Provider,
  chapterOutline: string,
  apiKey: string,
): Promise<WorksheetPromptPayload[]> {
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

  const raw =
    provider === 'anthropic'
      ? await callAnthropic(worksheetMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(worksheetMessages, apiKey, ['gpt-4o-mini', 'gpt-4o'])

  const items = parseWorksheetPromptsFromRaw(raw)
  if (items.length === 0) {
    throw new Error('Arbeitsblatt konnte nicht aus der KI-Antwort gelesen werden.')
  }
  return items
}

async function generateTopicSuggestionsWithAi(
  provider: Provider,
  topic: string,
  apiKey: string,
): Promise<string[]> {
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

  const raw =
    provider === 'anthropic'
      ? await callAnthropic(suggestionMessages, apiKey, { maxTokens: 1024 })
      : await callOpenAi(suggestionMessages, apiKey)

  const suggestions = sanitizeTopicSuggestions(raw)
  if (suggestions.length === 0) {
    throw new Error('Unterthemen konnten nicht generiert werden.')
  }
  return suggestions
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

  try {
    const body = (await req.json()) as {
      mode?: unknown
      provider?: unknown
      messages?: unknown
      payload?: { messages?: unknown; topic?: unknown } | unknown
    }
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

      const evaluation = await evaluateQuizWithAi(provider, payload, apiKey)
      return jsonResponse({ evaluation })
    }

    if (mode === 'generate_topic_suggestions') {
      const topic = typeof (body.payload as { topic?: unknown } | undefined)?.topic === 'string'
        ? String((body.payload as { topic?: unknown }).topic).trim()
        : ''
      if (!topic) {
        return jsonResponse({ error: 'Kein gueltiges Thema uebermittelt.' }, 400)
      }
      const suggestions = await generateTopicSuggestionsWithAi(provider, topic, apiKey)
      return jsonResponse({ suggestions })
    }

    if (mode === 'generate_flashcards') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext fuer Lernkarten uebermittelt.' }, 400)
      }
      const flashcards = await generateFlashcardsWithAi(provider, outline, apiKey)
      return jsonResponse({ flashcards })
    }

    if (mode === 'generate_worksheet') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext fuer Arbeitsblatt uebermittelt.' }, 400)
      }
      const prompts = await generateWorksheetWithAi(provider, outline, apiKey)
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
      const title = await generateTitleWithAi(provider, messages, apiKey)
      return jsonResponse({ title })
    }

    const assistantContent =
      provider === 'anthropic'
        ? await callAnthropic(messages, apiKey, { maxTokens: 8192 })
        : await callOpenAi(messages, apiKey)

    return jsonResponse({
      assistantMessage: {
        role: 'assistant',
        content: assistantContent,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})