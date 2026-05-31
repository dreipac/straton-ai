import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import {
  getAssistantEmojiStyleInstruction,
  getAssistantMainChatBrevityFinalReminder,
  getAssistantMainChatBrevityInstruction,
  getAssistantMainChatGuidedDiagnosisInstruction,
  getAssistantMainChatStepByStepIntakeInstruction,
  getAssistantMarkdownFormattingInstruction,
} from '../constants/chatAssistantStyle'
import {
  applyLiveWebHeuristic,
  buildInstantAnalyzeBriefingInstruction,
  fallbackInstantAnalyzeResult,
  formatInstantAnalyzeContextLines,
  sanitizeInstantAnalyzeResult,
  type InstantAnalyzeInvokeResult,
  type InstantAnalyzeResult,
} from '../constants/instantAnalyze'
import { env } from '../../../config/env'
import { errorMessageFromUnknown, parseApiErrorField } from '../../../utils/errorMessage'
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
import { getQuizFormatGenerationInstruction } from '../utils/quizFormatChoice'
import { formatUserContentForGateway } from '../utils/assistantSectionReply'
import {
  buildThinkingDocumentUserContextBlock,
  getAssistantThinkingMarkdownInstruction,
  getChatThinkingClarifyUiReminder,
  getChatThinkingDetailDepthInstruction,
  getChatThinkingEmojiStyleInstruction,
  getChatThinkingFinalAnswerTurnInstruction,
  getChatThinkingFinalAnswerUiReminder,
  getChatThinkingIntakeClarifyFocusInstruction,
  getChatThinkingMandatoryClarifyTurnInstruction,
  getChatThinkingMixedLayoutInstruction,
  getChatThinkingWordDocumentInstruction,
  getChatThinkingWorkflowInstruction,
} from '../constants/chatThinkingInstruction'
import {
  buildThinkingAnalyzeBriefingForGateway,
  fallbackThinkingAnalyzeResult,
  formatThinkingAnalyzeContextLines,
  sanitizeThinkingAnalyzeResult,
  type ThinkingAnalyzeResult,
} from '../constants/thinkingAnalyze'
import type { ThinkingIntakeSession } from '../utils/thinkingIntake'
import { buildThinkingIntakeSummary, resolveThinkingConversationPhase } from '../utils/thinkingIntake'
import {
  getChatComfortToneInstruction,
  getChatStrictToneInstruction,
  getChatTruthfulnessInstruction,
} from '../constants/chatTruthAndTone'
import { clipChatMessagesToEstimatedTokenBudget } from '../constants/mainChatContext'
import { prepareChatMessagesForVisionGateway } from '../utils/visionMessageContent'
import {
  LEARN_PATH_MAX_OUTPUT_TOKENS,
  MAIN_CHAT_MAX_OUTPUT_TOKENS,
  THINKING_MAX_OUTPUT_TOKENS,
} from '../constants/mainChatOutput'
import type {
  ChatMessage,
  ChatMessageExcelExport,
  ChatMessagePdfExport,
  ChatMessageWordExport,
  WordOutlineV1,
} from '../types'
import { evaluateInteractiveAnswer, isMatchQuestion, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'
import { stripGeneratedImageModelFooter } from '../utils/markdownInline'
import { WORD_CHAT_DOCUMENT_BODY_HINT, WORD_EXPORT_COMMAND_MARKER } from '../constants/wordExportPrompt'
import { PDF_CHAT_DOCUMENT_BODY_HINT, PDF_EXPORT_COMMAND_MARKER } from '../constants/pdfExportPrompt'

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
  /** Audit-Label für Admin-Protokoll (z. B. `learn_entry_quiz`, `learn_setup_topic`). */
  learnTelemetryMode?: 'learn_setup_topic' | 'learn_entry_quiz' | 'learn_tutor'
  /**
   * Nutzer hat Excel/XLSX angefragt: OpenAI bekommt kurzen Hinweis, kein Excel-JSON.
   * Spezifikation läuft separat über {@link generateExcelSpecWithSonnet}.
   */
  userRequestedExcel?: boolean
  /** Nutzer hat /Word gewählt: Dokumenttext ohne Meta-Erklärungen; schaltet Kürze-Hinweis ab. */
  userRequestedWord?: boolean
  /** Nutzer hat /PDF gewählt: druckbares PDF-Gliederungs-JSON; schaltet Kürze-Hinweis ab. */
  userRequestedPdf?: boolean
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
   * Hauptchat: Thinking nutzt GPT-5.4, ausführliche Antworten, klärt per Rückfragen (max. 2 Runden), ohne Profil-Speicher.
   */
  chatThinkingMode?: ChatThinkingMode
  /**
   * Hauptchat OpenAI: `subscription_usages.used_tokens` am Tag — zusammen mit {@link mainChatDailyTierConfig}.
   */
  mainChatUsedTokensToday?: number
  /** Aus `subscription_plans`: Tier 1 (bis Token-Budget) / Tier 2 für OpenAI-Hauptchat pro Tag. */
  mainChatDailyTierConfig?: ChatDailyOpenAiTierConfig | null
  /** Thinking-Modus: OpenAI-Staffel aus `subscription_plans` (thinking_tier_*). */
  mainChatThinkingTierConfig?: ChatDailyOpenAiTierConfig | null
  /**
   * Hauptchat: Obergrenze für geschätzte Tokens des User/Assistant-Verlaufs (ohne Systemprompt).
   * `number` = Kürzen; `null` = kein Limit; ohne Abo: Client setzt `mainChatContextMaxTokens` auf die App-Default-Größe.
   */
  mainChatContextMaxTokens?: number | null
  /**
   * Hauptchat: vor dem LLM-Aufruf mit Tavily ermittelte Websnippets (Edge `tavily-search`),
   * eingebettet in den Systemprompt — ohne die Rohdaten in der Nutzernachricht zu speichern.
   */
  webSearchContext?: string
  /** Smart Instant: Einordnung vor der Antwort (nur Hauptchat Instant). */
  instantAnalyze?: InstantAnalyzeResult
  /** Live-Web war geplant, Tavily lieferte aber keinen Kontext (Fehler/Guthaben). */
  webSearchRequestedButMissing?: boolean
  /** Thinking: Aufgabenanalyse vor Klärungsrunden. */
  thinkingAnalyze?: ThinkingAnalyzeResult
  /** Thinking: gesammelte Klärungsantworten + Bereitschaft für finale Anleitung. */
  thinkingIntake?: ThinkingIntakeSession | null
  /** Thinking: aktuelle Gesprächsphase (überschreibt Heuristik aus Verlauf). */
  thinkingConversationPhase?: 'clarify' | 'final'
  /** Thinking: Fokus der aktuellen Klärungsrunde. */
  thinkingClarifyFocus?: { dimensionLabel: string; questionHint: string; round: number; roundsTotal: number }
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
          const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
          if (parsed.error === 'THINKING_LIMIT') {
            return typeof parsed.message === 'string' && parsed.message.trim()
              ? parsed.message.trim()
              : 'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.'
          }
          const apiErr = parseApiErrorField(parsed)
          if (apiErr) {
            return apiErr
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
  return errorMessageFromUnknown(error, 'Unbekannter Edge-Function-Fehler.')
}

/**
 * Entfernt große data:-URLs aus dem Fließtext (Prompt-Größe / Lesbarkeit), lässt aber
 * `[BildData:…]…data:image…[/BildData]` unverändert — die Edge Function (`chat-completion`)
 * parst diese Blöcke zu OpenAI-Vision (`image_url`).
 */
function scrubMainChatInlineImagesPreservingBildData(content: string): string {
  const preserved: string[] = []
  const hole = (idx: number) => `\uFFF0STRATON_BILDDATA_${idx}\uFFF1`
  const withHoles = content.replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, (block) => {
    preserved.push(block)
    return hole(preserved.length - 1)
  })
  const scrubbed = withHoles.replace(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi,
    '[Eingebettetes Bild — im Chat sichtbar; hier nur Platzhalter]',
  )
  let out = scrubbed
  for (let i = 0; i < preserved.length; i += 1) {
    out = out.replace(hole(i), preserved[i]!)
  }
  return out
}

