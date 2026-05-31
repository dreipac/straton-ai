import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { useToast } from '../../../components/toast/ToastProvider'
import { ActionBottomSheet } from '../../../components/ui/bottom-sheet/ActionBottomSheet'
import { useGlassPillTouchFeedback } from '../../../hooks/useGlassPillTouchFeedback'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMobileComposerCompact } from '../../../hooks/useMobileComposerCompact'
import duringIcon from '../../../assets/icons/during.svg'
import landscapePng from '../../../assets/png/Landscape.png'
import sendIcon from '../../../assets/icons/send.svg'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { EXCEL_EXPORT_COMMAND_MARKER } from '../constants/excelExportPrompt'
import { WORD_EXPORT_COMMAND_MARKER } from '../constants/wordExportPrompt'
import { PDF_EXPORT_COMMAND_MARKER } from '../constants/pdfExportPrompt'
import { IMAGE_GEN_TILE_PROMPT_PREFIX } from '../constants/imageGenTile'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import { stripExcelSpecBlock } from '../excel/excelSpec'
import type { ChatMessage, InstantAnalyzeDebugMeta } from '../types'
import { renderInlineMarkdown } from '../utils/markdownInline'
import {
  renderAssistantRichContent,
  type AssistantRichContentOptions,
} from '../utils/renderAssistantRichContent'
import {
  buildUserMessageWithSectionRef,
  parseSectionRefFromUserContent,
  type AssistantSectionReference,
} from '../utils/assistantSectionReply'
import {
  ChatComposerReplyQuoteSlot,
  ChatMessageReplyQuotePreview,
} from './ChatComposerReplyQuoteBar'
import { ChatInstantAnalyzeDebugPanel } from './ChatInstantAnalyzeDebugPanel'
import { ChatPendingReplyLoader } from './ChatPendingReplyLoader'
import {
  canFinalizeWordExportFromThread,
  extractLeadingBannerTitleFromOutlineText,
  normalizeHeadingLevelsForWord,
  tryHeuristicWordOutlineFromPlainText,
  usesStratonWordMarkdownConvention,
  resolveWordOutlinePresentation,
  isLikelyDocumentOutlinePayload,
} from '../utils/wordOutline'
import { canFinalizePdfExportFromThread } from '../pdf/pdfOutline'
import { WordOutlinePaper, WordOutlinePaperBuilding } from './WordOutlinePaper'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'
import { ChatEmptyGreetingTitle } from './ChatEmptyGreetingTitle'
import { getChatEmptyGreeting } from '../utils/chatEmptyGreeting'
import { readImageFileAsVisionDataUrl } from '../utils/imageVisionNormalize'
import { extractLearningMaterialText, isChatVisionImageFile } from '../../learn/utils/documentParser'
import { hapticLightImpact } from '../../../utils/haptics'
import type { ChatComposerModelId } from '../constants/chatComposerModels'
import type { ChatReplyMode } from '../constants/chatReplyMode'
import type { ChatThinkingMode } from '../constants/chatThinkingMode'
import { ChatComposerAttachMenu } from './ChatComposerAttachMenu'
import { ChatComposerModelPicker } from './ChatComposerModelPicker'
import { ChatComposerThinkingModePicker } from './ChatComposerThinkingModePicker'
import { ThinkingClarifyModal } from './ThinkingClarifyModal'
import { useUserMessageLongPress } from '../hooks/useUserMessageLongPress'
import {
  requestRevealComposerAboveKeyboard,
  requestVisualKeyboardInsetSync,
  useVisualKeyboardInset,
  waitForVisualKeyboardReady,
} from '../hooks/useVisualKeyboardInset'
import { extractUserMessageCopyText } from '../utils/chatMessageCopy'
import { copyTextToClipboard } from '../../../utils/copyTextToClipboard'
import type { ThinkingClarifyDialogState } from '../utils/thinkingClarify'
import {
  messageContainsCompleteThinkingClarifyBlock,
  stripThinkingClarifyMarkersForDisplay,
} from '../utils/thinkingClarify'
import { matchExplicitImageGenerationRequest } from '../utils/imageGenerationIntent'
import { ThinkingClarifyFreeTextModal } from './ThinkingClarifyFreeTextModal'
import { QuizFormatChoiceModal } from './QuizFormatChoiceModal'
import {
  detectExplicitQuizFormatInText,
  shouldPromptQuizFormatChoice,
  type QuizFormatChoice,
} from '../utils/quizFormatChoice'
import { ChatUserMessageMenuSelect } from './ChatUserMessageMenuSelect'
import { getChatSendPhaseLabel, type ChatSendPhaseState } from '../constants/chatSendPhase'
import { DEFAULT_THINKING_CREDIT_MAX } from '../../auth/constants/thinkingCredits'

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

/** Einträge im Slash-Menü (Excel, Word, PDF, Bilder) — für Pfeiltasten / Enter */
const SLASH_MENU_ITEM_COUNT = 4

/** Gleicher Breakpoint wie `chat.css` (@media max-width 860px) — Slash-Menü aus, Anhang-Bottom-Sheet */
const MOBILE_COMPOSER_MQ = '(max-width: 860px)'

/** Mobil: Touch-Scale max. ~560ms nach Loslassen + Rück-Transition ~580ms — During-Icon erst danach */
const MOBILE_SEND_DURING_ICON_DELAY_MS = 1100

type ChatWindowProps = {
  /** Aktiver Thread — wechsel setzt Stream-Zustand zurück (sonst falsche Animation). */
  threadKey: string | null
  messages: ChatMessage[]
  isSending: boolean
  /** Smart Instant: Einordnung / automatische Websuche vor dem Stream. */
  sendPhase?: ChatSendPhaseState
  /** Superadmin + Admin-Center-Schalter: Einordnung unter User-Nachrichten. */
  showInstantAnalyzeDebug?: boolean
  /** Laufende Einordnung (vor Speichern der User-Nachricht). */
  liveInstantAnalyzeDebug?: InstantAnalyzeDebugMeta | null
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
  onSendMessage: (content: string, opts?: { quizFormat?: QuizFormatChoice }) => Promise<void>
  /** Thinking-Modus: verbleibendes Guthaben (Superadmin: auslassen). */
  thinkingCreditsRemaining?: number
  thinkingCreditMax?: number
  thinkingDailyGrant?: number | null
  /** Thinking-Guthaben leer — Senden gesperrt. */
  thinkingCreditsBlocked?: boolean
  /** Laufender KI-Stream: Klick auf den During-Button bricht die Antwort ab. */
  onCancelSend?: () => void
  /** Nach /Word: Word-Datei erzeugen, wenn die Papier-Vorschau passt. */
  onFinalizeWordDocument?: () => void | Promise<void>
  wordFinalizeBusy?: boolean
  /** Nach /PDF: PDF-Datei erzeugen, wenn die Papier-Vorschau passt. */
  onFinalizePdfDocument?: () => void | Promise<void>
  pdfFinalizeBusy?: boolean
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

/**
 * Desktop liefert eingefügte Bilder oft in `clipboardData.files`.
 * iOS Safari oft nur über `items[].getAsFile()` — ohne diesen Zweig bleibt die Liste leer.
 */
function getImageFilesFromClipboard(data: DataTransfer | null | undefined): File[] {
  if (!data) {
    return []
  }
  const fromFiles = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
  if (fromFiles.length > 0) {
    return fromFiles
  }
  const out: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') {
      continue
    }
    if (item.type === 'image/svg+xml') {
      continue
    }
    const file = item.getAsFile()
    if (!file) {
      continue
    }
    if (item.type.startsWith('image/')) {
      out.push(file)
      continue
    }
    // iOS: Clipboard-Item mit leerem `type`, Dateiname z. B. „image.png“
    if (!item.type && isChatVisionImageFile(file)) {
      out.push(file)
    }
  }
  return out
}

