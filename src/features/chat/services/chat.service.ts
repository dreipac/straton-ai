import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import {
  getAssistantEmojiStyleInstruction,
  getAssistantMainChatBrevityInstruction,
  getAssistantMarkdownFormattingInstruction,
} from '../constants/chatAssistantStyle'
import { env } from '../../../config/env'
import { getMockAssistantReply } from '../../../integrations/ai/mockAiAdapter'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { LearnFlashcard, LearnWorksheetItem } from '../../learn/services/learn.persistence'
import {
  buildExcelSpecSonnetSystemPrompt,
  EXCEL_CHAT_SHORT_REPLY_HINT,
  EXCEL_SPEC_CACHE_EPOCH,
} from '../constants/excelExportPrompt'
import { AI_CACHE_TTL, getOrSetCachedResponse } from '../../../integrations/ai/aiResponseCache'
import type { ChatMessage, ChatMessageExcelExport } from '../types'
import { evaluateInteractiveAnswer, isMatchQuestion, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'

type SendMessageResult = {
  assistantMessage: ChatMessage
}

type GenerateTitleResult = {
  title: string
}

type GenerateTopicSuggestionsResult = {
  suggestions: string[]
}

export type SendMessageOptions = {
  /** Zweiter System-Block (z. B. Lerntutor); unter den Basis-Quiz-Regeln. */
  systemPrompt?: string
  /** Ersetzt den Standard-Basisblock (Straton / Quiz-JSON-Regeln). */
  interactiveQuizPrompt?: string
  /**
   * Lernpfad / Learn-UI: Antwort über OpenAI GPT-5 mini (Edge). Ohne Flag: OpenAI für den Hauptchat.
   */
  useLearnPathModel?: boolean
  /**
   * Nutzer hat Excel/XLSX angefragt: OpenAI bekommt kurzen Hinweis, kein Excel-JSON.
   * Spezifikation laeuft separat ueber {@link generateExcelSpecWithSonnet}.
   */
  userRequestedExcel?: boolean
  /**
   * Optional: OpenAI-Modellreihenfolge fuer `chat-completion` (z. B. Lernkapitel-Hilfe).
   * Edge Function: sonst budgetbasierte Standardliste.
   */
  openAiModels?: string[]
}

type EvaluateQuizAnswerInput = {
  question: InteractiveQuizQuestion
  userAnswer: string
}

type EvaluateQuizAnswerResult = {
  isCorrect: boolean
  feedback: string
}

type GatewayMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const MAX_CHAT_TITLE_LENGTH = 42

function createAssistantMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

/** Liefert die vom Server gesendete Fehlermeldung (z. B. `{ error: "..." }`), sonst Status-Hinweis. */
async function messageFromFunctionsInvokeFailure(
  error: unknown,
  response: Response | undefined,
): Promise<string> {
  if (response) {
    try {
      const text = (await response.text()).trim()
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown }
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim()
          }
        } catch {
          if (text.length < 800) {
            return text
          }
        }
      }
    } catch {
      // Response-Body nicht lesbar
    }
    if (response.status === 401) {
      return 'Nicht angemeldet oder Sitzung abgelaufen. Bitte neu anmelden.'
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unbekannter Edge-Function-Fehler.'
}

