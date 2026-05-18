import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import {
  CHAT_THREADS_REFRESH_EVENT,
  type ChatThreadsRefreshDetail,
} from '../constants/events'
import {
  hasExcelSpecMarkers,
  normalizeExcelSpecForExport,
  parseExcelSpecFromContent,
} from '../excel/excelSpec'
import { stripExcelCommandMarker, userWantsExcelExport } from '../constants/excelExportPrompt'
import { stripWordCommandMarker, userWantsWordExport } from '../constants/wordExportPrompt'
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
import {
  generateChatImageFromPrompt,
  generateChatTitleWithAi,
  generateExcelFromSpec,
  generateExcelSpecWithSonnet,
  generateWordFromOutline,
  mergePersistedAiChatMemoryAfterTurn,
  sendMessage,
  sendMessageStreaming,
  usesGatewayAi,
} from '../services/chat.service'
import { fetchTavilySearchContext } from '../services/tavilySearch.service'
import type { ThinkingClarifyDialogState } from '../utils/thinkingClarify'
import {
  matchExplicitImageGenerationRequest,
  matchFollowUpImageEditRequest,
} from '../utils/imageGenerationIntent'
import { errorMessageFromUnknown } from '../../../utils/errorMessage'
import {
  parseThinkingClarifyContent,
  shouldOpenThinkingFallbackPopup,
  thinkingTurnExpectsClarifyOnly,
} from '../utils/thinkingClarify'
import {
  createChatMessage,
  createChatThread,
  deleteChatThread,
  leaveSharedChatThreadMembership,
  listChatThreads,
  listMessagesByThreadIds,
  mapMessage,
  touchChatThread,
  updateChatThreadTitle,
  type ChatMessageRow,
} from '../services/chat.persistence'
import { canFinalizeWordExportFromThread, extractWordOutlineFromThread } from '../utils/wordOutline'
import type { ChatMessage, ChatThread } from '../types'
const TEMP_THREAD_PREFIX = 'temp-thread-'
const THREAD_REMOVE_ANIMATION_MS = 180

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
  if (!excelFromExisting && !wordFromExisting) {
    return incoming
  }
  return {
    ...incoming,
    metadata: {
      ...(incoming.metadata ?? {}),
      ...(excelFromExisting ? { excelExport: excelFromExisting } : {}),
      ...(wordFromExisting ? { wordExport: wordFromExisting } : {}),
    },
  }
}

