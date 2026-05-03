import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ActionBottomSheet } from '../../../components/ui/bottom-sheet/ActionBottomSheet'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import attachmentIcon from '../../../assets/icons/attachment.svg'
import duringIcon from '../../../assets/icons/during.svg'
import fileIcon from '../../../assets/icons/file.svg'
import greenFileIcon from '../../../assets/icons/green-file.svg'
import landscapePng from '../../../assets/png/Landscape.png'
import sendIcon from '../../../assets/icons/send.svg'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { EXCEL_EXPORT_COMMAND_MARKER } from '../constants/excelExportPrompt'
import { IMAGE_GEN_TILE_PROMPT_PREFIX } from '../constants/imageGenTile'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import { stripExcelSpecBlock } from '../excel/excelSpec'
import type { ChatMessage } from '../types'
import { renderInlineMarkdown } from '../utils/markdownInline'
import { renderAssistantRichContent } from '../utils/renderAssistantRichContent'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'
import { extractLearningMaterialText } from '../../learn/utils/documentParser'
import { hapticLightImpact } from '../../../utils/haptics'
import type { ChatComposerModelId } from '../constants/chatComposerModels'
import type { ChatReplyMode } from '../constants/chatReplyMode'
import type { ChatThinkingMode } from '../constants/chatThinkingMode'
import { ChatComposerModelPicker } from './ChatComposerModelPicker'
import { ChatComposerReplyModePicker } from './ChatComposerReplyModePicker'
import { ChatComposerThinkingModePicker } from './ChatComposerThinkingModePicker'
import { ThinkingClarifyModal } from './ThinkingClarifyModal'
import { useVisualKeyboardInset } from '../hooks/useVisualKeyboardInset'
import type { ThinkingClarifyDialogState } from '../utils/thinkingClarify'
import {
  messageContainsCompleteThinkingClarifyBlock,
  stripThinkingClarifyMarkersForDisplay,
} from '../utils/thinkingClarify'
import { matchExplicitImageGenerationRequest } from '../utils/imageGenerationIntent'
import { ThinkingClarifyFreeTextModal } from './ThinkingClarifyFreeTextModal'

const EMPTY_CHAT_MESSAGES: ChatMessage[] = []

const IMAGE_GEN_MATRIX_SIZE = 15

function buildImageGenMatrixDots(): { key: string; delayMs: number }[] {
  const n = IMAGE_GEN_MATRIX_SIZE
  const c = (n - 1) / 2
  const maxD = Math.hypot(c, c) || 1
  const out: { key: string; delayMs: number }[] = []
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const dist = Math.hypot(row - c, col - c)
      out.push({
        key: `ig-${row}-${col}`,
        delayMs: Math.round((dist / maxD) * 740),
      })
    }
  }
  return out
}

const IMAGE_GEN_MATRIX_DOTS = buildImageGenMatrixDots()

/** Rechteckiges Excel-Panel — nicht 15×15 wie beim Bild, sonst stark verzerrte Raster-Zellen. */
const EXCEL_GEN_MATRIX_COLS = 11
const EXCEL_GEN_MATRIX_ROWS = 7

function buildExcelGenMatrixCells(): { key: string; delayMs: number }[] {
  const cols = EXCEL_GEN_MATRIX_COLS
  const rows = EXCEL_GEN_MATRIX_ROWS
  const cx = (cols - 1) / 2
  const cy = (rows - 1) / 2
  const maxD = Math.hypot(cx, cy) || 1
  const out: { key: string; delayMs: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dist = Math.hypot(col - cx, row - cy)
      out.push({
        key: `ex-${row}-${col}`,
        delayMs: Math.round((dist / maxD) * 740),
      })
    }
  }
  return out
}

const EXCEL_GEN_MATRIX_CELLS = buildExcelGenMatrixCells()

/** Einträge im Slash-Menü (Excel, Bilder) — für Pfeiltasten / Enter */
const SLASH_MENU_ITEM_COUNT = 2

/** Gleicher Breakpoint wie `chat.css` (@media max-width 860px) — Slash-Menü aus, Anhang-Bottom-Sheet */
const MOBILE_COMPOSER_MQ = '(max-width: 860px)'

type ChatWindowProps = {
  /** Aktiver Thread — wechsel setzt Stream-Zustand zurück (sonst falsche Animation). */
  threadKey: string | null
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  greetingName: string
  tokenLimitReached?: boolean
  composerModelId: ChatComposerModelId
  onComposerModelChange: (id: ChatComposerModelId) => void
  /** Abo ohne Modellwahl: false = Composer-Modell-Picker ausblenden. */
  showComposerModelPicker?: boolean
  chatReplyMode: ChatReplyMode
  onChatReplyModeChange: (mode: ChatReplyMode) => void
  chatThinkingMode: ChatThinkingMode
  onChatThinkingModeChange: (mode: ChatThinkingMode) => void
  /** Auf schmalen Viewports sitzt der Comfort/Strict-Schalter in der Oberleiste (`ChatToolbarReplyModeSelect`). */
  showReplyModePicker?: boolean
  /** Thinking-Rückfragen (Popup über der Message Box). */
  thinkingClarifyDialog?: ThinkingClarifyDialogState | null
  onDismissThinkingClarify?: () => void
  onSubmitThinkingClarifyAnswer?: (text: string) => void | Promise<void>
  onSendMessage: (content: string) => Promise<void>
  /** Laufender KI-Stream: Klick auf den During-Button bricht die Antwort ab. */
  onCancelSend?: () => void
}

