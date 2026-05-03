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
import type { ChatComposerModelId } from '../constants/chatComposerModels'
import { getChatComposerModelMeta } from '../constants/chatComposerModels'
import type { ChatDailyOpenAiTierConfig } from '../constants/chatDailyOpenAiTier'
import { buildMainChatOpenAiModelChain } from '../constants/chatDailyOpenAiTier'
import type { ChatReplyMode } from '../constants/chatReplyMode'
import type { ChatThinkingMode } from '../constants/chatThinkingMode'
import {
  getChatThinkingClarifyUiReminder,
  getChatThinkingWorkflowInstruction,
} from '../constants/chatThinkingInstruction'
import {
  getChatComfortToneInstruction,
  getChatStrictToneInstruction,
  getChatTruthfulnessInstruction,
} from '../constants/chatTruthAndTone'
import type { ChatMessage, ChatMessageExcelExport } from '../types'
import { evaluateInteractiveAnswer, isMatchQuestion, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'
import { stripGeneratedImageModelFooter } from '../utils/markdownInline'

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
   * Lernpfad / Learn-UI: Antwort über OpenAI (Edge), Standardkette {@link LEARN_PATH_OPENAI_MODELS}. Ohne Flag: Hauptchat.
   */
  useLearnPathModel?: boolean
  /**
   * Nutzer hat Excel/XLSX angefragt: OpenAI bekommt kurzen Hinweis, kein Excel-JSON.
   * Spezifikation läuft separat über {@link generateExcelSpecWithSonnet}.
   */
  userRequestedExcel?: boolean
  /**
   * Optional: OpenAI-Modellreihenfolge für `chat-completion`.
   * Bei `useLearnPathModel`: Standard {@link LEARN_PATH_OPENAI_MODELS}, wenn leer.
   */
  openAiModels?: string[]
  /**
   * Hauptchat: gewähltes Modell (GPT vs. Claude). Wird bei `useLearnPathModel` ignoriert.
   */
  mainChatModelId?: ChatComposerModelId
  /**
   * Hauptchat: Comfort (warm, mehr Emoji) vs. Strict (kühl, sachlich). Wird bei `useLearnPathModel` ignoriert.
   */
  chatReplyMode?: ChatReplyMode
  /**
   * Hauptchat: Thinking nutzt Claude Sonnet 4.6, klärt per Rückfragen (max. 2 Runden), ohne Profil-Speicher.
   */
  chatThinkingMode?: ChatThinkingMode
  /**
   * Hauptchat OpenAI: `subscription_usages.used_tokens` am Tag — zusammen mit {@link mainChatDailyTierConfig}.
   */
  mainChatUsedTokensToday?: number
  /** Aus `subscription_plans`: Tier 1 (bis Token-Budget) / Tier 2 für OpenAI-Hauptchat pro Tag. */
  mainChatDailyTierConfig?: ChatDailyOpenAiTierConfig | null
}

type EvaluateQuizAnswerInput = {
  question: InteractiveQuizQuestion
  userAnswer: string
}

type EvaluateQuizAnswerResult = {
  isCorrect: boolean
  feedback: string
}

/** Lernpfad, Lernkarten, Arbeitsblätter, Quiz-Auswertung, Thema-Vorschläge, Kapitel-Hilfe: primär GPT-5.4. */
export const LEARN_PATH_OPENAI_MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'] as const

/** @deprecated Alias — gleiche Kette wie {@link LEARN_PATH_OPENAI_MODELS}. */
export const LEARN_CHAPTER_HELP_OPENAI_MODELS = LEARN_PATH_OPENAI_MODELS

type GatewayMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Thinking-Modus: immer dieses Modell (Sonnet 4.6), unabhängig von der Composer-Modellwahl. */
const THINKING_ROUTE_MODEL_ID = 'claude-sonnet-4-6' satisfies ChatComposerModelId