/** Zwei Zeilen gleicher `id` (Realtime-INSERT + Stream-Ersetzung) — erste Liste war willkürlich, Excel-Metadaten nicht verlieren. */
function mergeDuplicateChatMessagePair(a: ChatMessage, b: ChatMessage): ChatMessage {
  const aHasExcel = Boolean(a.metadata?.excelExport)
  const bHasExcel = Boolean(b.metadata?.excelExport)
  const aHasWord = Boolean(a.metadata?.wordExport)
  const bHasWord = Boolean(b.metadata?.wordExport)
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
  if (aHasExcel && bHasExcel) {
    return b.content.length >= a.content.length ? b : a
  }
  if (aHasWord && bHasWord) {
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
    /** Nach erfolgreicher Tavily-Suche Profil aktualisieren (Guthaben). */
    onWebSearchCreditsConsumed?: () => void | Promise<void>
    /** Thinking-Modus-Guthaben (Profil); ohne Superadmin bei 0 keine Thinking-Anfrage. */
    thinkingCreditBalance?: number
    /** Nach erfolgreicher Thinking-Buchung Profil aktualisieren. */
    onThinkingCreditsConsumed?: () => void | Promise<void>
  },
) {
  const { getPrompt } = useSystemPrompts()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messagesByThreadId, setMessagesByThreadId] = useState<Record<string, ChatMessage[]>>({})
  const [isSending, setIsSending] = useState(false)
  const [wordFinalizeBusy, setWordFinalizeBusy] = useState(false)
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
  /** Lokal gepflegt (Profil + optimistisch nach Thinking-Anfrage); Superadmin: null = unbegrenzt. */
  const [thinkingCreditsRemaining, setThinkingCreditsRemaining] = useState<number | null>(() =>
    options?.isSuperadmin === true ? null : (options?.thinkingCreditBalance ?? 0),
  )
  const removeTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (options?.isSuperadmin === true) {
      setThinkingCreditsRemaining(null)
      return
    }
    setThinkingCreditsRemaining(options?.thinkingCreditBalance ?? 0)
  }, [options?.isSuperadmin, options?.thinkingCreditBalance])

  function persistComposerModelId(id: ChatComposerModelId) {
    if (chatModelPolicy && !chatModelPolicy.allowModelChoice) {
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
    setChatThinkingMode(mode)
    try {
      localStorage.setItem(CHAT_THINKING_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!chatModelPolicy || chatModelPolicy.allowModelChoice) {
      return
    }
    setComposerModelId(chatModelPolicy.forcedModelId)
  }, [chatModelPolicy])

  const effectiveComposerModelId: ChatComposerModelId =
    chatModelPolicy && !chatModelPolicy.allowModelChoice
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
      } else {
        setMessagesByThreadId({})
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
        return null
      })
    },
    [],
  )

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
      setThreads([])
      setMessagesByThreadId({})
      setActiveThreadId(null)
      setIsBootstrapping(false)
      return
    }

    const currentUserId = userId
    let isMounted = true

    async function bootstrap() {
      setIsBootstrapping(true)
      setError(null)

      try {
        await refreshThreadsFromServer(currentUserId, false)
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

  async function createNewChat() {
    if (!userId) {
      return
    }

    setError(null)

    if (!autoRemoveEmptyChats) {
      try {
        const persistedThread = await createChatThread(userId, 'Neuer Chat')
        setThreads((prev) => [{ ...persistedThread, membershipRole: 'owner' as const }, ...prev])
        setMessagesByThreadId((prev) => ({
          ...prev,
          [persistedThread.id]: prev[persistedThread.id] ?? [],
        }))
        setActiveThreadId(persistedThread.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Neuer Chat konnte nicht erstellt werden.')
      }
      return
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
    setActiveThreadId(temporaryThread.id)
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

  async function deleteChat(threadId: string) {
    const targetThread = threads.find((thread) => thread.id === threadId)
    if (targetThread?.isTemporary) {
      removeTemporaryThread(threadId)
      return
    }

    setError(null)

    try {
      await deleteChatThread(threadId)

      setThreads((prev) => {
        const remainingThreads = prev.filter((thread) => thread.id !== threadId)
        return remainingThreads
      })

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
      setError(err instanceof Error ? err.message : 'Chat konnte nicht gelöscht werden.')
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
      const updated: ChatMessage = {
        ...targetAssistant,
        content: wordResult.displayContent,
        metadata: {
          ...meta,
          wordExport: wordResult.wordExport,
        },
      }
      setMessagesByThreadId((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((m) => (m.id === targetAssistant.id ? updated : m)),
      }))
      void options?.onProfileMemoryUpdated?.()?.catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word-Export ist fehlgeschlagen.')
    } finally {
      setWordFinalizeBusy(false)
    }
  }

  function selectChat(threadId: string) {
    setThinkingClarifyDialog(null)
    if (autoRemoveEmptyChats && activeThreadId && activeThreadId !== threadId) {
      const activeThread = threads.find((thread) => thread.id === activeThreadId)
      const hasMessages = (messagesByThreadId[activeThreadId]?.length ?? 0) > 0

      if (activeThread?.isTemporary && !activeThread.isRemoving && !hasMessages) {
        removeTemporaryThread(activeThreadId)
      }
    }

    setActiveThreadId(threadId)
    setError(null)
  }

  async function submitMessage(
    content: string,
    sendOpts?: {
      useWebSearch?: boolean
    },
  ) {
    const wantsWord = userWantsWordExport(content)
    const wantsExcel = !wantsWord && userWantsExcelExport(content)
    let trimmed = stripExcelCommandMarker(content)
    trimmed = stripWordCommandMarker(trimmed)

    if (!canSend) {
      return
    }
    if (!wantsWord && !trimmed) {
      return
    }

    const imageCmd = wantsWord ? null : matchExplicitImageGenerationRequest(trimmed)
    const wantsThinkingTurn =
      usesGatewayAi() &&
      chatThinkingMode === 'thinking' &&
      !wantsExcel &&
      imageCmd?.kind !== 'prompt'

    if (wantsThinkingTurn && options?.isSuperadmin !== true && (thinkingCreditsRemaining ?? 0) < 1) {
      setError(
        'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
      )
      return
    }
    if (imageCmd?.kind === 'empty') {
      setError(
        'Bitte konkret beschreiben, was auf dem Bild sein soll (z. B. «Erstelle ein Bild: eine Katze im Wald»).',
      )
      return
    }

    setThinkingClarifyDialog(null)
    setError(null)
    let threadId = activeThreadId

    if (wantsWord && !usesGatewayAi()) {
      setError('Word-Export ist im Demo-Modus nicht verfügbar.')
      return
    }

    setIsSending(true)

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
      const aclThread =
        threads.find((t) => t.id === targetThreadId) ??
        (activeThread?.id === targetThreadId ? activeThread : undefined)
      const userOwnsThread = Boolean(userId && aclThread && aclThread.userId === userId)

      let imageGenPrompt =
        imageCmd && imageCmd.kind === 'prompt' ? imageCmd.prompt : null
      if (!imageGenPrompt && !wantsWord) {
        const prior = messagesByThreadId[targetThreadId] ?? []
        const follow = matchFollowUpImageEditRequest(trimmed, prior)
        if (follow.kind === 'prompt') {
          imageGenPrompt = follow.prompt
        }
      }

      let webSearchContext: string | undefined
      if (
        sendOpts?.useWebSearch &&
        trimmed &&
        usesGatewayAi() &&
        !wantsWord &&
        !wantsExcel &&
        !imageGenPrompt
      ) {
        if (!options?.isSuperadmin && (options?.webSearchCreditBalance ?? 0) < 1) {
          setError(
            'Dein Websuche-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen (max. 50 Kontostand).',
          )
          return
        }
        try {
          const ws = await fetchTavilySearchContext(trimmed)
          webSearchContext = ws.contextText
          void options?.onWebSearchCreditsConsumed?.()?.catch(() => {})
        } catch (wsErr) {
          const message =
            wsErr instanceof Error ? wsErr.message : 'Websuche ist fehlgeschlagen.'
          setError(message)
          return
        }
      }

      const userContent = trimmed || (wantsWord ? 'Word-Dokument vorbereiten' : trimmed)
      const storedUserMessage = await createChatMessage(
        targetThreadId,
        'user',
        userContent,
        wantsExcel
          ? { userExcelCommand: true }
          : wantsWord
            ? { userWordCommand: true }
            : webSearchContext
              ? { userWebSearchCommand: true }
              : undefined,
      )

      let nextMessages: ChatMessage[] = []
      setMessagesByThreadId((prev) => {
        const list = prev[targetThreadId] ?? []
        nextMessages = upsertChatMessage(list, storedUserMessage)
        return { ...prev, [targetThreadId]: nextMessages }
      })

      const shouldRename =
        (aclThread?.title === 'Neuer Chat' || isTemporaryThread) && userOwnsThread
      const provisionalTitle = shouldRename
        ? createChatTitle(trimmed || (wantsWord ? 'Word' : ''))
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

      if (imageGenPrompt) {
        if (!usesGatewayAi()) {
          setError('Bildgenerierung ist im Demo-Modus nicht verfügbar.')
          return
        }
        try {
          const imageContextTurns = nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
          const { assistantMarkdown } = await generateChatImageFromPrompt(
            imageGenPrompt,
            imageContextTurns,
          )
          const storedAssistantMessage = await createChatMessage(
            targetThreadId,
            'assistant',
            assistantMarkdown,
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
          const message =
            err instanceof Error ? err.message : 'Bildgenerierung ist fehlgeschlagen.'
          setError(message)
        }
        return
      }

      let streamAssistantId: string | null = null
      let finalAssistantContent: string
      let excelSpecModelLabel: 'Claude Sonnet' | 'OpenAI (Fallback)' | null = null

      if (usesGatewayAi()) {
        const streamingMessageId = crypto.randomUUID()
        streamAssistantId = streamingMessageId
        const streamCreatedAt = new Date().toISOString()
        const streamingPlaceholder: ChatMessage = {
          id: streamingMessageId,
          role: 'assistant',
          content: '',
          createdAt: streamCreatedAt,
          metadata: { liveStream: true },
        }
        setMessagesByThreadId((prev) =>
          upsertThreadMessages(prev, targetThreadId, streamingPlaceholder),
        )

        try {
          finalAssistantContent = await sendMessageStreaming(nextMessages, {
            interactiveQuizPrompt: getPrompt('interactive_quiz'),
            userRequestedExcel: wantsExcel,
            userRequestedWord: wantsWord,
            mainChatModelId: effectiveComposerModelId,
            chatReplyMode,
            chatThinkingMode,
            mainChatUsedTokensToday: options?.mainChatUsedTokensToday,
            mainChatDailyTierConfig: options?.mainChatDailyTierConfig,
            mainChatThinkingTierConfig: options?.mainChatThinkingTierConfig,
            mainChatContextMaxTokens:
              options?.mainChatContextMaxTokens === undefined
                ? DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
                : options.mainChatContextMaxTokens,
            webSearchContext,
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
            wantsThinkingTurn &&
            streamErr instanceof Error &&
            streamErr.message.includes('Thinking-Guthaben')
          ) {
            markThinkingCreditsDepletedLocally()
          }
          throw streamErr
        }
        if (wantsThinkingTurn && options?.isSuperadmin !== true) {
          markThinkingCreditConsumedLocally()
        }
      } else {
        const { assistantMessage } = await sendMessage(nextMessages, {
          interactiveQuizPrompt: getPrompt('interactive_quiz'),
          userRequestedExcel: wantsExcel,
          userRequestedWord: wantsWord,
          mainChatModelId: effectiveComposerModelId,
          chatReplyMode,
          chatThinkingMode,
          mainChatUsedTokensToday: options?.mainChatUsedTokensToday,
          mainChatDailyTierConfig: options?.mainChatDailyTierConfig,
          mainChatThinkingTierConfig: options?.mainChatThinkingTierConfig,
          mainChatContextMaxTokens:
            options?.mainChatContextMaxTokens === undefined
              ? DEFAULT_MAIN_CHAT_CONTEXT_MAX_TOKENS
              : options.mainChatContextMaxTokens,
          webSearchContext,
        })
        finalAssistantContent = assistantMessage.content
        if (wantsThinkingTurn && options?.isSuperadmin !== true) {
          markThinkingCreditConsumedLocally()
        }
      }
      if (usesGatewayAi() && wantsExcel) {
        try {
          const specResult = await generateExcelSpecWithSonnet(trimmed)
          excelSpecModelLabel = specResult.modelLabel
          finalAssistantContent = `${finalAssistantContent.trim()}\n\n${specResult.specBlock.trim()}`
        } catch (specErr) {
          setError(
            specErr instanceof Error
              ? specErr.message
              : 'Excel-Spezifikation (Claude) ist fehlgeschlagen.',
          )
        }
      }

      const storedAssistantMessage = await createChatMessage(
        targetThreadId,
        'assistant',
        finalAssistantContent,
      )

      let mergedAssistantMessage = storedAssistantMessage
      const excelSpecParsed = parseExcelSpecFromContent(finalAssistantContent)
      const excelSpecUnreadable =
        usesGatewayAi() &&
        wantsExcel &&
        hasExcelSpecMarkers(finalAssistantContent) &&
        !excelSpecParsed.spec

      if (excelSpecUnreadable) {
        setError(
          'Die Excel-Vorgabe in der Antwort konnte nicht gelesen werden (Schema/JSON). Bitte erneut versuchen oder eine kuerzere Tabelle anfragen.',
        )
      }

      if (excelSpecParsed.spec && usesGatewayAi()) {
        try {
          const excelResult = await generateExcelFromSpec({
            messageId: storedAssistantMessage.id,
            threadId: targetThreadId,
            spec: normalizeExcelSpecForExport(excelSpecParsed.spec),
          })
          mergedAssistantMessage = {
            ...storedAssistantMessage,
            content: excelSpecModelLabel
              ? `${excelResult.displayContent}\n\n_Modell für Excel-Spezifikation: ${excelSpecModelLabel}_`
              : excelResult.displayContent,
            metadata: { excelExport: excelResult.excelExport },
          }
        } catch (excelErr) {
          setError(
            excelErr instanceof Error ? excelErr.message : 'Excel-Datei konnte nicht erzeugt werden.',
          )
        }
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

      if (usesGatewayAi() && chatThinkingMode === 'thinking' && !wantsExcel && !wantsWord) {
        const rawAssistant = mergedAssistantMessage.content
        if (!hasExcelSpecMarkers(rawAssistant)) {
          const clarify = parseThinkingClarifyContent(rawAssistant)
          const expectedClarifyOnly = thinkingTurnExpectsClarifyOnly(nextMessages)

          if (clarify.kind === 'clarify') {
            setThinkingClarifyDialog({
              kind: 'structured',
              threadId: targetThreadId,
              messageId: mergedAssistantMessage.id,
              introMarkdown: clarify.introMarkdown,
              payload: clarify.payload,
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
            })
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
      const skipMemoryMergeForThinkingTurn = chatThinkingMode === 'thinking'
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
      if (
        wantsThinkingTurn &&
        err instanceof Error &&
        err.message.includes('Thinking-Guthaben')
      ) {
        markThinkingCreditsDepletedLocally()
      }
      setError(errorMessageFromUnknown(err))
    } finally {
      if (wantsThinkingTurn && options?.isSuperadmin !== true) {
        await options?.onThinkingCreditsConsumed?.()?.catch(() => {})
      }
      setIsSending(false)
    }
  }

  return {
    threads,
    activeThreadId,
    messages,
    isSending,
    isBootstrapping,
    error,
    submitMessage,
    finalizeWordDocumentExport,
    wordFinalizeBusy,
    createNewChat,
    renameChat,
    deleteChat,
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