type QuizAnswerStatus = 'idle' | 'correct' | 'incorrect'
type PendingAttachment = {
  id: string
  name: string
  content: string
  kind: 'file' | 'pasted-image'
  previewDataUrl?: string
}

type QuizAnswerState = {
  value: string
  status: QuizAnswerStatus
  feedback: string
}

/** Data-URL aus gespeichertem `[BildData:id]…[/BildData]` (lokale Preview-Map fehlt nach Reload). */
function extractBildDataUrlFromStoredContent(content: string, imageId: string): string | undefined {
  if (!imageId || !content.includes('[BildData:')) {
    return undefined
  }
  const escaped = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[BildData:${escaped}\\]\\s*([\\s\\S]*?)\\s*\\[/BildData\\]`, 'm')
  const m = content.match(re)
  const raw = m?.[1]?.trim()
  if (raw && raw.startsWith('data:')) {
    return raw
  }
  return undefined
}

/** PostgREST / Zwischenzustände: content nie undefined bei .length */
function safeMessageContent(content: string | null | undefined): string {
  return typeof content === 'string' ? content : ''
}

/** Typing-Reveal streamt Zeichenweise — bei eingebetteten Bildern (riesige data:-URLs) entstehen kaputte Markdown-Slices und die UI bleibt leer. */
const ASSISTANT_TYPING_REVEAL_MAX_CHARS = 12_000

function shouldSkipAssistantTypingReveal(strippedContent: string): boolean {
  return (
    strippedContent.length > ASSISTANT_TYPING_REVEAL_MAX_CHARS ||
    strippedContent.includes('data:image/')
  )
}

function extractDateiFileNamesFromContent(content: string): string[] {
  if (!content.includes('[Datei:')) {
    return []
  }
  const names: string[] = []
  const re = /\[Datei:\s*([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const label = String(m[1] ?? '').trim()
    if (label) {
      names.push(label)
    }
  }
  return names
}

export function ChatWindow({
  threadKey,
  messages,
  isSending,
  error,
  greetingName,
  tokenLimitReached = false,
  composerModelId,
  onComposerModelChange,
  showComposerModelPicker = true,
  chatReplyMode,
  onChatReplyModeChange,
  chatThinkingMode,
  onChatThinkingModeChange,
  showReplyModePicker = true,
  thinkingClarifyDialog = null,
  onDismissThinkingClarify = () => {},
  onSubmitThinkingClarifyAnswer = async () => {},
  onSendMessage,
  onCancelSend,
}: ChatWindowProps) {
  const messageList = Array.isArray(messages) ? messages : EMPTY_CHAT_MESSAGES
  const [draft, setDraft] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuHighlightIndex, setSlashMenuHighlightIndex] = useState(0)
  const [attachComposerSheetOpen, setAttachComposerSheetOpen] = useState(false)
  const isMobileComposer = useMediaQuery(MOBILE_COMPOSER_MQ)
  const [excelCommandSelected, setExcelCommandSelected] = useState(false)
  const [imageGenCommandSelected, setImageGenCommandSelected] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [sentPastedImagePreviews, setSentPastedImagePreviews] = useState<Record<string, string>>({})
  const isEmptyState = messageList.length === 0
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

  const showPendingAssistantRow = showAssistantPendingLoader || pendingExcelGeneration
  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({})
  const [quizChecksInProgress, setQuizChecksInProgress] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
  const [excelDownloadBusyId, setExcelDownloadBusyId] = useState<string | null>(null)
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
    if (lastMessage.metadata?.liveStream) return false
    const parsed = parseInteractiveContentWithFallback(lastMessage.content)
    if (parsed?.quiz) return false
    if (lastMessage.metadata?.excelExport) return false
    const full = safeMessageContent(lastMessage.content)
    const animated = safeMessageContent(animatedAssistantContent[lastMessage.id] ?? full)
    return animated.length < full.length
  })()
  const showDuringSendIcon = isSending || isAssistantReplyStillAnimating
  const cancelWhileSending = Boolean(isSending && onCancelSend)

  const composePlaceholder = tokenLimitReached
    ? 'Token-Limit erreicht'
    : imageGenCommandSelected
      ? 'Beschreibe dein Bild …'
      : 'Nachricht eingeben...'

  useEffect(() => {
    setExcelCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setAttachComposerSheetOpen(false)
  }, [threadKey])

  useEffect(() => {
    if (isMobileComposer) {
      setShowSlashMenu(false)
    }
  }, [isMobileComposer])

  function handleComposerSendClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!cancelWhileSending) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onCancelSend?.()
  }

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

  /** Setzt `--chat-visual-keyboard-inset` für mobilen Chat (s. `useVisualKeyboardInset`). */
  useVisualKeyboardInset()

  const MAX_INPUT_HEIGHT_PX = 220

  function adjustComposeHeight() {
    const el = inputRef.current
    if (!el) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`
  }

  useLayoutEffect(() => {
    adjustComposeHeight()
  }, [draft])

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

  function buildAttachmentMessageBlocks(items: PendingAttachment[]): string {
    return items
      .map((item) =>
        item.kind === 'pasted-image'
          ? (() => {
              const dataBlock = item.previewDataUrl
                ? `[BildData:${item.id}]\n${item.previewDataUrl}\n[/BildData]`
                : ''
              const ocrBlock = item.content.trim()
                ? `[Bild:${item.id}:${item.name}]\n${item.content}\n[/Bild]`
                : `[Bild:${item.id}:${item.name}] (Kein auslesbarer Text gefunden)\n[/Bild]`
              return [dataBlock, ocrBlock].filter(Boolean).join('\n')
            })()
          : item.content.trim()
            ? `[Datei: ${item.name}]\n${item.content}\n[/Datei]`
            : `[Datei: ${item.name}] (Kein auslesbarer Text gefunden)\n[/Datei]`,
      )
      .join('\n\n')
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const out = typeof reader.result === 'string' ? reader.result : ''
        resolve(out)
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error('Bild konnte nicht gelesen werden.'))
      }
      reader.readAsDataURL(file)
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if ((!draft.trim() && pendingAttachments.length === 0) || isSending || isAttachingFiles) {
      return
    }

    hapticLightImpact()

    const textPart = draft.trim()
    const messageText =
      imageGenCommandSelected && textPart ? `${IMAGE_GEN_TILE_PROMPT_PREFIX}${textPart}` : textPart
    const attachmentPart = buildAttachmentMessageBlocks(pendingAttachments)
    const baseContent = [messageText, attachmentPart].filter(Boolean).join('\n\n')
    const content = excelCommandSelected ? `${EXCEL_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim() : baseContent
    const pastedImageEntries = pendingAttachments.filter(
      (entry): entry is PendingAttachment & { kind: 'pasted-image'; previewDataUrl: string } =>
        entry.kind === 'pasted-image' && typeof entry.previewDataUrl === 'string' && entry.previewDataUrl.length > 0,
    )
    if (pastedImageEntries.length > 0) {
      setSentPastedImagePreviews((prev) => {
        const next = { ...prev }
        for (const item of pastedImageEntries) {
          next[item.id] = item.previewDataUrl
        }
        return next
      })
    }
    setDraft('')
    setShowSlashMenu(false)
    setExcelCommandSelected(false)
    setImageGenCommandSelected(false)
    setPendingAttachments([])
    await onSendMessage(content)
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue)
    if (excelCommandSelected || imageGenCommandSelected) {
      setShowSlashMenu(false)
      return
    }
    const withoutTrailingSpaces = nextValue.replace(/\s+$/, '')
    const shouldShow = !isMobileComposer && /(^|\s)\/$/.test(withoutTrailingSpaces)
    setShowSlashMenu(shouldShow)
    if (shouldShow) {
      setSlashMenuHighlightIndex(0)
    }
  }

  function handleSelectExcelSlashCommand() {
    setExcelCommandSelected(true)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectImageSlashCommand() {
    setImageGenCommandSelected(true)
    setExcelCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectExcelQuickTile() {
    setExcelCommandSelected(true)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleSelectImageQuickTile() {
    setImageGenCommandSelected(true)
    setExcelCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleAttachComposerButtonClick() {
    if (isSending || isAttachingFiles || tokenLimitReached) {
      return
    }
    if (isMobileComposer) {
      inputRef.current?.blur()
      setAttachComposerSheetOpen(true)
      return
    }
    fileInputRef.current?.click()
  }

  function handleComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashMenuHighlightIndex((i) => Math.min(SLASH_MENU_ITEM_COUNT - 1, i + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashMenuHighlightIndex((i) => Math.max(0, i - 1))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowSlashMenu(false)
        setDraft((prev) => prev.replace(/\/$/, ''))
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (slashMenuHighlightIndex === 0) {
          handleSelectExcelSlashCommand()
        } else {
          handleSelectImageSlashCommand()
        }
        return
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    const form = event.currentTarget.form
    if (!form || tokenLimitReached || isSending || isAttachingFiles) {
      return
    }
    if (!draft.trim() && pendingAttachments.length === 0) {
      return
    }
    form.requestSubmit()
  }

  async function handleAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || isSending || isAttachingFiles || tokenLimitReached) {
      return
    }

    await attachFiles(Array.from(fileList))
  }

  async function attachFiles(files: File[]) {
    if (files.length === 0 || isSending || isAttachingFiles || tokenLimitReached) {
      return
    }

    setIsAttachingFiles(true)
    try {
      const nextAttachments: PendingAttachment[] = []

      for (const file of files) {
        const text = await extractLearningMaterialText(file)
        const excerpt = text.trim().slice(0, 1400)
        nextAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: excerpt,
          kind: 'file',
        })
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments])
    } finally {
      setIsAttachingFiles(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (!isMobileComposer) {
        inputRef.current?.focus({ preventScroll: true })
      }
    }
  }

  function handleComposePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (isSending || isAttachingFiles || tokenLimitReached) {
      return
    }
    const clipboardFiles = Array.from(event.clipboardData?.files ?? [])
    const imageFiles = clipboardFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      return
    }
    event.preventDefault()
    void (async () => {
      if (isSending || isAttachingFiles || tokenLimitReached) {
        return
      }
      setIsAttachingFiles(true)
      try {
        const imageAttachments: PendingAttachment[] = []
        for (const file of imageFiles) {
          const [text, previewDataUrl] = await Promise.all([extractLearningMaterialText(file), readFileAsDataUrl(file)])
          imageAttachments.push({
            id: crypto.randomUUID(),
            name: file.name || `image-${Date.now()}.png`,
            content: text.trim().slice(0, 1400),
            kind: 'pasted-image',
            previewDataUrl,
          })
        }
        setPendingAttachments((prev) => [...prev, ...imageAttachments])
      } finally {
        setIsAttachingFiles(false)
        if (!isMobileComposer) {
          inputRef.current?.focus({ preventScroll: true })
        }
      }
    })()
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  function extractPastedImageIdsFromContent(content: string): string[] {
    const regex = /\[(?:BildData|Bild):([^:\]]+)(?::[^\]]+)?\][\s\S]*?\[\/(?:BildData|Bild)\]/g
    const ids = new Set<string>()
    let match: RegExpExecArray | null = regex.exec(content)
    while (match) {
      const id = String(match[1] ?? '').trim()
      if (id) {
        ids.add(id)
      }
      match = regex.exec(content)
    }
    return [...ids]
  }

  function stripAttachmentBlocksForDisplay(content: string): string {
    return content
      .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
      .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
      .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const thinkingClarifyOverlay =
    thinkingClarifyDialog?.kind === 'structured' ? (
      <ThinkingClarifyModal
        key={thinkingClarifyDialog.messageId}
        payload={thinkingClarifyDialog.payload}
        introMarkdown={thinkingClarifyDialog.introMarkdown}
        onDismiss={onDismissThinkingClarify}
        onSubmit={(text) => {
          void onSubmitThinkingClarifyAnswer(text)
        }}
      />
    ) : thinkingClarifyDialog?.kind === 'freeText' ? (
      <ThinkingClarifyFreeTextModal
        key={thinkingClarifyDialog.messageId}
        previewText={thinkingClarifyDialog.previewText}
        onDismiss={onDismissThinkingClarify}
        onSubmit={(text) => {
          void onSubmitThinkingClarifyAnswer(text)
        }}
      />
    ) : null

  const quickTilesEl =
    tokenLimitReached ? null : (
      <div className="chat-quick-tiles" role="group" aria-label="Schnellaktionen">
        <button
          type="button"
          className={`chat-quick-tile${excelCommandSelected ? ' is-active' : ''}`}
          onClick={handleSelectExcelQuickTile}
        >
          <span className="chat-quick-tile-icon-wrap" aria-hidden>
            <img src={greenFileIcon} alt="" />
          </span>
          <span className="chat-quick-tile-text">
            <span className="chat-quick-tile-title">Excel</span>
            <span className="chat-quick-tile-sub">Tabelle planen &amp; exportieren</span>
          </span>
        </button>
        <button
          type="button"
          className={`chat-quick-tile${imageGenCommandSelected ? ' is-active' : ''}`}
          onClick={handleSelectImageQuickTile}
        >
          <span className="chat-quick-tile-icon-wrap" aria-hidden>
            <img className="chat-quick-tile-icon--landscape" src={landscapePng} alt="" />
          </span>
          <span className="chat-quick-tile-text">
            <span className="chat-quick-tile-title">Bilder</span>
            <span className="chat-quick-tile-sub">KI-Bild aus deiner Beschreibung — ohne Sprachbefehl</span>
          </span>
        </button>
      </div>
    )

  const composerAttachSheet = (
    <ActionBottomSheet
      open={attachComposerSheetOpen}
      onClose={() => setAttachComposerSheetOpen(false)}
      title="Einfügen"
      ariaLabel="Bilder, Excel oder Datei wählen"
      actions={[
        {
          id: 'bilder',
          label: 'Bilder',
          actionClassName: 'action-bottom-sheet-action--compose-bilder',
          onClick: () => {
            handleSelectImageQuickTile()
          },
        },
        {
          id: 'excel',
          label: 'Excel',
          actionClassName: 'action-bottom-sheet-action--compose-excel',
          onClick: () => {
            handleSelectExcelQuickTile()
          },
        },
        {
          id: 'anhang',
          label: 'Datei anhängen',
          iconSrc: attachmentIcon,
          onClick: () => {
            fileInputRef.current?.click()
          },
        },
      ]}
    />
  )

  if (isEmptyState) {
    return (
      <section className={`chat-panel is-empty${tokenLimitReached ? ' has-limit-banner' : ''}`}>
        {tokenLimitReached ? (
          <p className="chat-limit-banner" role="alert">
            Dein Token-Limit für heute ist erreicht. Du kannst morgen wieder schreiben.
          </p>
        ) : null}
        <div className="chat-empty-compose">
          <h2 className="chat-empty-title">
            <span className="chat-empty-title-greet">Hallo {greetingName},</span>
            <span className="chat-empty-title-ask">Wie kann ich dir heute helfen?</span>
          </h2>
          {error ? <p className="error-text">{error}</p> : null}
          {thinkingClarifyOverlay}
          <form
            className={`chat-input-row is-centered chat-input-row--stacked${isSending ? ' is-sending' : ''}`}
            onSubmit={handleSubmit}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="chat-file-input-hidden"
              onChange={(event) => {
                void handleAttachFiles(event.target.files)
              }}
            />
            <div className="chat-left-actions">
              <button
                type="button"
                className="chat-attach-button"
                disabled={isSending || isAttachingFiles || tokenLimitReached}
                aria-label={isMobileComposer ? 'Einfügen: Bilder, Excel oder Datei' : 'Datei anhängen'}
                onClick={handleAttachComposerButtonClick}
              >
                <img className="ui-icon chat-send-icon" src={attachmentIcon} alt="" aria-hidden="true" />
              </button>
              {showComposerModelPicker ? (
                <ChatComposerModelPicker
                  value={composerModelId}
                  onChange={onComposerModelChange}
                  disabled={isSending || tokenLimitReached}
                />
              ) : null}
              {showReplyModePicker ? (
                <ChatComposerReplyModePicker
                  value={chatReplyMode}
                  onChange={onChatReplyModeChange}
                  disabled={isSending || tokenLimitReached}
                />
              ) : null}
              <ChatComposerThinkingModePicker
                value={chatThinkingMode}
                onChange={onChatThinkingModeChange}
                disabled={isSending || tokenLimitReached}
              />
            </div>
            <div className="chat-input-compose">
              {pendingAttachments.length > 0 || imageGenCommandSelected || excelCommandSelected ? (
                <div className="chat-attachment-chips" aria-label="Anhänge">
                  {imageGenCommandSelected ? (
                    <button
                      type="button"
                      className="chat-compose-mode-badge chat-compose-mode-badge--image"
                      title="Bildgenerierung aktiv (klicken zum Entfernen)"
                      aria-label="Bildgenerierung entfernen"
                      onClick={() => setImageGenCommandSelected(false)}
                    >
                      <img className="chat-compose-mode-badge-icon" src={landscapePng} alt="" aria-hidden />
                      <span className="chat-compose-mode-badge-label">Bilder</span>
                    </button>
                  ) : null}
                  {excelCommandSelected ? (
                    <button
                      type="button"
                      className="chat-compose-mode-badge chat-compose-mode-badge--excel"
                      title="Excel-Befehl aktiv (klicken zum Entfernen)"
                      aria-label="Excel-Befehl entfernen"
                      onClick={() => setExcelCommandSelected(false)}
                    >
                      <img className="chat-compose-mode-badge-icon" src={greenFileIcon} alt="" aria-hidden="true" />
                      <span className="chat-compose-mode-badge-label">Excel</span>
                    </button>
                  ) : null}
                  {pendingAttachments.map((item) => (
                    item.kind === 'pasted-image' && item.previewDataUrl ? (
                      <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image">
                        <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
                        <span
                          role="button"
                          tabIndex={0}
                          className="chat-attachment-chip-remove"
                          aria-label={`${item.name} entfernen`}
                          onClick={() => removeAttachment(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              removeAttachment(item.id)
                            }
                          }}
                        >
                          ×
                        </span>
                      </span>
                    ) : (
                      <span key={item.id} className="chat-attachment-chip">
                        <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" aria-hidden="true" />
                        <span className="chat-attachment-chip-name">{item.name}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="chat-attachment-chip-remove"
                          aria-label={`${item.name} entfernen`}
                          onClick={() => removeAttachment(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              removeAttachment(item.id)
                            }
                          }}
                        >
                          ×
                        </span>
                      </span>
                    )
                  ))}
                </div>
              ) : null}
              <div className="chat-input-field">
                <div className="chat-input-field-grow">
                  {showSlashMenu ? (
                    <div className="chat-slash-menu thread-menu" role="menu" aria-label="Slash Befehle">
                      <button
                        type="button"
                        className={`thread-menu-item${slashMenuHighlightIndex === 0 ? ' is-selected' : ''}`}
                        role="menuitem"
                        onMouseDown={(event) => {
                          event.preventDefault()
                        }}
                        onMouseEnter={() => setSlashMenuHighlightIndex(0)}
                        onClick={handleSelectExcelSlashCommand}
                      >
                        Excel
                      </button>
                      <button
                        type="button"
                        className={`thread-menu-item thread-menu-item--slash-image${
                          slashMenuHighlightIndex === 1 ? ' is-selected' : ''
                        }`}
                        role="menuitem"
                        onMouseDown={(event) => {
                          event.preventDefault()
                        }}
                        onMouseEnter={() => setSlashMenuHighlightIndex(1)}
                        onClick={handleSelectImageSlashCommand}
                      >
                        Bilder
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    rows={1}
                    value={draft}
                    onChange={(event) => handleDraftChange(event.target.value)}
                    onKeyDown={handleComposeKeyDown}
                    onPaste={handleComposePaste}
                    placeholder={composePlaceholder}
                    disabled={isSending || tokenLimitReached}
                    aria-multiline="true"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={
                tokenLimitReached ||
                isAttachingFiles ||
                (!cancelWhileSending && !draft.trim() && pendingAttachments.length === 0)
              }
              aria-busy={showDuringSendIcon}
              aria-label={
                tokenLimitReached
                  ? 'Token-Limit erreicht'
                  : cancelWhileSending
                    ? 'Antwort abbrechen'
                    : 'Nachricht senden'
              }
              onClick={handleComposerSendClick}
            >
              <img
                className={`ui-icon chat-send-icon${showDuringSendIcon ? ' chat-send-icon--during' : ''}`}
                src={showDuringSendIcon ? duringIcon : sendIcon}
                alt=""
                aria-hidden="true"
              />
            </button>
          </form>
          <p className="chat-input-hint">
            Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
          </p>
          {quickTilesEl}
          {composerAttachSheet}
        </div>
      </section>
    )
  }

  return (
    <section className={`chat-panel${tokenLimitReached ? ' has-limit-banner' : ''}`}>
      {tokenLimitReached ? (
        <p className="chat-limit-banner" role="alert">
          Dein Token-Limit für heute ist erreicht. Du kannst morgen wieder schreiben.
        </p>
      ) : null}
      <div className="chat-messages" ref={messagesScrollRef}>
        <div className="chat-messages-inner">
        {messageList.map((message) => {
          const rawContent = safeMessageContent(message.content)
          const isAssistant = message.role === 'assistant'
          const parsed = isAssistant ? parseInteractiveContentWithFallback(rawContent) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = safeMessageContent(animatedAssistantContent[message.id] ?? rawContent)
          /** Nach Excel-Export: gespeicherten Text nutzen (ohne Spec), nicht den Animations-Puffer mit altem JSON. */
          const baseAssistantForDisplay = message.metadata?.liveStream
            ? stripExcelSpecBlock(rawContent)
            : message.metadata?.excelExport
              ? rawContent
              : animatedContent
          const rawAssistantDisplay = hasInteractiveQuiz ? parsed?.cleanText || '' : baseAssistantForDisplay
          /** JSON-Spec im Chat nie anzeigen — nur Einleitungstext vor <<<STRATON_EXCEL_SPEC_JSON>>>. */
          const assistantAfterExcel = stripExcelSpecBlock(rawAssistantDisplay)
          const thinkingClarifyStreaming =
            isAssistant &&
            chatThinkingMode === 'thinking' &&
            Boolean(message.metadata?.liveStream) &&
            !messageContainsCompleteThinkingClarifyBlock(rawContent)
          /** Immer Clarify-JSON ausblenden, wenn der Block gültig ist — nicht an den aktuellen Composer-Modus koppeln (nach Reload oft «normal»). */
          const displayContent = isAssistant
            ? stripThinkingClarifyMarkersForDisplay(assistantAfterExcel)
            : stripAttachmentBlocksForDisplay(rawContent)
          const pastedImageIds = message.role === 'user' ? extractPastedImageIdsFromContent(rawContent) : []
          const savedDateiNames =
            message.role === 'user' ? extractDateiFileNamesFromContent(rawContent) : []
          const hasReloadedImageSrc =
            message.role === 'user' &&
            pastedImageIds.some(
              (id) =>
                Boolean(sentPastedImagePreviews[id]) ||
                Boolean(extractBildDataUrlFromStoredContent(rawContent, id)),
            )
          const showExcelFallbackText =
            isAssistant &&
            Boolean(message.metadata?.excelExport) &&
            !String(displayContent ?? '').trim()
          const isStreamingAssistant =
            isAssistant &&
            !hasInteractiveQuiz &&
            !message.metadata?.excelExport &&
            (Boolean(message.metadata?.liveStream) ||
              animatedContent.length < rawContent.length)
          const isLatestMessage = message.id === messageList[messageList.length - 1]?.id

          return (
            <article
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${isStreamingAssistant ? ' chat-message--streaming' : ''}${isLatestMessage ? ' chat-message--latest' : ''}`}
            >
              {isAssistant ? <strong className="chat-message-author">Straton AI</strong> : null}
              {hasReloadedImageSrc ? (
                <div className="chat-user-inline-images" aria-label="Eingefügte Bilder">
                  {pastedImageIds.map((imageId) => {
                    const src =
                      sentPastedImagePreviews[imageId] ??
                      extractBildDataUrlFromStoredContent(rawContent, imageId)
                    if (!src) {
                      return null
                    }
                    return <img key={imageId} className="chat-user-inline-image" src={src} alt="Eingefügtes Bild" />
                  })}
                </div>
              ) : null}
              {message.role === 'user' && savedDateiNames.length > 0 ? (
                <div className="chat-user-saved-attachments chat-attachment-chips" aria-label="Angehängte Dateien">
                  {savedDateiNames.map((name, fileIndex) => (
                    <span
                      key={`${message.id}-datei-${fileIndex}`}
                      className="chat-attachment-chip chat-attachment-chip--saved-file"
                    >
                      <span className="chat-attachment-chip-icon" aria-hidden="true">
                        <img src={fileIcon} alt="" width={15} height={15} />
                      </span>
                      <span className="chat-attachment-chip-name">{name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {thinkingClarifyStreaming ? (
                <p className="chat-thinking-stream-hint" role="status">
                  KI formuliert eine Rückfrage…
                </p>
              ) : displayContent ? (
                isAssistant ? (
                  <div className="chat-message-body chat-message-body--rich">{renderAssistantRichContent(displayContent)}</div>
                ) : (
                  <p>{renderInlineMarkdown(displayContent)}</p>
                )
              ) : null}
              {showExcelFallbackText ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Die Excel-Datei ist bereit — nutze den Download-Button unten.
                </p>
              ) : null}

              {message.metadata?.excelExport ? (
                <div className="chat-excel-download">
                  <button
                    type="button"
                    className="chat-excel-download-button"
                    disabled={excelDownloadBusyId === message.id}
                    onClick={() => {
                      void downloadExcelExport(message)
                    }}
                  >
                    {excelDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Excel herunterladen'}
                  </button>
                </div>
              ) : null}

              {hasInteractiveQuiz ? (
                <section className="interactive-quiz-block" aria-label="Interaktive Prüfungsfragen">
                  {parsed?.quiz?.title ? <h4 className="interactive-quiz-title">{parsed.quiz.title}</h4> : null}

                  {parsed?.quiz?.questions.map((question) => {
                    const current = getQuizAnswerState(message.id, question.id)
                    const key = getQuizAnswerKey(message.id, question.id)
                    const isChecking = quizChecksInProgress[key] === true
                    const statusClass =
                      current.status === 'correct'
                        ? 'is-correct'
                        : current.status === 'incorrect'
                          ? 'is-incorrect'
                          : ''

                    return (
                      <div key={question.id} className={`interactive-quiz-question ${statusClass}`}>
                        <p className="interactive-quiz-prompt">{question.prompt}</p>
                        <div className="interactive-quiz-answer-row">
                          <input
                            className="interactive-quiz-answer-input"
                            type="text"
                            value={current.value}
                            onChange={(event) =>
                              updateQuizAnswerValue(message.id, question.id, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void checkQuizAnswer(message, question.id)
                              }
                            }}
                            placeholder="Deine Antwort..."
                            disabled={isChecking}
                          />
                          <button
                            type="button"
                            className={`interactive-quiz-check ${statusClass}`}
                            aria-label="Antwort prüfen"
                            onClick={() => {
                              void checkQuizAnswer(message, question.id)
                            }}
                            disabled={!current.value.trim() || isChecking}
                          >
                            {isChecking ? '…' : '○'}
                          </button>
                        </div>
                        {current.feedback ? (
                          <p className={`interactive-quiz-feedback ${statusClass}`}>{current.feedback}</p>
                        ) : null}
                      </div>
                    )
                  })}
                </section>
              ) : null}
            </article>
          )
        })}
          {showPendingAssistantRow ? (
            <div
              className={`chat-message is-assistant chat-message--pending${
                pendingImageGeneration
                  ? ' chat-message--pending-image'
                  : pendingExcelGeneration
                    ? ' chat-message--pending-excel'
                    : ''
              }`}
              aria-live="polite"
              aria-busy="true"
            >
              <strong className="chat-message-author">Straton AI</strong>
              {pendingImageGeneration ? (
                <div
                  className="chat-image-gen-loader-panel"
                  role="status"
                  aria-label="Bild wird generiert"
                >
                  <div
                    className="chat-image-gen-matrix"
                    style={{
                      gridTemplateColumns: `repeat(${IMAGE_GEN_MATRIX_SIZE}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${IMAGE_GEN_MATRIX_SIZE}, minmax(0, 1fr))`,
                    }}
                    aria-hidden
                  >
                    {IMAGE_GEN_MATRIX_DOTS.map(({ key, delayMs }) => (
                      <span
                        key={key}
                        className="chat-image-gen-matrix-dot"
                        style={{ animationDelay: `${delayMs}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : pendingExcelGeneration ? (
                <div
                  className="chat-excel-gen-loader-panel"
                  role="status"
                  aria-label="Excel wird erstellt"
                >
                  <div
                    className="chat-excel-gen-matrix"
                    style={{
                      gridTemplateColumns: `repeat(${EXCEL_GEN_MATRIX_COLS}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${EXCEL_GEN_MATRIX_ROWS}, minmax(0, 1fr))`,
                    }}
                    aria-hidden
                  >
                    {EXCEL_GEN_MATRIX_CELLS.map(({ key, delayMs }) => (
                      <span
                        key={key}
                        className="chat-excel-gen-matrix-cell"
                        style={{ animationDelay: `${delayMs}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chat-pending-loader" role="status">
                  <span className="chat-pending-loader-dot" />
                  <span className="chat-pending-loader-dot" />
                  <span className="chat-pending-loader-dot" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="chat-composer-stack">
        {thinkingClarifyOverlay}
        {composerAttachSheet}
        <form
          className={`chat-input-row chat-input-row--stacked${isSending ? ' is-sending' : ''}`}
          onSubmit={handleSubmit}
        >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-file-input-hidden"
          onChange={(event) => {
            void handleAttachFiles(event.target.files)
          }}
        />
        <div className="chat-left-actions">
          <button
            type="button"
            className="chat-attach-button"
            disabled={isSending || isAttachingFiles || tokenLimitReached}
            aria-label={isMobileComposer ? 'Einfügen: Bilder, Excel oder Datei' : 'Datei anhängen'}
            onClick={handleAttachComposerButtonClick}
          >
            <img className="ui-icon chat-send-icon" src={attachmentIcon} alt="" aria-hidden="true" />
          </button>
          {showComposerModelPicker ? (
            <ChatComposerModelPicker
              value={composerModelId}
              onChange={onComposerModelChange}
              disabled={isSending || tokenLimitReached}
            />
          ) : null}
          {showReplyModePicker ? (
            <ChatComposerReplyModePicker
              value={chatReplyMode}
              onChange={onChatReplyModeChange}
              disabled={isSending || tokenLimitReached}
            />
          ) : null}
          <ChatComposerThinkingModePicker
            value={chatThinkingMode}
            onChange={onChatThinkingModeChange}
            disabled={isSending || tokenLimitReached}
          />
        </div>
        <div className="chat-input-compose">
          {pendingAttachments.length > 0 || imageGenCommandSelected || excelCommandSelected ? (
            <div className="chat-attachment-chips" aria-label="Anhänge">
              {imageGenCommandSelected ? (
                <button
                  type="button"
                  className="chat-compose-mode-badge chat-compose-mode-badge--image"
                  title="Bildgenerierung aktiv (klicken zum Entfernen)"
                  aria-label="Bildgenerierung entfernen"
                  onClick={() => setImageGenCommandSelected(false)}
                >
                  <img className="chat-compose-mode-badge-icon" src={landscapePng} alt="" aria-hidden />
                  <span className="chat-compose-mode-badge-label">Bilder</span>
                </button>
              ) : null}
              {excelCommandSelected ? (
                <button
                  type="button"
                  className="chat-compose-mode-badge chat-compose-mode-badge--excel"
                  title="Excel-Befehl aktiv (klicken zum Entfernen)"
                  aria-label="Excel-Befehl entfernen"
                  onClick={() => setExcelCommandSelected(false)}
                >
                  <img className="chat-compose-mode-badge-icon" src={greenFileIcon} alt="" aria-hidden="true" />
                  <span className="chat-compose-mode-badge-label">Excel</span>
                </button>
              ) : null}
              {pendingAttachments.map((item) => (
                item.kind === 'pasted-image' && item.previewDataUrl ? (
                  <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image">
                    <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
                    <span
                      role="button"
                      tabIndex={0}
                      className="chat-attachment-chip-remove"
                      aria-label={`${item.name} entfernen`}
                      onClick={() => removeAttachment(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          removeAttachment(item.id)
                        }
                      }}
                    >
                      ×
                    </span>
                  </span>
                ) : (
                  <span key={item.id} className="chat-attachment-chip">
                    <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" aria-hidden="true" />
                    <span className="chat-attachment-chip-name">{item.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="chat-attachment-chip-remove"
                      aria-label={`${item.name} entfernen`}
                      onClick={() => removeAttachment(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          removeAttachment(item.id)
                        }
                      }}
                    >
                      ×
                    </span>
                  </span>
                )
              ))}
            </div>
          ) : null}
          <div className="chat-input-field">
            <div className="chat-input-field-grow">
              {showSlashMenu ? (
                <div className="chat-slash-menu thread-menu" role="menu" aria-label="Slash Befehle">
                  <button
                    type="button"
                    className={`thread-menu-item${slashMenuHighlightIndex === 0 ? ' is-selected' : ''}`}
                    role="menuitem"
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onMouseEnter={() => setSlashMenuHighlightIndex(0)}
                    onClick={handleSelectExcelSlashCommand}
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    className={`thread-menu-item thread-menu-item--slash-image${
                      slashMenuHighlightIndex === 1 ? ' is-selected' : ''
                    }`}
                    role="menuitem"
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onMouseEnter={() => setSlashMenuHighlightIndex(1)}
                    onClick={handleSelectImageSlashCommand}
                  >
                    Bilder
                  </button>
                </div>
              ) : null}
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={1}
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={handleComposeKeyDown}
                onPaste={handleComposePaste}
                placeholder={composePlaceholder}
                disabled={isSending || tokenLimitReached}
                aria-multiline="true"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={
            tokenLimitReached ||
            isAttachingFiles ||
            (!cancelWhileSending && !draft.trim() && pendingAttachments.length === 0)
          }
          aria-busy={showDuringSendIcon}
          aria-label={
            tokenLimitReached
              ? 'Token-Limit erreicht'
              : cancelWhileSending
                ? 'Antwort abbrechen'
                : 'Nachricht senden'
          }
          onClick={handleComposerSendClick}
        >
          <img
            className={`ui-icon chat-send-icon${showDuringSendIcon ? ' chat-send-icon--during' : ''}`}
            src={showDuringSendIcon ? duringIcon : sendIcon}
            alt=""
            aria-hidden="true"
          />
        </button>
        </form>
        <p className="chat-input-hint">
          Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
        </p>
      </div>
    </section>
  )
}