function buildGatewayMessages(messages: ChatMessage[], options?: SendMessageOptions): GatewayMessage[] {
  const baseQuiz =
    options?.interactiveQuizPrompt?.trim() || DEFAULT_SYSTEM_PROMPTS.interactive_quiz
  const excelChatHint = options?.userRequestedExcel ? EXCEL_CHAT_SHORT_REPLY_HINT : ''
  const mainChatBrevity = options?.useLearnPathModel ? '' : getAssistantMainChatBrevityInstruction()
  const combinedSystemPrompt = [
    baseQuiz,
    options?.systemPrompt?.trim() ?? '',
    excelChatHint,
    mainChatBrevity,
    getAssistantMarkdownFormattingInstruction(),
    getAssistantEmojiStyleInstruction(),
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: combinedSystemPrompt,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

/** Echter KI-Call (nicht Mock). Chat und Lernpfad = OpenAI (Lernpfad: GPT-5 mini über Edge, siehe chat-completion). */
export function usesGatewayAi(): boolean {
  return env.aiProvider !== 'mock'
}

export async function generateExcelFromSpec(input: {
  messageId: string
  threadId: string
  spec: unknown
}): Promise<{ excelExport: ChatMessageExcelExport; displayContent: string }> {
  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('generate-excel-from-spec', {
    body: input,
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const payload = data as { excelExport?: unknown; displayContent?: unknown; error?: unknown } | undefined
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(payload.error.trim())
  }

  const excelExport = payload?.excelExport as Record<string, unknown> | undefined
  const displayContent = payload?.displayContent
  if (!excelExport || typeof displayContent !== 'string') {
    throw new Error('Excel-Export konnte nicht abgeschlossen werden.')
  }
  const bucket = typeof excelExport.bucket === 'string' ? excelExport.bucket : ''
  const path = typeof excelExport.path === 'string' ? excelExport.path : ''
  const fileName = typeof excelExport.fileName === 'string' ? excelExport.fileName : ''
  if (!bucket || !path || !fileName) {
    throw new Error('Ungueltige Excel-Antwort.')
  }

  return {
    excelExport: { bucket, path, fileName },
    displayContent,
  }
}

/** Begrenzt Sonnet-Ausgabe fuer Excel-Spec (Kosten). Edge `chat-completion` wertet `maxTokens` aus. */
const EXCEL_SPEC_MAX_OUTPUT_TOKENS = 8192
/** Harte Eingabegrenze fuer Excel-Spec (senkt TPM-Spitzen bei langen Paste-/Datei-Texten). */
const EXCEL_SPEC_MAX_INPUT_CHARS = 14000

function isAnthropicRateLimitErrorMessage(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('anthropic anfrage fehlgeschlagen (429)') ||
    m.includes('claude rate-limit') ||
    m.includes('rate_limit') ||
    m.includes('rate-limit')
  )
}

async function requestExcelSpecViaProvider(
  provider: 'anthropic' | 'openai',
  prompt: string,
): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      provider,
      ...(provider === 'openai' ? { openAiModels: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'] } : {}),
      messages: [
        { role: 'system', content: buildExcelSpecSonnetSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      maxTokens: EXCEL_SPEC_MAX_OUTPUT_TOKENS,
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const content = data?.assistantMessage?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      provider === 'anthropic'
        ? 'Claude hat keine Excel-Spezifikation geliefert.'
        : 'OpenAI hat keine Excel-Spezifikation geliefert.',
    )
  }
  return content.trim()
}

export type ExcelSpecGenerationResult = {
  specBlock: string
  modelLabel: 'Claude Sonnet' | 'OpenAI (Fallback)'
}

/**
 * Nur Claude Sonnet: maschinenlesbarer Excel-Block (Marker + JSON).
 * Eingabe absichtlich nur Nutzeranfrage — kein Chat-Verlauf (Input-Tokens sparen).
 */
export async function generateExcelSpecWithSonnet(userRequest: string): Promise<ExcelSpecGenerationResult> {
  const trimmed = userRequest.trim().slice(0, EXCEL_SPEC_MAX_INPUT_CHARS)
  return getOrSetCachedResponse(
    'excel-spec',
    [EXCEL_SPEC_CACHE_EPOCH, trimmed],
    AI_CACHE_TTL.excelSpec,
    async () => {
      try {
        const specBlock = await requestExcelSpecViaProvider('anthropic', trimmed)
        return { specBlock, modelLabel: 'Claude Sonnet' as const }
      } catch (err) {
        const primaryMessage = err instanceof Error ? err.message : String(err)
        if (!isAnthropicRateLimitErrorMessage(primaryMessage)) {
          throw err
        }
        try {
          const specBlock = await requestExcelSpecViaProvider('openai', trimmed)
          return { specBlock, modelLabel: 'OpenAI (Fallback)' as const }
        } catch {
          throw new Error(
            'Excel-Spezifikation konnte wegen Rate-Limit nicht erstellt werden. Bitte kurz warten und erneut versuchen.',
          )
        }
      }
    },
  )
}

function providerForMainChat(): 'openai' {
  return 'openai'
}

/** Lernpfad (Setup, Kapitel, Karten, Arbeitsblatt, Quiz-Bewertung, …): OpenAI GPT-5 mini über Edge `callOpenAi`. */
function providerForLearnPath(): 'openai' {
  return 'openai'
}

async function getAssistantReply(messages: ChatMessage[], options?: SendMessageOptions) {
  if (usesGatewayAi()) {
    const supabase = getSupabaseClient()
    const provider = options?.useLearnPathModel ? providerForLearnPath() : providerForMainChat()
    const { data, error, response } = await supabase.functions.invoke('chat-completion', {
      body: {
        provider,
        messages: buildGatewayMessages(messages, options),
        ...(options?.openAiModels?.length ? { openAiModels: options.openAiModels } : {}),
      },
    })

    if (error) {
      throw new Error(await messageFromFunctionsInvokeFailure(error, response))
    }

    const content = data?.assistantMessage?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
    }

    return content
  }

  return getMockAssistantReply(messages)
}

export async function sendMessage(
  messages: ChatMessage[],
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  const content = await getAssistantReply(messages, options)
  return {
    assistantMessage: createAssistantMessage(content),
  }
}

/** Primärmodell für den Hilfe-Chat im Lernkapitel-Modal (Edge `chat-completion`). */
export const LEARN_CHAPTER_HELP_OPENAI_MODELS = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'] as const

/**
 * Kurzer Hilfe-Chat zum aktuellen Lernkapitel-Schritt (kein Thread in der Haupt-Chat-UI).
 */
export async function sendLearnChapterHelpMessage(
  messages: ChatMessage[],
  chapterContext: string,
): Promise<SendMessageResult> {
  const trimmedContext = chapterContext.trim().slice(0, 12_000)
  const systemPrompt = [
    'Kontext zum aktuellen Lernkapitel (für dich als Referenz):',
    '',
    trimmedContext || '(Kein zusätzlicher Kontext.)',
  ].join('\n')

  return sendMessage(messages, {
    useLearnPathModel: true,
    interactiveQuizPrompt:
      'Du bist ein freundlicher Lernhelfer. Antworte auf Deutsch, verständlich und kompakt. Nutze Markdown wo sinnvoll. Keine Quiz-JSON-Blöcke (<<<STRATON_QUIZ_JSON>>>).',
    systemPrompt,
    openAiModels: [...LEARN_CHAPTER_HELP_OPENAI_MODELS],
  })
}

export type SendMessageStreamingOptions = SendMessageOptions & {
  onDelta: (accumulatedText: string) => void
}

type StreamSsePayload =
  | { type: 'delta'; t: string }
  | { type: 'done'; model?: string; inputTokens?: number; outputTokens?: number }
  | { type: 'error'; message?: string }

async function consumeChatCompletionSse(
  response: Response,
  onDelta: (accumulated: string) => void,
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming-Antwort konnte nicht gelesen werden.')
  }
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let streamError: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const sep = buffer.indexOf('\n\n')
        if (sep === -1) {
          break
        }
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        for (const line of block.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }
          const raw = trimmed.slice(5).trim()
          if (!raw) {
            continue
          }
          let payload: StreamSsePayload
          try {
            payload = JSON.parse(raw) as StreamSsePayload
          } catch {
            continue
          }
          if (payload.type === 'delta' && typeof payload.t === 'string' && payload.t.length > 0) {
            full += payload.t
            onDelta(full)
          } else if (payload.type === 'error') {
            streamError = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : 'Stream-Fehler'
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (streamError) {
    throw new Error(streamError)
  }
  const trimmed = full.trim()
  if (!trimmed) {
    throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
  }
  return trimmed
}

/**
 * Hauptchat: echtes SSE-Streaming (OpenAI) über die Edge Function.
 * Lernpfad (`useLearnPathModel`) fällt auf nicht-streaming JSON zurück.
 */
export async function sendMessageStreaming(
  messages: ChatMessage[],
  options: SendMessageStreamingOptions,
): Promise<string> {
  const onDelta = options.onDelta

  if (!usesGatewayAi()) {
    const text = await getMockAssistantReply(messages)
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
    }
    const step = Math.max(4, Math.ceil(text.length / 20))
    for (let i = step; i < text.length; i += step) {
      onDelta(text.slice(0, i))
    }
    onDelta(text)
    return text.trim()
  }

  if (options.useLearnPathModel) {
    const content = await getAssistantReply(messages, options)
    onDelta(content)
    return content.trim()
  }

  const supabase = getSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    throw new Error('Nicht angemeldet oder Sitzung abgelaufen.')
  }

  const baseUrl = env.supabaseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/functions/v1/chat-completion`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
    },
    body: JSON.stringify({
      provider: providerForMainChat(),
      messages: buildGatewayMessages(messages, options),
      stream: true,
    }),
  })

  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    let msg = `OpenAI Anfrage fehlgeschlagen (${res.status}).`
    try {
      const t = await res.text()
      if (t) {
        try {
          const j = JSON.parse(t) as { error?: unknown }
          if (typeof j.error === 'string' && j.error.trim()) {
            msg = j.error.trim()
          }
        } catch {
          if (t.length < 600) {
            msg = t.trim()
          }
        }
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  if (!ct.includes('text/event-stream')) {
    const t = await res.text()
    let fromJson = ''
    try {
      const j = JSON.parse(t) as { error?: unknown }
      if (typeof j.error === 'string' && j.error.trim()) {
        fromJson = j.error.trim()
      }
    } catch {
      /* kein JSON */
    }
    throw new Error(
      fromJson ||
        t.trim().slice(0, 400) ||
        'Streaming nicht unterstuetzt — Edge Function «chat-completion» deployen.',
    )
  }

  return consumeChatCompletionSse(res, onDelta)
}

function fallbackChatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.trim() ?? ''
  if (!firstUser) {
    return 'Neuer Chat'
  }
  return firstUser.length > MAX_CHAT_TITLE_LENGTH
    ? `${firstUser.slice(0, MAX_CHAT_TITLE_LENGTH)}...`
    : firstUser
}

function sanitizeChatTitle(raw: string): string {
  const compact = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return ''
  }
  return compact.length > MAX_CHAT_TITLE_LENGTH ? compact.slice(0, MAX_CHAT_TITLE_LENGTH).trim() : compact
}

export async function generateChatTitleWithAi(messages: ChatMessage[]): Promise<GenerateTitleResult> {
  if (!usesGatewayAi()) {
    return { title: fallbackChatTitle(messages) }
  }

  const titleKey = JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: message.content ?? '',
    })),
  )

  return getOrSetCachedResponse(
    'chat-title',
    [titleKey],
    AI_CACHE_TTL.chatTitle,
    async () => {
      const supabase = getSupabaseClient()
      const { data, error, response } = await supabase.functions.invoke('chat-completion', {
        body: {
          mode: 'generate_title',
          provider: providerForMainChat(),
          payload: {
            messages: messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          },
        },
      })

      if (error) {
        throw new Error(await messageFromFunctionsInvokeFailure(error, response))
      }

      const title = sanitizeChatTitle(String(data?.title ?? ''))
      if (!title) {
        return { title: fallbackChatTitle(messages) }
      }

      return { title }
    },
  )
}

export async function generateTopicSuggestionsWithAi(topic: string): Promise<GenerateTopicSuggestionsResult> {
  const normalizedTopic = topic.trim()
  if (!normalizedTopic) {
    return { suggestions: [] }
  }

  if (!usesGatewayAi()) {
    return {
      suggestions: [
        `${normalizedTopic} Grundlagen`,
        `${normalizedTopic} Praxis`,
        `${normalizedTopic} Vertiefung`,
      ].slice(0, 5),
    }
  }

  return getOrSetCachedResponse(
    'topic-suggestions',
    [normalizedTopic],
    AI_CACHE_TTL.topicSuggestions,
    async () => {
      const supabase = getSupabaseClient()
      const { data, error, response } = await supabase.functions.invoke('chat-completion', {
        body: {
          mode: 'generate_topic_suggestions',
          provider: providerForLearnPath(),
          payload: {
            topic: normalizedTopic,
          },
        },
      })

      if (error) {
        throw new Error(await messageFromFunctionsInvokeFailure(error, response))
      }

      const rawSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : []
      const suggestions = rawSuggestions
        .filter((entry: unknown): entry is string => typeof entry === 'string')
        .map((entry: string) => entry.trim())
        .filter(Boolean)
        .slice(0, 5)

      if (suggestions.length === 0) {
        return { suggestions: [`${normalizedTopic} Grundlagen`] }
      }

      return { suggestions }
    },
  )
}

export type { LearnFlashcard, LearnWorksheetItem } from '../../learn/services/learn.persistence'

function mockFlashcardsFromOutline(outline: string): LearnFlashcard[] {
  const topic = outline.split('\n').find((l) => l.startsWith('### '))?.replace(/^###\s+/, '').slice(0, 48) || 'Thema'
  return [
    {
      id: 'm1',
      question: `Was ist ein Kernpunkt in «${topic}»?`,
      answer: 'Im Mock-Modus gibt es keine KI. Bitte OpenAI in .env aktivieren fuer echte Lernkarten.',
    },
    {
      id: 'm2',
      question: 'Wie übst du am besten?',
      answer: 'Nutze die Kapitel-Schritte und den Einstiegstest; Lernkarten ergänzen das Wiederholen.',
    },
  ]
}

export async function generateLearnFlashcards(chapterOutline: string): Promise<LearnFlashcard[]> {
  const trimmed = chapterOutline.trim()
  if (!trimmed) {
    throw new Error('Keine Kapiteldaten fuer Lernkarten vorhanden.')
  }

  if (!usesGatewayAi()) {
    return mockFlashcardsFromOutline(trimmed)
  }

  return getOrSetCachedResponse(
    'learn-flashcards',
    [trimmed],
    AI_CACHE_TTL.learnFlashcards,
    async () => {
      const supabase = getSupabaseClient()
      const { data, error, response } = await supabase.functions.invoke('chat-completion', {
        body: {
          mode: 'generate_flashcards',
          provider: providerForLearnPath(),
          payload: {
            chapterOutline: trimmed,
          },
        },
      })

      if (error) {
        throw new Error(await messageFromFunctionsInvokeFailure(error, response))
      }

      const raw = Array.isArray(data?.flashcards) ? data.flashcards : []
      const cards: LearnFlashcard[] = []
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') {
          continue
        }
        const o = entry as { question?: unknown; answer?: unknown }
        const question = typeof o.question === 'string' ? o.question.trim() : ''
        const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
        if (question && answer) {
          cards.push({
            id: crypto.randomUUID(),
            question,
            answer,
          })
        }
      }

      if (cards.length === 0) {
        throw new Error('Keine Lernkarten von der KI erhalten.')
      }

      return cards.slice(0, 20)
    },
  )
}

/** Extrahiert Aufgaben aus der Edge-Response (toleriert alte Deploys und abweichende JSON-Keys). */
function parseWorksheetItemsFromInvokeData(data: unknown): LearnWorksheetItem[] {
  if (!data || typeof data !== 'object') {
    return []
  }
  const root = data as Record<string, unknown>

  const promptFromObject = (o: Record<string, unknown>): string => {
    const keys = ['prompt', 'question', 'task', 'text', 'aufgabe', 'content', 'title'] as const
    for (const key of keys) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) {
        return v.trim()
      }
    }
    return ''
  }

  const fromArray = (arr: unknown): LearnWorksheetItem[] => {
    if (!Array.isArray(arr)) {
      return []
    }
    const out: LearnWorksheetItem[] = []
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const prompt = promptFromObject(entry as Record<string, unknown>)
      if (prompt) {
        out.push({ id: crypto.randomUUID(), prompt })
      }
    }
    return out
  }

  let items = fromArray(root.worksheetItems)
  if (items.length === 0) {
    items = fromArray(root.items)
  }
  if (items.length === 0) {
    items = fromArray(root.tasks)
  }
  /** Ältere/kaputte Edge-Route: Request mit Kapiteltext landet im Lernkarten-Zweig und liefert nur «flashcards». */
  if (items.length === 0 && Array.isArray(root.flashcards)) {
    const fromCards: LearnWorksheetItem[] = []
    for (const entry of root.flashcards) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const q = typeof o.question === 'string' ? o.question.trim() : ''
      if (q) {
        fromCards.push({ id: crypto.randomUUID(), prompt: q })
      }
    }
    items = fromCards
  }

  return items.slice(0, 20)
}

function mockWorksheetFromOutline(outline: string): LearnWorksheetItem[] {
  const topic = outline.split('\n').find((l) => l.startsWith('### '))?.replace(/^###\s+/, '').slice(0, 48) || 'Thema'
  return [
    {
      id: 'w1',
      prompt: `Erkläre in eigenen Worten einen zentralen Begriff aus «${topic}».`,
    },
    {
      id: 'w2',
      prompt: 'Im Mock-Modus gibt es keine KI. Bitte OpenAI in .env aktivieren für echte Arbeitsblatt-Aufgaben.',
    },
  ]
}

export async function generateLearnWorksheet(chapterOutline: string): Promise<LearnWorksheetItem[]> {
  const trimmed = chapterOutline.trim()
  if (!trimmed) {
    throw new Error('Keine Kapiteldaten fuer Arbeitsblatt vorhanden.')
  }

  if (!usesGatewayAi()) {
    return mockWorksheetFromOutline(trimmed)
  }

  return getOrSetCachedResponse(
    'learn-worksheet',
    [trimmed],
    AI_CACHE_TTL.learnWorksheet,
    async () => {
      const supabase = getSupabaseClient()
      const { data, error, response } = await supabase.functions.invoke('chat-completion', {
        body: {
          mode: 'generate_worksheet',
          provider: providerForLearnPath(),
          payload: {
            chapterOutline: trimmed,
          },
        },
      })

      if (error) {
        throw new Error(await messageFromFunctionsInvokeFailure(error, response))
      }

      const items = parseWorksheetItemsFromInvokeData(data)

      if (items.length === 0) {
        throw new Error(
          'Keine Aufgaben von der KI erhalten. Häufig: Edge-Function «chat-completion» ist nicht mit dem Modus «generate_worksheet» deployt — bitte deployen oder erneut versuchen.',
        )
      }

      return items
    },
  )
}

export async function evaluateQuizAnswerWithAi(
  input: EvaluateQuizAnswerInput,
): Promise<EvaluateQuizAnswerResult> {
  const trimmedAnswer = input.userAnswer.trim()
  if (!trimmedAnswer) {
    return {
      isCorrect: false,
      feedback: 'Bitte gib zuerst eine Antwort ein.',
    }
  }

  if (isMatchQuestion(input.question)) {
    return evaluateInteractiveAnswer(trimmedAnswer, input.question)
  }

  if (!usesGatewayAi()) {
    return evaluateInteractiveAnswer(trimmedAnswer, input.question)
  }

  const acceptable = input.question.acceptableAnswers ?? []
  const evalKey = [
    input.question.prompt,
    input.question.expectedAnswer,
    JSON.stringify(acceptable),
    trimmedAnswer,
  ]

  return getOrSetCachedResponse(
    'quiz-eval',
    evalKey,
    AI_CACHE_TTL.quizEval,
    async () => {
      const supabase = getSupabaseClient()
      const { data, error, response } = await supabase.functions.invoke('chat-completion', {
        body: {
          mode: 'evaluate_quiz',
          provider: providerForLearnPath(),
          payload: {
            question: input.question.prompt,
            expectedAnswer: input.question.expectedAnswer,
            acceptableAnswers: input.question.acceptableAnswers,
            userAnswer: trimmedAnswer,
          },
        },
      })

      if (error) {
        throw new Error(await messageFromFunctionsInvokeFailure(error, response))
      }

      const evaluation = data?.evaluation as { isCorrect?: unknown; feedback?: unknown } | undefined
      if (!evaluation) {
        throw new Error('Keine Bewertungsdaten von der KI erhalten.')
      }

      return {
        isCorrect: evaluation.isCorrect === true,
        feedback:
          typeof evaluation.feedback === 'string' && evaluation.feedback.trim()
            ? evaluation.feedback.trim()
            : evaluation.isCorrect === true
              ? 'Richtig.'
              : 'Nicht ganz korrekt.',
      }
    },
  )
}
