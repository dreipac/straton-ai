import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useToast } from '../../../components/toast/ToastProvider'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMobileComposerCompact } from '../../../hooks/useMobileComposerCompact'
import { CHART_EXPORT_COMMAND_MARKER } from '../constants/chartExportPrompt'
import { EXCEL_EXPORT_COMMAND_MARKER } from '../constants/excelExportPrompt'
import { WORD_EXPORT_COMMAND_MARKER } from '../constants/wordExportPrompt'
import { PDF_EXPORT_COMMAND_MARKER } from '../constants/pdfExportPrompt'
import { IMAGE_GEN_TILE_PROMPT_PREFIX } from '../constants/imageGenTile'
import type { ChatThinkingMode } from '../constants/chatThinkingMode'
import { buildUserMessageWithSectionRef, type AssistantSectionReference } from '../utils/assistantSectionReply'
import { isChatVisionImageFile } from '../../learn/utils/documentParser'
import type { ChatDocumentAttachmentRef, ChatPendingDocumentFile } from '../types/chatSendOptions'
import {
  isServerExtractedDocumentFile,
  uploadChatDocumentAttachment,
} from '../services/chat.documentStorage'
import { hapticLightImpact } from '../../../utils/haptics'
import {
  detectExplicitQuizFormatInText,
  shouldPromptQuizFormatChoice,
  type QuizFormatChoice,
} from '../utils/quizFormatChoice'
import {
  buildPastedImagePendingAttachments,
  getImageFilesFromClipboard,
  type ChatWindowPendingAttachment,
} from '../components/chat-window/chatWindowMessageUtils'
import {
  CHAT_WINDOW_MOBILE_COMPOSER_MQ,
  CHAT_WINDOW_SLASH_MENU_ITEM_COUNT,
} from '../components/chat-window/chatWindowConstants'

const MAX_INPUT_HEIGHT_PX = 220

export type UseChatComposerArgs = {
  threadKey: string | null
  composerUserId?: string | null
  isSending: boolean
  tokenLimitReached: boolean
  thinkingCreditsBlocked: boolean
  chatThinkingMode: ChatThinkingMode
  onSendMessage: (
    content: string,
    opts?: {
      quizFormat?: QuizFormatChoice
      visionInlineDataUrl?: string
      documentAttachments?: ChatDocumentAttachmentRef[]
      pendingDocumentFiles?: ChatPendingDocumentFile[]
    },
  ) => Promise<void>
  onClearSectionReplyEmbed?: () => void
}

