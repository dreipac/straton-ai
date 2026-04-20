import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSystemPrompts } from '../../systemPrompts/useSystemPrompts'
import { CHAT_THREADS_REFRESH_EVENT } from '../constants/events'
import {
  hasExcelSpecMarkers,
  normalizeExcelSpecForExport,
  parseExcelSpecFromContent,
} from '../excel/excelSpec'
import { stripExcelCommandMarker, userWantsExcelExport } from '../constants/excelExportPrompt'
import {
  CHAT_COMPOSER_MODEL_STORAGE_KEY,
  type ChatComposerModelId,
  type ChatModelPolicy,
  parseStoredComposerModelId,
} from '../constants/chatComposerModels'
import {
  generateChatTitleWithAi,
  generateExcelFromSpec,
  generateExcelSpecWithSonnet,
  mergePersistedAiChatMemoryAfterTurn,
  sendMessage,
  sendMessageStreaming,
  usesGatewayAi,
} from '../services/chat.service'
import {
  createChatMessage,
  createChatThread,
  deleteChatThread,
  listChatThreads,
  listMessagesByThreadIds,
  touchChatThread,
  updateChatThreadTitle,
} from '../services/chat.persistence'
import type { ChatMessage, ChatThread } from '../types'
const TEMP_THREAD_PREFIX = 'temp-thread-'
const THREAD_REMOVE_ANIMATION_MS = 180

function createChatTitle(content: string) {
  const trimmed = content
    .replace(/\[\[STRATON_EXCEL_COMMAND\]\]/g, '')
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
  },
) {
  const { getPrompt } = useSystemPrompts()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messagesByThreadId, setMessagesByThreadId] = useState<Record<string, ChatMessage[]>>({})
  const [isSending, setIsSending] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerModelId, setComposerModelId] = useState<ChatComposerModelId>(() =>
    parseStoredComposerModelId(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_COMPOSER_MODEL_STORAGE_KEY) : null,
    ),
  )
  const removeTimersRef = useRef<Record<string, number>>({})

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
  const canSend = useMemo(() => !isSending, [isSending])

  const refreshThreadsFromServer = useCallback(
    async (currentUserId: string, preserveActiveThread: boolean) => {
      const nextThreads = await listChatThreads(currentUserId)
      if (nextThreads.length > 0) {
        const allMessages = await listMessagesByThreadIds(nextThreads.map((thread) => thread.id))
        setMessagesByThreadId(getMessagesByThread(allMessages))
      } else {
        setMessagesByThreadId({})
      }

      setThreads(nextThreads)
      setActiveThreadId((currentId) => {
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

    function handleThreadsRefresh() {
      void refreshThreadsFromServer(currentUserId, true)
    }

    window.addEventListener(CHAT_THREADS_REFRESH_EVENT, handleThreadsRefresh as EventListener)
    return () => {
      window.removeEventListener(CHAT_THREADS_REFRESH_EVENT, handleThreadsRefresh as EventListener)
    }
  }, [userId, refreshThreadsFromServer])

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
        setThreads((prev) => [persistedThread, ...prev])
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

  function selectChat(threadId: string) {
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

  async function submitMessage(content: string) {
    const wantsExcel = userWantsExcelExport(content)
    const trimmed = stripExcelCommandMarker(content)
    if (!trimmed || !canSend) {
      return
    }

    setError(null)
    let threadId = activeThreadId

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
        setThreads((prev) => [persistedThread, ...prev])
        setMessagesByThreadId((prev) => ({
          ...prev,
          [persistedThread.id]: prev[persistedThread.id] ?? [],
        }))
        setActiveThreadId(persistedThread.id)

        threadId = persistedThread.id
        activeThread = persistedThread
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
          return [persistedThread, ...withoutTemporary]
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
      }

      if (!threadId) {
        setError('Chat konnte nicht vorbereitet werden.')
        return
      }

      const targetThreadId = threadId
      const storedUserMessage = await createChatMessage(targetThreadId, 'user', trimmed)

      const currentMessages = messagesByThreadId[targetThreadId] ?? []
      const nextMessages = [...currentMessages, storedUserMessage]

      setMessagesByThreadId((prev) => ({
        ...prev,
        [targetThreadId]: nextMessages,
      }))

      const shouldRename = activeThread?.title === 'Neuer Chat' || isTemporaryThread
      const provisionalTitle = shouldRename ? createChatTitle(trimmed) : activeThread?.title

      if (provisionalTitle && shouldRename) {
        await updateChatThreadTitle(targetThreadId, provisionalTitle)
      }

      await touchChatThread(targetThreadId)

      setThreads((prev) => {
        const updated = prev.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                title: provisionalTitle ?? thread.title,
                updatedAt: new Date().toISOString(),
              }
            : thread,
        )
        return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })

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
        setMessagesByThreadId((prev) => ({
          ...prev,
          [targetThreadId]: [...(prev[targetThreadId] ?? []), streamingPlaceholder],
        }))

        try {
          finalAssistantContent = await sendMessageStreaming(nextMessages, {
            interactiveQuizPrompt: getPrompt('interactive_quiz'),
            userRequestedExcel: wantsExcel,
            mainChatModelId: effectiveComposerModelId,
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
          throw streamErr
        }
      } else {
        const { assistantMessage } = await sendMessage(nextMessages, {
          interactiveQuizPrompt: getPrompt('interactive_quiz'),
          userRequestedExcel: wantsExcel,
          mainChatModelId: effectiveComposerModelId,
        })
        finalAssistantContent = assistantMessage.content
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
          return {
            ...prev,
            [targetThreadId]: list.map((m) => (m.id === streamAssistantId ? mergedAssistantMessage : m)),
          }
        }
        return {
          ...prev,
          [targetThreadId]: [...list, mergedAssistantMessage],
        }
      })

      await touchChatThread(targetThreadId)

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

      if (shouldRename) {
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
      if (usesGatewayAi() && userId && persistMemory) {
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
      const message =
        err instanceof Error ? err.message : 'Beim Senden ist ein unbekannter Fehler aufgetreten.'
      setError(message)
    } finally {
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
    createNewChat,
    renameChat,
    deleteChat,
    selectChat,
    canSend,
    composerModelId: effectiveComposerModelId,
    setComposerModelId: persistComposerModelId,
    isChatModelLocked,
  }
}
