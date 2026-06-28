import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import {
  CHAT_THREADS_REFRESH_EVENT,
  CHAT_LAST_ACTIVE_THREAD_STORAGE_KEY,
  type ChatThreadsRefreshDetail,
} from '../constants/events'
import { stripChartCommandMarker, userWantsChartExport } from '../constants/chartExportPrompt'
import { stripDiagramCommandMarker, userWantsDiagramExport } from '../constants/diagramExportPrompt'
import { stripExcelCommandMarker, userWantsExcelExport } from '../constants/excelExportPrompt'
import { stripWordCommandMarker, userWantsWordExport } from '../constants/wordExportPrompt'
import { stripPdfCommandMarker, userWantsPdfExport } from '../constants/pdfExportPrompt'
import {
  PPTX_EDIT_COMMAND_MARKER,
  PPTX_PRESET_DISPLAY,
  stripPptxCommandMarker,
  userWantsPptxEdit,
  userWantsPptxExport,
  type PptxPresetKey,
} from '../constants/pptxExportPrompt'
import {
  CHAT_COMPOSER_MODEL_STORAGE_KEY,
  type ChatComposerModelId,
  type ChatModelPolicy,
  parseStoredComposerModelId,
} from '../constants/chatComposerModels'
import {
  CHAT_REPLY_MODE_STORAGE_KEY,
  type ChatReplyMode,
  parseStoredChatReplyMode,
} from '../constants/chatReplyMode'
import {
  CHAT_THINKING_MODE_STORAGE_KEY,
  type ChatThinkingMode,
  parseStoredChatThinkingMode,
} from '../constants/chatThinkingMode'
import type { ChatDailyOpenAiTierConfig } from '../constants/chatDailyOpenAiTier'
import { DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS } from '../constants/mainChatContext'
import { resolveStickyChatActionModel } from '../constants/chatIntentModelRouting'
import { getChatIntentModelRoutingConfig } from '../services/chatIntentModelRoutingFlag'
import {
  generateChatImageFromPrompt,
  generateChatTitleWithAi,
  generateExcelFromSpec,
  generateWordFromOutline,
  generatePdfFromOutline,
  generatePptxFromOutline,
  mergePersistedAiChatMemoryAfterTurn,
  extractChatDocumentsOnServer,
  instantAnalyzeUserMessage,
  sendMessage,
  sendMessageStreaming,
  thinkingAnalyzeUserMessage,
  thinkingDraftForTurn,
  thinkingReviewDraft,
  isAbortErrorLike,
  usesGatewayAi,
} from '../services/chat.service'
import type { InstantAnalyzeResult } from '../constants/instantAnalyze'
import type { ThinkingAnalyzeResult } from '../constants/thinkingAnalyze'
import {
  folderFilesToDocumentAttachments,
  resolveFolderFilesToLoad,
  resolveShouldUseFolderSources,
  userMessageWantsFolderSources,
  type ChatThreadFolderContext,
} from '../constants/folderSourceIntent'
import { isThinkingContinuationFollowUp } from '../constants/thinkingPipeline'
import type { ThinkingReviewResult } from '../constants/thinkingReview'
import {
  buildThinkingIntakeSummary,
  createThinkingIntakeSession,
  extractDimensionFromLastClarify,
  getNextThinkingFocusDimension,
  getThinkingClarifyProgress,
  isThinkingClarifyFollowUp,
  recordThinkingIntakeAnswer,
  resolveThinkingConversationPhase,
  type ThinkingIntakeSession,
} from '../utils/thinkingIntake'
import { fetchTavilySearchContext } from '../services/tavilySearch.service'
import {
  buildUnsplashSearchAssistantPayload,
  fetchUnsplashSearchResults,
} from '../services/unsplashSearch.service'
import {
  extractImageSearchQuery,
  isImageSearchTurnMessage,
  matchImageTopicClarification,
  type ImageSearchPriorTurn,
} from '../utils/imageSearchIntent'
import type { ThinkingClarifyDialogState } from '../utils/thinkingClarify'
import { stripSectionRefBlock } from '../utils/assistantSectionReply'
import type { ChatSendMessageOptions } from '../types/chatSendOptions'
import { uploadChatDocumentAttachment } from '../services/chat.documentStorage'
import {
  clearGeminiInstantEnabledCache,
  setGeminiInstantEnabledFromSupabase,
} from '../services/geminiInstantFlag'
import { setThinkingGeminiModelsFromSupabase } from '../services/thinkingGeminiModelsFlag'
import { getAppFeatureFlags } from '../../auth/services/appFeatureFlags.service'
import {
  messageHasDocumentFileAttachment,
  stripComposerAttachmentBlocksForRouting,
  stripEmptyDateiPlaceholders,
} from '../utils/chatRoutingText'
import {
  loadChatMediaPathAsVisionDataUrl,
  resolveReferencedImageStoragePath,
  shouldResolveReferencedImageVision,
} from '../utils/referencedImageVision'
import {
  matchAttachedImageEditRequest,
  matchFollowUpImageEditRequest,
  shouldUseAttachedImageEdit,
} from '../utils/imageGenerationIntent'
import { isComposerImageGenRequest } from '../constants/imageGenTile'
import {
  detectRouteHeuristic,
  resolveHeuristicImageGenFallback,
  resolveInstantRouteOverrides,
} from '../constants/instantAnalyzeRoute'
import { errorMessageFromUnknown } from '../../../utils/errorMessage'
import {
  parseThinkingClarifyContent,
  shouldOpenThinkingFallbackPopup,
} from '../utils/thinkingClarify'
import {
  createChatMessage,
  archiveChatThread,
  createChatThread,
  deleteChatThread,
  leaveSharedChatThreadMembership,
  listChatThreads,
  listMessagesByThreadIds,
  listMessagesForThread,
  mapMessage,
  touchChatThread,
  updateChatMessageContent,
  updateChatThreadTitle,
  type ChatMessageRow,
} from '../services/chat.persistence'
import { setChatThreadFolder } from '../services/chat.folders'
import { canFinalizeWordExportFromThread, extractWordOutlineFromThread } from '../utils/wordOutline'
import {
  canFinalizeExcelExportFromThread,
  hasExcelSpecMarkers,
  normalizeExcelSpecForExport,
  parseExcelSpecFromContent,
} from '../excel/excelSpec'
import { parseChartSpecFromContent } from '../chart/chartSpec'
import { parseDiagramSpecFromContent } from '../diagram/diagramSpec'
import { userMessageRequestsDirectAnswer } from '../constants/chatDirectAnswerInstruction'
import {
  canFinalizePdfExportFromThread,
  extractPdfOutlineFromThread,
} from '../pdf/pdfOutline'
import {
  applyPptxPatchToSlides,
  applyPptxTextOnlyPatchToSlides,
  buildPptxEditContextBlock,
  buildPptxExportHtml,
  canFinalizePptxExportFromThread,
  extractPptxSlidesFromThread,
  extractPptxSlideTitle,
  findPptxExportTargetMessage,
  hasPptxPatchMarkers,
  parsePptxPatchFromContent,
  parsePptxSlidesFromAssistantContent,
  parsePptxTextPatchFromContent,
  PPTX_PRESET_LEGACY_THEME_FALLBACK,
  type PptxSlide,
} from '../utils/pptxOutline'

/** Ergebnis von `submitPptxEditMessage` — entweder erfolgreich aufgelöster Patch ODER vom Modell abgelehnter, nicht umsetzbarer Wunsch (siehe `PPTX_EDIT_UNSUPPORTED_RULE`). */
export type PptxEditResult = { messageId: string; slides: PptxSlide[] } | { unsupported: true; message: string }
import { buildInstantAnalyzeDebugMeta } from '../constants/instantAnalyze'
import { buildThinkingAnalyzeDebugMeta } from '../constants/thinkingAnalyze'
import {
  computeLayoutMetricsFromAssistantContent,
  layoutMetricsToDebugMeta,
  presentationProfileToDebugMeta,
  resolveInstantPresentationProfileForMainChatTurn,
  resolveThinkingPresentationProfileForTurn,
  type PresentationProfile,
} from '../constants/presentationProfile'
import {
  resolveThinkingMediaRouteFromHeuristics,
  resolveThinkingMediaRouteFromInstantAnalyze,
} from '../constants/thinkingMediaRoute'
import {
  persistGeneratedImageInAssistantMessage,
  persistInlineVisionImagesInContent,
} from '../services/chat.visionStorage'
import {
  extractInlineVisionDataUrlFromContent,
  injectVisionInlineDataUrlIntoMessageContent,
  isValidVisionDataUrlForGateway,
  messageHasVisionPayload,
} from '../utils/visionMessageContent'
import { normalizeVisionDataUrl } from '../utils/imageVisionNormalize'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import type { ThinkingAnalyzeDebugMeta } from '../types'
import type { ChatProfileIdentity } from '../constants/chatProfileIdentityContext'
import type { ChatUserIntroduction } from '../constants/chatUserIntroductionContext'
import type { ChatSubscriptionUsageContext } from '../constants/chatSubscriptionUsageContext'
import type { InstantAnalyzeDebugMeta } from '../types'
import type { ChatMessage, ChatThread } from '../types'

export type { ChatSendPhase, ChatSendPhaseState } from '../constants/chatSendPhase'

const TEMP_THREAD_PREFIX = 'temp-thread-'
const THREAD_REMOVE_ANIMATION_MS = 180

/** Composer-Vorschau > Parsen aus `content` (Storage ersetzt Base64 oft vor dem API-Call). */
function resolveVisionInlineDataUrlForSend(
  composerPreviewUrl: string | undefined,
  ...contentCandidates: string[]
): string | undefined {
  const fromComposer =
    typeof composerPreviewUrl === 'string' ? normalizeVisionDataUrl(composerPreviewUrl.trim()) : ''
  if (isValidVisionDataUrlForGateway(fromComposer)) {
    return fromComposer
  }
  for (const raw of contentCandidates) {
    const extracted = extractInlineVisionDataUrlFromContent(raw)
    if (extracted) {
      return extracted
    }
  }
  return undefined
}

function applyVisionInlineToChatMessagesForGateway(
  messages: ChatMessage[],
  userMessageId: string,
  visionInlineDataUrl: string | undefined,
): ChatMessage[] {
  const inline =
    typeof visionInlineDataUrl === 'string' ? normalizeVisionDataUrl(visionInlineDataUrl.trim()) : ''
  if (!inline.startsWith('data:image/') || inline.length <= 64) {
    return messages
  }
  return messages.map((m) => {
    if (m.id !== userMessageId || m.role !== 'user') {
      return m
    }
    return {
      ...m,
      content: injectVisionInlineDataUrlIntoMessageContent(m.content, inline),
    }
  })
}

/** `merge_ai_chat_memory` nur alle N Nachrichten (jede User- und Assistant-Zeile zählt 1). */
const MEMORY_MERGE_EVERY_N_MESSAGES = 8