const RAG_RECENT_TURNS = 8
/** Mehr Verlauf, wenn die letzte User-Nachricht ein Vision-Bild enthält (kurzer Text wie „hier“). */
const RAG_RECENT_TURNS_WITH_VISION = 14
const RAG_MAX_RETRIEVED_MESSAGES = 6
const RAG_MIN_TERM_LEN = 3
const STEP_BY_STEP_INTENT_RE =
  /\b(wie\s+(geht|mache|richte)\b|schritt\s*(für|fuer)\s*schritt|einrichten|installieren|konfigurieren|setup|access\s*point|hotspot)\b/i
const PLATFORM_HINT_RE =
  /\b(windows|mac(?:os)?|linux|ubuntu|debian|arch|android|ios|iphone|ipad)\b/i
const VERSION_HINT_RE = /\b(v(?:ersion)?\s?\d{1,2}|(?:\d{1,2}\.){1,2}\d{1,2})\b/i

function shouldForceStepByStepIntake(message: ChatMessage | undefined): boolean {
  const text = typeof message?.content === 'string' ? message.content.trim() : ''
  if (!text || !STEP_BY_STEP_INTENT_RE.test(text)) {
    return false
  }
  const hasPlatformHint = PLATFORM_HINT_RE.test(text)
  const hasVersionHint = VERSION_HINT_RE.test(text)
  // Harte Rückfragepflicht, wenn das Anliegen nach How-to klingt, aber Umgebung fehlt.
  return !(hasPlatformHint && hasVersionHint)
}

function tokenizeRagTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= RAG_MIN_TERM_LEN)
}

function selectMainChatMessagesWithRagLite(messages: ChatMessage[]): ChatMessage[] {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  const lastHasVision = Boolean(lastUserMessage?.content.includes('[BildData:'))
  const recentTurns = lastHasVision ? RAG_RECENT_TURNS_WITH_VISION : RAG_RECENT_TURNS

  if (messages.length <= recentTurns) {
    return messages
  }
  const recent = messages.slice(-recentTurns)
  const recentIds = new Set(recent.map((m) => m.id))
  const queryTerms = new Set(tokenizeRagTerms(lastUserMessage?.content ?? ''))
  if (queryTerms.size === 0) {
    const firstUser = messages.find((m) => m.role === 'user')
    if (lastHasVision && firstUser && !recentIds.has(firstUser.id)) {
      return [firstUser, ...recent].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    }
    return recent
  }

  const scored = messages
    .filter((m) => !recentIds.has(m.id))
    .map((m) => {
      const terms = tokenizeRagTerms(m.content)
      let overlap = 0
      for (const term of terms) {
        if (queryTerms.has(term)) {
          overlap += 1
        }
      }
      const hasOverlap = overlap > 0
      // Kürzere, überlappende Snippets bevorzugen; User-Nachrichten minimal priorisieren.
      const density = hasOverlap ? overlap / Math.max(1, terms.length) : 0
      const roleBoost = m.role === 'user' ? 0.08 : 0
      const score = overlap + density + roleBoost
      return { message: m, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RAG_MAX_RETRIEVED_MESSAGES)
    .map((entry) => entry.message)

  const selected = [...scored, ...recent]
  if (lastHasVision) {
    const firstUser = messages.find((m) => m.role === 'user')
    if (firstUser && !selected.some((m) => m.id === firstUser.id)) {
      selected.unshift(firstUser)
    }
  }
  selected.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return selected
}

function getChatWebSearchGroundingInstruction(): string {
  return [
    'Live-Websuche (Tavily): Snippets können in der **letzten Nutzernachricht** unter «Kontext für diese Anfrage» stehen.',
    'Nutze diese Auszüge als Faktenbasis. Wenn etwas nicht belegt ist, sage das klar.',
    'Bei konkreten Behauptungen Quellen mit Seitentitel oder URL nennen.',
    'Bei Aktienkursen/Preisen: nenne den Wert aus den Snippets (mit Währung und Stand/Stichtag wenn vorhanden).',
    'Bei News/Politik/Deals: fasse die Snippets sachlich zusammen; nenne kein Trainings-Wissenscutoff-Datum.',
    'Verweise den Nutzer nicht pauschal auf externe Seiten, wenn die Snippets bereits Antworten erlauben.',
    'Ohne Websuche-Snippets: nicht mit «Wissensstand bis Oktober 2023» antworten — das ist irrelevant für Live-Anfragen.',
  ].join('\n')
}

const MAIN_CHAT_TURN_CONTEXT_HEADER =
  '## Kontext für diese Anfrage (vom System ergänzt, nicht vom Nutzer geschrieben)'

/** Dynamische Turn-Blöcke ans User-Text hängen — Systemprompt bleibt für Prompt-Cache stabil. */
function prependMainChatTurnContextToUserContent(userContent: string, contextBlocks: string[]): string {
  const blocks = contextBlocks.map((b) => b.trim()).filter(Boolean)
  if (blocks.length === 0) {
    return userContent
  }
  const body = blocks.join('\n\n')
  const base = userContent.trim()
  return base
    ? `${MAIN_CHAT_TURN_CONTEXT_HEADER}\n\n${body}\n\n---\n\n${base}`
    : `${MAIN_CHAT_TURN_CONTEXT_HEADER}\n\n${body}`
}

function buildGatewayMessages(messages: ChatMessage[], options?: SendMessageOptions): GatewayMessage[] {
  const baseQuiz =
    options?.interactiveQuizPrompt?.trim() || DEFAULT_SYSTEM_PROMPTS.interactive_quiz
  const excelChatHint = options?.userRequestedExcel ? EXCEL_CHAT_SHORT_REPLY_HINT : ''
  const wordChatHint = options?.userRequestedWord ? WORD_CHAT_DOCUMENT_BODY_HINT : ''
  const pdfChatHint = options?.userRequestedPdf ? PDF_CHAT_DOCUMENT_BODY_HINT : ''
  const isMainChat = !options?.useLearnPathModel
  const contextCap = options?.mainChatContextMaxTokens
  const visionPreparedMessages = isMainChat ? prepareChatMessagesForVisionGateway(messages) : messages
  const ragSelectedMessages = isMainChat
    ? selectMainChatMessagesWithRagLite(visionPreparedMessages)
    : visionPreparedMessages
  const threadMessages =
    isMainChat && typeof contextCap === 'number' && contextCap > 0
      ? clipChatMessagesToEstimatedTokenBudget(ragSelectedMessages, contextCap)
      : ragSelectedMessages
  const thinking = isMainChat && options?.chatThinkingMode === 'thinking'
  const thinkingDoc =
    thinking && (Boolean(options?.userRequestedWord) || Boolean(options?.userRequestedPdf))
  const mainChatInstantPrompts =
    isMainChat && !options?.userRequestedWord && !options?.userRequestedPdf && !thinking
  const mainChatBrevity = mainChatInstantPrompts ? getAssistantMainChatBrevityInstruction() : ''
  const mainChatGuidedDiagnosis = mainChatInstantPrompts
    ? getAssistantMainChatGuidedDiagnosisInstruction()
    : ''
  const mainChatStepByStepIntake = mainChatInstantPrompts
    ? getAssistantMainChatStepByStepIntakeInstruction()
    : ''
  const replyTone = isMainChat ? (options?.chatReplyMode ?? 'comfort') : undefined
  const truthBlock = isMainChat ? getChatTruthfulnessInstruction() : ''
  const toneBlock =
    isMainChat && replyTone === 'strict'
      ? getChatStrictToneInstruction()
      : isMainChat && replyTone === 'comfort'
        ? getChatComfortToneInstruction()
        : ''
  const lastUserMessage = [...threadMessages].reverse().find((m) => m.role === 'user')
  const forceStepByStepIntake = mainChatInstantPrompts && shouldForceStepByStepIntake(lastUserMessage)
  const instantAnalyze = options?.instantAnalyze
  const instantAskOnly = Boolean(
    isMainChat && !thinking && instantAnalyze?.reply_mode === 'ask_only',
  )
  const stepByStepIntakeHardGuard =
    forceStepByStepIntake || instantAskOnly
      ? [
          instantAskOnly
            ? 'Harter Smart-Instant-Guard (diese Antwort):'
            : 'Harter Intake-Guard (diese Antwort):',
          '- Gib jetzt KEINE Anleitungsschritte und KEINE Befehle aus.',
          instantAskOnly
            ? '- Stelle nur 2–4 kurze, präzise Rückfragen — keine Lösung, keine Schrittfolge.'
            : '- Stelle stattdessen nur 3–5 präzise Rückfragen zur Umgebung (OS/Version/Verbindungsart/Ziel).',
          '- Abschluss mit genau einer kurzen Frage nach den fehlenden Infos.',
        ].join('\n')
      : ''
  const mainChatWebGrounding =
    isMainChat && !thinking ? getChatWebSearchGroundingInstruction() : ''

  const lastUserTurnContextBlocks: string[] = []
  if (isMainChat && !thinking && instantAnalyze) {
    lastUserTurnContextBlocks.push(buildInstantAnalyzeBriefingInstruction(instantAnalyze))
  }
  if (
    isMainChat &&
    !thinking &&
    options?.webSearchRequestedButMissing &&
    !options?.webSearchContext?.trim()
  ) {
    lastUserTurnContextBlocks.push(
      [
        'Hinweis: Eine Live-Websuche war für diese Anfrage vorgesehen, ist aber fehlgeschlagen oder nicht verfügbar.',
        'Erfinde keine aktuellen Fakten und verweise nicht auf ein Trainings-Wissenscutoff-Datum (z. B. Oktober 2023).',
        'Sage kurz, dass aktuelle Web-Infos gerade nicht abgerufen werden konnten, und bitte um erneuten Versuch oder präzisere Quelle.',
      ].join(' '),
    )
  }
  if (isMainChat && !thinking && options?.webSearchContext?.trim()) {
    lastUserTurnContextBlocks.push(`--- Websuche ---\n${options.webSearchContext.trim()}`)
  }
  if (stepByStepIntakeHardGuard) {
    lastUserTurnContextBlocks.push(stepByStepIntakeHardGuard)
  }
  const thinkingClarifyPhase = thinking
    ? thinkingDoc
      ? 'final'
      : (options?.thinkingConversationPhase ??
        resolveThinkingConversationPhase(threadMessages, options?.thinkingIntake ?? null))
    : null
  const thinkingIntakeBlocks: string[] = []
  if (thinking && options?.thinkingAnalyze) {
    thinkingIntakeBlocks.push(
      buildThinkingAnalyzeBriefingForGateway(
        options.thinkingAnalyze,
        options.thinkingIntake ? buildThinkingIntakeSummary(options.thinkingIntake) : undefined,
      ),
    )
  }
  if (thinking && thinkingClarifyPhase === 'clarify' && options?.thinkingClarifyFocus) {
    thinkingIntakeBlocks.push(getChatThinkingIntakeClarifyFocusInstruction(options.thinkingClarifyFocus))
  }
  const thinkingBlock = thinking
    ? [
        getChatThinkingWorkflowInstruction(),
        thinkingDoc ? getChatThinkingWordDocumentInstruction() : getAssistantThinkingMarkdownInstruction(),
        thinkingDoc ? '' : getChatThinkingMixedLayoutInstruction(),
        thinkingDoc ? '' : getChatThinkingDetailDepthInstruction(),
        thinkingClarifyPhase === 'clarify'
          ? getChatThinkingMandatoryClarifyTurnInstruction()
          : getChatThinkingFinalAnswerTurnInstruction(options?.thinkingAnalyze?.task_type),
      ]
        .filter(Boolean)
        .join('\n\n')
    : ''
  const thinkingClarifyUiReminder =
    thinkingClarifyPhase === 'clarify'
      ? getChatThinkingClarifyUiReminder()
      : thinkingClarifyPhase === 'final'
        ? getChatThinkingFinalAnswerUiReminder()
        : ''
  const combinedSystemPrompt = [
    baseQuiz,
    options?.systemPrompt?.trim() ?? '',
    excelChatHint,
    wordChatHint,
    pdfChatHint,
    mainChatWebGrounding,
    mainChatBrevity,
    mainChatGuidedDiagnosis,
    mainChatStepByStepIntake,
    truthBlock,
    toneBlock,
    thinkingBlock,
    thinking
      ? ''
      : getAssistantMarkdownFormattingInstruction({
          replyTone,
          compact: false,
        }),
    thinking
      ? getChatThinkingEmojiStyleInstruction()
      : !options?.userRequestedWord && !options?.userRequestedPdf
        ? getAssistantEmojiStyleInstruction({ replyTone })
        : '',
    thinkingClarifyUiReminder,
    mainChatBrevity && !thinkingClarifyUiReminder ? getAssistantMainChatBrevityFinalReminder() : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const scrubDataImages =
    isMainChat && !options?.useLearnPathModel
      ? (content: string) =>
          typeof content === 'string' ? scrubMainChatInlineImagesPreservingBildData(content) : ''
      : (content: string) => content

  return [
    {
      role: 'system',
      content: combinedSystemPrompt,
    },
    ...threadMessages.map((message) => {
      let content = scrubDataImages(message.content)
      if (message.role === 'user' && isMainChat) {
        content = formatUserContentForGateway(content)
      }
      if (message.role === 'user' && message.metadata?.userWordCommand) {
        const t = content.trim()
        content = t ? `${t}\n\n${WORD_EXPORT_COMMAND_MARKER}` : WORD_EXPORT_COMMAND_MARKER
      }
      if (message.role === 'user' && message.metadata?.userPdfCommand) {
        const t = content.trim()
        content = t ? `${t}\n\n${PDF_EXPORT_COMMAND_MARKER}` : PDF_EXPORT_COMMAND_MARKER
      }
      if (isMainChat && !thinking && message.role === 'user') {
        const turnBlocks: string[] = []
        if (message.metadata?.userQuizFormat) {
          turnBlocks.push(getQuizFormatGenerationInstruction(message.metadata.userQuizFormat))
        }
        if (lastUserMessage && message.id === lastUserMessage.id) {
          turnBlocks.push(...lastUserTurnContextBlocks)
        }
        content = prependMainChatTurnContextToUserContent(content, turnBlocks)
      }
      if (
        thinking &&
        message.role === 'user' &&
        lastUserMessage &&
        message.id === lastUserMessage.id
      ) {
        const thinkingBlocks = [...thinkingIntakeBlocks]
        const docBlock = buildThinkingDocumentUserContextBlock(message.content)
        if (docBlock) {
          thinkingBlocks.push(docBlock)
        }
        if (thinkingBlocks.length > 0) {
          const body = thinkingBlocks.join('\n\n')
          const base = content.trim()
          content = base ? `${base}\n\n---\n\n${body}` : body
        }
      }
      return {
        role: message.role,
        content,
      }
    }),
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

export async function generateWordFromOutline(input: {
  messageId: string
  threadId: string
  outline: WordOutlineV1
}): Promise<{ wordExport: ChatMessageWordExport; displayContent: string }> {
  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('generate-word-from-outline', {
    body: input,
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const payload = data as { wordExport?: unknown; displayContent?: unknown; error?: unknown } | undefined
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(payload.error.trim())
  }

  const wordExport = payload?.wordExport as Record<string, unknown> | undefined
  const displayContent = payload?.displayContent
  if (!wordExport || typeof displayContent !== 'string') {
    throw new Error('Word-Export konnte nicht abgeschlossen werden.')
  }
  const bucket = typeof wordExport.bucket === 'string' ? wordExport.bucket : ''
  const path = typeof wordExport.path === 'string' ? wordExport.path : ''
  const fileName = typeof wordExport.fileName === 'string' ? wordExport.fileName : ''
  if (!bucket || !path || !fileName) {
    throw new Error('Ungültige Word-Antwort.')
  }

  return {
    wordExport: { bucket, path, fileName },
    displayContent,
  }
}

export async function generatePdfFromOutline(input: {
  messageId: string
  threadId: string
  outline: WordOutlineV1
}): Promise<{ pdfExport: ChatMessagePdfExport; displayContent: string }> {
  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('generate-pdf-from-outline', {
    body: input,
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const payload = data as { pdfExport?: unknown; displayContent?: unknown; error?: unknown } | undefined
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(payload.error.trim())
  }

  const pdfExport = payload?.pdfExport as Record<string, unknown> | undefined
  const displayContent = payload?.displayContent
  if (!pdfExport || typeof displayContent !== 'string') {
    throw new Error('PDF-Export konnte nicht abgeschlossen werden.')
  }
  const bucket = typeof pdfExport.bucket === 'string' ? pdfExport.bucket : ''
  const path = typeof pdfExport.path === 'string' ? pdfExport.path : ''
  const fileName = typeof pdfExport.fileName === 'string' ? pdfExport.fileName : ''
  if (!bucket || !path || !fileName) {
    throw new Error('Ungültige PDF-Antwort.')
  }

  return {
    pdfExport: { bucket, path, fileName },
    displayContent,
  }
}

/** Begrenzt Sonnet-Ausgabe für Excel-Spec (Kosten). Edge `chat-completion` wertet `maxTokens` aus. */
const EXCEL_SPEC_MAX_OUTPUT_TOKENS = 8192
/** Harte Eingabegrenze für Excel-Spec (senkt TPM-Spitzen bei langen Paste-/Datei-Texten). */
const EXCEL_SPEC_MAX_INPUT_CHARS = 14000

/**
 * OpenAI Prompt Caching:
 * - bewusst grobe, stabile Keys pro Workload fuer hohe Hit-Rate
 * - bei grossen Prompt-Aenderungen EPOCH hochzaehlen
 * @see https://platform.openai.com/docs/guides/prompt-caching
 */
const OPENAI_PROMPT_CACHE_KEY_EXCEL_SPEC = 'straton-excel-spec-v1'
const OPENAI_PROMPT_CACHE_KEY_MAIN = 'straton-main-v4'
/** Thinking: eigener Key + stabiler Systemprompt (Material-Hinweis in Nutzernachricht). */
const OPENAI_PROMPT_CACHE_KEY_THINKING = 'straton-main-thinking-v5'
const OPENAI_PROMPT_CACHE_KEY_THINKING_ANALYZE = 'straton-thinking-analyze-v1'
const OPENAI_PROMPT_CACHE_KEY_LEARN = 'straton-learn-v3'
const OPENAI_PROMPT_CACHE_KEY_INSTANT_ANALYZE = 'straton-instant-analyze-v1'

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
    const learnMode = options.learnTelemetryMode ?? 'learn_tutor'
    const body: Record<string, unknown> = {
      provider: providerForLearnPath(),
      mode: learnMode,
      messages: gatewayMessages,
      promptCacheKey: OPENAI_PROMPT_CACHE_KEY_LEARN,
      promptCacheRetention: '24h',
      includeProfileMemory: false,
      maxTokens: LEARN_PATH_MAX_OUTPUT_TOKENS,
      openAiModels: options.openAiModels?.length
        ? [...options.openAiModels]
        : [...LEARN_PATH_OPENAI_MODELS],
    }
    return body
  }

  const thinking = isMainChatThinking(options)
  const meta = thinking
    ? { provider: 'openai' as const, openAiModels: [] as string[] }
    : getChatComposerModelMeta(options?.mainChatModelId ?? 'gpt-5.4-mini')
  const body: Record<string, unknown> = {
    mode: 'chat',
    provider: meta.provider,
    messages: gatewayMessages,
    includeProfileMemory: thinking ? false : true,
  }
  if (meta.provider === 'openai') {
    if (!options?.useLearnPathModel && thinking) {
      const usedToday =
        typeof options?.mainChatUsedTokensToday === 'number' ? options.mainChatUsedTokensToday : 0
      body.openAiModels = [
        ...buildMainChatOpenAiModelChain(usedToday, options?.mainChatThinkingTierConfig ?? undefined),
      ]
    } else if (
      !options?.useLearnPathModel &&
      !thinking &&
      options?.mainChatDailyTierConfig != null &&
      typeof options?.mainChatUsedTokensToday === 'number'
    ) {
      body.openAiModels = [
        ...buildMainChatOpenAiModelChain(
          options.mainChatUsedTokensToday,
          options.mainChatDailyTierConfig,
        ),
      ]
    } else if (meta.openAiModels?.length) {
      body.openAiModels = [...meta.openAiModels]
    }
  }
  if (meta.provider === 'anthropic' && meta.anthropicModel) {
    body.anthropicModel = meta.anthropicModel
  }
  if (meta.provider === 'openai') {
    body.promptCacheKey = thinking ? OPENAI_PROMPT_CACHE_KEY_THINKING : OPENAI_PROMPT_CACHE_KEY_MAIN
    body.promptCacheRetention = '24h'
  }
  body.maxTokens = thinking ? THINKING_MAX_OUTPUT_TOKENS : MAIN_CHAT_MAX_OUTPUT_TOKENS
  if (thinking) {
    body.billingConsumeThinkingCredit = true
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
    ? { provider: 'openai' as const }
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
          const j = JSON.parse(t) as { error?: unknown; message?: unknown }
          if (j.error === 'THINKING_LIMIT') {
            throw new Error(
              typeof j.message === 'string' && j.message.trim()
                ? j.message.trim()
                : 'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
            )
          }
          const apiErr = parseApiErrorField(j)
          if (apiErr) {
            msg = apiErr
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('Thinking-Guthaben')) {
            throw parseErr
          }
          if (t.length < 600) {
            msg = t.trim()
          }
        }
      }
    } catch (outer) {
      if (outer instanceof Error && outer.message.includes('Thinking-Guthaben')) {
        throw outer
      }
      /* ignore */
    }
    throw new Error(msg)
  }

  if (!ct.includes('text/event-stream')) {
    const t = await res.text()
    let fromJson = ''
    try {
      const j = JSON.parse(t) as { error?: unknown }
      fromJson = parseApiErrorField(j)
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

export async function instantAnalyzeUserMessage(params: {
  userMessage: string
  priorTurns?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<InstantAnalyzeInvokeResult> {
  const trimmed = params.userMessage.trim()
  if (!trimmed) {
    return { analyze: fallbackInstantAnalyzeResult(''), source: 'fallback' }
  }
  if (!usesGatewayAi()) {
    return { analyze: fallbackInstantAnalyzeResult(trimmed), source: 'fallback' }
  }

  const contextBlock = params.priorTurns?.length
    ? formatInstantAnalyzeContextLines(params.priorTurns)
    : ''

  try {
    const supabase = getSupabaseClient()
    const { data, error, response } = await supabase.functions.invoke('chat-completion', {
      body: {
        mode: 'instant_analyze',
        provider: providerForMainChat(),
        promptCacheKey: OPENAI_PROMPT_CACHE_KEY_INSTANT_ANALYZE,
        promptCacheRetention: '24h',
        payload: {
          userMessage: trimmed,
          contextBlock,
        },
      },
    })

    if (error) {
      throw new Error(await messageFromFunctionsInvokeFailure(error, response))
    }

    const parsed = sanitizeInstantAnalyzeResult(data?.analyze)
    if (parsed) {
      return {
        analyze: applyLiveWebHeuristic(trimmed, parsed),
        source: 'edge',
        analyzeFromAi: parsed,
      }
    }
  } catch {
    /* Fallback unten */
  }

  return { analyze: fallbackInstantAnalyzeResult(trimmed), source: 'fallback' }
}

export type ThinkingAnalyzeInvokeResult = {
  analyze: ThinkingAnalyzeResult
  source: 'edge' | 'fallback'
}

export async function thinkingAnalyzeUserMessage(params: {
  userMessage: string
  priorTurns?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<ThinkingAnalyzeInvokeResult> {
  const trimmed = params.userMessage.trim()
  if (!trimmed) {
    return { analyze: fallbackThinkingAnalyzeResult(''), source: 'fallback' }
  }
  if (!usesGatewayAi()) {
    return { analyze: fallbackThinkingAnalyzeResult(trimmed), source: 'fallback' }
  }

  const contextBlock = params.priorTurns?.length
    ? formatThinkingAnalyzeContextLines(params.priorTurns)
    : ''

  try {
    const supabase = getSupabaseClient()
    const { data, error, response } = await supabase.functions.invoke('chat-completion', {
      body: {
        mode: 'thinking_analyze',
        provider: providerForMainChat(),
        promptCacheKey: OPENAI_PROMPT_CACHE_KEY_THINKING_ANALYZE,
        promptCacheRetention: '24h',
        payload: {
          userMessage: trimmed,
          contextBlock,
        },
      },
    })

    if (error) {
      throw new Error(await messageFromFunctionsInvokeFailure(error, response))
    }

    const parsed = sanitizeThinkingAnalyzeResult(data?.analyze)
    if (parsed) {
      return { analyze: parsed, source: 'edge' }
    }
  } catch {
    /* Fallback */
  }

  return { analyze: fallbackThinkingAnalyzeResult(trimmed), source: 'fallback' }
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

export type { LearnFlashcard, LearnFlashcardSet, LearnWorksheetItem } from '../../learn/services/learn.persistence'

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

      return cards.slice(0, 16)
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

  return items.slice(0, 12)
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