async function buildPastedImagePendingAttachments(files: File[]): Promise<PendingAttachment[]> {
  const imageAttachments: PendingAttachment[] = []
  for (const file of files) {
    /*
     * Kein `extractLearningMaterialText` / Tesseract hier: Das würde jedes iPhone-Foto (hohe Auflösung)
     * clientseitig mit OCR blockieren und oft 10–30+ Sekunden dauern — die KI bekommt das Bild ohnehin
     * als `[BildData]` (Vision).
     */
    const previewDataUrl = await readImageFileAsVisionDataUrl(file)
    imageAttachments.push({
      id: crypto.randomUUID(),
      name: file.name || `image-${Date.now()}.png`,
      content: '',
      kind: 'pasted-image',
      previewDataUrl,
    })
  }
  return imageAttachments
}

export function ChatWindow({
  threadKey,
  messages,
  isSending,
  sendPhase = null,
  showInstantAnalyzeDebug = false,
  liveInstantAnalyzeDebug = null,
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
  thinkingCreditsRemaining,
  thinkingCreditMax,
  thinkingDailyGrant,
  thinkingCreditsBlocked = false,
  onCancelSend,
  onFinalizeWordDocument,
  wordFinalizeBusy = false,
  onFinalizePdfDocument,
  pdfFinalizeBusy = false,
}: ChatWindowProps) {
  const messageList = Array.isArray(messages) ? messages : EMPTY_CHAT_MESSAGES
  const [draft, setDraft] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuHighlightIndex, setSlashMenuHighlightIndex] = useState(0)
  const [attachComposerSheetOpen, setAttachComposerSheetOpen] = useState(false)
  const isMobileComposer = useMediaQuery(MOBILE_COMPOSER_MQ)
  const mobileComposerCompact = useMobileComposerCompact()
  const isMobileCompactComposer = isMobileComposer && mobileComposerCompact
  const { push: pushToast } = useToast()
  const userMessageLongPress = useUserMessageLongPress(isMobileComposer)
  const mobileComposerSendTouch = useGlassPillTouchFeedback()
  const mobileComposerMessageBoxTouch = useGlassPillTouchFeedback()
  const mobileSendStartedWithTouchRef = useRef(false)
  const [mobileDuringIconReady, setMobileDuringIconReady] = useState(false)
  const [excelCommandSelected, setExcelCommandSelected] = useState(false)
  const [wordCommandSelected, setWordCommandSelected] = useState(false)
  const [pdfCommandSelected, setPdfCommandSelected] = useState(false)
  const [imageGenCommandSelected, setImageGenCommandSelected] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [sentPastedImagePreviews, setSentPastedImagePreviews] = useState<Record<string, string>>({})
  const [imageLightboxSrc, setImageLightboxSrc] = useState<string | null>(null)
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false)
  const imageLightboxClosePendingRef = useRef(false)
  const sectionReplyEmbedCancelRef = useRef<(() => void) | null>(null)
  const [quizFormatPending, setQuizFormatPending] = useState<{ content: string } | null>(null)
  const [composerSectionReply, setComposerSectionReply] = useState<AssistantSectionReference | null>(
    null,
  )
  const isEmptyState = messageList.length === 0
  const emptyChatGreeting = useMemo(() => getChatEmptyGreeting(greetingName), [greetingName])

  useLayoutEffect(() => {
    if (!imageLightboxSrc) {
      setImageLightboxOpen(false)
      return
    }
    imageLightboxClosePendingRef.current = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setImageLightboxOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [imageLightboxSrc])

  function closeImageLightbox() {
    imageLightboxClosePendingRef.current = true
    setImageLightboxOpen(false)
  }

  function handleImageLightboxTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') {
      return
    }
    if (imageLightboxClosePendingRef.current) {
      imageLightboxClosePendingRef.current = false
      setImageLightboxSrc(null)
    }
  }

  useEffect(() => {
    if (!imageLightboxSrc) {
      return
    }
    const onKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        closeImageLightbox()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imageLightboxSrc])
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
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
  const showDuringSendIcon =
    isAssistantReplyStillAnimating ||
    (isSending && (!isMobileComposer || mobileDuringIconReady))

  useEffect(() => {
    if (!isSending) {
      setMobileDuringIconReady(false)
      return
    }
    if (!isMobileComposer) {
      return
    }
    const beganWithTouch = mobileSendStartedWithTouchRef.current
    mobileSendStartedWithTouchRef.current = false
    if (!beganWithTouch) {
      setMobileDuringIconReady(true)
      return
    }
    setMobileDuringIconReady(false)
    const id = window.setTimeout(() => setMobileDuringIconReady(true), MOBILE_SEND_DURING_ICON_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [isSending, isMobileComposer])

  const cancelWhileSending = Boolean(isSending && onCancelSend)

  const composerSendButtonClassName = isMobileComposer
    ? ['new-chat-touch-btn', mobileComposerSendTouch.touchStateClass]
        .filter(Boolean)
        .join(' ')
    : undefined

  const composerSendIconEl = (
    <span
      className={
        isMobileComposer ? 'chat-send-icon-stack new-chat-touch-btn__icon' : 'chat-send-icon-stack'
      }
    >
      <img
        className={`ui-icon chat-send-icon chat-send-icon-stack__layer${showDuringSendIcon ? '' : ' chat-send-icon-stack__layer--on'}`}
        src={sendIcon}
        alt=""
        aria-hidden="true"
      />
      <img
        className={`ui-icon chat-send-icon chat-send-icon--during chat-send-icon-stack__layer${showDuringSendIcon ? ' chat-send-icon-stack__layer--on' : ''}`}
        src={duringIcon}
        alt=""
        aria-hidden="true"
      />
    </span>
  )

  const composerSendButton = (
    <button
      type="submit"
      className={composerSendButtonClassName}
      disabled={
        tokenLimitReached ||
        thinkingCreditsBlocked ||
        isAttachingFiles ||
        (!cancelWhileSending && !draft.trim() && pendingAttachments.length === 0)
      }
      aria-busy={isSending || isAssistantReplyStillAnimating}
      aria-label={
        tokenLimitReached
          ? 'Token-Limit erreicht'
          : thinkingCreditsBlocked
            ? 'Thinking-Guthaben aufgebraucht'
            : cancelWhileSending
              ? 'Antwort abbrechen'
              : 'Nachricht senden'
      }
      onClick={handleComposerSendClick}
      onPointerDown={handleComposerSendPointerDown}
      onPointerUp={mobileComposerSendTouch.touchHandlers.onPointerUp}
      onPointerCancel={mobileComposerSendTouch.touchHandlers.onPointerCancel}
      onPointerLeave={mobileComposerSendTouch.touchHandlers.onPointerLeave}
      onAnimationEnd={mobileComposerSendTouch.touchHandlers.onAnimationEnd}
    >
      {composerSendIconEl}
    </button>
  )

  const composerInputRowTouchHandlers = isMobileComposer
    ? mobileComposerMessageBoxTouch.touchHandlers
    : undefined

  const buildComposerInputRowClass = (centered: boolean) =>
    [
      'chat-input-row',
      centered ? 'is-centered' : '',
      'chat-input-row--stacked',
      isMobileCompactComposer ? 'chat-input-row--mobile-compact' : '',
      chatThinkingMode === 'thinking' ? 'chat-input-row--thinking-mode' : '',
      isSending ? 'is-sending' : '',
      isMobileComposer ? 'tap-spring-surface' : '',
      isMobileComposer ? mobileComposerMessageBoxTouch.touchStateClass : '',
    ]
      .filter(Boolean)
      .join(' ')

  const showComposerInlinePickers = !isMobileCompactComposer

  const attachButtonClassName = [
    'chat-attach-button',
    isMobileCompactComposer ? 'chat-compact-composer-surface' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const composePlaceholder = tokenLimitReached
    ? 'Token-Limit erreicht'
    : thinkingCreditsBlocked
      ? 'Thinking-Guthaben aufgebraucht'
      : 'Straton fragen'

  useEffect(() => {
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setAttachComposerSheetOpen(false)
    sectionReplyEmbedCancelRef.current?.()
    sectionReplyEmbedCancelRef.current = null
    setComposerSectionReply(null)
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

  /** Fokus der Textarea bleibt; globales Tap-Spring wie Sidebar/Topbar (`new-chat-touch-btn`). */
  function handleComposerSendPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.currentTarget.disabled) {
      return
    }
    const touchLike = event.pointerType === 'touch' || event.pointerType === 'pen'
    if (!isMobileComposer || !touchLike) {
      return
    }
    event.preventDefault()
    mobileSendStartedWithTouchRef.current = true
    mobileComposerSendTouch.touchHandlers.onPointerDown(event)
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

  const clearSectionReplyEmbedSchedule = useCallback(() => {
    sectionReplyEmbedCancelRef.current?.()
    sectionReplyEmbedCancelRef.current = null
  }, [])

  const ensureMobileComposerVisible = useCallback(() => {
    if (!isMobileComposer) {
      return
    }
    requestRevealComposerAboveKeyboard()
  }, [isMobileComposer])

  const prepareComposerViewportBeforeKeyboard = useCallback(() => {
    if (!isMobileComposer) {
      return
    }
    const scrollEl = messagesScrollRef.current
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight
    }
    const stack = document.querySelector('.chat-composer-stack')
    if (stack instanceof HTMLElement) {
      stack.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' })
    }
  }, [isMobileComposer])

  const focusComposerForSectionReply = useCallback(
    (options?: { allowScroll?: boolean }) => {
      const input = inputRef.current
      if (!input) {
        return false
      }
      input.focus({ preventScroll: options?.allowScroll !== true })
      if (isMobileComposer) {
        requestVisualKeyboardInsetSync()
      }
      return true
    },
    [isMobileComposer],
  )

  const focusComposerAfterSectionReplyEmbed = useCallback(() => {
    if (!isMobileComposer) {
      focusComposerForSectionReply({ allowScroll: false })
      return
    }
    prepareComposerViewportBeforeKeyboard()
    if (!focusComposerForSectionReply({ allowScroll: true })) {
      return
    }
    sectionReplyEmbedCancelRef.current = waitForVisualKeyboardReady(() => {
      sectionReplyEmbedCancelRef.current = null
      ensureMobileComposerVisible()
      requestAnimationFrame(() => {
        ensureMobileComposerVisible()
        requestVisualKeyboardInsetSync()
      })
    })
  }, [
    ensureMobileComposerVisible,
    focusComposerForSectionReply,
    isMobileComposer,
    prepareComposerViewportBeforeKeyboard,
  ])

  const syncComposerLayoutAfterSectionReplyEmbed = useCallback(() => {
    prepareComposerViewportBeforeKeyboard()
    requestVisualKeyboardInsetSync()
    ensureMobileComposerVisible()
    requestAnimationFrame(() => {
      ensureMobileComposerVisible()
      requestVisualKeyboardInsetSync()
    })
  }, [ensureMobileComposerVisible, prepareComposerViewportBeforeKeyboard])

  const handleSectionReplyEmbedSettled = useCallback(() => {
    syncComposerLayoutAfterSectionReplyEmbed()
  }, [syncComposerLayoutAfterSectionReplyEmbed])

  const beginSectionReplyFromSwipe = useCallback(
    (ref: AssistantSectionReference) => {
      hapticLightImpact()
      clearSectionReplyEmbedSchedule()

      if (!isMobileComposer) {
        setComposerSectionReply(ref)
        focusComposerForSectionReply({ allowScroll: false })
        return
      }

      /*
       * Referenz sofort ins DOM (flushSync), Fokus noch in derselben Swipe-Geste —
       * sonst blockiert iOS die Tastatur (~340ms später). Layout nach Quote-Animation nachziehen.
       */
      flushSync(() => {
        setComposerSectionReply(ref)
      })

      focusComposerForSectionReply({ allowScroll: true })

      sectionReplyEmbedCancelRef.current = waitForVisualKeyboardReady(() => {
        sectionReplyEmbedCancelRef.current = null
        syncComposerLayoutAfterSectionReplyEmbed()
      })
    },
    [
      clearSectionReplyEmbedSchedule,
      focusComposerAfterSectionReplyEmbed,
      focusComposerForSectionReply,
      isMobileComposer,
      syncComposerLayoutAfterSectionReplyEmbed,
    ],
  )

  useEffect(() => () => clearSectionReplyEmbedSchedule(), [clearSectionReplyEmbedSchedule])

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
  }, [draft, isMobileCompactComposer])

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

  function buildAttachmentMessageBlocks(items: PendingAttachment[]): string {
    return items
      .map((item) =>
        item.kind === 'pasted-image'
          ? item.previewDataUrl
            ? `[BildData:${item.id}]\n${item.previewDataUrl}\n[/BildData]`
            : item.content.trim()
              ? `[Bild:${item.id}:${item.name}]\n${item.content}\n[/Bild]`
              : ''
          : item.content.trim()
            ? `[Datei: ${item.name}]\n${item.content}\n[/Datei]`
            : `[Datei: ${item.name}] (Kein auslesbarer Text gefunden)\n[/Datei]`,
      )
      .join('\n\n')
  }

  function buildAssistantRichOptions(messageId: string): AssistantRichContentOptions {
    return {
      onChatImagePreview: setImageLightboxSrc,
      sectionReply: {
        messageId,
        onReference: beginSectionReplyFromSwipe,
      },
    }
  }

  async function deliverComposerMessage(
    content: string,
    sendOpts?: { quizFormat?: QuizFormatChoice },
  ) {
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
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setPendingAttachments([])
    setQuizFormatPending(null)
    const payload = buildUserMessageWithSectionRef(content, composerSectionReply)
    setComposerSectionReply(null)
    await onSendMessage(payload, sendOpts?.quizFormat ? { quizFormat: sendOpts.quizFormat } : undefined)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
      (!draft.trim() && pendingAttachments.length === 0) ||
      isSending ||
      isAttachingFiles ||
      thinkingCreditsBlocked
    ) {
      return
    }

    hapticLightImpact()

    const textPart = draft.trim()
    const messageText =
      imageGenCommandSelected && textPart ? `${IMAGE_GEN_TILE_PROMPT_PREFIX}${textPart}` : textPart
    const attachmentPart = buildAttachmentMessageBlocks(pendingAttachments)
    const baseContent = [messageText, attachmentPart].filter(Boolean).join('\n\n')
    const content = wordCommandSelected
      ? `${WORD_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim()
      : pdfCommandSelected
        ? `${PDF_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim()
        : excelCommandSelected
          ? `${EXCEL_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim()
          : baseContent
    if (
      shouldPromptQuizFormatChoice(textPart, {
        wantsWord: wordCommandSelected,
        wantsPdf: pdfCommandSelected,
        wantsExcel: excelCommandSelected,
        wantsImageGen: imageGenCommandSelected,
        thinkingMode: chatThinkingMode === 'thinking',
      })
    ) {
      setQuizFormatPending({ content })
      return
    }

    const explicitQuizFormat = detectExplicitQuizFormatInText(textPart)
    await deliverComposerMessage(
      content,
      explicitQuizFormat ? { quizFormat: explicitQuizFormat } : undefined,
    )
  }

  function handleQuizFormatChosen(format: QuizFormatChoice) {
    if (!quizFormatPending) {
      return
    }
    const { content } = quizFormatPending
    void deliverComposerMessage(content, { quizFormat: format })
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue)
    if (excelCommandSelected || imageGenCommandSelected || wordCommandSelected || pdfCommandSelected) {
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
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectWordSlashCommand() {
    setWordCommandSelected(true)
    setExcelCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectPdfSlashCommand() {
    setPdfCommandSelected(true)
    setWordCommandSelected(false)
    setExcelCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectImageSlashCommand() {
    setImageGenCommandSelected(true)
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectExcelQuickTile() {
    setExcelCommandSelected(true)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleSelectWordQuickTile() {
    setWordCommandSelected(true)
    setExcelCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleSelectPdfQuickTile() {
    setPdfCommandSelected(true)
    setWordCommandSelected(false)
    setExcelCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleSelectImageQuickTile() {
    setImageGenCommandSelected(true)
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function openMobileAttachSheet() {
    inputRef.current?.blur()
    setAttachComposerSheetOpen(true)
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
        } else if (slashMenuHighlightIndex === 1) {
          handleSelectWordSlashCommand()
        } else if (slashMenuHighlightIndex === 2) {
          handleSelectPdfSlashCommand()
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
    if (!form || tokenLimitReached || isSending || isAttachingFiles || thinkingCreditsBlocked) {
      return
    }
    if (!draft.trim() && pendingAttachments.length === 0) {
      return
    }
    form.requestSubmit()
  }

  async function handleAttachFiles(fileList: FileList | null) {
    if (
      !fileList ||
      fileList.length === 0 ||
      isSending ||
      isAttachingFiles ||
      tokenLimitReached ||
      thinkingCreditsBlocked
    ) {
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
        if (isChatVisionImageFile(file)) {
          try {
            nextAttachments.push(...(await buildPastedImagePendingAttachments([file])))
          } catch {
            pushToast(
              'Dieses Foto konnte nicht für die KI-Analyse vorbereitet werden. Bitte ein anderes Bild wählen oder erneut aufnehmen.',
            )
          }
        } else {
          const text = await extractLearningMaterialText(file)
          const excerpt = text.trim().slice(0, 1400)
          nextAttachments.push({
            id: crypto.randomUUID(),
            name: file.name,
            content: excerpt,
            kind: 'file',
          })
        }
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
    if (isSending || isAttachingFiles || tokenLimitReached || thinkingCreditsBlocked) {
      return
    }
    const imageFiles = getImageFilesFromClipboard(event.clipboardData)
    if (imageFiles.length === 0) {
      return
    }
    event.preventDefault()
    void (async () => {
      if (isSending || isAttachingFiles || tokenLimitReached || thinkingCreditsBlocked) {
        return
      }
      setIsAttachingFiles(true)
      try {
        const imageAttachments = await buildPastedImagePendingAttachments(imageFiles)
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
    return extractUserMessageCopyText(content)
  }

  async function handleCopyUserMessageText(text: string) {
    const ok = await copyTextToClipboard(text)
    pushToast(ok ? 'Nachricht kopiert' : 'Kopieren fehlgeschlagen')
  }

  const composerReplyQuoteSlot = (
    <ChatComposerReplyQuoteSlot
      reference={composerSectionReply}
      onDismiss={() => {
        clearSectionReplyEmbedSchedule()
        setComposerSectionReply(null)
      }}
      onOpenSettled={
        isMobileComposer ? handleSectionReplyEmbedSettled : undefined
      }
    />
  )

  const quizFormatOverlay = quizFormatPending ? (
    <QuizFormatChoiceModal
      previewText={quizFormatPending.content.split('\n\n')[0]?.slice(0, 280)}
      onDismiss={() => setQuizFormatPending(null)}
      onChoose={handleQuizFormatChosen}
    />
  ) : null

  const thinkingClarifyOverlay =
    thinkingClarifyDialog?.kind === 'structured' ? (
      <ThinkingClarifyModal
        key={thinkingClarifyDialog.messageId}
        payload={thinkingClarifyDialog.payload}
        introMarkdown={thinkingClarifyDialog.introMarkdown}
        clarifyRound={thinkingClarifyDialog.clarifyRound}
        clarifyRoundsTotal={thinkingClarifyDialog.clarifyRoundsTotal}
        intakeSummary={thinkingClarifyDialog.intakeSummary}
        analysisSummary={thinkingClarifyDialog.analysisSummary}
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
      <div
        className={`chat-quick-tiles${isMobileComposer ? ' chat-quick-tiles--mobile-rail' : ''}`}
        role="group"
        aria-label="Schnellaktionen"
      >
        {isMobileComposer ? (
          <div className="chat-quick-tiles-scroll">
            <div className="chat-quick-tiles-scroll-track">
              <button
                type="button"
                className={`chat-quick-tile chat-quick-tile--bilder${imageGenCommandSelected ? ' is-active' : ''}`}
                onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
                onClick={handleSelectImageQuickTile}
              >
                <span className="chat-quick-tile-icon-wrap" aria-hidden>
                  <img className="chat-quick-tile-icon--landscape" src={landscapePng} alt="" />
                </span>
                <span className="chat-quick-tile-text">
                  <span className="chat-quick-tile-title">Bilder</span>
                  <span className="chat-quick-tile-sub">Bild generieren</span>
                </span>
              </button>
              <button
                type="button"
                className={`chat-quick-tile chat-quick-tile--excel${excelCommandSelected ? ' is-active' : ''}`}
                onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
                onClick={handleSelectExcelQuickTile}
              >
                <span className="chat-quick-tile-icon-wrap" aria-hidden>
                  <span className="chat-quick-tile-letter-mark">X</span>
                </span>
                <span className="chat-quick-tile-text">
                  <span className="chat-quick-tile-title">Excel</span>
                  <span className="chat-quick-tile-sub">Tabelle planen &amp; exportieren</span>
                </span>
              </button>
              <button
                type="button"
                className={`chat-quick-tile chat-quick-tile--word${wordCommandSelected ? ' is-active' : ''}`}
                onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
                onClick={handleSelectWordQuickTile}
              >
                <span className="chat-quick-tile-icon-wrap" aria-hidden>
                  <span className="chat-quick-tile-letter-mark">W</span>
                </span>
                <span className="chat-quick-tile-text">
                  <span className="chat-quick-tile-title">Word</span>
                  <span className="chat-quick-tile-sub">Word generieren</span>
                </span>
              </button>
              <button
                type="button"
                className={`chat-quick-tile chat-quick-tile--pdf${pdfCommandSelected ? ' is-active' : ''}`}
                onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
                onClick={handleSelectPdfQuickTile}
              >
                <span className="chat-quick-tile-icon-wrap" aria-hidden>
                  <span className="chat-quick-tile-letter-mark">P</span>
                </span>
                <span className="chat-quick-tile-text">
                  <span className="chat-quick-tile-title">PDF</span>
                  <span className="chat-quick-tile-sub">PDF generieren</span>
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="chat-quick-tiles-row chat-quick-tiles-row--top">
              <button
                type="button"
                className={`chat-quick-tile chat-quick-tile--excel${excelCommandSelected ? ' is-active' : ''}`}
                onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
                onClick={handleSelectExcelQuickTile}
              >
            <span className="chat-quick-tile-icon-wrap" aria-hidden>
              <span className="chat-quick-tile-letter-mark">X</span>
            </span>
            <span className="chat-quick-tile-text">
              <span className="chat-quick-tile-title">Excel</span>
              <span className="chat-quick-tile-sub">Tabelle planen &amp; exportieren</span>
            </span>
          </button>
          <button
            type="button"
            className={`chat-quick-tile chat-quick-tile--word${wordCommandSelected ? ' is-active' : ''}`}
            onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
            onClick={handleSelectWordQuickTile}
          >
            <span className="chat-quick-tile-icon-wrap" aria-hidden>
              <span className="chat-quick-tile-letter-mark">W</span>
            </span>
            <span className="chat-quick-tile-text">
              <span className="chat-quick-tile-title">Word</span>
              <span className="chat-quick-tile-sub">Word generieren</span>
            </span>
          </button>
        </div>
        <div className="chat-quick-tiles-row chat-quick-tiles-row--bottom">
          <button
            type="button"
            className={`chat-quick-tile chat-quick-tile--pdf${pdfCommandSelected ? ' is-active' : ''}`}
            onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
            onClick={handleSelectPdfQuickTile}
          >
            <span className="chat-quick-tile-icon-wrap" aria-hidden>
              <span className="chat-quick-tile-letter-mark">P</span>
            </span>
            <span className="chat-quick-tile-text">
              <span className="chat-quick-tile-title">PDF</span>
              <span className="chat-quick-tile-sub">PDF generieren</span>
            </span>
          </button>
          <button
            type="button"
            className={`chat-quick-tile chat-quick-tile--bilder${imageGenCommandSelected ? ' is-active' : ''}`}
            onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
            onClick={handleSelectImageQuickTile}
          >
            <span className="chat-quick-tile-icon-wrap" aria-hidden>
              <img className="chat-quick-tile-icon--landscape" src={landscapePng} alt="" />
            </span>
            <span className="chat-quick-tile-text">
              <span className="chat-quick-tile-title">Bilder</span>
              <span className="chat-quick-tile-sub">Bild generieren</span>
            </span>
          </button>
        </div>
          </>
        )}
      </div>
    )

  const thinkingMaxCap =
    typeof thinkingCreditMax === 'number' ? thinkingCreditMax : DEFAULT_THINKING_CREDIT_MAX

  const thinkingCreditsHintEl =
    chatThinkingMode === 'thinking' && typeof thinkingCreditsRemaining === 'number' && !tokenLimitReached ? (
      <p
        className={`chat-websearch-credits-hint${thinkingCreditsBlocked ? ' chat-thinking-credits-hint--empty' : ''}`}
        role="status"
      >
        {thinkingCreditsBlocked
          ? 'Thinking-Guthaben aufgebraucht. Weitere Anfragen nach der täglichen Aufladung (UTC) oder mit neuem Abo-Guthaben.'
          : `Noch ${thinkingCreditsRemaining} Thinking-Anfrage(n) (max. ${thinkingMaxCap} Kontostand).`}
        {!thinkingCreditsBlocked &&
        typeof thinkingDailyGrant === 'number' &&
        thinkingDailyGrant > 0
          ? ` Täglich +${thinkingDailyGrant} (UTC).`
          : ''}
      </p>
    ) : null

  const attachControlDisabled =
    isSending || isAttachingFiles || tokenLimitReached || thinkingCreditsBlocked

  const composerAttachButton = (
    <ChatComposerAttachMenu
      className={attachButtonClassName}
      disabled={attachControlDisabled}
      ariaLabel={isMobileComposer ? 'Einfügen: Bilder, Excel oder Datei' : 'Anhang-Menü öffnen'}
      isMobile={isMobileComposer}
      onMobileOpen={openMobileAttachSheet}
      onUploadFile={() => fileInputRef.current?.click()}
      replyMode={chatReplyMode}
      onReplyModeChange={onChatReplyModeChange}
      showReplyModeOption={showReplyModePicker && !isMobileComposer}
    />
  )

  const composerAttachSheet = (
    <ActionBottomSheet
      open={attachComposerSheetOpen}
      onClose={() => setAttachComposerSheetOpen(false)}
      title="Einfügen"
      ariaLabel="Word, PDF, Excel, Bilder oder Datei wählen"
      actions={[
        {
          id: 'word',
          label: 'Word',
          actionClassName: 'action-bottom-sheet-action--compose-word',
          onClick: () => {
            handleSelectWordQuickTile()
          },
        },
        {
          id: 'pdf',
          label: 'PDF',
          actionClassName: 'action-bottom-sheet-action--compose-pdf',
          onClick: () => {
            handleSelectPdfQuickTile()
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
          id: 'bilder',
          label: 'Bilder',
          actionClassName: 'action-bottom-sheet-action--compose-bilder',
          onClick: () => {
            handleSelectImageQuickTile()
          },
        },
        {
          id: 'anhang',
          label: 'Datei anhängen',
          onClick: () => {
            fileInputRef.current?.click()
          },
        },
      ]}
    />
  )

  const imageLightboxEl =
    imageLightboxSrc !== null ? (
      <div
        className={`chat-image-lightbox${imageLightboxOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!imageLightboxOpen}
        aria-label="Bildvorschau"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('.chat-image-lightbox-img')) {
            return
          }
          closeImageLightbox()
        }}
        onTransitionEnd={handleImageLightboxTransitionEnd}
      >
        <div className="chat-image-lightbox-frame">
          <img src={imageLightboxSrc} alt="" className="chat-image-lightbox-img" decoding="async" />
        </div>
      </div>
    ) : null

  if (isEmptyState) {
    return (
      <section
        className={`chat-panel is-empty${tokenLimitReached ? ' has-limit-banner' : ''}`}
      >
        {tokenLimitReached ? (
          <p className="chat-limit-banner" role="alert">
            Dein Token-Limit für heute ist erreicht. Du kannst morgen wieder schreiben.
          </p>
        ) : null}
        <div className="chat-empty-compose">
          <ChatEmptyGreetingTitle
            greet={emptyChatGreeting.greet}
            ask={emptyChatGreeting.ask}
            animationKey={threadKey ?? 'new'}
          />
          {error ? <p className="error-text">{error}</p> : null}
          {quizFormatOverlay}
          {thinkingClarifyOverlay}
          {quickTilesEl}
          {thinkingCreditsHintEl}
          {isSending ? (
            <div className="chat-empty-send-status" aria-live="polite">
              <ChatPendingReplyLoader
                statusLabel={getChatSendPhaseLabel(sendPhase) ?? 'Denkt nach …'}
              />
            </div>
          ) : null}
          {showInstantAnalyzeDebug && liveInstantAnalyzeDebug ? (
            <div className="chat-empty-instant-debug">
              <ChatInstantAnalyzeDebugPanel debug={liveInstantAnalyzeDebug} compact />
            </div>
          ) : null}
          <form
            className={buildComposerInputRowClass(true)}
            onSubmit={handleSubmit}
            {...composerInputRowTouchHandlers}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif"
              className="chat-file-input-hidden"
              onChange={(event) => {
                void handleAttachFiles(event.target.files)
              }}
            />
            <div className="chat-left-actions">
              {composerAttachButton}
              {showComposerInlinePickers && showComposerModelPicker ? (
                <ChatComposerModelPicker
                  value={composerModelId}
                  onChange={onComposerModelChange}
                  disabled={isSending || tokenLimitReached}
                />
              ) : null}
              {showComposerInlinePickers ? (
                <ChatComposerThinkingModePicker
                  value={chatThinkingMode}
                  onChange={onChatThinkingModeChange}
                  disabled={isSending || tokenLimitReached}
                />
              ) : null}
            </div>
            <div
              className={[
                'chat-input-compose',
                isMobileCompactComposer ? 'chat-input-compose--mobile-compact' : '',
                composerSectionReply ? 'chat-input-compose--has-section-reply' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {composerReplyQuoteSlot}
              {pendingAttachments.length > 0 ||
              (!isMobileComposer &&
                (imageGenCommandSelected || excelCommandSelected || wordCommandSelected || pdfCommandSelected)) ? (
                <div className="chat-attachment-chips" aria-label="Anhänge">
                  {!isMobileComposer && imageGenCommandSelected ? (
                    <span className="chat-attach-removable">
                      <span className="chat-compose-mode-badge chat-compose-mode-badge--image" title="Bildgenerierung aktiv">
                        <span className="chat-compose-mode-badge-label">Bilder</span>
                      </span>
                      <button
                        type="button"
                        className="chat-attachment-chip-remove"
                        aria-label="Bildgenerierung entfernen"
                        onClick={() => setImageGenCommandSelected(false)}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                  {!isMobileComposer && excelCommandSelected ? (
                    <span className="chat-attach-removable">
                      <span className="chat-compose-mode-badge chat-compose-mode-badge--excel" title="Excel-Befehl aktiv">
                        <span className="chat-compose-mode-badge-label">Excel</span>
                      </span>
                      <button
                        type="button"
                        className="chat-attachment-chip-remove"
                        aria-label="Excel-Befehl entfernen"
                        onClick={() => setExcelCommandSelected(false)}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                  {!isMobileComposer && wordCommandSelected ? (
                    <span className="chat-attach-removable">
                      <span className="chat-compose-mode-badge chat-compose-mode-badge--word" title="Word-Export aktiv">
                        <span className="chat-compose-mode-badge-label">Word</span>
                      </span>
                      <button
                        type="button"
                        className="chat-attachment-chip-remove"
                        aria-label="Word-Befehl entfernen"
                        onClick={() => setWordCommandSelected(false)}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                  {!isMobileComposer && pdfCommandSelected ? (
                    <span className="chat-attach-removable">
                      <span className="chat-compose-mode-badge chat-compose-mode-badge--pdf" title="PDF-Export aktiv">
                        <span className="chat-compose-mode-badge-label">PDF</span>
                      </span>
                      <button
                        type="button"
                        className="chat-attachment-chip-remove"
                        aria-label="PDF-Befehl entfernen"
                        onClick={() => setPdfCommandSelected(false)}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                  {pendingAttachments.map((item) => (
                    item.kind === 'pasted-image' && item.previewDataUrl ? (
                      <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image chat-attach-removable">
                        <button
                          type="button"
                          className="chat-attachment-inline-preview-trigger"
                          aria-label="Vorschau vergrößern"
                          onClick={() => {
                            const u = item.previewDataUrl
                            if (u) {
                              setImageLightboxSrc(u)
                            }
                          }}
                        >
                          <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
                        </button>
                        <button
                          type="button"
                          className="chat-attachment-chip-remove"
                          aria-label={`${item.name} entfernen`}
                          onClick={() => removeAttachment(item.id)}
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <span key={item.id} className="chat-attachment-chip chat-attach-removable">
                        <span className="chat-attachment-chip-name">{item.name}</span>
                        <button
                          type="button"
                          className="chat-attachment-chip-remove"
                          aria-label={`${item.name} entfernen`}
                          onClick={() => removeAttachment(item.id)}
                        >
                          ×
                        </button>
                      </span>
                    )
                  ))}
                </div>
              ) : null}
              {isMobileCompactComposer ? (
                <div className="chat-input-pill chat-compact-composer-surface">
                  <div className="chat-input-field">
                    <div className="chat-input-field-grow">
                      <textarea
                        ref={inputRef}
                        className="chat-input"
                        rows={1}
                        value={draft}
                        onChange={(event) => handleDraftChange(event.target.value)}
                        onKeyDown={handleComposeKeyDown}
                        onPaste={handleComposePaste}
                        placeholder={composePlaceholder}
                        disabled={isSending || tokenLimitReached || thinkingCreditsBlocked}
                        aria-multiline="true"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  {composerSendButton}
                </div>
              ) : (
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
                          className={`thread-menu-item${slashMenuHighlightIndex === 1 ? ' is-selected' : ''}`}
                          role="menuitem"
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          onMouseEnter={() => setSlashMenuHighlightIndex(1)}
                          onClick={handleSelectWordSlashCommand}
                        >
                          Word
                        </button>
                        <button
                          type="button"
                          className={`thread-menu-item${slashMenuHighlightIndex === 2 ? ' is-selected' : ''}`}
                          role="menuitem"
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          onMouseEnter={() => setSlashMenuHighlightIndex(2)}
                          onClick={handleSelectPdfSlashCommand}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          className={`thread-menu-item thread-menu-item--slash-image${
                            slashMenuHighlightIndex === 3 ? ' is-selected' : ''
                          }`}
                          role="menuitem"
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          onMouseEnter={() => setSlashMenuHighlightIndex(3)}
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
                      disabled={isSending || tokenLimitReached || thinkingCreditsBlocked}
                      aria-multiline="true"
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
            </div>
            {!isMobileCompactComposer ? composerSendButton : null}
          </form>
          <p className="chat-input-hint">
            Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
          </p>
          {composerAttachSheet}
        </div>
        {imageLightboxEl}
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
        {messageList.map((message, messageIndex) => {
          const rawContent = safeMessageContent(message.content)
          const isAssistant = message.role === 'assistant'
          let precedingUserForWordPaper: (typeof messageList)[number] | null = null
          if (isAssistant) {
            for (let i = messageIndex - 1; i >= 0; i -= 1) {
              if (messageList[i].role === 'user') {
                precedingUserForWordPaper = messageList[i]
                break
              }
            }
          }
          const isWordAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userWordCommand)
          const isPdfAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userPdfCommand)
          /** Papier-Karte nur nach explizitem /Word oder /PDF — nicht bei zufälligen ####-Zeilen im Normalchat. */
          const showWordPaperLayout = isWordAssistantTurn || isPdfAssistantTurn
          const parsed = isAssistant ? parseInteractiveContentWithFallback(rawContent) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = safeMessageContent(animatedAssistantContent[message.id] ?? rawContent)
          /** Nach Excel-Export: gespeicherten Text nutzen (ohne Spec), nicht den Animations-Puffer mit altem JSON. */
          const baseAssistantForDisplay = message.metadata?.liveStream
            ? stripExcelSpecBlock(rawContent)
            : message.metadata?.excelExport || message.metadata?.wordExport || message.metadata?.pdfExport
              ? rawContent
              : animatedContent
          const rawAssistantDisplay = hasInteractiveQuiz ? parsed?.cleanText || '' : baseAssistantForDisplay
          /** JSON-Spec im Chat nie anzeigen — nur Einleitungstext vor <<<STRATON_EXCEL_SPEC_JSON>>>. */
          const assistantAfterExcel = stripExcelSpecBlock(rawAssistantDisplay)
          const thinkingClarifyStreaming =
            isAssistant &&
            !isWordAssistantTurn &&
            chatThinkingMode === 'thinking' &&
            Boolean(message.metadata?.liveStream) &&
            !messageContainsCompleteThinkingClarifyBlock(rawContent)
          /** Immer Clarify-JSON ausblenden, wenn der Block gültig ist — nicht an den aktuellen Composer-Modus koppeln (nach Reload oft «normal»). */
          const userSectionReplyParsed =
            message.role === 'user' ? parseSectionRefFromUserContent(rawContent) : null
          const displayContent = isAssistant
            ? isWordAssistantTurn
              ? assistantAfterExcel
              : stripThinkingClarifyMarkersForDisplay(assistantAfterExcel)
            : userSectionReplyParsed
              ? stripAttachmentBlocksForDisplay(userSectionReplyParsed.userText)
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
          const showWordFallbackText =
            isAssistant &&
            Boolean(message.metadata?.wordExport) &&
            !String(displayContent ?? '').trim()
          const showPdfFallbackText =
            isAssistant &&
            Boolean(message.metadata?.pdfExport) &&
            !String(displayContent ?? '').trim()
          const isStreamingAssistant =
            isAssistant &&
            !hasInteractiveQuiz &&
            !message.metadata?.excelExport &&
            !message.metadata?.wordExport &&
            !message.metadata?.pdfExport &&
            (Boolean(message.metadata?.liveStream) ||
              animatedContent.length < rawContent.length)
          const isLatestMessage = message.id === messageList[messageList.length - 1]?.id
          const showOrbitLoader = isAssistant && isLatestMessage && showLatestAssistantOrbitLoader
          const showAssistantAuthor = isAssistant && !showOrbitLoader

          const userMessageCopyText =
            message.role === 'user' ? stripAttachmentBlocksForDisplay(rawContent) : ''
          const userMessageLongPressHandlers =
            message.role === 'user' && userMessageCopyText
              ? userMessageLongPress.bindUserMessageLongPress(message.id, userMessageCopyText)
              : undefined
          const userMessagePressActive =
            message.role === 'user' && userMessageLongPress.isMessagePressActive(message.id)

          return (
            <article
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${isStreamingAssistant ? ' chat-message--streaming' : ''}${isLatestMessage ? ' chat-message--latest' : ''}${userMessagePressActive ? ' is-message-press-active' : ''}`}
              {...userMessageLongPressHandlers}
            >
              {showOrbitLoader ? (
                <div className="chat-message-orbit-loader-wrap">
                  <ChatPendingReplyLoader statusLabel={streamingStatusLabel} />
                </div>
              ) : null}
              {showAssistantAuthor ? (
                <strong className="chat-message-author">
                  Straton AI
                  {message.metadata?.assistantAutoWebSearch ? (
                    <span className="chat-message-web-badge">Mit Websuche</span>
                  ) : null}
                </strong>
              ) : null}
              {hasReloadedImageSrc ? (
                  <div className="chat-user-inline-images" aria-label="Eingefügte Bilder">
                  {pastedImageIds.map((imageId) => {
                    const src =
                      sentPastedImagePreviews[imageId] ??
                      extractBildDataUrlFromStoredContent(rawContent, imageId)
                    if (!src) {
                      return null
                    }
                    return (
                      <button
                        key={imageId}
                        type="button"
                        className="chat-user-inline-image-trigger"
                        aria-label="Bild vergrößern"
                        onClick={() => setImageLightboxSrc(src)}
                      >
                        <img className="chat-user-inline-image" src={src} alt="Eingefügtes Bild" />
                      </button>
                    )
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
                      <span className="chat-attachment-chip-name">{name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {userSectionReplyParsed?.sectionRef ? (
                <ChatMessageReplyQuotePreview reference={userSectionReplyParsed.sectionRef} />
              ) : null}
              {message.role === 'user' &&
              showInstantAnalyzeDebug &&
              message.metadata?.instantAnalyzeDebug ? (
                <ChatInstantAnalyzeDebugPanel debug={message.metadata.instantAnalyzeDebug} />
              ) : null}
              {thinkingClarifyStreaming ? (
                <p className="chat-thinking-stream-hint" role="status">
                  KI formuliert eine Rückfrage…
                </p>
              ) : displayContent ? (
                isAssistant ? (
                  !hasInteractiveQuiz ? (
                    (() => {
                      if (message.metadata?.wordExport || message.metadata?.excelExport || message.metadata?.pdfExport) {
                        return (
                          <div className="chat-message-body chat-message-body--rich">
                            {renderAssistantRichContent(
                              displayContent,
                              buildAssistantRichOptions(message.id),
                            )}
                          </div>
                        )
                      }
                      const fence = resolveWordOutlinePresentation(displayContent)
                      if (fence && showWordPaperLayout) {
                        const outlineForPaper = normalizeHeadingLevelsForWord({
                          ...fence.outline,
                          title: undefined,
                        })
                        const peeledBefore = extractLeadingBannerTitleFromOutlineText(fence.before)
                        const bannerTitle =
                          fence.outline.title?.trim() ||
                          peeledBefore.bannerTitle ||
                          null
                        const beforeMarkdown = fence.before.trim()
                          ? peeledBefore.bodyWithoutBanner.trim()
                          : ''
                        return (
                          <>
                            {beforeMarkdown ? (
                              <div className="chat-message-body chat-message-body--rich">
                                {renderAssistantRichContent(
                                  beforeMarkdown,
                                  buildAssistantRichOptions(message.id),
                                )}
                              </div>
                            ) : null}
                            <WordOutlinePaper outline={outlineForPaper} bannerTitle={bannerTitle} />
                            {fence.after.trim() ? (
                              <div className="chat-message-body chat-message-body--rich">
                                {renderAssistantRichContent(
                                  fence.after,
                                  buildAssistantRichOptions(message.id),
                                )}
                              </div>
                            ) : null}
                          </>
                        )
                      }
                      if (
                        showWordPaperLayout &&
                        isLikelyDocumentOutlinePayload(displayContent) &&
                        (isStreamingAssistant || message.metadata?.liveStream)
                      ) {
                        return <WordOutlinePaperBuilding />
                      }
                      const wordConventionActive = usesStratonWordMarkdownConvention(displayContent)
                      const peeledFull = wordConventionActive
                        ? { bannerTitle: null, bodyWithoutBanner: displayContent }
                        : extractLeadingBannerTitleFromOutlineText(displayContent)
                      const heuristicOutline = tryHeuristicWordOutlineFromPlainText(
                        peeledFull.bodyWithoutBanner,
                      )
                      if (
                        showWordPaperLayout &&
                        heuristicOutline &&
                        heuristicOutline.blocks.length > 0
                      ) {
                        return (
                          <WordOutlinePaper
                            outline={normalizeHeadingLevelsForWord({
                              ...heuristicOutline,
                              title: undefined,
                            })}
                            bannerTitle={peeledFull.bannerTitle}
                          />
                        )
                      }
                      return (
                        <div className="chat-message-body chat-message-body--rich">
                          {renderAssistantRichContent(
                            displayContent,
                            buildAssistantRichOptions(message.id),
                          )}
                        </div>
                      )
                    })()
                  ) : (
                    <div className="chat-message-body chat-message-body--rich">
                      {renderAssistantRichContent(
                        displayContent,
                        buildAssistantRichOptions(message.id),
                      )}
                    </div>
                  )
                ) : (
                  <p>{renderInlineMarkdown(displayContent)}</p>
                )
              ) : null}
              {showExcelFallbackText ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Die Excel-Datei ist bereit — nutze den Download-Button unten.
                </p>
              ) : null}
              {showWordFallbackText ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Die Word-Datei ist bereit — nutze den Download-Button unten.
                </p>
              ) : null}
              {showPdfFallbackText ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Die PDF-Datei ist bereit — nutze den Download-Button unten.
                </p>
              ) : null}
              {isMobileComposer && userMessageLongPress.shouldMountMenuOverlay(message.id) ? (
                <ChatUserMessageMenuSelect
                  ref={userMessageLongPress.menuSelectRef}
                  onSelectCopy={() => {
                    const text = userMessageLongPress.getMenuCopyText()
                    if (text) {
                      void handleCopyUserMessageText(text)
                    }
                  }}
                  onClose={userMessageLongPress.closeMenu}
                />
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

              {message.metadata?.wordExport ? (
                <div className="chat-excel-download">
                  <button
                    type="button"
                    className="chat-excel-download-button"
                    disabled={wordDownloadBusyId === message.id}
                    onClick={() => {
                      void downloadWordExport(message)
                    }}
                  >
                    {wordDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Word herunterladen'}
                  </button>
                </div>
              ) : null}

              {message.metadata?.pdfExport ? (
                <div className="chat-excel-download">
                  <button
                    type="button"
                    className="chat-excel-download-button"
                    disabled={pdfDownloadBusyId === message.id}
                    onClick={() => {
                      void downloadPdfExport(message)
                    }}
                  >
                    {pdfDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'PDF herunterladen'}
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
                    : pendingWordGeneration
                      ? ' chat-message--pending-excel'
                      : pendingPdfGeneration
                        ? ' chat-message--pending-excel'
                        : ''
              }`}
              aria-live="polite"
              aria-busy="true"
            >
              {pendingImageGeneration ? (
                <strong className="chat-message-author">Straton AI</strong>
              ) : null}
              {pendingImageGeneration ? (
                <div className="chat-pending-orbit-wrap chat-pending-special-loader">
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
                  <p className="chat-pending-status">{getChatSendPhaseLabel('image')}</p>
                </div>
              ) : pendingExcelGeneration || pendingWordGeneration || pendingPdfGeneration ? (
                <>
                <strong className="chat-message-author">Straton AI</strong>
                <div className="chat-pending-orbit-wrap chat-pending-special-loader">
                <div
                  className="chat-excel-gen-loader-panel"
                  role="status"
                  aria-label={
                    pendingWordGeneration
                      ? 'Word wird erstellt'
                      : pendingPdfGeneration
                        ? 'PDF wird erstellt'
                        : 'Excel wird erstellt'
                  }
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
                <p className="chat-pending-status">
                  {getChatSendPhaseLabel(
                    pendingWordGeneration ? 'word' : pendingPdfGeneration ? 'pdf' : 'excel',
                  )}
                </p>
                </div>
                </>
              ) : (
                <ChatPendingReplyLoader statusLabel={pendingStatusLabel} />
              )}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {onFinalizeWordDocument &&
      canFinalizeWordExportFromThread(messageList) &&
      !isSending ? (
        <div className="chat-word-finalize-bar" role="region" aria-label="Word-Export">
          <p className="chat-word-finalize-bar__hint">
            Wenn die Vorschau oben passt, erzeuge die Word-Datei aus der Gliederung.
          </p>
          <button
            type="button"
            className="chat-excel-download-button"
            disabled={wordFinalizeBusy}
            onClick={() => void onFinalizeWordDocument()}
          >
            {wordFinalizeBusy ? 'Word wird erstellt…' : 'Word-Datei erzeugen'}
          </button>
        </div>
      ) : null}

      {onFinalizePdfDocument &&
      canFinalizePdfExportFromThread(messageList) &&
      !isSending ? (
        <div className="chat-word-finalize-bar" role="region" aria-label="PDF-Export">
          <p className="chat-word-finalize-bar__hint">
            Wenn die Vorschau oben passt, erzeuge die PDF-Datei aus der Gliederung.
          </p>
          <button
            type="button"
            className="chat-excel-download-button"
            disabled={pdfFinalizeBusy}
            onClick={() => void onFinalizePdfDocument()}
          >
            {pdfFinalizeBusy ? 'PDF wird erstellt…' : 'PDF-Datei erzeugen'}
          </button>
        </div>
      ) : null}

      <div
        className="chat-composer-stack"
      >
        {quizFormatOverlay}
        {thinkingClarifyOverlay}
        {isMobileComposer ? quickTilesEl : null}
        {isMobileComposer ? thinkingCreditsHintEl : null}
        {showInstantAnalyzeDebug && liveInstantAnalyzeDebug && isSending ? (
          <div className="chat-composer-instant-debug">
            <ChatInstantAnalyzeDebugPanel debug={liveInstantAnalyzeDebug} compact />
          </div>
        ) : null}
        {composerAttachSheet}
        <form
          className={buildComposerInputRowClass(false)}
          onSubmit={handleSubmit}
          {...composerInputRowTouchHandlers}
        >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="chat-file-input-hidden"
          onChange={(event) => {
            void handleAttachFiles(event.target.files)
          }}
        />
        <div className="chat-left-actions">
          {composerAttachButton}
          {showComposerInlinePickers && showComposerModelPicker ? (
            <ChatComposerModelPicker
              value={composerModelId}
              onChange={onComposerModelChange}
              disabled={isSending || tokenLimitReached}
            />
          ) : null}
          {showComposerInlinePickers ? (
            <ChatComposerThinkingModePicker
              value={chatThinkingMode}
              onChange={onChatThinkingModeChange}
              disabled={isSending || tokenLimitReached}
            />
          ) : null}
        </div>
        <div
          className={[
            'chat-input-compose',
            isMobileCompactComposer ? 'chat-input-compose--mobile-compact' : '',
            composerSectionReply ? 'chat-input-compose--has-section-reply' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {composerReplyQuoteSlot}
          {pendingAttachments.length > 0 ||
          (!isMobileComposer &&
            (imageGenCommandSelected || excelCommandSelected || wordCommandSelected || pdfCommandSelected)) ? (
            <div className="chat-attachment-chips" aria-label="Anhänge">
              {!isMobileComposer && imageGenCommandSelected ? (
                <span className="chat-attach-removable">
                  <span className="chat-compose-mode-badge chat-compose-mode-badge--image" title="Bildgenerierung aktiv">
                    <span className="chat-compose-mode-badge-label">Bilder</span>
                  </span>
                  <button
                    type="button"
                    className="chat-attachment-chip-remove"
                    aria-label="Bildgenerierung entfernen"
                    onClick={() => setImageGenCommandSelected(false)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {!isMobileComposer && excelCommandSelected ? (
                <span className="chat-attach-removable">
                  <span className="chat-compose-mode-badge chat-compose-mode-badge--excel" title="Excel-Befehl aktiv">
                    <span className="chat-compose-mode-badge-label">Excel</span>
                  </span>
                  <button
                    type="button"
                    className="chat-attachment-chip-remove"
                    aria-label="Excel-Befehl entfernen"
                    onClick={() => setExcelCommandSelected(false)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {!isMobileComposer && wordCommandSelected ? (
                <span className="chat-attach-removable">
                  <span className="chat-compose-mode-badge chat-compose-mode-badge--word" title="Word-Export aktiv">
                    <span className="chat-compose-mode-badge-label">Word</span>
                  </span>
                  <button
                    type="button"
                    className="chat-attachment-chip-remove"
                    aria-label="Word-Befehl entfernen"
                    onClick={() => setWordCommandSelected(false)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {!isMobileComposer && pdfCommandSelected ? (
                <span className="chat-attach-removable">
                  <span className="chat-compose-mode-badge chat-compose-mode-badge--pdf" title="PDF-Export aktiv">
                    <span className="chat-compose-mode-badge-label">PDF</span>
                  </span>
                  <button
                    type="button"
                    className="chat-attachment-chip-remove"
                    aria-label="PDF-Befehl entfernen"
                    onClick={() => setPdfCommandSelected(false)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {pendingAttachments.map((item) => (
                item.kind === 'pasted-image' && item.previewDataUrl ? (
                  <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image chat-attach-removable">
                    <button
                      type="button"
                      className="chat-attachment-inline-preview-trigger"
                      aria-label="Vorschau vergrößern"
                      onClick={() => {
                        const u = item.previewDataUrl
                        if (u) {
                          setImageLightboxSrc(u)
                        }
                      }}
                    >
                      <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
                    </button>
                    <button
                      type="button"
                      className="chat-attachment-chip-remove"
                      aria-label={`${item.name} entfernen`}
                      onClick={() => removeAttachment(item.id)}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span key={item.id} className="chat-attachment-chip chat-attach-removable">
                    <span className="chat-attachment-chip-name">{item.name}</span>
                    <button
                      type="button"
                      className="chat-attachment-chip-remove"
                      aria-label={`${item.name} entfernen`}
                      onClick={() => removeAttachment(item.id)}
                    >
                      ×
                    </button>
                  </span>
                )
              ))}
            </div>
          ) : null}
          {isMobileCompactComposer ? (
            <div className="chat-input-pill chat-compact-composer-surface">
              <div className="chat-input-field">
                <div className="chat-input-field-grow">
                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    rows={1}
                    value={draft}
                    onChange={(event) => handleDraftChange(event.target.value)}
                    onKeyDown={handleComposeKeyDown}
                    onPaste={handleComposePaste}
                    placeholder={composePlaceholder}
                    disabled={isSending || tokenLimitReached || thinkingCreditsBlocked}
                    aria-multiline="true"
                    autoComplete="off"
                  />
                </div>
              </div>
              {composerSendButton}
            </div>
          ) : (
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
                      className={`thread-menu-item${slashMenuHighlightIndex === 1 ? ' is-selected' : ''}`}
                      role="menuitem"
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onMouseEnter={() => setSlashMenuHighlightIndex(1)}
                      onClick={handleSelectWordSlashCommand}
                    >
                      Word
                    </button>
                    <button
                      type="button"
                      className={`thread-menu-item${slashMenuHighlightIndex === 2 ? ' is-selected' : ''}`}
                      role="menuitem"
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onMouseEnter={() => setSlashMenuHighlightIndex(2)}
                      onClick={handleSelectPdfSlashCommand}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className={`thread-menu-item thread-menu-item--slash-image${
                        slashMenuHighlightIndex === 3 ? ' is-selected' : ''
                      }`}
                      role="menuitem"
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onMouseEnter={() => setSlashMenuHighlightIndex(3)}
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
                  disabled={isSending || tokenLimitReached || thinkingCreditsBlocked}
                  aria-multiline="true"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </div>
        {!isMobileCompactComposer ? composerSendButton : null}
        </form>
        {!isMobileComposer ? thinkingCreditsHintEl : null}
        <p className="chat-input-hint">
          Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
        </p>
      </div>
      {imageLightboxEl}
    </section>
  )
}