function createChatTitle(content: string) {
  const trimmed = content
    .replace(/\[\[STRATON_EXCEL_COMMAND\]\]/g, '')
    .replace(/\[\[STRATON_WORD_COMMAND\]\]/g, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
    .trim()
  if (!trimmed) {
    return 'Neuer Chat'
  }

  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed
}

function getMessagesByThread(
  messages: ChatMessage[],
): Record<string, ChatMessage[]> {
  return messages.reduce<Record<string, ChatMessage[]>>((acc, message) => {
    if (!message.threadId) {
      return acc
    }

    if (!acc[message.threadId]) {
      acc[message.threadId] = []
    }

    acc[message.threadId].push(message)
    return acc
  }, {})
}

function readLastActiveThreadId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return sessionStorage.getItem(CHAT_LAST_ACTIVE_THREAD_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistLastActiveThreadId(threadId: string | null) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    if (threadId) {
      sessionStorage.setItem(CHAT_LAST_ACTIVE_THREAD_STORAGE_KEY, threadId)
    } else {
      sessionStorage.removeItem(CHAT_LAST_ACTIVE_THREAD_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

function threadLikelyHasMessages(thread: ChatThread): boolean {
  return thread.updatedAt !== thread.createdAt
}

/** Eine Zeile pro Nachrichten-ID — verhindert Duplikate bei Realtime + lokalem Append. */
function upsertChatMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const idx = list.findIndex((m) => m.id === message.id)
  const next = idx >= 0 ? list.map((m, i) => (i === idx ? message : m)) : [...list, message]
  return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function upsertThreadMessages(
  prev: Record<string, ChatMessage[]>,
  threadId: string,
  message: ChatMessage,
): Record<string, ChatMessage[]> {
  const list = prev[threadId] ?? []
  return { ...prev, [threadId]: upsertChatMessage(list, message) }
}

/**
 * INSERT aus Realtime spiegelt die DB-Zeile — `excelExport` liegt oft nur clientseitig nach `generateExcelFromSpec`.
 * Ohne Merge würde die zweite (und weitere) Excel-Antwort die Metadaten wieder verlieren.
 */
function mergeRealtimeChatMessage(existing: ChatMessage | undefined, incoming: ChatMessage): ChatMessage {
  if (!existing) {
    return incoming
  }
  const excelFromExisting =
    existing.metadata?.excelExport && !incoming.metadata?.excelExport
      ? existing.metadata.excelExport
      : undefined
  const wordFromExisting =
    existing.metadata?.wordExport && !incoming.metadata?.wordExport
      ? existing.metadata.wordExport
      : undefined
  const pdfFromExisting =
    existing.metadata?.pdfExport && !incoming.metadata?.pdfExport
      ? existing.metadata.pdfExport
      : undefined
  if (!excelFromExisting && !wordFromExisting && !pdfFromExisting) {
    return incoming
  }
  return {
    ...incoming,
    metadata: {
      ...(incoming.metadata ?? {}),
      ...(excelFromExisting ? { excelExport: excelFromExisting } : {}),
      ...(wordFromExisting ? { wordExport: wordFromExisting } : {}),
      ...(pdfFromExisting ? { pdfExport: pdfFromExisting } : {}),
    },
  }
}

/** Zwei Zeilen gleicher `id` (Realtime-INSERT + Stream-Ersetzung) — erste Liste war willkürlich, Excel-Metadaten nicht verlieren. */
function mergeDuplicateChatMessagePair(a: ChatMessage, b: ChatMessage): ChatMessage {
  const aHasExcel = Boolean(a.metadata?.excelExport)
  const bHasExcel = Boolean(b.metadata?.excelExport)
  const aHasWord = Boolean(a.metadata?.wordExport)
  const bHasWord = Boolean(b.metadata?.wordExport)
  const aHasPdf = Boolean(a.metadata?.pdfExport)
  const bHasPdf = Boolean(b.metadata?.pdfExport)
  if (aHasExcel && !bHasExcel) {
    return a
  }
  if (bHasExcel && !aHasExcel) {
    return b
  }
  if (aHasWord && !bHasWord) {
    return a
  }
  if (bHasWord && !aHasWord) {
    return b
  }
  if (aHasPdf && !bHasPdf) {
    return a
  }
  if (bHasPdf && !aHasPdf) {
    return b
  }
  if (aHasExcel && bHasExcel) {
    return b.content.length >= a.content.length ? b : a
  }
  if (aHasWord && bHasWord) {
    return b.content.length >= a.content.length ? b : a
  }
  if (aHasPdf && bHasPdf) {
    return b.content.length >= a.content.length ? b : a
  }
  return b.content.length >= a.content.length ? b : a
}

function createTemporaryThread(userId: string): ChatThread {
  const now = new Date().toISOString()
  return {
    id: `${TEMP_THREAD_PREFIX}${crypto.randomUUID()}`,
    userId,
    title: 'Neuer Chat',
    createdAt: now,
    updatedAt: now,
    isTemporary: true,
    isRemoving: false,
  }
}

export function useChat(
  userId: string | undefined,
  autoRemoveEmptyChats = true,
  /** Abo: Modellsperre; undefined = volle Auswahl (z. B. Gast). */
  chatModelPolicy?: ChatModelPolicy,
  options?: {
    /** false: kein automatisches Aktualisieren des KI-Nutzer-Speichers nach Antworten */
    persistAiChatMemory?: boolean
    onProfileMemoryUpdated?: () => void | Promise<void>
    /** `subscription_usages.used_tokens` — Tages-Staffelung OpenAI im Hauptchat */
    mainChatUsedTokensToday?: number
    mainChatDailyTierConfig?: ChatDailyOpenAiTierConfig | null
    mainChatThinkingTierConfig?: ChatDailyOpenAiTierConfig | null
    /** Abo: max. geschätzte Tokens für Chat-Verlauf; ohne Abo Default aus `mainChatContext`. */
    mainChatContextMaxTokens?: number | null
    /** Aktuelles Websuche-Guthaben (Profil); ohne Superadmin bei 0 keine Websuche. */
    webSearchCreditBalance?: number
    isSuperadmin?: boolean
    /** App-Flag: Instant-Analyse-Debug im Chat (nur zusammen mit isSuperadmin). */
    instantAnalyzeDebugEnabled?: boolean
    /** Nach erfolgreicher Tavily-Suche Profil aktualisieren (Guthaben). */
    onWebSearchCreditsConsumed?: () => void | Promise<void>
    /** Thinking-Modus-Guthaben (Profil); ohne Superadmin bei 0 keine Thinking-Anfrage. */
    thinkingCreditBalance?: number
    /** Nach erfolgreicher Thinking-Buchung Profil aktualisieren. */
    onThinkingCreditsConsumed?: () => void | Promise<void>
    /** Vor-/Nachname aus Profil — System-Prompt Hauptchat (kein Extra-Request pro Turn). */
    profileIdentity?: ChatProfileIdentity | null
    /** Einführung aus Profil — System-Prompt Hauptchat. */
    userIntroduction?: ChatUserIntroduction | null
    /** Abo-Verbrauch aus Profil — System-Prompt + Karten im Chat. */
    subscriptionUsage?: ChatSubscriptionUsageContext | null
    /** Abo: Custom-Modus (Intent Analyze + Modell-Picker). */
    customModeAllowed?: boolean
    /** Ordner-Kontext für lazy Quellen aus Ordner-Dateien. */
    resolveThreadFolderContext?: (
      threadId: string,
    ) => Promise<import('../constants/folderSourceIntent').ChatThreadFolderContext | null>
  },
) {
  const { getPrompt } = useSystemPrompts()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messagesByThreadId, setMessagesByThreadId] = useState<Record<string, ChatMessage[]>>({})
  const [isSending, setIsSending] = useState(false)
  const [sendPhase, setSendPhase] = useState<ChatSendPhaseState>(null)
  const [liveInstantAnalyzeDebug, setLiveInstantAnalyzeDebug] =
    useState<InstantAnalyzeDebugMeta | null>(null)
  const [liveThinkingAnalyzeDebug, setLiveThinkingAnalyzeDebug] =
    useState<ThinkingAnalyzeDebugMeta | null>(null)
  const [wordFinalizeBusy, setWordFinalizeBusy] = useState(false)
  const [pdfFinalizeBusy, setPdfFinalizeBusy] = useState(false)
  const [excelFinalizeBusy, setExcelFinalizeBusy] = useState(false)
  const [pptxFinalizeBusy, setPptxFinalizeBusy] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerModelId, setComposerModelId] = useState<ChatComposerModelId>(() =>
    parseStoredComposerModelId(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_COMPOSER_MODEL_STORAGE_KEY) : null,
    ),
  )
  const [chatReplyMode, setChatReplyMode] = useState<ChatReplyMode>(() =>
    parseStoredChatReplyMode(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_REPLY_MODE_STORAGE_KEY) : null,
    ),
  )
  const [chatThinkingMode, setChatThinkingMode] = useState<ChatThinkingMode>(() =>
    parseStoredChatThinkingMode(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_THINKING_MODE_STORAGE_KEY) : null,
    ),
  )
  const [thinkingClarifyDialog, setThinkingClarifyDialog] = useState<ThinkingClarifyDialogState | null>(
    null,
  )
  const thinkingIntakeByThreadRef = useRef<Record<string, ThinkingIntakeSession>>({})
  const sendAbortControllerRef = useRef<AbortController | null>(null)
  const sendCancelCleanupRef = useRef<{
    threadId: string
    streamAssistantId: string | null
  } | null>(null)
  /** Lokal gepflegt (Profil + optimistisch nach Thinking-Anfrage); Superadmin: null = unbegrenzt. */
  const [thinkingCreditsRemaining, setThinkingCreditsRemaining] = useState<number | null>(() =>
    options?.isSuperadmin === true ? null : (options?.thinkingCreditBalance ?? 0),
  )
  const removeTimersRef = useRef<Record<string, number>>({})
  const loadedMessageThreadIdsRef = useRef<Set<string>>(new Set())
  /** Letztes Ergebnis eines Editier-Turns (Patch aufgelöst ODER als "nicht umsetzbar" abgelehnt) — `submitMessage` selbst gibt nichts zurück, daher hier zwischenlegen, damit `submitPptxEditMessage` das Modal nach Abschluss entsprechend aktualisieren kann. */
  const pptxEditResultRef = useRef<PptxEditResult | null>(null)

  useEffect(() => {
    if (options?.isSuperadmin === true) {
      setThinkingCreditsRemaining(null)
      return
    }
    setThinkingCreditsRemaining(options?.thinkingCreditBalance ?? 0)
  }, [options?.isSuperadmin, options?.thinkingCreditBalance])

  function persistComposerModelId(id: ChatComposerModelId) {
    if (
      chatModelPolicy &&
      !chatModelPolicy.allowModelChoice &&
      chatThinkingMode !== 'custom'
    ) {
      return
    }
    setComposerModelId(id)
    try {
      localStorage.setItem(CHAT_COMPOSER_MODEL_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }

  function persistChatReplyMode(mode: ChatReplyMode) {
    setChatReplyMode(mode)
    try {
      localStorage.setItem(CHAT_REPLY_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  function persistChatThinkingMode(mode: ChatThinkingMode) {
    if (mode === 'custom' && options?.customModeAllowed !== true) {
      mode = 'normal'
    }
    setChatThinkingMode(mode)
    try {
      localStorage.setItem(CHAT_THINKING_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!chatModelPolicy || chatModelPolicy.allowModelChoice || chatThinkingMode === 'custom') {
      return
    }
    setComposerModelId(chatModelPolicy.forcedModelId)
  }, [chatModelPolicy, chatThinkingMode])

  useEffect(() => {
    if (options?.customModeAllowed === true) {
      return
    }
    if (chatThinkingMode !== 'custom') {
      return
    }
    setChatThinkingMode('normal')
    try {
      localStorage.setItem(CHAT_THINKING_MODE_STORAGE_KEY, 'normal')
    } catch {
      /* ignore */
    }
  }, [options?.customModeAllowed, chatThinkingMode])

  const effectiveComposerModelId: ChatComposerModelId =
    chatThinkingMode === 'custom'
      ? composerModelId
      : chatModelPolicy && !chatModelPolicy.allowModelChoice
        ? chatModelPolicy.forcedModelId
        : composerModelId

  const isChatModelLocked = Boolean(chatModelPolicy && !chatModelPolicy.allowModelChoice)

  const messages = activeThreadId ? (messagesByThreadId[activeThreadId] ?? []) : []
  const thinkingCreditsBlocked =
    usesGatewayAi() &&
    chatThinkingMode === 'thinking' &&
    options?.isSuperadmin !== true &&
    (thinkingCreditsRemaining ?? 0) < 1

  const canSend = useMemo(() => !isSending && !thinkingCreditsBlocked, [isSending, thinkingCreditsBlocked])

  function markThinkingCreditConsumedLocally() {
    if (options?.isSuperadmin === true) {
      return
    }
    setThinkingCreditsRemaining((prev) => Math.max(0, (prev ?? 0) - 1))
  }

  function cancelSend() {
    sendAbortControllerRef.current?.abort()
    const cleanup = sendCancelCleanupRef.current
    if (cleanup?.threadId && cleanup.streamAssistantId) {
      setMessagesByThreadId((prev) => ({
        ...prev,
        [cleanup.threadId]: (prev[cleanup.threadId] ?? []).filter(
          (m) => m.id !== cleanup.streamAssistantId,
        ),
      }))
    }
    setSendPhase(null)
    setLiveInstantAnalyzeDebug(null)
    setLiveThinkingAnalyzeDebug(null)
  }

  function markThinkingCreditsDepletedLocally() {
    if (options?.isSuperadmin === true) {
      return
    }
    setThinkingCreditsRemaining(0)
  }

  const refreshThreadsFromServer = useCallback(
    async (
      currentUserId: string,
      preserveActiveThread: boolean,
      preferThreadId?: string | null,
    ) => {
      const nextThreads = await listChatThreads(currentUserId)
      if (nextThreads.length > 0) {
        const allMessages = await listMessagesByThreadIds(nextThreads.map((thread) => thread.id))
        setMessagesByThreadId(getMessagesByThread(allMessages))
        loadedMessageThreadIdsRef.current = new Set(nextThreads.map((thread) => thread.id))
      } else {
        setMessagesByThreadId({})
        loadedMessageThreadIdsRef.current = new Set()
      }

      setThreads(nextThreads)
      setActiveThreadId((currentId) => {
        if (
          preferThreadId &&
          nextThreads.some((thread) => thread.id === preferThreadId)
        ) {
          return preferThreadId
        }
        if (!preserveActiveThread) {
          return null
        }
        if (currentId && nextThreads.some((thread) => thread.id === currentId)) {
          return currentId
        }
        const storedId = readLastActiveThreadId()
        if (storedId && nextThreads.some((thread) => thread.id === storedId)) {
          return storedId
        }
        return null
      })
    },
    [],
  )

  const ensureThreadMessagesLoaded = async (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId)
    const cachedLen = messagesByThreadId[threadId]?.length ?? 0
    /** Optimistisches Senden / lokale Liste — nicht mit leerer Server-Antwort überschreiben. */
    if (cachedLen > 0) {
      loadedMessageThreadIdsRef.current.add(threadId)
      return
    }

    const shouldLoad =
      !loadedMessageThreadIdsRef.current.has(threadId) ||
      (thread != null && threadLikelyHasMessages(thread))

    if (!shouldLoad) {
      return
    }

    const msgs = await listMessagesForThread(threadId)
    loadedMessageThreadIdsRef.current.add(threadId)
    setMessagesByThreadId((prev) => {
      const localLen = prev[threadId]?.length ?? 0
      if (localLen > 0) {
        return prev
      }
      return {
        ...prev,
        [threadId]: msgs,
      }
    })
  }

  function clearRemoveTimer(threadId: string) {
    const timerId = removeTimersRef.current[threadId]
    if (timerId) {
      window.clearTimeout(timerId)
      delete removeTimersRef.current[threadId]
    }
  }

  function removeTemporaryThread(threadId: string) {
    clearRemoveTimer(threadId)

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId && thread.isTemporary
          ? {
              ...thread,
              isRemoving: true,
            }
          : thread,
      ),
    )

    setActiveThreadId((currentId) => (currentId === threadId ? null : currentId))

    removeTimersRef.current[threadId] = window.setTimeout(() => {
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId))
      setMessagesByThreadId((prev) => {
        const nextState = { ...prev }
        delete nextState[threadId]
        return nextState
      })
      delete removeTimersRef.current[threadId]
    }, THREAD_REMOVE_ANIMATION_MS)
  }

  useEffect(() => {
    if (!userId) {
      clearGeminiInstantEnabledCache()
      setThreads([])
      setMessagesByThreadId({})
      setActiveThreadId(null)
      loadedMessageThreadIdsRef.current = new Set()
      setIsBootstrapping(false)
      return
    }

    let flagsMounted = true
    void getAppFeatureFlags()
      .then((flags) => {
        if (flagsMounted) {
          setGeminiInstantEnabledFromSupabase(flags.gemini_instant_enabled)
          setThinkingGeminiModelsFromSupabase({
            standard: flags.thinking_gemini_model_standard_active,
            rich: flags.thinking_gemini_model_rich_active,
          })
        }
      })
      .catch(() => {
        if (flagsMounted) {
          setGeminiInstantEnabledFromSupabase(false)
        }
      })
    return () => {
      flagsMounted = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      return
    }

    const currentUserId = userId
    let isMounted = true

    async function bootstrap() {
      setIsBootstrapping(true)
      setError(null)

      try {
        await refreshThreadsFromServer(currentUserId, true)
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Chats konnten nicht geladen werden.')
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrap()

    return () => {
      isMounted = false
    }
  }, [userId, refreshThreadsFromServer])

  useEffect(() => {
    persistLastActiveThreadId(activeThreadId)
  }, [activeThreadId])

  useEffect(() => {
    if (!activeThreadId || isBootstrapping) {
      return
    }
    void ensureThreadMessagesLoaded(activeThreadId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Nachrichten konnten nicht geladen werden.')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Thread-Wechsel laden, nicht bei jeder Nachricht
  }, [activeThreadId, isBootstrapping, threads])

  useEffect(() => {
    if (!userId) {
      return
    }
    const currentUserId = userId

    function handleThreadsRefresh(ev: Event) {
      let prefer: string | undefined
      const ce = ev as CustomEvent<ChatThreadsRefreshDetail>
      if (ce.detail && typeof ce.detail.selectThreadId === 'string' && ce.detail.selectThreadId) {
        prefer = ce.detail.selectThreadId
      }
      void refreshThreadsFromServer(currentUserId, true, prefer)
    }

    window.addEventListener(CHAT_THREADS_REFRESH_EVENT, handleThreadsRefresh as EventListener)
    return () => {
      window.removeEventListener(CHAT_THREADS_REFRESH_EVENT, handleThreadsRefresh as EventListener)
    }
  }, [userId, refreshThreadsFromServer])

  useEffect(() => {
    if (!userId) {
      return
    }
    const supabase = getSupabaseClient()

    function handleChatMessageRow(row: ChatMessageRow) {
      if (!row?.id || !row.thread_id) {
        return
      }
      const mapped = mapMessage(row)
      setMessagesByThreadId((prev) => {
        const list = prev[row.thread_id] ?? []
        const existing = list.find((m) => m.id === mapped.id)
        const merged = mergeRealtimeChatMessage(existing, mapped)
        return upsertThreadMessages(prev, row.thread_id, merged)
      })
      setThreads((prev) => {
        const has = prev.some((t) => t.id === row.thread_id)
        if (!has) {
          return prev
        }
        const updated = prev.map((t) =>
          t.id === row.thread_id ? { ...t, updatedAt: new Date().toISOString() } : t,
        )
        return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })
    }

    const channel = supabase
      .channel(`chat-messages-live-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          handleChatMessageRow(payload.new as ChatMessageRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          /* generate-excel-from-spec schreibt metadata + content — ohne UPDATE blieb ggf. die INSERT-Zeile ohne Button */
          handleChatMessageRow(payload.new as ChatMessageRow)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    setThinkingClarifyDialog((prev) => {
      if (!prev || prev.threadId === activeThreadId) {
        return prev
      }
      return null
    })
  }, [activeThreadId])

  useEffect(() => {
    return () => {
      Object.values(removeTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      removeTimersRef.current = {}
    }
  }, [])

  async function createNewChat(options?: { folderId?: string }): Promise<string | null> {
    if (!userId) {
      return null
    }

    setError(null)
    const folderId = options?.folderId?.trim() || null
    const mustPersistImmediately = Boolean(folderId) || !autoRemoveEmptyChats

    if (mustPersistImmediately) {
      try {
        const persistedThread = await createChatThread(userId, 'Neuer Chat')
        if (folderId) {
          await setChatThreadFolder(userId, persistedThread.id, folderId)
        }

        threads
          .filter((thread) => thread.isTemporary && !thread.isRemoving)
          .forEach((thread) => {
            removeTemporaryThread(thread.id)
          })

        setThreads((prev) => {
          const withoutTemporary = prev.filter((thread) => !thread.isTemporary || thread.isRemoving)
          return [{ ...persistedThread, membershipRole: 'owner' as const }, ...withoutTemporary]
        })
        setMessagesByThreadId((prev) => ({
          ...prev,
          [persistedThread.id]: prev[persistedThread.id] ?? [],
        }))
        loadedMessageThreadIdsRef.current.add(persistedThread.id)
        setActiveThreadId(persistedThread.id)
        return persistedThread.id
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Neuer Chat konnte nicht erstellt werden.')
        return null
      }
    }

    const temporaryThread = createTemporaryThread(userId)

    threads
      .filter((thread) => thread.isTemporary && !thread.isRemoving)
      .forEach((thread) => {
        removeTemporaryThread(thread.id)
      })

    setThreads((prev) => [temporaryThread, ...prev])
    setMessagesByThreadId((prev) => ({
      ...prev,
      [temporaryThread.id]: [],
    }))
    loadedMessageThreadIdsRef.current.add(temporaryThread.id)
    setActiveThreadId(temporaryThread.id)
    return temporaryThread.id
  }

  async function renameChat(threadId: string, nextTitle: string) {
    const trimmed = nextTitle.trim()
    if (!trimmed) {
      return
    }

    setError(null)

    try {
      await updateChatThreadTitle(threadId, trimmed)

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                title: trimmed,
                updatedAt: new Date().toISOString(),
              }
            : thread,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat konnte nicht umbenannt werden.')
    }
  }

  async function deleteChat(
    threadId: string,
    options?: { animateRemoval?: boolean; optimisticListRemoval?: boolean },
  ) {
    const targetThread = threads.find((thread) => thread.id === threadId)
    if (targetThread?.isTemporary) {
      removeTemporaryThread(threadId)
      return
    }

    const animateRemoval = options?.animateRemoval !== false
    const optimisticListRemoval = options?.optimisticListRemoval === true

    setError(null)
    clearRemoveTimer(threadId)

    if (!animateRemoval) {
      setActiveThreadId((currentId) => (currentId === threadId ? null : currentId))

      const removeFromListState = () => {
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId))
        setMessagesByThreadId((prev) => {
          const nextState = { ...prev }
          delete nextState[threadId]
          return nextState
        })
      }

      if (optimisticListRemoval) {
        removeFromListState()
        try {
          await deleteChatThread(threadId)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Chat konnte nicht gelöscht werden.')
        }
        return
      }

      try {
        await deleteChatThread(threadId)
        removeFromListState()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chat konnte nicht gelöscht werden.')
      }
      return
    }

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              isRemoving: true,
            }
          : thread,
      ),
    )

    setActiveThreadId((currentId) => (currentId === threadId ? null : currentId))

    try {
      await Promise.all([
        deleteChatThread(threadId),
        new Promise<void>((resolve) => {
          removeTimersRef.current[threadId] = window.setTimeout(() => {
            resolve()
          }, THREAD_REMOVE_ANIMATION_MS)
        }),
      ])

      setThreads((prev) => prev.filter((thread) => thread.id !== threadId))

      setMessagesByThreadId((prev) => {
        const nextState = { ...prev }
        delete nextState[threadId]
        return nextState
      })

      delete removeTimersRef.current[threadId]
    } catch (err) {
      clearRemoveTimer(threadId)
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                isRemoving: false,
              }
            : thread,
        ),
      )
      setError(err instanceof Error ? err.message : 'Chat konnte nicht gelöscht werden.')
    }
  }

  async function archiveChat(
    threadId: string,
    options?: { animateRemoval?: boolean; optimisticListRemoval?: boolean },
  ) {
    const targetThread = threads.find((thread) => thread.id === threadId)
    if (targetThread?.isTemporary) {
      removeTemporaryThread(threadId)
      return
    }

    const animateRemoval = options?.animateRemoval !== false
    const optimisticListRemoval = options?.optimisticListRemoval === true

    setError(null)
    clearRemoveTimer(threadId)

    if (!animateRemoval) {
      setActiveThreadId((currentId) => (currentId === threadId ? null : currentId))

      const removeFromListState = () => {
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId))
      }

      if (optimisticListRemoval) {
        removeFromListState()
        try {
          await archiveChatThread(threadId)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Chat konnte nicht archiviert werden.')
        }
        return
      }

      try {
        await archiveChatThread(threadId)
        removeFromListState()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chat konnte nicht archiviert werden.')
      }
      return
    }

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              isRemoving: true,
            }
          : thread,
      ),
    )

    setActiveThreadId((currentId) => (currentId === threadId ? null : currentId))

    try {
      await Promise.all([
        archiveChatThread(threadId),
        new Promise<void>((resolve) => {
          removeTimersRef.current[threadId] = window.setTimeout(() => {
            resolve()
          }, THREAD_REMOVE_ANIMATION_MS)
        }),
      ])

      setThreads((prev) => prev.filter((thread) => thread.id !== threadId))

      delete removeTimersRef.current[threadId]
    } catch (err) {
      clearRemoveTimer(threadId)
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                isRemoving: false,
              }
            : thread,
        ),
      )
      setError(err instanceof Error ? err.message : 'Chat konnte nicht archiviert werden.')
    }
  }

  async function leaveSharedChatAsMember(threadId: string) {
    if (!userId) {
      return
    }

    const targetThread = threads.find((thread) => thread.id === threadId)
    if (
      targetThread?.isTemporary ||
      targetThread?.membershipRole !== 'member'
    ) {
      return
    }

    setError(null)

    try {
      await leaveSharedChatThreadMembership(threadId, userId)

      setThreads((prev) => prev.filter((thread) => thread.id !== threadId))

      setMessagesByThreadId((prev) => {
        const nextState = { ...prev }
        delete nextState[threadId]
        return nextState
      })

      setActiveThreadId((currentId) => {
        if (currentId !== threadId) {
          return currentId
        }
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freigabe konnte nicht beendet werden.')
    }
  }

  async function finalizeWordDocumentExport() {
    if (!activeThreadId) {
      return
    }
    if (!usesGatewayAi()) {
      setError('Word-Export ist im Demo-Modus nicht verfügbar.')
      return
    }
    const list = messagesByThreadId[activeThreadId] ?? []
    if (!canFinalizeWordExportFromThread(list)) {
      setError(
        'Es gibt noch keine exportierbare Gliederung. Bitte mit /Word eine Vorschau erzeugen oder den Entwurf ergänzen.',
      )
      return
    }
    const outline = extractWordOutlineFromThread(list)
    if (!outline) {
      return
    }
    const targetAssistant = [...list].reverse().find((m) => m.role === 'assistant' && !m.metadata?.wordExport)
    if (!targetAssistant) {
      return
    }
    setWordFinalizeBusy(true)
    setError(null)
    try {
      const wordResult = await generateWordFromOutline({
        messageId: targetAssistant.id,
        threadId: activeThreadId,
        outline,
      })
      const meta = { ...(targetAssistant.metadata ?? {}) }
      delete meta.liveStream
      const updatedMeta = { ...meta, wordExport: wordResult.wordExport }
      const updated: ChatMessage = {
        ...targetAssistant,
        metadata: updatedMeta,
      }
      // Restore original content in DB (edge function overwrites it with displayContent)
      await updateChatMessageContent(targetAssistant.id, targetAssistant.content, updatedMeta)
      setMessagesByThreadId((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((m) => (m.id === targetAssistant.id ? updated : m)),
      }))
      void options?.onProfileMemoryUpdated?.()?.catch(() => {})
      return wordResult.wordExport
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word-Export ist fehlgeschlagen.')
    } finally {
      setWordFinalizeBusy(false)
    }
    return undefined
  }

  async function finalizeExcelDocumentExport() {
    if (!activeThreadId) {
      return
    }
    if (!usesGatewayAi()) {
      setError('Excel-Export ist im Demo-Modus nicht verfügbar.')
      return
    }
    const list = messagesByThreadId[activeThreadId] ?? []
    if (!canFinalizeExcelExportFromThread(list)) {
      setError(
        'Es gibt noch keine exportierbare Excel-Vorgabe. Bitte mit /Excel eine Vorschau mit JSON erzeugen.',
      )
      return
    }
    const last = list[list.length - 1]
    if (!last || last.role !== 'assistant') {
      return
    }
    const parsed = parseExcelSpecFromContent(last.content)
    if (!parsed.spec) {
      return
    }
    const targetAssistant = [...list].reverse().find((m) => m.role === 'assistant' && !m.metadata?.excelExport)
    if (!targetAssistant) {
      return
    }
    setExcelFinalizeBusy(true)
    setError(null)
    try {
      const excelResult = await generateExcelFromSpec({
        messageId: targetAssistant.id,
        threadId: activeThreadId,
        spec: normalizeExcelSpecForExport(parsed.spec),
      })
      const meta = { ...(targetAssistant.metadata ?? {}) }
      delete meta.liveStream
      const updated: ChatMessage = {
        ...targetAssistant,
        content: excelResult.displayContent,
        metadata: {
          ...meta,
          excelExport: excelResult.excelExport,
        },
      }
      setMessagesByThreadId((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((m) =>
          m.id === targetAssistant.id ? updated : m,
        ),
      }))
      void options?.onProfileMemoryUpdated?.()?.catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel-Export ist fehlgeschlagen.')
    } finally {
      setExcelFinalizeBusy(false)
    }
  }

  async function finalizePdfDocumentExport() {
    if (!activeThreadId) {
      return
    }
    if (!usesGatewayAi()) {
      setError('PDF-Export ist im Demo-Modus nicht verfügbar.')
      return
    }
    const list = messagesByThreadId[activeThreadId] ?? []
    if (!canFinalizePdfExportFromThread(list)) {
      setError(
        'Es gibt noch keine exportierbare Gliederung. Bitte mit /PDF eine Vorschau erzeugen oder den Entwurf ergänzen.',
      )
      return
    }
    const outline = extractPdfOutlineFromThread(list)
    if (!outline) {
      return
    }
    const targetAssistant = [...list].reverse().find((m) => m.role === 'assistant' && !m.metadata?.pdfExport)
    if (!targetAssistant) {
      return
    }
    setPdfFinalizeBusy(true)
    setError(null)
    try {
      const pdfResult = await generatePdfFromOutline({
        messageId: targetAssistant.id,
        threadId: activeThreadId,
        outline,
      })
      const meta = { ...(targetAssistant.metadata ?? {}) }
      delete meta.liveStream
      const updatedMeta = { ...meta, pdfExport: pdfResult.pdfExport }
      const updated: ChatMessage = {
        ...targetAssistant,
        metadata: updatedMeta,
      }
      // Restore original content in DB (edge function overwrites it with displayContent)
      await updateChatMessageContent(targetAssistant.id, targetAssistant.content, updatedMeta)
      setMessagesByThreadId((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((m) => (m.id === targetAssistant.id ? updated : m)),
      }))
      void options?.onProfileMemoryUpdated?.()?.catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-Export ist fehlgeschlagen.')
    } finally {
      setPdfFinalizeBusy(false)
    }
  }

  async function finalizePptxDocumentExport() {
    if (!activeThreadId) {
      return
    }
    if (!usesGatewayAi()) {
      setError('PowerPoint-Export ist im Demo-Modus nicht verfügbar.')
      return
    }
    const list = messagesByThreadId[activeThreadId] ?? []
    if (!canFinalizePptxExportFromThread(list)) {
      setError(
        'Es gibt noch keine exportierbaren Folien. Bitte mit /PowerPoint eine Vorschau erzeugen.',
      )
      return
    }
    const slides = extractPptxSlidesFromThread(list)
    if (!slides) {
      return
    }
    /** Immer der Anker (die ursprüngliche Präsentations-Nachricht) — nie ein versteckter Editier-Turn, auch wenn der bereits einen (jetzt veralteten) `pptxExport` trägt. */
    const targetAssistant = findPptxExportTargetMessage(list)
    if (!targetAssistant) {
      return
    }
    setPptxFinalizeBusy(true)
    setError(null)
    try {
      const pptxResult = await generatePptxFromOutline({
        messageId: targetAssistant.id,
        threadId: activeThreadId,
        html: buildPptxExportHtml(slides),
        fileName: extractPptxSlideTitle(slides[0]),
      })
      const meta = { ...(targetAssistant.metadata ?? {}) }
      delete meta.liveStream
      const updated: ChatMessage = {
        ...targetAssistant,
        content: pptxResult.displayContent,
        metadata: {
          ...meta,
          pptxExport: { ...pptxResult.pptxExport, slides },
        },
      }
      setMessagesByThreadId((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((m) => (m.id === targetAssistant.id ? updated : m)),
      }))
      void options?.onProfileMemoryUpdated?.()?.catch(() => {})
      return pptxResult.pptxExport
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PowerPoint-Export ist fehlgeschlagen.')
      return undefined
    } finally {
      setPptxFinalizeBusy(false)
    }
  }

  async function selectChat(threadId: string) {
    setThinkingClarifyDialog(null)
    if (autoRemoveEmptyChats && activeThreadId && activeThreadId !== threadId) {
      const activeThread = threads.find((thread) => thread.id === activeThreadId)
      const hasMessages = (messagesByThreadId[activeThreadId]?.length ?? 0) > 0

      if (activeThread?.isTemporary && !activeThread.isRemoving && !hasMessages) {
        removeTemporaryThread(activeThreadId)
      }
    }

    try {
      await ensureThreadMessagesLoaded(threadId)
      setActiveThreadId(threadId)
      setError(null)
    } catch (err) {
      setActiveThreadId(threadId)
      setError(err instanceof Error ? err.message : 'Nachrichten konnten nicht geladen werden.')
    }
  }

  async function submitMessage(content: string, sendOpts?: ChatSendMessageOptions) {
    let wantsWord = userWantsWordExport(content)
    let wantsPdf = !wantsWord && userWantsPdfExport(content)
    let wantsExcel = !wantsWord && !wantsPdf && userWantsExcelExport(content)
    let wantsPptx = !wantsWord && !wantsPdf && !wantsExcel && userWantsPptxExport(content)
    /** Editier-Box in der Folien-Vorschau: gezielte Änderung statt Neugenerierung — siehe `submitPptxEditMessage`. */
    const wantsPptxEdit = wantsPptx && userWantsPptxEdit(content)
    /** Editier-Turns laufen immer über Smart Instant — schnelle Rückmeldung für gezielte Änderungen, unabhängig vom globalen Thinking-Toggle. */
    const effectiveThinkingMode: ChatThinkingMode = wantsPptxEdit ? 'normal' : chatThinkingMode
    let wantsChart =
      !wantsWord && !wantsPdf && !wantsExcel && !wantsPptx && userWantsChartExport(content)
    let wantsDiagram =
      !wantsWord &&
      !wantsPdf &&
      !wantsExcel &&
      !wantsPptx &&
      !wantsChart &&
      userWantsDiagramExport(content)
    let trimmed = stripDiagramCommandMarker(stripChartCommandMarker(content))
    trimmed = stripExcelCommandMarker(trimmed)
    trimmed = stripWordCommandMarker(trimmed)
    trimmed = stripPdfCommandMarker(trimmed)
    trimmed = stripPptxCommandMarker(trimmed)
    /** Routing ohne Anhang-Blöcke/Dateinamen — verhindert fälschliches pdf_generate. */
    const routingText = stripComposerAttachmentBlocksForRouting(stripSectionRefBlock(trimmed))
    const hasPendingServerDocuments =
      (sendOpts?.documentAttachments?.length ?? 0) > 0 ||
      (sendOpts?.pendingDocumentFiles?.length ?? 0) > 0
    let hasDocumentFileAttachment =
      hasPendingServerDocuments || messageHasDocumentFileAttachment(content)
    /** Voller Composer-Inhalt (mit `[BildData]`), nicht `routingText` — sonst blockiert reines Foto ohne Text. */
    const hasAttachedVision =
      messageHasVisionPayload(trimmed) || Boolean(sendOpts?.visionInlineDataUrl)

    if (!canSend) {
      return
    }
    if (
      !wantsWord &&
      !wantsPdf &&
      !routingText &&
      !hasAttachedVision &&
      !hasDocumentFileAttachment
    ) {
      return
    }
    const priorTurnsEarly: ImageSearchPriorTurn[] = (activeThreadId
      ? messagesByThreadId[activeThreadId] ?? []
      : []
    )
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ...(m.metadata?.unsplashSearch?.query
          ? { unsplashQuery: m.metadata.unsplashSearch.query }
          : {}),
      }))

    if (!wantsChart && !wantsDiagram && routingText) {
      const mediaRoute = detectRouteHeuristic(
        routingText,
        hasAttachedVision,
        priorTurnsEarly,
        hasDocumentFileAttachment,
      )
      if (mediaRoute?.category === 'chart') {
        wantsChart = true
      } else if (mediaRoute?.category === 'diagram') {
        wantsDiagram = true
      }
    }
    const wantsDirectAnswer = userMessageRequestsDirectAnswer(routingText, priorTurnsEarly)

    let imageGenPrompt: string | null = null
    let imageSearchQuery: string | null = null

    if (effectiveThinkingMode === 'thinking') {
      const composerRouteLockedEarly =
        wantsWord ||
        wantsPdf ||
        wantsExcel ||
        wantsPptx ||
        wantsChart ||
        wantsDiagram ||
        isComposerImageGenRequest(routingText)
      const thinkingMediaEarly = resolveThinkingMediaRouteFromHeuristics(routingText, {
        hasVisionAttachment: hasAttachedVision,
        hasDocumentFileAttachment,
        priorTurns: priorTurnsEarly,
        composerRouteLocked: composerRouteLockedEarly,
      })
      if (thinkingMediaEarly.imageGenEmpty) {
        setError(
          'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
        )
        return
      }
      if (thinkingMediaEarly.wantsWord) {
        wantsWord = true
        wantsPdf = false
        wantsExcel = false
        wantsPptx = false
        wantsChart = false
        wantsDiagram = false
      } else if (thinkingMediaEarly.wantsPdf) {
        wantsPdf = true
        wantsWord = false
        wantsExcel = false
        wantsPptx = false
        wantsChart = false
        wantsDiagram = false
      } else if (thinkingMediaEarly.wantsExcel) {
        wantsExcel = true
        wantsWord = false
        wantsPdf = false
        wantsPptx = false
        wantsChart = false
        wantsDiagram = false
      } else if (thinkingMediaEarly.wantsPptx) {
        wantsPptx = true
        wantsWord = false
        wantsPdf = false
        wantsExcel = false
        wantsChart = false
        wantsDiagram = false
      } else if (thinkingMediaEarly.wantsChart) {
        wantsChart = true
        wantsWord = false
        wantsPdf = false
        wantsExcel = false
        wantsPptx = false
        wantsDiagram = false
      } else if (thinkingMediaEarly.wantsDiagram) {
        wantsDiagram = true
        wantsWord = false
        wantsPdf = false
        wantsExcel = false
        wantsPptx = false
        wantsChart = false
      }
      if (thinkingMediaEarly.imageSearchQuery) {
        imageSearchQuery = thinkingMediaEarly.imageSearchQuery
        imageGenPrompt = null
      }
    }

    let wantsThinkingTurn =
      usesGatewayAi() &&
      effectiveThinkingMode === 'thinking' &&
      !wantsExcel &&
      !wantsChart &&
      !wantsDiagram &&
      !wantsWord &&
      !wantsPdf &&
      !wantsPptx &&
      !imageGenPrompt &&
      !imageSearchQuery

    if (wantsThinkingTurn && options?.isSuperadmin !== true && (thinkingCreditsRemaining ?? 0) < 1) {
      setError(
        'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
      )
      return
    }
    setThinkingClarifyDialog(null)
    setError(null)
    setLiveInstantAnalyzeDebug(null)
    setLiveThinkingAnalyzeDebug(null)
    let threadId = activeThreadId

    if ((wantsWord || wantsPdf) && !usesGatewayAi()) {
      setError(`${wantsPdf ? 'PDF' : 'Word'}-Export ist im Demo-Modus nicht verfügbar.`)
      return
    }

    setIsSending(true)
    sendAbortControllerRef.current?.abort()
    const sendAbort = new AbortController()
    sendAbortControllerRef.current = sendAbort
    const signal = sendAbort.signal

    try {
      let activeThread = threadId ? threads.find((thread) => thread.id === threadId) : undefined
      let isTemporaryThread = Boolean(activeThread?.isTemporary)

      if (!threadId) {
        if (!userId) {
          setError('Kein Nutzer aktiv. Bitte neu anmelden.')
          return
        }

        const persistedThread = await createChatThread(userId, 'Neuer Chat')
        const ownerThread = { ...persistedThread, membershipRole: 'owner' as const }
        setThreads((prev) => [ownerThread, ...prev])
        setMessagesByThreadId((prev) => ({
          ...prev,
          [persistedThread.id]: prev[persistedThread.id] ?? [],
        }))
        setActiveThreadId(persistedThread.id)

        threadId = persistedThread.id
        activeThread = ownerThread
        isTemporaryThread = false
      }

      if (isTemporaryThread) {
        if (!userId) {
          setError('Kein Nutzer aktiv. Bitte neu anmelden.')
          return
        }

        const temporaryThreadId = threadId
        if (!temporaryThreadId) {
          setError('Chat konnte nicht vorbereitet werden.')
          return
        }

        const persistedThread = await createChatThread(userId, 'Neuer Chat')
        clearRemoveTimer(temporaryThreadId)

        setThreads((prev) => {
          const withoutTemporary = prev.filter((thread) => thread.id !== temporaryThreadId)
          return [{ ...persistedThread, membershipRole: 'owner' as const }, ...withoutTemporary]
        })

        setMessagesByThreadId((prev) => {
          const nextState = { ...prev }
          const temporaryMessages = nextState[temporaryThreadId] ?? []
          delete nextState[temporaryThreadId]
          nextState[persistedThread.id] = temporaryMessages
          return nextState
        })

        threadId = persistedThread.id
        setActiveThreadId(persistedThread.id)
        activeThread = { ...persistedThread, membershipRole: 'owner' as const }
        isTemporaryThread = false
      }

      if (!threadId) {
        setError('Chat konnte nicht vorbereitet werden.')
        return
      }

      const targetThreadId = threadId
      sendCancelCleanupRef.current = { threadId: targetThreadId, streamAssistantId: null }
      const aclThread =
        threads.find((t) => t.id === targetThreadId) ??
        (activeThread?.id === targetThreadId ? activeThread : undefined)
      const userOwnsThread = Boolean(userId && aclThread && aclThread.userId === userId)

      const priorTurnsForContext: ImageSearchPriorTurn[] = (messagesByThreadId[targetThreadId] ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ...(m.metadata?.unsplashSearch?.query
            ? { unsplashQuery: m.metadata.unsplashSearch.query }
            : {}),
        }))

      let folderContext: ChatThreadFolderContext | null = null
      try {
        folderContext = (await options?.resolveThreadFolderContext?.(targetThreadId)) ?? null
      } catch {
        folderContext = null
      }
      const folderFileNames =
        folderContext?.files.map((file) => file.name.trim()).filter(Boolean) ?? []

      if (effectiveThinkingMode !== 'thinking') {
        imageSearchQuery =
          !imageGenPrompt &&
          !wantsWord &&
          !wantsPdf &&
          (isImageSearchTurnMessage(routingText) ||
            matchImageTopicClarification(routingText, priorTurnsForContext))
            ? extractImageSearchQuery(routingText, undefined, priorTurnsForContext) || null
            : null
      }
      if (!imageGenPrompt && !wantsWord && !wantsPdf && hasAttachedVision) {
        const attachedEdit = matchAttachedImageEditRequest(routingText, true)
        if (attachedEdit.kind === 'prompt') {
          imageGenPrompt = attachedEdit.prompt
        }
      }
      if (!imageGenPrompt && !wantsWord && !wantsPdf) {
        const prior = messagesByThreadId[targetThreadId] ?? []
        const follow = matchFollowUpImageEditRequest(routingText, prior)
        if (follow.kind === 'prompt') {
          imageGenPrompt = follow.prompt
        }
      }

      let userContent =
        trimmed ||
        (wantsWord ? 'Word-Dokument vorbereiten' : wantsPdf ? 'PDF-Dokument vorbereiten' : trimmed)

      const optimisticUserId = crypto.randomUUID()
      const optimisticCreatedAt = new Date().toISOString()
      let nextMessages: ChatMessage[] = []

      let documentAttachments = [...(sendOpts?.documentAttachments ?? [])]
      const pendingDocFiles = sendOpts?.pendingDocumentFiles ?? []
      const hasDocumentProcessing =
        documentAttachments.length > 0 || pendingDocFiles.length > 0

      const buildPrePersistUserMetadata = (
        docAttachments: typeof documentAttachments,
      ): NonNullable<ChatMessage['metadata']> => ({
        ...(wantsExcel ? { userExcelCommand: true as const } : {}),
        ...(wantsWord ? { userWordCommand: true as const } : {}),
        ...(wantsPdf ? { userPdfCommand: true as const } : {}),
        ...(wantsPptx ? { userPptxCommand: true as const } : {}),
        ...(wantsChart ? { userChartCommand: true as const } : {}),
        ...(wantsDiagram ? { userDiagramCommand: true as const } : {}),
        ...(wantsDirectAnswer ? { userDirectAnswerCommand: true as const } : {}),
        ...(sendOpts?.quizFormat ? { userQuizFormat: sendOpts.quizFormat } : {}),
        ...(docAttachments.length > 0
          ? {
              documentAttachments: docAttachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                bucket: attachment.bucket,
                path: attachment.path,
                mimeType: attachment.mimeType,
              })),
            }
          : {}),
      })

      const syncOptimisticUserMessage = (content: string, metadata: ChatMessage['metadata']) => {
        const message: ChatMessage = {
          id: optimisticUserId,
          role: 'user',
          content,
          createdAt: optimisticCreatedAt,
          metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
        }
        loadedMessageThreadIdsRef.current.add(targetThreadId)
        setMessagesByThreadId((prev) => {
          const list = prev[targetThreadId] ?? []
          nextMessages = upsertChatMessage(list, message)
          return { ...prev, [targetThreadId]: nextMessages }
        })
      }

      const dropOptimisticUserMessage = () => {
        setMessagesByThreadId((prev) => ({
          ...prev,
          [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
        }))
      }

      if (hasDocumentProcessing) {
        const pendingAttachmentRefs = pendingDocFiles.map((pending) => ({
          id: pending.id,
          name: pending.name,
          bucket: '',
          path: '',
          mimeType: pending.file.type || 'application/octet-stream',
        }))
        syncOptimisticUserMessage(
          userContent,
          buildPrePersistUserMetadata([...documentAttachments, ...pendingAttachmentRefs]),
        )
        setSendPhase('document_processing')
      }

      if (pendingDocFiles.length > 0) {
        if (!userId) {
          dropOptimisticUserMessage()
          setError('Kein Nutzer aktiv. Bitte neu anmelden.')
          return
        }
        for (const pending of pendingDocFiles) {
          try {
            const uploaded = await uploadChatDocumentAttachment(
              userId,
              targetThreadId,
              pending.file,
              pending.id,
            )
            documentAttachments.push({
              id: pending.id,
              name: pending.name,
              bucket: uploaded.bucket,
              path: uploaded.path,
              mimeType: uploaded.mimeType,
            })
          } catch (uploadErr) {
            dropOptimisticUserMessage()
            setError(
              uploadErr instanceof Error
                ? uploadErr.message
                : 'Dokument konnte nicht hochgeladen werden.',
            )
            return
          }
        }
        if (hasDocumentProcessing) {
          syncOptimisticUserMessage(userContent, buildPrePersistUserMetadata(documentAttachments))
        }
      }

      if (documentAttachments.length > 0) {
        if (!hasDocumentProcessing) {
          setSendPhase('document_processing')
        }
        try {
          const { fileBlocks } = await extractChatDocumentsOnServer({
            attachments: documentAttachments,
            signal,
          })
          userContent = stripEmptyDateiPlaceholders(userContent)
          userContent = [userContent, fileBlocks].filter(Boolean).join('\n\n')
          if (!userContent.trim()) {
            userContent = 'Bitte werte das angehängte Dokument aus.'
          }
        } catch (extractErr) {
          if (!isAbortErrorLike(extractErr)) {
            setError(
              extractErr instanceof Error
                ? extractErr.message
                : 'Dokument konnte nicht analysiert werden.',
            )
          }
          dropOptimisticUserMessage()
          return
        }
      }

      const userMetadataBase: NonNullable<ChatMessage['metadata']> = {
        ...(wantsExcel ? { userExcelCommand: true as const } : {}),
        ...(wantsWord ? { userWordCommand: true as const } : {}),
        ...(wantsPdf ? { userPdfCommand: true as const } : {}),
        ...(wantsPptx && !wantsPptxEdit ? { userPptxCommand: true as const } : {}),
        ...(wantsChart ? { userChartCommand: true as const } : {}),
        ...(wantsDiagram ? { userDiagramCommand: true as const } : {}),
        ...(wantsDirectAnswer ? { userDirectAnswerCommand: true as const } : {}),
        ...(sendOpts?.quizFormat ? { userQuizFormat: sendOpts.quizFormat } : {}),
        ...(sendOpts?.pptxEditAnchorMessageId
          ? { pptxEditAnchorMessageId: sendOpts.pptxEditAnchorMessageId }
          : {}),
        ...(documentAttachments.length > 0
          ? {
              documentAttachments: documentAttachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                bucket: attachment.bucket,
                path: attachment.path,
                mimeType: attachment.mimeType,
              })),
            }
          : {}),
      }

      async function injectFolderSourcesIfNeeded(
        analyze?: Pick<InstantAnalyzeResult | ThinkingAnalyzeResult, 'task_type' | 'intent'> & {
          use_folder_sources?: boolean
        },
      ): Promise<boolean> {
        if (!folderContext || folderContext.files.length === 0 || documentAttachments.length > 0) {
          return false
        }
        if (
          !resolveShouldUseFolderSources({
            userMessage: routingText,
            fileNames: folderFileNames,
            hasDirectDocumentAttachment: documentAttachments.length > 0,
            analyze,
          })
        ) {
          return false
        }

        setSendPhase('document_processing')
        const filesToLoad = resolveFolderFilesToLoad(routingText, folderContext.files)
        const attachments = folderFilesToDocumentAttachments(filesToLoad)
        try {
          const { fileBlocks } = await extractChatDocumentsOnServer({ attachments, signal })
          userContent = stripEmptyDateiPlaceholders(userContent)
          userContent = [userContent, fileBlocks].filter(Boolean).join('\n\n')
          if (!userContent.trim()) {
            userContent = 'Bitte werte die Ordner-Dateien aus.'
          }
          hasDocumentFileAttachment = true
          syncOptimisticUserMessage(
            userContent,
            Object.keys(userMetadataBase).length > 0 ? userMetadataBase : undefined,
          )
          return true
        } catch (extractErr) {
          if (!isAbortErrorLike(extractErr)) {
            setError(
              extractErr instanceof Error
                ? extractErr.message
                : 'Ordner-Dateien konnten nicht gelesen werden.',
            )
          }
          dropOptimisticUserMessage()
          throw extractErr
        }
      }

      let visionInlineDataUrl = resolveVisionInlineDataUrlForSend(
        sendOpts?.visionInlineDataUrl,
        userContent,
        content,
      )

      const priorForVision = messagesByThreadId[targetThreadId] ?? []

      const wantsInstantAnalyze =
        usesGatewayAi() &&
        effectiveThinkingMode !== 'thinking' &&
        !wantsWord &&
        !wantsPdf &&
        !wantsExcel &&
        !wantsPptx &&
        !wantsChart &&
        !wantsDiagram &&
        (Boolean(routingText) || hasDocumentFileAttachment) &&
        !hasAttachedVision

      if (userId && messageHasVisionPayload(userContent)) {
        try {
          const persisted = await persistInlineVisionImagesInContent(userId, targetThreadId, userContent)
          userContent = persisted.content
          if (persisted.metadata?.visionImage) {
            userMetadataBase.visionImage = persisted.metadata.visionImage
          }
        } catch (persistErr) {
          console.warn('[useChat] vision storage persist failed', persistErr)
        }
      }

      if (
        messageHasVisionPayload(content) &&
        !visionInlineDataUrl &&
        !userContent.includes('@chat-media:')
      ) {
        dropOptimisticUserMessage()
        setError('Das Foto konnte nicht für die KI vorbereitet werden. Bitte erneut anhängen.')
        return
      }

      const priorTurns = priorTurnsForContext

      syncOptimisticUserMessage(
        userContent,
        Object.keys(userMetadataBase).length > 0 ? userMetadataBase : undefined,
      )

      if (wantsInstantAnalyze) {
        setSendPhase('analyzing')
      }

      let instantAnalyze: InstantAnalyzeResult | undefined
      let webSearchContext: string | undefined
      let usedAutoWebSearch = false
      let wantedAutoWebSearch = false
      let instantAnalyzeDebug: InstantAnalyzeDebugMeta | undefined
      let presentationProfileForDebug: PresentationProfile | undefined
      const persistInstantAnalyzeDebug =
        options?.isSuperadmin === true && options?.instantAnalyzeDebugEnabled === true

      try {
        if (wantsInstantAnalyze) {
          // Stage 2D: start folder content extraction in parallel with instant analyze
          // when the heuristic already knows folder sources are needed (no analyze result required)
          const heuristicWantsFolderSources =
            folderContext != null &&
            folderContext.files.length > 0 &&
            documentAttachments.length === 0 &&
            userMessageWantsFolderSources(routingText, folderFileNames)

          let speculativeFolderPromise: Promise<{ fileBlocks: string }> | null = null
          if (heuristicWantsFolderSources) {
            const filesToLoad = resolveFolderFilesToLoad(routingText, folderContext!.files)
            const attachments = folderFilesToDocumentAttachments(filesToLoad)
            speculativeFolderPromise = extractChatDocumentsOnServer({ attachments, signal })
          }

          const invokeResult = await instantAnalyzeUserMessage({
            userMessage: routingText,
            priorTurns,
            hasVisionAttachment: hasAttachedVision,
            hasDocumentFileAttachment,
            folderContext,
            signal,
          })
          instantAnalyze = invokeResult.analyze

          if (speculativeFolderPromise) {
            const shouldUse = resolveShouldUseFolderSources({
              userMessage: routingText,
              fileNames: folderFileNames,
              hasDirectDocumentAttachment: documentAttachments.length > 0,
              analyze: instantAnalyze,
            })
            if (shouldUse) {
              setSendPhase('document_processing')
              let folderData: { fileBlocks: string } | null = null
              try {
                folderData = await speculativeFolderPromise
              } catch (extractErr) {
                if (!isAbortErrorLike(extractErr)) {
                  setError(
                    extractErr instanceof Error
                      ? extractErr.message
                      : 'Ordner-Dateien konnten nicht gelesen werden.',
                  )
                }
                dropOptimisticUserMessage()
                return
              }
              if (folderData) {
                userContent = stripEmptyDateiPlaceholders(userContent)
                userContent = [userContent, folderData.fileBlocks].filter(Boolean).join('\n\n')
                if (!userContent.trim()) {
                  userContent = 'Bitte werte die Ordner-Dateien aus.'
                }
                hasDocumentFileAttachment = true
                syncOptimisticUserMessage(
                  userContent,
                  Object.keys(userMetadataBase).length > 0 ? userMetadataBase : undefined,
                )
              }
            }
            // if shouldUse is false: discard speculative result, injectFolderSourcesIfNeeded
            // will also return false since heuristic was the only trigger
          } else {
            try {
              await injectFolderSourcesIfNeeded(instantAnalyze)
            } catch {
              return
            }
          }

          const composerRouteLocked =
            wantsWord ||
            wantsPdf ||
            wantsExcel ||
            wantsPptx ||
            wantsChart ||
            wantsDiagram ||
            isComposerImageGenRequest(routingText)
          const routeOverrides = resolveInstantRouteOverrides(instantAnalyze, routingText, {
            composerRouteLocked,
            priorTurns: priorTurnsForContext,
            hasDocumentFileAttachment,
          })
          if (routeOverrides.imageGenEmpty) {
            setMessagesByThreadId((prev) => ({
              ...prev,
              [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
            }))
            setError(
              'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
            )
            return
          }
          if (routeOverrides.wantsWord) {
            wantsWord = true
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsPdf) {
            wantsPdf = true
            wantsWord = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsExcel) {
            wantsExcel = true
            wantsWord = false
            wantsPdf = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsPptx) {
            wantsPptx = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsChart) {
            wantsChart = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsDiagram = false
          } else if (routeOverrides.wantsDiagram) {
            wantsDiagram = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
          }
          if (routeOverrides.imageSearchQuery) {
            imageSearchQuery = routeOverrides.imageSearchQuery
            imageGenPrompt = null
          } else if (routeOverrides.imageGenPrompt) {
            imageGenPrompt = routeOverrides.imageGenPrompt
            imageSearchQuery = null
          }
          if (
            routeOverrides.loadReferencedImageVision &&
            !hasAttachedVision &&
            !visionInlineDataUrl &&
            userId
          ) {
            const refPath = resolveReferencedImageStoragePath(priorForVision)
            if (refPath) {
              const loaded = await loadChatMediaPathAsVisionDataUrl(refPath)
              if (loaded) {
                visionInlineDataUrl = loaded
              }
            }
          }
          if (
            !imageGenPrompt &&
            !imageSearchQuery &&
            !wantsWord &&
            !wantsPdf &&
            !wantsExcel &&
            !wantsPptx &&
            !wantsChart &&
            !wantsDiagram
          ) {
            const genFallback = resolveHeuristicImageGenFallback(routingText)
            if (genFallback.imageGenEmpty) {
              setMessagesByThreadId((prev) => ({
                ...prev,
                [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
              }))
              setError(
                'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
              )
              return
            }
            if (genFallback.imageGenPrompt) {
              imageGenPrompt = genFallback.imageGenPrompt
            }
          }
          if (wantsWord) {
            userMetadataBase.userWordCommand = true
            delete userMetadataBase.userPdfCommand
            delete userMetadataBase.userExcelCommand
            delete userMetadataBase.userPptxCommand
            if (!trimmed) {
              userContent = 'Word-Dokument vorbereiten'
            }
          } else if (wantsPdf) {
            userMetadataBase.userPdfCommand = true
            delete userMetadataBase.userWordCommand
            delete userMetadataBase.userExcelCommand
            delete userMetadataBase.userPptxCommand
            if (!trimmed) {
              userContent = 'PDF-Dokument vorbereiten'
            }
          } else if (wantsExcel) {
            userMetadataBase.userExcelCommand = true
            delete userMetadataBase.userWordCommand
            delete userMetadataBase.userPdfCommand
            delete userMetadataBase.userPptxCommand
            delete userMetadataBase.userChartCommand
          } else if (wantsPptx && !wantsPptxEdit) {
            userMetadataBase.userPptxCommand = true
            delete userMetadataBase.userWordCommand
            delete userMetadataBase.userPdfCommand
            delete userMetadataBase.userExcelCommand
            delete userMetadataBase.userChartCommand
            if (!trimmed) {
              userContent = 'PowerPoint-Präsentation vorbereiten'
            }
          } else if (wantsChart) {
            userMetadataBase.userChartCommand = true
            delete userMetadataBase.userWordCommand
            delete userMetadataBase.userPdfCommand
            delete userMetadataBase.userExcelCommand
            delete userMetadataBase.userPptxCommand
            delete userMetadataBase.userDiagramCommand
            if (!trimmed) {
              userContent = 'Diagramm erstellen'
            }
          } else if (wantsDiagram) {
            userMetadataBase.userDiagramCommand = true
            delete userMetadataBase.userWordCommand
            delete userMetadataBase.userPdfCommand
            delete userMetadataBase.userExcelCommand
            delete userMetadataBase.userPptxCommand
            delete userMetadataBase.userChartCommand
            if (!trimmed) {
              userContent = 'Struktur-Diagramm erstellen'
            }
          }

          const shouldAutoWeb =
            instantAnalyze.category === 'chat' &&
            instantAnalyze.needs_live_web &&
            instantAnalyze.reply_mode !== 'ask_only' &&
            instantAnalyze.action !== 'clarify' &&
            instantAnalyze.web_query.trim().length > 0
          wantedAutoWebSearch = shouldAutoWeb

          if (shouldAutoWeb) {
            if (!options?.isSuperadmin && (options?.webSearchCreditBalance ?? 0) < 1) {
              setError(
                'Für aktuelle Web-Infos ist dein Websuche-Guthaben aufgebraucht. Die Antwort erfolgt ohne Live-Suche.',
              )
            } else {
              setSendPhase('web_search')
              try {
                const ws = await fetchTavilySearchContext(instantAnalyze.web_query.trim(), signal)
                webSearchContext = ws.contextText
                usedAutoWebSearch = true
                void options?.onWebSearchCreditsConsumed?.()?.catch(() => {})
              } catch (wsErr) {
                if (isAbortErrorLike(wsErr)) {
                  throw wsErr
                }
                const message =
                  wsErr instanceof Error ? wsErr.message : 'Websuche ist fehlgeschlagen.'
                setError(message)
              }
            }
          }

          if (persistInstantAnalyzeDebug && instantAnalyze) {
            presentationProfileForDebug = resolveInstantPresentationProfileForMainChatTurn({
              analyze: instantAnalyze,
              userMessage: routingText,
              priorTurns: priorTurnsForContext,
              visionInlineDataUrl,
              webSearchContext,
            })
            instantAnalyzeDebug = buildInstantAnalyzeDebugMeta({
              invoke: invokeResult,
              autoWebPlanned: wantedAutoWebSearch,
              autoWebRan: usedAutoWebSearch,
              presentationProfile: presentationProfileToDebugMeta(presentationProfileForDebug),
            })
            setLiveInstantAnalyzeDebug(instantAnalyzeDebug)
          }
        }
      } catch (analyzeErr) {
        setMessagesByThreadId((prev) => ({
          ...prev,
          [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
        }))
        throw analyzeErr
      }

      const optimisticContentSnapshot =
        nextMessages.find((message) => message.id === optimisticUserId)?.content ?? ''
      if (Object.keys(userMetadataBase).length > 0 || userContent !== optimisticContentSnapshot) {
        setMessagesByThreadId((prev) => {
          const list = prev[targetThreadId] ?? []
          const idx = list.findIndex((m) => m.id === optimisticUserId)
          if (idx === -1) {
            return prev
          }
          const next = [...list]
          next[idx] = {
            ...next[idx],
            content: userContent,
            metadata:
              Object.keys(userMetadataBase).length > 0 ? { ...userMetadataBase } : next[idx].metadata,
          }
          nextMessages = next
          return { ...prev, [targetThreadId]: next }
        })
      }

      const wantsThinkingMediaAnalyze =
        effectiveThinkingMode === 'thinking' &&
        usesGatewayAi() &&
        !wantsWord &&
        !wantsPdf &&
        !wantsExcel &&
        !wantsPptx &&
        !wantsChart &&
        !wantsDiagram &&
        !imageGenPrompt &&
        !imageSearchQuery &&
        Boolean(routingText)

      if (wantsThinkingMediaAnalyze) {
        setSendPhase('analyzing')
        try {
          const invokeResult = await instantAnalyzeUserMessage({
            userMessage: routingText,
            priorTurns,
            hasVisionAttachment: hasAttachedVision,
            hasDocumentFileAttachment,
            folderContext,
            signal,
          })
          const routeOverrides = resolveThinkingMediaRouteFromInstantAnalyze(
            invokeResult.analyze,
            routingText,
            { priorTurns: priorTurnsForContext, hasDocumentFileAttachment },
          )
          if (routeOverrides.imageGenEmpty) {
            setMessagesByThreadId((prev) => ({
              ...prev,
              [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
            }))
            setError(
              'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
            )
            return
          }
          if (routeOverrides.wantsWord) {
            wantsWord = true
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsPdf) {
            wantsPdf = true
            wantsWord = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsExcel) {
            wantsExcel = true
            wantsWord = false
            wantsPdf = false
            wantsPptx = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsPptx) {
            wantsPptx = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsChart = false
            wantsDiagram = false
          } else if (routeOverrides.wantsChart) {
            wantsChart = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsDiagram = false
          } else if (routeOverrides.wantsDiagram) {
            wantsDiagram = true
            wantsWord = false
            wantsPdf = false
            wantsExcel = false
            wantsPptx = false
            wantsChart = false
          }
          if (routeOverrides.imageSearchQuery) {
            imageSearchQuery = routeOverrides.imageSearchQuery
            imageGenPrompt = null
          } else if (routeOverrides.imageGenPrompt) {
            imageGenPrompt = routeOverrides.imageGenPrompt
            imageSearchQuery = null
          }
          if (
            routeOverrides.loadReferencedImageVision &&
            !hasAttachedVision &&
            !visionInlineDataUrl &&
            userId
          ) {
            const refPath = resolveReferencedImageStoragePath(priorForVision)
            if (refPath) {
              const loaded = await loadChatMediaPathAsVisionDataUrl(refPath)
              if (loaded) {
                visionInlineDataUrl = loaded
              }
            }
          }
          if (
            !imageGenPrompt &&
            !imageSearchQuery &&
            !wantsWord &&
            !wantsPdf &&
            !wantsExcel &&
            !wantsPptx &&
            !wantsChart &&
            !wantsDiagram
          ) {
            const genFallback = resolveHeuristicImageGenFallback(routingText)
            if (genFallback.imageGenEmpty) {
              setMessagesByThreadId((prev) => ({
                ...prev,
                [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
              }))
              setError(
                'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
              )
              return
            }
            if (genFallback.imageGenPrompt) {
              imageGenPrompt = genFallback.imageGenPrompt
            }
          }
          wantsThinkingTurn =
            usesGatewayAi() &&
            effectiveThinkingMode === 'thinking' &&
            !wantsExcel &&
            !wantsChart &&
            !wantsDiagram &&
            !wantsWord &&
            !wantsPdf &&
            !wantsPptx &&
            !imageGenPrompt &&
            !imageSearchQuery
        } catch (thinkingRouteErr) {
          setMessagesByThreadId((prev) => ({
            ...prev,
            [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
          }))
          throw thinkingRouteErr
        }
      }

      if (
        !visionInlineDataUrl &&
        !imageGenPrompt &&
        !imageSearchQuery &&
        usesGatewayAi() &&
        userId &&
        shouldResolveReferencedImageVision(routingText, priorForVision)
      ) {
        const refPath = resolveReferencedImageStoragePath(priorForVision)
        if (refPath) {
          const loaded = await loadChatMediaPathAsVisionDataUrl(refPath)
          if (loaded) {
            visionInlineDataUrl = loaded
          }
        }
      }

      if ((wantsWord || wantsPdf) && !usesGatewayAi()) {
        setMessagesByThreadId((prev) => ({
          ...prev,
          [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
        }))
        setError(`${wantsPdf ? 'PDF' : 'Word'}-Export ist im Demo-Modus nicht verfügbar.`)
        return
      }

      const userMetadataFinal = {
        ...userMetadataBase,
        ...(usedAutoWebSearch ? { autoWebSearch: true as const } : {}),
        ...(instantAnalyzeDebug ? { instantAnalyzeDebug } : {}),
      }

      let storedUserMessage: ChatMessage
      try {
        storedUserMessage = await createChatMessage(
          targetThreadId,
          'user',
          userContent,
          Object.keys(userMetadataFinal).length > 0 ? userMetadataFinal : undefined,
        )
      } catch (persistErr) {
        setMessagesByThreadId((prev) => ({
          ...prev,
          [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId),
        }))
        throw persistErr
      }

      setMessagesByThreadId((prev) => {
        const list = (prev[targetThreadId] ?? []).filter((m) => m.id !== optimisticUserId)
        nextMessages = upsertChatMessage(list, storedUserMessage)
        return { ...prev, [targetThreadId]: nextMessages }
      })

      const shouldRename =
        (aclThread?.title === 'Neuer Chat' || isTemporaryThread) && userOwnsThread
      const provisionalTitle = shouldRename
        ? createChatTitle(trimmed || (wantsWord ? 'Word' : wantsPdf ? 'PDF' : wantsPptx ? 'PowerPoint' : ''))
        : aclThread?.title

      if (provisionalTitle && shouldRename && userOwnsThread) {
        await updateChatThreadTitle(targetThreadId, provisionalTitle)
      }

      if (userOwnsThread) {
        await touchChatThread(targetThreadId)
      }

      setThreads((prev) => {
        const updated = prev.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                title: userOwnsThread ? (provisionalTitle ?? thread.title) : thread.title,
                updatedAt: new Date().toISOString(),
              }
            : thread,
        )
        return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })

      if (imageSearchQuery) {
        if (!usesGatewayAi()) {
          setError('Fotosuche ist im Demo-Modus nicht verfügbar.')
          return
        }
        setSendPhase('image_search')
        try {
          const searchResult = await fetchUnsplashSearchResults(imageSearchQuery)
          const { content: assistantContent, metadata: unsplashMeta } =
            buildUnsplashSearchAssistantPayload(searchResult)
          const storedAssistantMessage = await createChatMessage(
            targetThreadId,
            'assistant',
            assistantContent,
            unsplashMeta,
          )
          setMessagesByThreadId((prev) =>
            upsertThreadMessages(prev, targetThreadId, storedAssistantMessage),
          )
          if (userOwnsThread) {
            await touchChatThread(targetThreadId)
          }
          setThreads((prev) => {
            const updated = prev.map((thread) =>
              thread.id === targetThreadId
                ? { ...thread, updatedAt: new Date().toISOString() }
                : thread,
            )
            return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          })
          if (shouldRename && userOwnsThread) {
            void (async () => {
              try {
                const { title } = await generateChatTitleWithAi([
                  ...nextMessages,
                  {
                    id: storedAssistantMessage.id,
                    role: 'assistant',
                    content: storedAssistantMessage.content,
                    createdAt: storedAssistantMessage.createdAt,
                  },
                ])
                if (!title || title === provisionalTitle) {
                  return
                }
                await updateChatThreadTitle(targetThreadId, title)
                setThreads((prev) => {
                  const updated = prev.map((thread) =>
                    thread.id === targetThreadId ? { ...thread, title } : thread,
                  )
                  return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                })
              } catch {
                /* Titel optional */
              }
            })()
          }
          void options?.onProfileMemoryUpdated?.()?.catch(() => {})
        } catch (err) {
          if (isAbortErrorLike(err)) {
            throw err
          }
          setError(err instanceof Error ? err.message : 'Fotosuche ist fehlgeschlagen.')
        }
        return
      }

      if (imageGenPrompt) {
        if (!usesGatewayAi()) {
          setError('Bildgenerierung ist im Demo-Modus nicht verfügbar.')
          return
        }
        setSendPhase('image')
        try {
          const imageContextTurns = nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
          let sourceImageDataUrl = resolveVisionInlineDataUrlForSend(
            sendOpts?.visionInlineDataUrl,
            content,
            userContent,
          )
          if (!sourceImageDataUrl && userContent.includes('@chat-media:') && userId) {
            const pathMatch = userContent.match(/@chat-media:([^\s)\]]+)/)
            if (pathMatch?.[1]) {
              sourceImageDataUrl =
                (await loadChatMediaPathAsVisionDataUrl(pathMatch[1])) ?? undefined
            }
          }
          const useAttachedEdit = shouldUseAttachedImageEdit(
            imageGenPrompt,
            Boolean(sourceImageDataUrl),
          )
          const { assistantMarkdown } = await generateChatImageFromPrompt(imageGenPrompt, imageContextTurns, {
            ...(useAttachedEdit && sourceImageDataUrl
              ? { sourceImageDataUrl }
              : {}),
          })
          let assistantContent = assistantMarkdown
          let generatedImageMetadata: ChatMessage['metadata'] | undefined
          if (userId) {
            const persisted = await persistGeneratedImageInAssistantMessage(
              userId,
              targetThreadId,
              assistantMarkdown,
            )
            assistantContent = persisted.content
            generatedImageMetadata = persisted.metadata
          }
          const storedAssistantMessage = await createChatMessage(
            targetThreadId,
            'assistant',
            assistantContent,
            generatedImageMetadata,
          )
          setMessagesByThreadId((prev) =>
            upsertThreadMessages(prev, targetThreadId, storedAssistantMessage),
          )
          if (userOwnsThread) {
            await touchChatThread(targetThreadId)
          }
          setThreads((prev) => {
            const updated = prev.map((thread) =>
              thread.id === targetThreadId
                ? { ...thread, updatedAt: new Date().toISOString() }
                : thread,
            )
            return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          })
          if (shouldRename && userOwnsThread) {
            void (async () => {
              try {
                const { title } = await generateChatTitleWithAi([
                  ...nextMessages,
                  {
                    id: storedAssistantMessage.id,
                    role: 'assistant',
                    content: storedAssistantMessage.content,
                    createdAt: storedAssistantMessage.createdAt,
                  },
                ])
                if (!title || title === provisionalTitle) {
                  return
                }
                await updateChatThreadTitle(targetThreadId, title)
                setThreads((prev) => {
                  const updated = prev.map((thread) =>
                    thread.id === targetThreadId ? { ...thread, title } : thread,
                  )
                  return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                })
              } catch {
                /* Titel optional */
              }
            })()
          }
          void options?.onProfileMemoryUpdated?.()?.catch(() => {
            /* Profil-Refresh nicht auf Sende-Pfad blockieren */
          })
        } catch (err) {
          if (isAbortErrorLike(err)) {
            throw err
          }
          const message =
            err instanceof Error ? err.message : 'Bildgenerierung ist fehlgeschlagen.'
          setError(message)
        }
        return
      }

      let streamAssistantId: string | null = null
      let finalAssistantContent: string

      let thinkingIntake: ThinkingIntakeSession | null = null
      let thinkingAnalyzeResult: ThinkingAnalyzeResult | undefined
      let thinkingAnalyzeDebug: ThinkingAnalyzeDebugMeta | undefined
      let thinkingConversationPhase: 'clarify' | 'final' | undefined
      let thinkingClarifyFocus:
        | {
            dimensionLabel: string
            questionHint: string
            round: number
            roundsTotal: number
          }
        | undefined
      let thinkingDraft: string | undefined
      let thinkingReview: ThinkingReviewResult | undefined
      let outboundSendPhase: ChatSendPhaseState = wantsThinkingTurn ? 'thinking_analyze' : 'generating'

      if (
        wantsThinkingTurn &&
        routingText &&
        !visionInlineDataUrl &&
        !hasAttachedVision &&
        userId &&
        usesGatewayAi()
      ) {
        try {
          const routeInvoke = await instantAnalyzeUserMessage({
            userMessage: routingText,
            priorTurns: nextMessages
              .slice(0, -1)
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                ...(m.metadata?.unsplashSearch?.query
                  ? { unsplashQuery: m.metadata.unsplashSearch.query }
                  : {}),
              })),
            folderContext,
            signal,
          })
          const routeOverrides = resolveInstantRouteOverrides(routeInvoke.analyze, routingText, {
            composerRouteLocked: false,
            priorTurns: priorTurnsForContext,
            hasDocumentFileAttachment,
          })
          if (routeOverrides.loadReferencedImageVision) {
            const refPath = resolveReferencedImageStoragePath(priorForVision)
            if (refPath) {
              const loaded = await loadChatMediaPathAsVisionDataUrl(refPath)
              if (loaded) {
                visionInlineDataUrl = loaded
              }
            }
          }
        } catch {
          /* Thinking: Intent optional — Keyword-Fallback oben */
        }
      }

      if (
        wantsThinkingTurn &&
        !wantsWord &&
        !wantsPdf &&
        !wantsExcel &&
        !wantsPptx &&
        !wantsChart &&
        !wantsDiagram &&
        trimmed
      ) {
        const clarifyFollowUp = isThinkingClarifyFollowUp(nextMessages)
        let session = thinkingIntakeByThreadRef.current[targetThreadId] ?? null

        if (clarifyFollowUp) {
          const dim = extractDimensionFromLastClarify(nextMessages)
          const userAnswer = trimmed
          if (!session && userAnswer) {
            outboundSendPhase = 'thinking_analyze'
            setSendPhase(outboundSendPhase)
            const priorTurns = nextMessages
              .slice(0, -1)
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              }))
            const thinkInvoke = await thinkingAnalyzeUserMessage({
              userMessage: userAnswer,
              priorTurns,
              isContinuationFollowUp: false,
              hasVisionAttachment: hasAttachedVision,
              hasDocumentFileAttachment,
              folderContext,
              signal,
            })
            if (persistInstantAnalyzeDebug) {
              presentationProfileForDebug = resolveThinkingPresentationProfileForTurn({
                analyze: thinkInvoke.analyze,
                userMessage: userAnswer,
                phase: 'clarify',
              })
              thinkingAnalyzeDebug = buildThinkingAnalyzeDebugMeta({
                invoke: thinkInvoke,
                presentationProfile: presentationProfileToDebugMeta(presentationProfileForDebug),
              })
              setLiveThinkingAnalyzeDebug(thinkingAnalyzeDebug)
            }
            session = createThinkingIntakeSession(thinkInvoke.analyze)
          }
          if (session && userAnswer) {
            session = recordThinkingIntakeAnswer(
              session,
              dim
                ? {
                    dimensionId: dim.dimensionId,
                    label: dim.label,
                    answer: userAnswer,
                  }
                : {
                    dimensionId: `round_${session.clarifyRoundsCompleted}`,
                    label: 'Antwort',
                    answer: userAnswer,
                  },
            )
            thinkingIntakeByThreadRef.current[targetThreadId] = session
          }
          thinkingAnalyzeResult = session?.analyze
          thinkingIntake = session
        } else {
          delete thinkingIntakeByThreadRef.current[targetThreadId]
          outboundSendPhase = 'thinking_analyze'
          setSendPhase(outboundSendPhase)
          const priorTurns = nextMessages
            .slice(0, -1)
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          const thinkingPipelineUserMessage = storedUserMessage.content
          const thinkInvoke = await thinkingAnalyzeUserMessage({
            userMessage: thinkingPipelineUserMessage,
            priorTurns,
            isContinuationFollowUp: isThinkingContinuationFollowUp(trimmed, nextMessages),
            hasVisionAttachment: hasAttachedVision,
            hasDocumentFileAttachment,
            folderContext,
            signal,
          })
          if (persistInstantAnalyzeDebug) {
            presentationProfileForDebug = resolveThinkingPresentationProfileForTurn({
              analyze: thinkInvoke.analyze,
              userMessage: trimmed,
              phase: thinkInvoke.analyze.needs_clarification ? 'clarify' : 'final',
            })
            thinkingAnalyzeDebug = buildThinkingAnalyzeDebugMeta({
              invoke: thinkInvoke,
              presentationProfile: presentationProfileToDebugMeta(presentationProfileForDebug),
            })
            setLiveInstantAnalyzeDebug(null)
            setLiveThinkingAnalyzeDebug(thinkingAnalyzeDebug)
          }
          session = createThinkingIntakeSession(thinkInvoke.analyze)
          thinkingIntakeByThreadRef.current[targetThreadId] = session
          thinkingAnalyzeResult = thinkInvoke.analyze
          thinkingIntake = session
        }

        if (thinkingAnalyzeDebug && storedUserMessage) {
          setMessagesByThreadId((prev) => ({
            ...prev,
            [targetThreadId]: (prev[targetThreadId] ?? []).map((m) =>
              m.id === storedUserMessage.id
                ? { ...m, metadata: { ...m.metadata, thinkingAnalyzeDebug } }
                : m,
            ),
          }))
        }

        thinkingConversationPhase = resolveThinkingConversationPhase(nextMessages, thinkingIntake)
        const focusDim = thinkingIntake ? getNextThinkingFocusDimension(thinkingIntake) : null
        const progress = thinkingIntake ? getThinkingClarifyProgress(thinkingIntake) : null
        if (thinkingConversationPhase === 'clarify' && focusDim && progress && progress.roundsTotal > 0) {
          outboundSendPhase = 'thinking_clarify'
          setSendPhase(outboundSendPhase)
          thinkingClarifyFocus = {
            dimensionLabel: focusDim.label,
            questionHint: focusDim.question_hint,
            round: progress.round,
            roundsTotal: progress.roundsTotal,
          }
        } else if (thinkingConversationPhase === 'final' && thinkingAnalyzeResult) {
          try {
            await injectFolderSourcesIfNeeded(thinkingAnalyzeResult)
          } catch {
            return
          }
          if (persistInstantAnalyzeDebug) {
            presentationProfileForDebug = resolveThinkingPresentationProfileForTurn({
              analyze: thinkingAnalyzeResult,
              userMessage: trimmed,
              phase: 'final',
            })
            const profileMeta = presentationProfileToDebugMeta(presentationProfileForDebug)
            thinkingAnalyzeDebug = thinkingAnalyzeDebug
              ? { ...thinkingAnalyzeDebug, presentation_profile: profileMeta }
              : thinkingAnalyzeDebug
            if (thinkingAnalyzeDebug) {
              setLiveThinkingAnalyzeDebug(thinkingAnalyzeDebug)
            }
          }
          const shouldAutoWebThinking =
            thinkingAnalyzeResult.needs_live_web &&
            thinkingAnalyzeResult.web_query.trim().length > 0
          wantedAutoWebSearch = shouldAutoWebThinking

          if (shouldAutoWebThinking) {
            if (!options?.isSuperadmin && (options?.webSearchCreditBalance ?? 0) < 1) {
              setError(
                'Für aktuelle Web-Infos ist dein Websuche-Guthaben aufgebraucht. Die Antwort erfolgt ohne Live-Suche.',
              )
            } else {
              setSendPhase('web_search')
              try {
                const ws = await fetchTavilySearchContext(
                  thinkingAnalyzeResult.web_query.trim(),
                  signal,
                )
                webSearchContext = ws.contextText
                usedAutoWebSearch = true
                void options?.onWebSearchCreditsConsumed?.()?.catch(() => {})
              } catch (wsErr) {
                if (isAbortErrorLike(wsErr)) {
                  throw wsErr
                }
                const message =
                  wsErr instanceof Error ? wsErr.message : 'Websuche ist fehlgeschlagen.'
                setError(message)
              }
            }
          }

          const pipelinePriorTurns = nextMessages
            .slice(0, -1)
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          const intakeSummary = thinkingIntake ? buildThinkingIntakeSummary(thinkingIntake) : ''
          setSendPhase('thinking_draft')
          const thinkingPipelineUserMessage = storedUserMessage.content
          const { draft } = await thinkingDraftForTurn({
            userMessage: thinkingPipelineUserMessage,
            analyze: thinkingAnalyzeResult,
            intakeSummary,
            priorTurns: pipelinePriorTurns,
            webSearchContext,
            signal,
          })
          setSendPhase('thinking_review')
          const { review } = await thinkingReviewDraft({
            userMessage: thinkingPipelineUserMessage,
            analyze: thinkingAnalyzeResult,
            draft,
            intakeSummary,
            webSearchContext,
            signal,
          })
          if (review.needs_live_web && review.web_query.trim().length > 0 && !usedAutoWebSearch) {
            if (!options?.isSuperadmin && (options?.webSearchCreditBalance ?? 0) < 1) {
              setError(
                'Für aktuelle Web-Infos ist dein Websuche-Guthaben aufgebraucht. Die Antwort erfolgt ohne Live-Suche.',
              )
            } else {
              wantedAutoWebSearch = true
              setSendPhase('web_search')
              try {
                const ws = await fetchTavilySearchContext(review.web_query.trim(), signal)
                webSearchContext = ws.contextText
                usedAutoWebSearch = true
                void options?.onWebSearchCreditsConsumed?.()?.catch(() => {})
              } catch (wsErr) {
                if (isAbortErrorLike(wsErr)) {
                  throw wsErr
                }
                const message = wsErr instanceof Error ? wsErr.message : 'Websuche ist fehlgeschlagen.'
                setError(message)
              }
            }
          }
          thinkingDraft = draft
          thinkingReview = review
          thinkingConversationPhase = 'final'
          outboundSendPhase = 'generating'
          setSendPhase(outboundSendPhase)
        }
      }

      if (usesGatewayAi()) {
        setSendPhase(outboundSendPhase)
        const streamingMessageId = crypto.randomUUID()
        streamAssistantId = streamingMessageId
        const streamCreatedAt = new Date().toISOString()
        const streamingPlaceholder: ChatMessage = {
          id: streamingMessageId,
          role: 'assistant',
          content: '',
          createdAt: streamCreatedAt,
          metadata: {
            liveStream: true,
            thinkingStreamKind: thinkingConversationPhase === 'clarify' ? 'clarify' : 'final',
          },
        }
        setMessagesByThreadId((prev) =>
          upsertThreadMessages(prev, targetThreadId, streamingPlaceholder),
        )
        sendCancelCleanupRef.current = { threadId: targetThreadId, streamAssistantId: streamingMessageId }

        try {
          finalAssistantContent = await sendMessageStreaming(
            applyVisionInlineToChatMessagesForGateway(
              nextMessages,
              storedUserMessage.id,
              visionInlineDataUrl,
            ),
            {
            interactiveQuizPrompt: getPrompt('interactive_quiz'),
            userRequestedExcel: wantsExcel,
            userRequestedWord: wantsWord,
            userRequestedPdf: wantsPdf,
            userRequestedChart: wantsChart,
            userRequestedDiagram: wantsDiagram,
            userRequestedPptx: wantsPptx,
            userRequestedPptxEdit: wantsPptxEdit,
            pptxEditCurrentDeckContext: sendOpts?.pptxEditCurrentDeckContext,
            pptxSelectedPreset: sendOpts?.pptxSelectedPreset,
            pptxEditTextOnly: Boolean(sendOpts?.pptxEditCurrentSlides?.[0]?.preset),
            mainChatModelId: effectiveComposerModelId,
            chatReplyMode,
            chatThinkingMode: effectiveThinkingMode,
            mainChatUsedTokensToday: options?.mainChatUsedTokensToday,
            mainChatDailyTierConfig: options?.mainChatDailyTierConfig,
            mainChatThinkingTierConfig: options?.mainChatThinkingTierConfig,
            mainChatContextMaxTokens:
              options?.mainChatContextMaxTokens === undefined
                ? DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
                : options.mainChatContextMaxTokens,
            webSearchContext,
            instantAnalyze,
            webSearchRequestedButMissing: wantedAutoWebSearch && !webSearchContext?.trim(),
            thinkingAnalyze: thinkingAnalyzeResult,
            thinkingIntake,
            thinkingConversationPhase,
            thinkingClarifyFocus,
            thinkingDraft,
            thinkingReview,
            visionInlineDataUrl,
            mainChatThreadId: targetThreadId,
            profileIdentity: options?.profileIdentity ?? null,
            userIntroduction: options?.userIntroduction ?? null,
            subscriptionUsage: options?.subscriptionUsage ?? null,
            signal,
            onDelta: (full) => {
              setMessagesByThreadId((prev) => ({
                ...prev,
                [targetThreadId]: (prev[targetThreadId] ?? []).map((m) =>
                  m.id === streamingMessageId ? { ...m, content: full } : m,
                ),
              }))
            },
          })
        } catch (streamErr) {
          setMessagesByThreadId((prev) => ({
            ...prev,
            [targetThreadId]: (prev[targetThreadId] ?? []).filter((m) => m.id !== streamingMessageId),
          }))
          if (
            !isAbortErrorLike(streamErr) &&
            wantsThinkingTurn &&
            streamErr instanceof Error &&
            streamErr.message.includes('Thinking-Guthaben')
          ) {
            markThinkingCreditsDepletedLocally()
          }
          throw streamErr
        }
        if (!signal.aborted && wantsThinkingTurn && options?.isSuperadmin !== true) {
          markThinkingCreditConsumedLocally()
        }
      } else {
        setSendPhase(outboundSendPhase)
        const { assistantMessage } = await sendMessage(
          applyVisionInlineToChatMessagesForGateway(
            nextMessages,
            storedUserMessage.id,
            visionInlineDataUrl,
          ),
          {
          interactiveQuizPrompt: getPrompt('interactive_quiz'),
          userRequestedExcel: wantsExcel,
          userRequestedWord: wantsWord,
          userRequestedPdf: wantsPdf,
          userRequestedChart: wantsChart,
          userRequestedDiagram: wantsDiagram,
          userRequestedPptx: wantsPptx,
          userRequestedPptxEdit: wantsPptxEdit,
          pptxEditCurrentDeckContext: sendOpts?.pptxEditCurrentDeckContext,
          pptxSelectedPreset: sendOpts?.pptxSelectedPreset,
          pptxEditTextOnly: Boolean(sendOpts?.pptxEditCurrentSlides?.[0]?.preset),
          mainChatModelId: effectiveComposerModelId,
          chatReplyMode,
          chatThinkingMode: effectiveThinkingMode,
          mainChatUsedTokensToday: options?.mainChatUsedTokensToday,
          mainChatDailyTierConfig: options?.mainChatDailyTierConfig,
          mainChatThinkingTierConfig: options?.mainChatThinkingTierConfig,
          mainChatContextMaxTokens:
            options?.mainChatContextMaxTokens === undefined
              ? DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
              : options.mainChatContextMaxTokens,
          webSearchContext,
          instantAnalyze,
          webSearchRequestedButMissing: wantedAutoWebSearch && !webSearchContext?.trim(),
          thinkingAnalyze: thinkingAnalyzeResult,
          thinkingIntake,
          thinkingConversationPhase,
          thinkingClarifyFocus,
          thinkingDraft,
          thinkingReview,
          visionInlineDataUrl,
          mainChatThreadId: targetThreadId,
          profileIdentity: options?.profileIdentity ?? null,
          userIntroduction: options?.userIntroduction ?? null,
          subscriptionUsage: options?.subscriptionUsage ?? null,
          signal,
        })
        finalAssistantContent = assistantMessage.content
        if (!signal.aborted && wantsThinkingTurn && options?.isSuperadmin !== true) {
          markThinkingCreditConsumedLocally()
        }
      }
      const layoutMetricsForDebug =
        persistInstantAnalyzeDebug && presentationProfileForDebug
          ? layoutMetricsToDebugMeta(
              computeLayoutMetricsFromAssistantContent(finalAssistantContent),
              presentationProfileForDebug,
            )
          : undefined

      /**
       * Editier-Box: Antwort ist ein Patch (kein voller Foliensatz) — sofort gegen den Foliensatz
       * auflösen, der beim Senden aktuell war, und das Ergebnis persistieren. Downstream (Karte,
       * Modal, Export) liest dann `metadata.pptxSlides` statt den (rohen Patch-)Text zu parsen.
       */
      const pptxEditIsTextOnly = Boolean(sendOpts?.pptxEditCurrentSlides?.[0]?.preset)
      const pptxPatchResolvedSlides =
        wantsPptxEdit && hasPptxPatchMarkers(finalAssistantContent)
          ? pptxEditIsTextOnly
            ? applyPptxTextOnlyPatchToSlides(
                sendOpts?.pptxEditCurrentSlides ?? [],
                parsePptxTextPatchFromContent(finalAssistantContent) ?? [],
              )
            : applyPptxPatchToSlides(
                sendOpts?.pptxEditCurrentSlides ?? [],
                parsePptxPatchFromContent(finalAssistantContent) ?? [],
              )
          : null
      /** Sobald ein Thread-Turn ein 'chat'-Aktions-Modell gewählt hat, bleibt es für den Rest des Threads gleich (siehe `resolveStickyChatActionModel`) — stabilisiert OpenAI-Prompt-Caching, das sonst bei jedem Action-Wechsel (answer ⇄ short_answer/clarify/one_step) das Modell und damit den Cache-Scope wechselt. */
      const mainChatActionModelForTurn =
        instantAnalyze?.category === 'chat'
          ? resolveStickyChatActionModel(
              nextMessages,
              instantAnalyze.category,
              instantAnalyze.action,
              getChatIntentModelRoutingConfig(),
            )
          : undefined
      const assistantMetadataBase = {
        ...(usedAutoWebSearch ? { assistantAutoWebSearch: true as const } : {}),
        ...(mainChatActionModelForTurn ? { mainChatActionModel: mainChatActionModelForTurn } : {}),
        ...(layoutMetricsForDebug ? { presentationLayoutMetrics: layoutMetricsForDebug } : {}),
        ...(pptxPatchResolvedSlides && pptxPatchResolvedSlides.length > 0
          ? { pptxSlides: pptxPatchResolvedSlides }
          : {}),
        ...(wantsPptxEdit && sendOpts?.pptxEditAnchorMessageId
          ? { pptxEditAnchorMessageId: sendOpts.pptxEditAnchorMessageId }
          : {}),
      }
      const storedAssistantMessage = await createChatMessage(
        targetThreadId,
        'assistant',
        finalAssistantContent,
        Object.keys(assistantMetadataBase).length > 0 ? assistantMetadataBase : undefined,
      )
      if (wantsPptxEdit) {
        /** Fallback: Modell hat das Patch-Format ignoriert und einen vollen Foliensatz geliefert — trotzdem auflösbar. */
        const fallbackSlides =
          pptxPatchResolvedSlides && pptxPatchResolvedSlides.length > 0
            ? pptxPatchResolvedSlides
            : parsePptxSlidesFromAssistantContent(finalAssistantContent)
        /** Anker bleibt stabil — die Vorschau zeigt immer dieselbe (erste) Präsentations-Nachricht, nie die neue Editier-Nachricht selbst (siehe `resolvePptxPresentationState`). */
        const anchorMessageId = sendOpts?.pptxEditAnchorMessageId
        if (fallbackSlides.length > 0 && anchorMessageId) {
          pptxEditResultRef.current = { messageId: anchorMessageId, slides: fallbackSlides }
        } else if (fallbackSlides.length === 0) {
          /** Modell hat bewusst keinen Patch geliefert — der Wunsch liegt ausserhalb der festen Wertelisten (siehe `PPTX_EDIT_UNSUPPORTED_RULE`). Klartext-Antwort als Hinweis ans Modal zurückgeben statt stillschweigend nichts zu tun. */
          pptxEditResultRef.current = {
            unsupported: true,
            message: finalAssistantContent.trim() || 'Diese Änderung konnte nicht umgesetzt werden.',
          }
        }
      }

      const mergedAssistantMessage = storedAssistantMessage

      if (layoutMetricsForDebug && storedUserMessage) {
        const enrichedInstantDebug = storedUserMessage.metadata?.instantAnalyzeDebug
          ? {
              ...storedUserMessage.metadata.instantAnalyzeDebug,
              layout_metrics: layoutMetricsForDebug,
            }
          : undefined
        const enrichedThinkingDebug = storedUserMessage.metadata?.thinkingAnalyzeDebug
          ? {
              ...storedUserMessage.metadata.thinkingAnalyzeDebug,
              layout_metrics: layoutMetricsForDebug,
            }
          : undefined
        if (enrichedInstantDebug || enrichedThinkingDebug) {
          setMessagesByThreadId((prev) => ({
            ...prev,
            [targetThreadId]: (prev[targetThreadId] ?? []).map((m) =>
              m.id === storedUserMessage.id
                ? {
                    ...m,
                    metadata: {
                      ...m.metadata,
                      ...(enrichedInstantDebug ? { instantAnalyzeDebug: enrichedInstantDebug } : {}),
                      ...(enrichedThinkingDebug ? { thinkingAnalyzeDebug: enrichedThinkingDebug } : {}),
                    },
                  }
                : m,
            ),
          }))
          if (enrichedInstantDebug) {
            setLiveInstantAnalyzeDebug(enrichedInstantDebug)
          }
          if (enrichedThinkingDebug) {
            setLiveThinkingAnalyzeDebug(enrichedThinkingDebug)
          }
        }
      }
      if (
        usesGatewayAi() &&
        wantsExcel &&
        hasExcelSpecMarkers(finalAssistantContent) &&
        !parseExcelSpecFromContent(finalAssistantContent).spec
      ) {
        setError(
          'Die Excel-Vorgabe in der Antwort konnte nicht gelesen werden (Schema/JSON). Bitte erneut versuchen oder eine kürzere Tabelle anfragen.',
        )
      }
      if (usesGatewayAi() && wantsChart && !parseChartSpecFromContent(finalAssistantContent).spec) {
        setError(
          'Das Diagramm konnte nicht dargestellt werden — die KI hat kein gültiges Chart-JSON geliefert. Bitte erneut versuchen.',
        )
      }
      if (usesGatewayAi() && wantsDiagram && !parseDiagramSpecFromContent(finalAssistantContent).spec) {
        setError(
          'Das Struktur-Diagramm konnte nicht dargestellt werden — die KI hat keinen gültigen Mermaid-Block geliefert. Bitte erneut versuchen.',
        )
      }

      setMessagesByThreadId((prev) => {
        const list = prev[targetThreadId] ?? []
        if (streamAssistantId) {
          const replaced = list.map((m) =>
            m.id === streamAssistantId ? mergedAssistantMessage : m,
          )
          const mergedById = new Map<string, ChatMessage>()
          for (const m of replaced) {
            const prev = mergedById.get(m.id)
            mergedById.set(m.id, prev ? mergeDuplicateChatMessagePair(prev, m) : m)
          }
          const deduped = [...mergedById.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          return {
            ...prev,
            [targetThreadId]: deduped,
          }
        }
        return upsertThreadMessages(prev, targetThreadId, mergedAssistantMessage)
      })

      if (
        usesGatewayAi() &&
        effectiveThinkingMode === 'thinking' &&
        !wantsExcel &&
        !wantsChart &&
        !wantsDiagram &&
        !wantsWord &&
        !wantsPdf &&
        !wantsPptx
      ) {
        const rawAssistant = mergedAssistantMessage.content
        if (!hasExcelSpecMarkers(rawAssistant)) {
          const clarify = parseThinkingClarifyContent(rawAssistant)
          const expectedClarifyOnly = thinkingConversationPhase === 'clarify'
          const progress = thinkingIntake ? getThinkingClarifyProgress(thinkingIntake) : null
          const collectedSummary = thinkingIntake ? buildThinkingIntakeSummary(thinkingIntake) : ''

          if (clarify.kind === 'clarify') {
            setThinkingClarifyDialog({
              kind: 'structured',
              threadId: targetThreadId,
              messageId: mergedAssistantMessage.id,
              introMarkdown: clarify.introMarkdown,
              payload: clarify.payload,
              clarifyRound: clarify.payload.round ?? progress?.round,
              clarifyRoundsTotal: clarify.payload.rounds_total ?? progress?.roundsTotal,
              intakeSummary: collectedSummary || undefined,
              analysisSummary: thinkingIntake?.analyze.analysis_summary,
            })
          } else if (
            expectedClarifyOnly &&
            shouldOpenThinkingFallbackPopup(rawAssistant)
          ) {
            setThinkingClarifyDialog({
              kind: 'freeText',
              threadId: targetThreadId,
              messageId: mergedAssistantMessage.id,
              previewText:
                rawAssistant.trim() ||
                'Kurze Rückfrage: Was ist dir bei dieser Aufgabe am wichtigsten (Ziel, Tiefe oder Format)?',
              clarifyRound: progress?.round,
              clarifyRoundsTotal: progress?.roundsTotal,
            })
          } else if (thinkingConversationPhase === 'final') {
            delete thinkingIntakeByThreadRef.current[targetThreadId]
          }
        }
      }

      if (userOwnsThread) {
        await touchChatThread(targetThreadId)
      }

      setThreads((prev) => {
        const updated = prev.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                updatedAt: new Date().toISOString(),
              }
            : thread,
        )
        return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })

      if (shouldRename && userOwnsThread) {
        void (async () => {
          try {
            const { title } = await generateChatTitleWithAi([
              ...nextMessages,
              {
                id: mergedAssistantMessage.id,
                role: 'assistant',
                content: mergedAssistantMessage.content,
                createdAt: mergedAssistantMessage.createdAt,
              },
            ])

            if (!title || title === provisionalTitle) {
              return
            }

            await updateChatThreadTitle(targetThreadId, title)
            setThreads((prev) => {
              const updated = prev.map((thread) =>
                thread.id === targetThreadId
                  ? {
                      ...thread,
                      title,
                    }
                  : thread,
              )
              return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            })
          } catch {
            // Keep provisional title when title generation fails.
          }
        })()
      }

      const persistMemory = options?.persistAiChatMemory !== false
      const skipMemoryMergeForThinkingTurn = effectiveThinkingMode === 'thinking'
      const messagesInThreadAfterTurn = nextMessages.length + 1
      const shouldMergeMemoryByInterval =
        messagesInThreadAfterTurn > 0 &&
        messagesInThreadAfterTurn % MEMORY_MERGE_EVERY_N_MESSAGES === 0
      if (
        usesGatewayAi() &&
        userId &&
        persistMemory &&
        !skipMemoryMergeForThinkingTurn &&
        shouldMergeMemoryByInterval
      ) {
        void (async () => {
          try {
            await mergePersistedAiChatMemoryAfterTurn({
              userMessage: trimmed,
              assistantMessage: mergedAssistantMessage.content,
            })
            await options?.onProfileMemoryUpdated?.()
          } catch {
            /* optional */
          }
        })()
      }
    } catch (err) {
      if (isAbortErrorLike(err)) {
        return
      }
      if (
        wantsThinkingTurn &&
        err instanceof Error &&
        err.message.includes('Thinking-Guthaben')
      ) {
        markThinkingCreditsDepletedLocally()
      }
      setError(errorMessageFromUnknown(err))
    } finally {
      const aborted = sendAbortControllerRef.current?.signal.aborted ?? false
      sendAbortControllerRef.current = null
      sendCancelCleanupRef.current = null
      if (!aborted && wantsThinkingTurn && options?.isSuperadmin !== true) {
        await options?.onThinkingCreditsConsumed?.()?.catch(() => {})
      }
      setSendPhase(null)
      setLiveInstantAnalyzeDebug(null)
      setLiveThinkingAnalyzeDebug(null)
      setIsSending(false)
    }
  }

  /**
   * Editier-Box in der Folien-Vorschau — sichtbarer Chat-Bubble-Text ist nur `instruction`,
   * der aktuelle Foliensatz geht als versteckter Turn-Kontext mit (siehe `pptxEditCurrentDeckContext`
   * in `chat.service.ts`). Läuft über den ganz normalen `submitMessage`-Pfad, daher entsteht eine
   * echte, persistierte Chat-Nachricht mit eigenem Verlauf/eigener Versionierung.
   */
  async function submitPptxEditMessage(
    instruction: string,
    currentSlides: PptxSlide[],
    anchorMessageId: string,
  ): Promise<PptxEditResult | undefined> {
    const trimmedInstruction = instruction.trim()
    if (!trimmedInstruction || currentSlides.length === 0 || !anchorMessageId) {
      return undefined
    }
    pptxEditResultRef.current = null
    const content = `${trimmedInstruction}\n\n${PPTX_EDIT_COMMAND_MARKER}`
    await submitMessage(content, {
      pptxEditCurrentSlides: currentSlides,
      pptxEditCurrentDeckContext: buildPptxEditContextBlock(currentSlides),
      pptxEditAnchorMessageId: anchorMessageId,
    })
    return pptxEditResultRef.current ?? undefined
  }

  /**
   * "Design ändern" — nur für neue (Preset-basierte) Decks: wechselt NUR `preset`/`theme`, Inhalt/
   * Struktur bleiben unverändert, KEIN KI-Aufruf. Nutzt dieselbe Editier-Turn-Maschinerie wie
   * `submitPptxEditMessage` (Anker + `pptxSlides`-Metadata), damit `resolvePptxPresentationState`
   * den neuen Stand ohne weitere Code-Änderung als "aktuell" erkennt.
   */
  async function applyPptxPresetSwitch(
    anchorMessageId: string,
    currentSlides: PptxSlide[],
    preset: PptxPresetKey,
  ): Promise<PptxSlide[] | undefined> {
    if (!activeThreadId || !anchorMessageId || currentSlides.length === 0) {
      return undefined
    }
    const targetThreadId = activeThreadId
    const newSlides = currentSlides.map((slide) => ({
      ...slide,
      preset,
      theme: PPTX_PRESET_LEGACY_THEME_FALLBACK[preset],
    }))
    const assistantMessage = await createChatMessage(
      targetThreadId,
      'assistant',
      `Design auf «${PPTX_PRESET_DISPLAY[preset].label}» geändert.`,
      { pptxEditAnchorMessageId: anchorMessageId, pptxSlides: newSlides },
    )
    setMessagesByThreadId((prev) => upsertThreadMessages(prev, targetThreadId, assistantMessage))
    return newSlides
  }

  return {
    threads,
    activeThreadId,
    messages,
    isSending,
    sendPhase,
    liveInstantAnalyzeDebug:
      options?.isSuperadmin === true && options?.instantAnalyzeDebugEnabled === true
        ? liveInstantAnalyzeDebug
        : null,
    liveThinkingAnalyzeDebug:
      options?.isSuperadmin === true && options?.instantAnalyzeDebugEnabled === true
        ? liveThinkingAnalyzeDebug
        : null,
    isBootstrapping,
    error,
    submitMessage,
    submitPptxEditMessage,
    applyPptxPresetSwitch,
    cancelSend,
    finalizeWordDocumentExport,
    wordFinalizeBusy,
    finalizePdfDocumentExport,
    pdfFinalizeBusy,
    finalizeExcelDocumentExport,
    excelFinalizeBusy,
    finalizePptxDocumentExport,
    pptxFinalizeBusy,
    createNewChat,
    renameChat,
    deleteChat,
    archiveChat,
    leaveSharedChatAsMember,
    selectChat,
    canSend,
    composerModelId: effectiveComposerModelId,
    setComposerModelId: persistComposerModelId,
    isChatModelLocked,
    chatReplyMode,
    setChatReplyMode: persistChatReplyMode,
    chatThinkingMode,
    setChatThinkingMode: persistChatThinkingMode,
    thinkingClarifyDialog,
    dismissThinkingClarify: () => setThinkingClarifyDialog(null),
    thinkingCreditsRemaining,
    thinkingCreditsBlocked,
  }
}