function isMainChatThinking(options?: SendMessageOptions): boolean {
  return Boolean(!options?.useLearnPathModel && options?.chatThinkingMode === 'thinking')
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
  const isMainChat = !options?.useLearnPathModel
  const mainChatBrevity = isMainChat ? getAssistantMainChatBrevityInstruction() : ''
  const replyTone = isMainChat ? (options?.chatReplyMode ?? 'comfort') : undefined
  const truthBlock = isMainChat ? getChatTruthfulnessInstruction() : ''
  const toneBlock =
    isMainChat && replyTone === 'strict'
      ? getChatStrictToneInstruction()
      : isMainChat && replyTone === 'comfort'
        ? getChatComfortToneInstruction()
        : ''
  const thinkingBlock =
    isMainChat && options?.chatThinkingMode === 'thinking'
      ? getChatThinkingWorkflowInstruction()
      : ''
  const thinkingClarifyUiReminder =
    isMainChat && options?.chatThinkingMode === 'thinking' ? getChatThinkingClarifyUiReminder() : ''
  const combinedSystemPrompt = [
    baseQuiz,
    options?.systemPrompt?.trim() ?? '',
    excelChatHint,
    mainChatBrevity,
    truthBlock,
    toneBlock,
    thinkingBlock,
    getAssistantMarkdownFormattingInstruction({ replyTone }),
    getAssistantEmojiStyleInstruction({ replyTone }),
    thinkingClarifyUiReminder,
  ]
    .filter(Boolean)
    .join('\n\n')

  const scrubDataImages =
    isMainChat && !options?.useLearnPathModel
      ? (content: string) =>
          typeof content === 'string'
            ? content.replace(
                /data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi,
                '[Eingebettetes Bild — im Chat sichtbar; hier nur Platzhalter]',
              )
            : ''
      : (content: string) => content

  return [
    {
      role: 'system',
      content: combinedSystemPrompt,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: scrubDataImages(message.content),
    })),
  ]
}

/** Echter KI-Call (nicht Mock). Chat und Lernpfad = OpenAI (Lernpfad: GPT-5 mini über Edge, siehe chat-completion). */
export function usesGatewayAi(): boolean {
  return env.aiProvider !== 'mock'
}

/** Rollen + Text für Bild-Kontext (keine Base64 — wird vor dem Senden bereinigt). */
export type ChatImageContextTurn = { role: 'user' | 'assistant'; content: string }

function sanitizeContentForImageContext(content: string): string {
  let s = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, '[Bild im Chatverlauf]')
  s = s.replace(/\[BildData:[^\]]+\][\s\S]*?\[\/BildData\]/gi, '[Bild im Chatverlauf]')
  s = s.replace(/\[Bild:[^\]]+\][\s\S]*?\[\/Bild\]/gi, '[Bild im Chatverlauf]')
  s = s.replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/gi, '[Datei-Anhang]')
  const max = 3200
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * Bildgenerierung über Edge Function `generate-chat-image` (OpenAI GPT Image 1/2 laut Abo).
 * Optional `contextMessages`: aktueller Chat-Verlauf für Nachbearbeitungen («wie vorher, aber …»).
 */
export async function generateChatImageFromPrompt(
  prompt: string,
  contextMessages?: ChatImageContextTurn[],
): Promise<{ assistantMarkdown: string }> {
  const supabase = getSupabaseClient()
  const body: { prompt: string; contextMessages?: ChatImageContextTurn[] } = { prompt }
  if (contextMessages?.length) {
    body.contextMessages = contextMessages.map((m) => ({
      role: m.role,
      content: sanitizeContentForImageContext(typeof m.content === 'string' ? m.content : ''),
    }))
  }
  const { data, error, response } = await supabase.functions.invoke('generate-chat-image', {
    body,
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const payload = data as { assistantMarkdown?: unknown; error?: unknown } | undefined
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(payload.error.trim())
  }

  const assistantMarkdown = payload?.assistantMarkdown
  if (typeof assistantMarkdown !== 'string' || !assistantMarkdown.trim()) {
    throw new Error('Die Bildgenerierung hat keine Daten geliefert.')
  }

  return { assistantMarkdown: stripGeneratedImageModelFooter(assistantMarkdown.trim()) }
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
    throw new Error('Ungültige Excel-Antwort.')
  }

  return {
    excelExport: { bucket, path, fileName },
    displayContent,
  }
}

/** Begrenzt Sonnet-Ausgabe für Excel-Spec (Kosten). Edge `chat-completion` wertet `maxTokens` aus. */
const EXCEL_SPEC_MAX_OUTPUT_TOKENS = 8192
/** Harte Eingabegrenze für Excel-Spec (senkt TPM-Spitzen bei langen Paste-/Datei-Texten). */
const EXCEL_SPEC_MAX_INPUT_CHARS = 14000