export function useChatComposer({
  threadKey,
  composerUserId,
  isSending,
  tokenLimitReached,
  thinkingCreditsBlocked,
  chatThinkingMode,
  onSendMessage,
  onClearSectionReplyEmbed,
}: UseChatComposerArgs) {
  const isMobileComposer = useMediaQuery(CHAT_WINDOW_MOBILE_COMPOSER_MQ)
  const mobileComposerCompact = useMobileComposerCompact()
  const isMobileCompactComposer = isMobileComposer && mobileComposerCompact
  const { push: pushToast } = useToast()

  const [draft, setDraft] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuHighlightIndex, setSlashMenuHighlightIndex] = useState(0)
  const [attachComposerSheetOpen, setAttachComposerSheetOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
  const [excelCommandSelected, setExcelCommandSelected] = useState(false)
  const [wordCommandSelected, setWordCommandSelected] = useState(false)
  const [pdfCommandSelected, setPdfCommandSelected] = useState(false)
  const [chartCommandSelected, setChartCommandSelected] = useState(false)
  const [imageGenCommandSelected, setImageGenCommandSelected] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<ChatWindowPendingAttachment[]>([])
  const [sentPastedImagePreviews, setSentPastedImagePreviews] = useState<Record<string, string>>({})
  const [quizFormatPending, setQuizFormatPending] = useState<{ content: string } | null>(null)
  const [composerSectionReply, setComposerSectionReply] = useState<AssistantSectionReference | null>(null)
  const onClearSectionReplyEmbedRef = useRef(onClearSectionReplyEmbed)
  onClearSectionReplyEmbedRef.current = onClearSectionReplyEmbed

  const composePlaceholder = tokenLimitReached
    ? 'Token-Limit erreicht'
    : thinkingCreditsBlocked
      ? 'Thinking-Guthaben aufgebraucht'
      : 'Straton fragen'

  const hasCommandOrAttachments =
    pendingAttachments.length > 0 ||
    imageGenCommandSelected ||
    excelCommandSelected ||
    wordCommandSelected ||
    pdfCommandSelected ||
    chartCommandSelected

  useEffect(() => {
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setChartCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setAttachComposerSheetOpen(false)
    onClearSectionReplyEmbedRef.current?.()
    setComposerSectionReply(null)
  }, [threadKey])

  useEffect(() => {
    if (isMobileComposer) {
      setShowSlashMenu(false)
    }
  }, [isMobileComposer])

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

  function buildAttachmentMessageBlocks(items: ChatWindowPendingAttachment[]): string {
    return items
      .map((item) => {
        if (item.kind === 'pasted-image') {
          if (item.previewDataUrl) {
            return `[BildData:${item.id}]\n${item.previewDataUrl}\n[/BildData]`
          }
          if (item.content.trim()) {
            return `[Bild:${item.id}:${item.name}]\n${item.content}\n[/Bild]`
          }
          return ''
        }
        if (item.documentStorage || item.pendingFile) {
          return `[Datei: ${item.name}]\n[/Datei]`
        }
        if (item.content.trim()) {
          return `[Datei: ${item.name}]\n${item.content}\n[/Datei]`
        }
        return `[Datei: ${item.name}] (Kein auslesbarer Text gefunden)\n[/Datei]`
      })
      .filter(Boolean)
      .join('\n\n')
  }

  function collectDocumentSendRefs(items: ChatWindowPendingAttachment[]): {
    documentAttachments: ChatDocumentAttachmentRef[]
    pendingDocumentFiles: ChatPendingDocumentFile[]
  } {
    const documentAttachments: ChatDocumentAttachmentRef[] = []
    const pendingDocumentFiles: ChatPendingDocumentFile[] = []
    for (const item of items) {
      if (item.kind !== 'file') {
        continue
      }
      if (item.documentStorage) {
        documentAttachments.push({
          id: item.id,
          name: item.name,
          bucket: item.documentStorage.bucket,
          path: item.documentStorage.path,
          mimeType: item.documentStorage.mimeType,
        })
      } else if (item.pendingFile) {
        pendingDocumentFiles.push({ id: item.id, name: item.name, file: item.pendingFile })
      }
    }
    return { documentAttachments, pendingDocumentFiles }
  }

  async function deliverComposerMessage(
    content: string,
    sendOpts?: { quizFormat?: QuizFormatChoice },
  ) {
    const pastedImageEntries = pendingAttachments.filter(
      (entry): entry is ChatWindowPendingAttachment & { kind: 'pasted-image'; previewDataUrl: string } =>
        entry.kind === 'pasted-image' && typeof entry.previewDataUrl === 'string' && entry.previewDataUrl.length > 0,
    )
    const visionInlineDataUrl = pastedImageEntries[0]?.previewDataUrl
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
    const { documentAttachments, pendingDocumentFiles } = collectDocumentSendRefs(pendingAttachments)
    setPendingAttachments([])
    setQuizFormatPending(null)
    const payload = buildUserMessageWithSectionRef(content, composerSectionReply)
    setComposerSectionReply(null)
    await onSendMessage(payload, {
      ...(sendOpts?.quizFormat ? { quizFormat: sendOpts.quizFormat } : {}),
      ...(visionInlineDataUrl ? { visionInlineDataUrl } : {}),
      ...(documentAttachments.length > 0 ? { documentAttachments } : {}),
      ...(pendingDocumentFiles.length > 0 ? { pendingDocumentFiles } : {}),
    })
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
          : chartCommandSelected
            ? `${CHART_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim()
            : baseContent
    if (
      shouldPromptQuizFormatChoice(textPart, {
        wantsWord: wordCommandSelected,
        wantsPdf: pdfCommandSelected,
        wantsExcel: excelCommandSelected,
        wantsChart: chartCommandSelected,
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
    if (
      excelCommandSelected ||
      chartCommandSelected ||
      imageGenCommandSelected ||
      wordCommandSelected ||
      pdfCommandSelected
    ) {
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

  function handleSelectChartSlashCommand() {
    setChartCommandSelected(true)
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectExcelSlashCommand() {
    setExcelCommandSelected(true)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setChartCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectWordSlashCommand() {
    setWordCommandSelected(true)
    setExcelCommandSelected(false)
    setPdfCommandSelected(false)
    setChartCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectPdfSlashCommand() {
    setPdfCommandSelected(true)
    setWordCommandSelected(false)
    setExcelCommandSelected(false)
    setChartCommandSelected(false)
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
    setChartCommandSelected(false)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus({ preventScroll: true })
  }

  function handleSelectChartQuickTile() {
    setChartCommandSelected(true)
    setExcelCommandSelected(false)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setImageGenCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function handleSelectExcelQuickTile() {
    setExcelCommandSelected(true)
    setWordCommandSelected(false)
    setPdfCommandSelected(false)
    setChartCommandSelected(false)
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
    setChartCommandSelected(false)
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
    setChartCommandSelected(false)
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
    setChartCommandSelected(false)
    setShowSlashMenu(false)
    if (!isMobileComposer) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function openMobileAttachSheet() {
    inputRef.current?.blur()
    setAttachComposerSheetOpen(true)
  }

  function openDocumentFilePicker() {
    fileInputRef.current?.click()
  }

  function openImageFilePicker() {
    imageFileInputRef.current?.click()
  }

  function handleComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashMenuHighlightIndex((i) => Math.min(CHAT_WINDOW_SLASH_MENU_ITEM_COUNT - 1, i + 1))
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
        } else if (slashMenuHighlightIndex === 3) {
          handleSelectChartSlashCommand()
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
      const nextAttachments: ChatWindowPendingAttachment[] = []

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
          const id = crypto.randomUUID()
          if (isServerExtractedDocumentFile(file)) {
            let documentStorage: ChatWindowPendingAttachment['documentStorage']
            if (composerUserId && threadKey) {
              try {
                documentStorage = await uploadChatDocumentAttachment(
                  composerUserId,
                  threadKey,
                  file,
                  id,
                )
              } catch {
                pushToast('Dokument konnte nicht hochgeladen werden. Bitte erneut versuchen.')
                continue
              }
            }
            nextAttachments.push({
              id,
              name: file.name,
              content: '',
              kind: 'file',
              documentStorage,
              pendingFile: documentStorage ? undefined : file,
            })
          } else {
            nextAttachments.push({
              id,
              name: file.name,
              content: '',
              kind: 'file',
              pendingFile: file,
            })
          }
        }
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments])
    } finally {
      setIsAttachingFiles(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (imageFileInputRef.current) {
        imageFileInputRef.current.value = ''
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

  function buildComposerInputRowClass(centered: boolean, touchStateClass?: string) {
    return [
      'chat-input-row',
      centered ? 'is-centered' : '',
      'chat-input-row--stacked',
      isMobileCompactComposer ? 'chat-input-row--mobile-compact' : '',
      chatThinkingMode === 'thinking' ? 'chat-input-row--thinking-mode' : '',
      isSending ? 'is-sending' : '',
      isMobileComposer ? 'tap-spring-surface' : '',
      isMobileComposer ? touchStateClass : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return {
    isMobileComposer,
    isMobileCompactComposer,
    draft,
    showSlashMenu,
    slashMenuHighlightIndex,
    setSlashMenuHighlightIndex,
    attachComposerSheetOpen,
    setAttachComposerSheetOpen,
    inputRef,
    fileInputRef,
    imageFileInputRef,
    isAttachingFiles,
    excelCommandSelected,
    setExcelCommandSelected,
    wordCommandSelected,
    setWordCommandSelected,
    pdfCommandSelected,
    setPdfCommandSelected,
    chartCommandSelected,
    setChartCommandSelected,
    imageGenCommandSelected,
    setImageGenCommandSelected,
    pendingAttachments,
    composerSectionReply,
    setComposerSectionReply,
    quizFormatPending,
    setQuizFormatPending,
    sentPastedImagePreviews,
    composePlaceholder,
    hasCommandOrAttachments,
    handleSubmit,
    handleQuizFormatChosen,
    handleDraftChange,
    handleSelectExcelSlashCommand,
    handleSelectWordSlashCommand,
    handleSelectPdfSlashCommand,
    handleSelectChartSlashCommand,
    handleSelectImageSlashCommand,
    handleSelectChartQuickTile,
    handleSelectExcelQuickTile,
    handleSelectWordQuickTile,
    handleSelectPdfQuickTile,
    handleSelectImageQuickTile,
    openMobileAttachSheet,
    openDocumentFilePicker,
    openImageFilePicker,
    handleComposeKeyDown,
    handleAttachFiles,
    handleComposePaste,
    removeAttachment,
    buildComposerInputRowClass,
    showComposerInlinePickers: !isMobileCompactComposer,
    attachButtonClassName: [
      'chat-attach-button',
      isMobileCompactComposer ? 'chat-compact-composer-surface' : '',
    ]
      .filter(Boolean)
      .join(' '),
    attachControlDisabled: isSending || isAttachingFiles || tokenLimitReached || thinkingCreditsBlocked,
  }
}
