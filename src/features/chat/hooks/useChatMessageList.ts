import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import type { ChatMessage } from '../types'
import { stripExcelSpecBlock } from '../excel/excelSpec'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'
import { matchExplicitImageGenerationRequest } from '../utils/imageGenerationIntent'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import { getChatSendPhaseLabel } from '../constants/chatSendPhase'
import { safeMessageContent, shouldSkipAssistantTypingReveal } from '../components/chat-window/chatWindowMessageUtils'

export type QuizAnswerStatus = 'idle' | 'correct' | 'incorrect'

export type QuizAnswerState = {
  value: string
  status: QuizAnswerStatus
  feedback: string
}

export type UseChatMessageListArgs = {
  threadKey: string | null
  messages: ChatMessage[]
  isSending: boolean
  sendPhase: ChatSendPhaseState
}

export function useChatMessageList({
  threadKey,
  messages: messageList,
  isSending,
  sendPhase,
}: UseChatMessageListArgs) {
  const showAssistantPendingLoader =
    isSending &&
    messageList.length > 0 &&
    messageList[messageList.length - 1]?.role === 'user'
  const pendingUserContentForLoader = showAssistantPendingLoader
    ? safeMessageContent(messageList[messageList.length - 1]?.content)
    : ''
  const pendingImageGeneration =
    showAssistantPendingLoader &&
    matchExplicitImageGenerationRequest(pendingUserContentForLoader).kind === 'prompt'

  const lastExcelUserIndex = (() => {
    for (let i = messageList.length - 1; i >= 0; i -= 1) {
      if (messageList[i].role === 'user' && messageList[i].metadata?.userExcelCommand) {
        return i
      }
    }
    return -1
  })()
  /** Nur Nachrichten nach der letzten Excel-User-Zeile — sonst blockiert die erste Excel-Antwort alle weiteren. */
  const assistantHasExcelExportAfterLastExcelUser =
    lastExcelUserIndex >= 0 &&
    messageList
      .slice(lastExcelUserIndex + 1)
      .some((m) => m.role === 'assistant' && Boolean(m.metadata?.excelExport))
  /** Excel: Marker liegt nicht im gespeicherten Text — Flag in User-`metadata`; Loader auch während Stream/Sonnet. */
  const pendingExcelGeneration =
    isSending &&
    !pendingImageGeneration &&
    lastExcelUserIndex >= 0 &&
    !assistantHasExcelExportAfterLastExcelUser

  const lastWordUserIndex = (() => {
    for (let i = messageList.length - 1; i >= 0; i -= 1) {
      if (messageList[i].role === 'user' && messageList[i].metadata?.userWordCommand) {
        return i
      }
    }
    return -1
  })()
  const assistantHasWordExportAfterLastWordUser =
    lastWordUserIndex >= 0 &&
    messageList
      .slice(lastWordUserIndex + 1)
      .some((m) => m.role === 'assistant' && Boolean(m.metadata?.wordExport))
  const pendingWordGeneration =
    isSending &&
    !pendingImageGeneration &&
    !pendingExcelGeneration &&
    lastWordUserIndex >= 0 &&
    !assistantHasWordExportAfterLastWordUser

  const lastPdfUserIndex = (() => {
    for (let i = messageList.length - 1; i >= 0; i -= 1) {
      if (messageList[i].role === 'user' && messageList[i].metadata?.userPdfCommand) {
        return i
      }
    }
    return -1
  })()
  const assistantHasPdfExportAfterLastPdfUser =
    lastPdfUserIndex >= 0 &&
    messageList
      .slice(lastPdfUserIndex + 1)
      .some((m) => m.role === 'assistant' && Boolean(m.metadata?.pdfExport))
  const pendingPdfGeneration =
    isSending &&
    !pendingImageGeneration &&
    !pendingExcelGeneration &&
    !pendingWordGeneration &&
    lastPdfUserIndex >= 0 &&
    !assistantHasPdfExportAfterLastPdfUser

  const showPendingTextOrbitRow =
    showAssistantPendingLoader &&
    !pendingImageGeneration &&
    !pendingExcelGeneration &&
    !pendingWordGeneration &&
    !pendingPdfGeneration
  const showPendingAssistantRow =
    showPendingTextOrbitRow ||
    pendingImageGeneration ||
    pendingExcelGeneration ||
    pendingWordGeneration ||
    pendingPdfGeneration
  const pendingStatusLabel =
    getChatSendPhaseLabel(sendPhase) ??
    (isSending && showPendingTextOrbitRow ? 'Denkt nach …' : undefined)
  const streamingStatusLabel = getChatSendPhaseLabel(sendPhase) ?? 'Denkt nach …'

  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({})
  const [quizChecksInProgress, setQuizChecksInProgress] = useState<Record<string, boolean>>({})
  const [excelDownloadBusyId, setExcelDownloadBusyId] = useState<string | null>(null)
  const [wordDownloadBusyId, setWordDownloadBusyId] = useState<string | null>(null)
  const [pdfDownloadBusyId, setPdfDownloadBusyId] = useState<string | null>(null)
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set())
  const animationTimersRef = useRef<number[]>([])
  /** Zuletzt bekannte Listenlänge (für „genau eine neue Nachricht“ = Stream). */
  const prevMessageCountRef = useRef(0)
  /** Laufende Schreib-Animation: darf nicht vom „Sofort“-Zweig überschrieben werden. */
  const streamingAssistantIdsRef = useRef<Set<string>>(new Set())
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)

  const lastMessage = messageList.length > 0 ? messageList[messageList.length - 1] : undefined
  const isAssistantReplyStillAnimating = (() => {
    if (!lastMessage || lastMessage.role !== 'assistant') return false
    if (lastMessage.metadata?.excelExport) return false
    if (lastMessage.metadata?.wordExport) return false
    if (lastMessage.metadata?.pdfExport) return false
    if (lastMessage.metadata?.liveStream) return true
    const parsed = parseInteractiveContentWithFallback(lastMessage.content)
    if (parsed?.quiz) return false
    const full = stripExcelSpecBlock(safeMessageContent(lastMessage.content))
    if (shouldSkipAssistantTypingReveal(full)) return false
    if (isSending && full.trim().length === 0) return true
    const animated = safeMessageContent(animatedAssistantContent[lastMessage.id] ?? full)
    return animated.length < full.length
  })()
  const showLatestAssistantOrbitLoader =
    !showPendingTextOrbitRow && lastMessage?.role === 'assistant' && isAssistantReplyStillAnimating

  const lastMessageFingerprint =
    messageList.length > 0
      ? `${messageList[messageList.length - 1].id}:${safeMessageContent(messageList[messageList.length - 1].content).length}`
      : ''

  /** Liste immer ohne Scroll-Animation ans Ende (Chat öffnen, Laden, neue Nachricht). */
  useEffect(() => {
    const el = messagesScrollRef.current
    if (!el || messageList.length === 0) {
      return
    }
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'auto',
      })
    })
  }, [threadKey, lastMessageFingerprint, isSending, messageList.length])

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      animationTimersRef.current = []
    }
  }, [])

  /** Thread gewechselt: Historie sofort voll anzeigen, Stream-Refs zurücksetzen. */
  useLayoutEffect(() => {
    const assistantIds = new Set(messageList.filter((m) => m.role === 'assistant').map((m) => m.id))
    animatedAssistantIdsRef.current = assistantIds
    streamingAssistantIdsRef.current = new Set()
    setAnimatedAssistantContent({})
    prevMessageCountRef.current = messageList.length
    // messages gehören zum gleichen Render wie threadKey; bei jeder messages-Änderung würden wir fälschlich zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur Thread-Wechsel
  }, [threadKey])

  /** Kein Volltext vor dem ersten Paint bei neu angehängter Assistenten-Nachricht. */
  useLayoutEffect(() => {
    const latest = messageList[messageList.length - 1]
    const appendedOne = messageList.length === prevMessageCountRef.current + 1
    if (
      !latest ||
      latest.role !== 'assistant' ||
      !appendedOne ||
      animatedAssistantIdsRef.current.has(latest.id)
    ) {
      return
    }
    if (latest.metadata?.liveStream) {
      return
    }
    const raw = stripExcelSpecBlock(safeMessageContent(latest.content))
    if (shouldSkipAssistantTypingReveal(raw)) {
      setAnimatedAssistantContent((prev) => ({ ...prev, [latest.id]: raw }))
      animatedAssistantIdsRef.current.add(latest.id)
      prevMessageCountRef.current = messageList.length
      return
    }
    setAnimatedAssistantContent((prev) => ({ ...prev, [latest.id]: '' }))
  }, [messageList])

  useEffect(() => {
    animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    animationTimersRef.current = []

    const latestMessage = messageList[messageList.length - 1]
    const appendedAssistant =
      Boolean(latestMessage) &&
      latestMessage.role === 'assistant' &&
      messageList.length === prevMessageCountRef.current + 1 &&
      !animatedAssistantIdsRef.current.has(latestMessage.id)

    const shouldStreamLatest = appendedAssistant

    const rafChainIds: number[] = []
    let streamingStarted = false
    let streamingIdForCleanup: string | null = null

    const cancelRafChain = () => {
      rafChainIds.forEach((id) => cancelAnimationFrame(id))
      rafChainIds.length = 0
    }

    for (const message of messageList) {
      if (message.role !== 'assistant') {
        continue
      }

      if (message.metadata?.liveStream) {
        setAnimatedAssistantContent((prev) => ({
          ...prev,
          [message.id]: stripExcelSpecBlock(safeMessageContent(message.content)),
        }))
        continue
      }

      if (animatedAssistantIdsRef.current.has(message.id)) {
        continue
      }

      if (streamingAssistantIdsRef.current.has(message.id)) {
        continue
      }

      if (shouldStreamLatest && latestMessage?.id === message.id) {
        /** Roh-Präfix zeigt sonst Marker/JSON, bevor END im String liegt — strip vor Animation. */
        const fullContent = stripExcelSpecBlock(safeMessageContent(message.content))
        if (shouldSkipAssistantTypingReveal(fullContent)) {
          if (!animatedAssistantIdsRef.current.has(message.id)) {
            setAnimatedAssistantContent((prev) => ({
              ...prev,
              [message.id]: fullContent,
            }))
            animatedAssistantIdsRef.current.add(message.id)
          }
          streamingAssistantIdsRef.current.delete(message.id)
          prevMessageCountRef.current = messageList.length
          continue
        }
        streamingStarted = true
        streamingIdForCleanup = message.id
        streamingAssistantIdsRef.current.add(message.id)

        /** Nach API-Wartezeit: nur kurzes Einblenden — alte Werte wirkten wie zusätzliche Ladezeit. */
        const charsPerSecond = 320
        const durationMs = Math.min(900, Math.max(120, (fullContent.length / charsPerSecond) * 1000))
        const start = performance.now()
        const targetLen = messageList.length

        const tick = (now: number) => {
          const elapsed = now - start
          const t = Math.min(1, elapsed / durationMs)
          const eased = 1 - (1 - t) ** 3
          const len = Math.floor(eased * fullContent.length)
          const slice = fullContent.slice(0, len)
          setAnimatedAssistantContent((prev) => ({
            ...prev,
            [message.id]: slice,
          }))

          if (t < 1) {
            const nextId = requestAnimationFrame(tick)
            rafChainIds.push(nextId)
          } else {
            streamingAssistantIdsRef.current.delete(message.id)
            animatedAssistantIdsRef.current.add(message.id)
            prevMessageCountRef.current = targetLen
          }
        }

        const firstId = requestAnimationFrame(tick)
        rafChainIds.push(firstId)
        continue
      }

      const immediateTimerId = window.setTimeout(() => {
        setAnimatedAssistantContent((prev) => ({
          ...prev,
          [message.id]: safeMessageContent(message.content),
        }))
      }, 0)
      animationTimersRef.current.push(immediateTimerId)
      animatedAssistantIdsRef.current.add(message.id)
    }

    if (!streamingStarted) {
      prevMessageCountRef.current = messageList.length
    }

    return () => {
      cancelRafChain()
      if (streamingIdForCleanup && streamingAssistantIdsRef.current.has(streamingIdForCleanup)) {
        streamingAssistantIdsRef.current.delete(streamingIdForCleanup)
      }
    }
  }, [messageList])

  async function downloadExcelExport(message: ChatMessage) {
    const ex = message.metadata?.excelExport
    if (!ex) {
      return
    }
    setExcelDownloadBusyId(message.id)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.storage.from(ex.bucket).createSignedUrl(ex.path, 3600)
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Download-Link konnte nicht erstellt werden.')
      }
      const res = await fetch(data.signedUrl)
      if (!res.ok) {
        throw new Error('Datei konnte nicht geladen werden.')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = ex.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error(e)
    } finally {
      setExcelDownloadBusyId(null)
    }
  }

  async function downloadWordExport(message: ChatMessage) {
    const wx = message.metadata?.wordExport
    if (!wx) {
      return
    }
    setWordDownloadBusyId(message.id)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.storage.from(wx.bucket).createSignedUrl(wx.path, 3600)
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Download-Link konnte nicht erstellt werden.')
      }
      const res = await fetch(data.signedUrl)
      if (!res.ok) {
        throw new Error('Datei konnte nicht geladen werden.')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = wx.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error(e)
    } finally {
      setWordDownloadBusyId(null)
    }
  }

  async function downloadPdfExport(message: ChatMessage) {
    const px = message.metadata?.pdfExport
    if (!px) {
      return
    }
    setPdfDownloadBusyId(message.id)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.storage.from(px.bucket).createSignedUrl(px.path, 3600)
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Download-Link konnte nicht erstellt werden.')
      }
      const res = await fetch(data.signedUrl)
      if (!res.ok) {
        throw new Error('Datei konnte nicht geladen werden.')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = px.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error(e)
    } finally {
      setPdfDownloadBusyId(null)
    }
  }

  function getQuizAnswerKey(messageId: string, questionId: string) {
    return `${messageId}::${questionId}`
  }

  function getQuizAnswerState(messageId: string, questionId: string): QuizAnswerState {
    const key = getQuizAnswerKey(messageId, questionId)
    return quizAnswers[key] ?? { value: '', status: 'idle', feedback: '' }
  }

  function updateQuizAnswerValue(messageId: string, questionId: string, value: string) {
    const key = getQuizAnswerKey(messageId, questionId)
    setQuizAnswers((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { status: 'idle', feedback: '' }),
        value,
      },
    }))
  }

  async function checkQuizAnswer(message: ChatMessage, questionId: string) {
    const parsed = parseInteractiveContentWithFallback(safeMessageContent(message.content))
    if (!parsed.quiz) {
      return
    }

    const question = parsed.quiz.questions.find((entry) => entry.id === questionId)
    if (!question) {
      return
    }

    const key = getQuizAnswerKey(message.id, questionId)
    const current = quizAnswers[key] ?? { value: '', status: 'idle', feedback: '' }
    setQuizChecksInProgress((prev) => ({ ...prev, [key]: true }))

    try {
      const result = await evaluateQuizAnswerWithAi({
        question,
        userAnswer: current.value,
      })

      setQuizAnswers((prev) => ({
        ...prev,
        [key]: {
          value: current.value,
          status: result.isCorrect ? 'correct' : 'incorrect',
          feedback: result.feedback,
        },
      }))
    } catch {
      setQuizAnswers((prev) => ({
        ...prev,
        [key]: {
          value: current.value,
          status: 'incorrect',
          feedback: 'KI Bewertung momentan nicht erreichbar. Bitte erneut prüfen.',
        },
      }))
    } finally {
      setQuizChecksInProgress((prev) => ({ ...prev, [key]: false }))
    }
  }
  return {
    messagesScrollRef,
    animatedAssistantContent,
    showPendingAssistantRow,
    pendingImageGeneration,
    pendingExcelGeneration,
    pendingWordGeneration,
    pendingPdfGeneration,
    pendingStatusLabel,
    showLatestAssistantOrbitLoader,
    streamingStatusLabel,
    isAssistantReplyStillAnimating,
    excelDownloadBusyId,
    wordDownloadBusyId,
    pdfDownloadBusyId,
    getQuizAnswerState,
    updateQuizAnswerValue,
    checkQuizAnswer,
    quizChecksInProgress,
    downloadExcelExport,
    downloadWordExport,
    downloadPdfExport,
  }
}