/**
 * OpenAI Prompt Caching: stabiler Key pro identischem System-/Instruktions-Prefix (Routing + Trefferquote).
 * @see https://platform.openai.com/docs/guides/prompt-caching
 */
const OPENAI_PROMPT_CACHE_KEY_MAIN = 'straton-main-v1'
const OPENAI_PROMPT_CACHE_KEY_LEARN = 'straton-learn-v1'
const OPENAI_PROMPT_CACHE_KEY_EXCEL_SPEC = 'straton-excel-spec-v1'

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
      ...(provider === 'openai'
        ? {
            openAiModels: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'],
            promptCacheKey: OPENAI_PROMPT_CACHE_KEY_EXCEL_SPEC,
            promptCacheRetention: '24h',
          }
        : {}),
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

/** Lernpfad (Setup, Kapitel, Karten, Arbeitsblatt, Quiz-Bewertung, …): OpenAI über Edge (`LEARN_PATH_OPENAI_MODELS`). */
function providerForLearnPath(): 'openai' {
  return 'openai'
}

function buildChatCompletionRequestBody(
  messages: ChatMessage[],
  options?: SendMessageOptions,
): Record<string, unknown> {
  const gatewayMessages = buildGatewayMessages(messages, options)
  if (options?.useLearnPathModel) {
    const body: Record<string, unknown> = {
      provider: providerForLearnPath(),
      messages: gatewayMessages,
      promptCacheKey: OPENAI_PROMPT_CACHE_KEY_LEARN,
      promptCacheRetention: '24h',
      includeProfileMemory: false,
      openAiModels: options.openAiModels?.length
        ? [...options.openAiModels]
        : [...LEARN_PATH_OPENAI_MODELS],
    }
    return body
  }

  const thinking = isMainChatThinking(options)
  const meta = thinking
    ? getChatComposerModelMeta(THINKING_ROUTE_MODEL_ID)
    : getChatComposerModelMeta(options?.mainChatModelId ?? 'gpt-5.4-mini')
  const body: Record<string, unknown> = {
    provider: meta.provider,
    messages: gatewayMessages,
    includeProfileMemory: thinking ? false : true,
  }
  if (meta.provider === 'openai' && meta.openAiModels?.length) {
    if (
      !options?.useLearnPathModel &&
      !thinking &&
      typeof options?.mainChatUsedTokensToday === 'number'
    ) {
      body.openAiModels = [
        ...buildMainChatOpenAiModelChain(
          options.mainChatUsedTokensToday,
          options.mainChatDailyTierConfig ?? undefined,
        ),
      ]
    } else {
      body.openAiModels = [...meta.openAiModels]
    }
  }
  if (meta.provider === 'anthropic' && meta.anthropicModel) {
    body.anthropicModel = meta.anthropicModel
  }
  if (meta.provider === 'openai') {
    body.promptCacheKey = OPENAI_PROMPT_CACHE_KEY_MAIN
    body.promptCacheRetention = '24h'
  }
  return body
}

const SIMULATED_STREAM_MS = 14
const SIMULATED_STREAM_STEP = 36

function isAbortErrorLike(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

async function simulateAssistantTextStream(
  fullText: string,
  onDelta: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const text = fullText.trim()
  if (!text.length) {
    onDelta('')
    return
  }
  if (text.length <= SIMULATED_STREAM_STEP) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    onDelta(text)
    return
  }
  for (let end = SIMULATED_STREAM_STEP; end < text.length; end += SIMULATED_STREAM_STEP) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    onDelta(text.slice(0, end))
    await new Promise((r) => setTimeout(r, SIMULATED_STREAM_MS))
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  onDelta(text)
}

async function getAssistantReply(messages: ChatMessage[], options?: SendMessageOptions) {
  if (usesGatewayAi()) {
    const supabase = getSupabaseClient()
    const { data, error, response } = await supabase.functions.invoke('chat-completion', {
      body: buildChatCompletionRequestBody(messages, options),
    })

    if (error) {
      throw new Error(await messageFromFunctionsInvokeFailure(error, response))
    }

    const content = data?.assistantMessage?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Der KI-Provider hat keine gültige Antwort geliefert.')
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

/** Nach einem Hauptchat-Turn: Nutzerprofil-Kontext aktualisieren (Edge `merge_ai_chat_memory`). */
export async function mergePersistedAiChatMemoryAfterTurn(input: {
  userMessage: string
  assistantMessage: string
}): Promise<void> {
  if (!usesGatewayAi()) {
    return
  }
  const supabase = getSupabaseClient()
  const { error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'merge_ai_chat_memory',
      provider: 'openai',
      payload: {
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
      },
    },
  })
  if (error) {
    console.warn(
      '[chat] merge_ai_chat_memory:',
      await messageFromFunctionsInvokeFailure(error, response),
    )
  }
}

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
  signal?: AbortSignal
}

type StreamSsePayload =
  | { type: 'delta'; t: string }
  | { type: 'done'; model?: string; inputTokens?: number; outputTokens?: number }
  | { type: 'error'; message?: string }

async function consumeChatCompletionSse(
  response: Response,
  onDelta: (accumulated: string) => void,
  signal?: AbortSignal,
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
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        throw new DOMException('Aborted', 'AbortError')
      }
      let readResult: ReadableStreamReadResult<Uint8Array>
      try {
        readResult = await reader.read()
      } catch (readErr) {
        if (signal?.aborted || isAbortErrorLike(readErr)) {
          throw new DOMException('Aborted', 'AbortError')
        }
        throw readErr
      }
      const { done, value } = readResult
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
    throw new Error('Der KI-Provider hat keine gültige Antwort geliefert.')
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
  const signal = options.signal

  if (!usesGatewayAi()) {
    const text = await getMockAssistantReply(messages)
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Der KI-Provider hat keine gültige Antwort geliefert.')
    }
    const step = Math.max(4, Math.ceil(text.length / 20))
    for (let i = step; i < text.length; i += step) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      onDelta(text.slice(0, i))
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    onDelta(text)
    return text.trim()
  }

  if (options.useLearnPathModel) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const content = await getAssistantReply(messages, options)
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    onDelta(content)
    return content.trim()
  }

  const thinkingMain = !options.useLearnPathModel && options.chatThinkingMode === 'thinking'
  const streamMeta = thinkingMain
    ? getChatComposerModelMeta(THINKING_ROUTE_MODEL_ID)
    : getChatComposerModelMeta(options.mainChatModelId ?? 'gpt-5.4-mini')
  if (streamMeta.provider === 'anthropic') {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const content = await getAssistantReply(messages, options)
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    await simulateAssistantTextStream(content, onDelta, signal)
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
      ...buildChatCompletionRequestBody(messages, options),
      stream: true,
    }),
    signal,
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
        'Streaming nicht unterstützt — Edge Function «chat-completion» deployen.',
    )
  }

  return consumeChatCompletionSse(res, onDelta, signal)
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

/** chat-completion «generate_title»: keine data:-Bilder (Megabytes Base64) — sonst 500 / Timeout. */
function shortenContentForChatTitleApi(content: string | undefined | null): string {
  if (typeof content !== 'string' || !content) {
    return ''
  }
  return content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/g, '[Generiertes Bild]')
}

export async function generateChatTitleWithAi(messages: ChatMessage[]): Promise<GenerateTitleResult> {
  if (!usesGatewayAi()) {
    return { title: fallbackChatTitle(messages) }
  }

  const titleKey = JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: shortenContentForChatTitleApi(message.content),
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
              content: shortenContentForChatTitleApi(message.content),
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
          openAiModels: [...LEARN_PATH_OPENAI_MODELS],
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
      answer: 'Im Mock-Modus gibt es keine KI. Bitte OpenAI in .env aktivieren für echte Lernkarten.',
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
    throw new Error('Keine Kapiteldaten für Lernkarten vorhanden.')
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
          openAiModels: [...LEARN_PATH_OPENAI_MODELS],
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
    throw new Error('Keine Kapiteldaten für Arbeitsblatt vorhanden.')
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
          openAiModels: [...LEARN_PATH_OPENAI_MODELS],
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

  if (input.question.questionType === 'mcq' || input.question.questionType === 'true_false') {
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
          openAiModels: [...LEARN_PATH_OPENAI_MODELS],
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
