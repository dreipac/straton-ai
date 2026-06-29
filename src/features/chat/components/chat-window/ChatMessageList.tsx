import { useRef, type RefObject } from 'react'
import fileIcon from '../../../../assets/icons/file.svg'
import { ChatExportActionHint } from '../ChatExportActionHint'
import { ChatInstantAnalyzeDebugPanel } from '../ChatInstantAnalyzeDebugPanel'
import { ChatThinkingAnalyzeDebugPanel } from '../ChatThinkingAnalyzeDebugPanel'
import { ChatMediaInlineImage } from '../ChatMediaInlineImage'
import { ChatPendingReplyLoader } from '../ChatPendingReplyLoader'
import { ChatMessageReplyQuotePreview } from '../ChatComposerReplyQuoteBar'
import { ChatUserMessageActionMenu } from '../ChatUserMessageMenuSelect'
import { ChatAssistantMessageCopyButton } from './ChatAssistantMessageCopyButton'
import { ChatDocumentExportButton } from './ChatDocumentExportButton'
import { extractAssistantMessageCopyText } from '../../utils/chatMessageCopy'
import { UnsplashPhotoResults } from '../UnsplashPhotoResults'
import {
  canFinalizeExcelExportFromThread,
  hasExcelSpecMarkers,
  parseExcelSpecFromContent,
  stripExcelSpecBlock,
} from '../../excel/excelSpec'
import { userMessageHadDirectAnswerIntent } from '../../constants/chatDirectAnswerInstruction'
import { stripComposerAttachmentBlocksForRouting } from '../../utils/chatRoutingText'
import {
  messageContainsSubscriptionUsageMarker,
  stripSubscriptionUsageMarker,
  userMessageRequestsSubscriptionUsage,
} from '../../constants/chatSubscriptionUsageMarker'
import type { AccountSubscriptionDisplay } from '../../../settings/utils/accountSubscriptionDisplay'
import { userMessageRequestsChart, userMessageRequestsDiagram } from '../../constants/instantAnalyzeRoute'
import { DirectAnswerMcqPreview } from '../DirectAnswerMcqPreview'
import { ChatSubscriptionUsagePreview } from '../ChatSubscriptionUsagePreview'
import { buildDirectAnswerMcqPreview } from '../../utils/directAnswerMcq'
import { ChartSpecPreview, ChartSpecPreviewBuilding } from '../ChartSpecPreview'
import { DiagramSpecPreview, DiagramSpecPreviewBuilding } from '../DiagramSpecPreview'
import { ExcelSpecPreview, ExcelSpecPreviewBuilding } from '../ExcelSpecPreview'
import {
  hasChartSpecMarkers,
  parseChartSpecFromContent,
  stripChartSpecBlock,
} from '../../chart/chartSpec'
import {
  hasDiagramSpecMarkers,
  parseDiagramSpecFromContent,
  stripDiagramSpecBlock,
} from '../../diagram/diagramSpec'
import { PptxPresentationCard, PptxPresentationCardBuilding } from '../PptxPresentationCard'
import {
  canFinalizePptxExportFromThread,
  hasPptxHtmlMarkers,
  resolvePptxPresentationState,
  stripPptxHtmlBlock,
  stripPptxPatchBlock,
  type PptxSlide,
} from '../../utils/pptxOutline'
import type { ChatMessage, ChatMessagePptxExport } from '../../types'
import { renderInlineMarkdown } from '../../utils/markdownInline'
import { renderAssistantRichContent } from '../../utils/renderAssistantRichContent'
import type { AssistantRichContentOptions } from '../../utils/renderAssistantRichContent'
import { parseSectionRefFromUserContent } from '../../utils/assistantSectionReply'
import { parseInteractiveContentWithFallback } from '../../utils/interactiveQuiz'
import {
  stripThinkingClarifyMarkersForDisplay,
  messageContainsCompleteThinkingClarifyBlock,
} from '../../utils/thinkingClarify'
import {
  canFinalizeWordExportFromThread,
  extractWordOutlineFromAssistantContent,
  stripWordSpecMarkerBlock,
} from '../../utils/wordOutline'
import { WordDocumentCard, WordDocumentCardBuilding } from '../WordDocumentCard'
import { ChatGenDotsLoader } from '../ChatGenDotsLoader'
import type { WordPage } from '../../utils/wordPaginate'
import { stripPdfSpecMarkerBlock } from '../../pdf/pdfOutline'
import { canFinalizePdfExportFromThread } from '../../pdf/pdfOutline'
import type { ChatThinkingMode } from '../../constants/chatThinkingMode'
import type { useUserMessageLongPress } from '../../hooks/useUserMessageLongPress'
import type { QuizAnswerState } from '../../hooks/useChatMessageList'
import { getChatSendPhaseLabel, type ChatSendPhaseState } from '../../constants/chatSendPhase'
import {
  EXCEL_GEN_MATRIX_CELLS,
  EXCEL_GEN_MATRIX_COLS,
  EXCEL_GEN_MATRIX_ROWS,
  IMAGE_GEN_MATRIX_DOTS,
  IMAGE_GEN_MATRIX_SIZE,
} from './chatWindowExportMatrices'
import {
  extractBildDataUrlFromStoredContent,
  extractChatMediaStoragePathFromStoredContent,
  extractDateiTextFromContent,
  resolveUserMessageDocumentAttachments,
  type ResolvedUserDocumentAttachment,
  extractPastedImageIdsFromContent,
  safeMessageContent,
  stripAttachmentBlocksForDisplay,
} from './chatWindowMessageUtils'

export type ChatMessageListProps = {
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messages: ChatMessage[]
  animatedAssistantContent: Record<string, string>
  sentPastedImagePreviews: Record<string, string>
  onImagePreview: (src: string) => void
  onDocumentPreview?: (request: {
    attachment: ResolvedUserDocumentAttachment
    messageContent: string
  }) => void
  isMobileComposer: boolean
  showInstantAnalyzeDebug: boolean
  chatThinkingMode: ChatThinkingMode
  isSending: boolean
  showPendingAssistantRow: boolean
  showBootstrapPendingRow: boolean
  bootstrapStatusLabel: string | undefined
  pendingImageGeneration: boolean
  pendingImageSearch: boolean
  pendingExcelGeneration: boolean
  pendingWordGeneration: boolean
  pendingPdfGeneration: boolean
  pendingChartGeneration: boolean
  pendingDiagramGeneration: boolean
  pendingPptxGeneration: boolean
  pendingStatusLabel: string | undefined
  sendPhase: ChatSendPhaseState
  showLatestAssistantOrbitLoader: boolean
  streamingStatusLabel: string
  userMessageLongPress: ReturnType<typeof useUserMessageLongPress>
  buildAssistantRichOptions: (messageId: string) => AssistantRichContentOptions
  getQuizAnswerState: (messageId: string, questionId: string) => QuizAnswerState
  updateQuizAnswerValue: (messageId: string, questionId: string, value: string) => void
  checkQuizAnswer: (message: ChatMessage, questionId: string) => void | Promise<void>
  quizChecksInProgress: Record<string, boolean>
  downloadExcelExport: (message: ChatMessage) => void | Promise<void>
  downloadWordExport: (message: ChatMessage) => void | Promise<void>
  downloadPdfExport: (message: ChatMessage) => void | Promise<void>
  downloadPptxExport: (message: ChatMessage) => void | Promise<void>
  excelDownloadBusyId: string | null
  wordDownloadBusyId: string | null
  pdfDownloadBusyId: string | null
  pptxDownloadBusyId: string | null
  onFinalizeWordDocument?: () => void | Promise<unknown>
  wordFinalizeBusy: boolean
  onFinalizePdfDocument?: () => void | Promise<void>
  pdfFinalizeBusy: boolean
  onFinalizeExcelDocument?: () => void | Promise<void>
  excelFinalizeBusy: boolean
  onFinalizePptxDocument?: () => Promise<ChatMessagePptxExport | undefined> | void
  pptxFinalizeBusy: boolean
  onCopyUserMessage: (text: string) => boolean | Promise<boolean>
  subscriptionUsageDisplay?: AccountSubscriptionDisplay | null
  onPptxPreview?: (messageId: string, slides: PptxSlide[]) => void
  onWordPreview?: (messageId: string, pages: WordPage[], fileName?: string) => void
  /** Anzeigename des Nutzers — Autor fürs Word-Titelblatt. */
  documentAuthorName?: string
}

export function ChatMessageList(props: ChatMessageListProps) {
  const {
    messagesScrollRef,
    messages,
    animatedAssistantContent,
    sentPastedImagePreviews,
    onImagePreview,
    onDocumentPreview,
    isMobileComposer,
    showInstantAnalyzeDebug,
    chatThinkingMode,
    isSending,
    showPendingAssistantRow,
    showBootstrapPendingRow,
    bootstrapStatusLabel,
    pendingImageGeneration,
    pendingImageSearch,
    pendingExcelGeneration,
    pendingWordGeneration,
    pendingPdfGeneration,
    pendingChartGeneration,
    pendingDiagramGeneration,
    pendingPptxGeneration,
    pendingStatusLabel,
    sendPhase,
    showLatestAssistantOrbitLoader,
    streamingStatusLabel,
    userMessageLongPress,
    buildAssistantRichOptions,
    getQuizAnswerState,
    updateQuizAnswerValue,
    checkQuizAnswer,
    quizChecksInProgress,
    downloadExcelExport,
    downloadWordExport,
    downloadPdfExport,
    downloadPptxExport,
    excelDownloadBusyId,
    wordDownloadBusyId,
    pdfDownloadBusyId,
    pptxDownloadBusyId,
    onFinalizeWordDocument,
    wordFinalizeBusy,
    onFinalizePdfDocument,
    pdfFinalizeBusy,
    onFinalizeExcelDocument,
    excelFinalizeBusy,
    onFinalizePptxDocument,
    pptxFinalizeBusy,
    onCopyUserMessage,
    subscriptionUsageDisplay,
    onPptxPreview,
    onWordPreview,
    documentAuthorName,
  } = props

  const userMessageMenuAnchorRef = useRef<HTMLDivElement | null>(null)

  /**
   * Editier-Turns (`pptxEditAnchorMessageId` gesetzt) werden unten komplett übersprungen (kein
   * eigener Bubble/Karte) — die "letzte" Nachricht für Enter-Animation/Finalize-Hinweis ist deshalb
   * nicht zwingend `messages[messages.length-1]`, sondern die letzte tatsächlich gerenderte.
   */
  let lastVisibleMessageId: string | undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].metadata?.pptxEditAnchorMessageId) {
      lastVisibleMessageId = messages[i].id
      break
    }
  }

  return (
    <div className="chat-messages" ref={messagesScrollRef}>
        <div className="chat-messages-inner">
        {messages.map((message, messageIndex) => {
          if (message.metadata?.pptxEditAnchorMessageId) {
            return null
          }
          const rawContent = safeMessageContent(message.content)
          const isAssistant = message.role === 'assistant'
          let precedingUserForWordPaper: (typeof messages)[number] | null = null
          if (isAssistant) {
            for (let i = messageIndex - 1; i >= 0; i -= 1) {
              if (messages[i].role === 'user') {
                precedingUserForWordPaper = messages[i]
                break
              }
            }
          }
          const isWordAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userWordCommand)
          const isPdfAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userPdfCommand)
          const isExcelAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userExcelCommand)
          const isPptxAssistantTurn =
            isAssistant && Boolean(precedingUserForWordPaper?.metadata?.userPptxCommand)
          const isChartAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageRequestsChart(
                  precedingUserForWordPaper.content,
                  precedingUserForWordPaper.metadata,
                ),
            )
          const isDiagramAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageRequestsDiagram(
                  precedingUserForWordPaper.content,
                  precedingUserForWordPaper.metadata,
                ),
            )
          const precedingUserRoutingText = precedingUserForWordPaper
            ? stripComposerAttachmentBlocksForRouting(precedingUserForWordPaper.content)
            : ''
          const isDirectAnswerAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageHadDirectAnswerIntent(
                  precedingUserRoutingText,
                  precedingUserForWordPaper.metadata,
                  messages
                    .slice(0, messageIndex)
                    .filter((m) => m.role === 'user' || m.role === 'assistant')
                    .map((m) => ({ role: m.role, content: m.content })),
                ),
            )
          const isSubscriptionUsageAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageRequestsSubscriptionUsage(precedingUserForWordPaper.content),
            )
          const directAnswerMcq =
            isDirectAnswerAssistantTurn && precedingUserForWordPaper
              ? buildDirectAnswerMcqPreview(
                  precedingUserRoutingText,
                  rawContent,
                  messages,
                  messageIndex,
                )
              : null
          const excelSpecForPreview =
            isExcelAssistantTurn && !message.metadata?.excelExport
              ? parseExcelSpecFromContent(rawContent).spec
              : null
          const chartSpecForPreview = isChartAssistantTurn
            ? parseChartSpecFromContent(rawContent).spec
            : null
          const diagramSpecForPreview = isDiagramAssistantTurn
            ? parseDiagramSpecFromContent(rawContent).spec
            : null
          /** Berücksichtigt bereits erfolgte Editier-Turns dieser Präsentation (siehe `resolvePptxPresentationState`) — die Karte/das Modal zeigen so immer den aktuellsten Stand, nicht nur den dieser einen Nachricht. */
          const pptxSlidesForPreview = isPptxAssistantTurn
            ? resolvePptxPresentationState(messages, message.id)?.slides ?? []
            : []
          const parsed = isAssistant ? parseInteractiveContentWithFallback(rawContent) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = safeMessageContent(animatedAssistantContent[message.id] ?? rawContent)
          /** Nach Excel-Export: gespeicherten Text nutzen (ohne Spec), nicht den Animations-Puffer mit altem JSON. */
          const baseAssistantForDisplay = message.metadata?.liveStream
            ? stripPptxPatchBlock(
                stripPptxHtmlBlock(stripDiagramSpecBlock(stripChartSpecBlock(stripExcelSpecBlock(rawContent)))),
              )
            : message.metadata?.excelExport ||
                message.metadata?.wordExport ||
                message.metadata?.pdfExport ||
                message.metadata?.pptxExport
              ? rawContent
              : animatedContent
          const rawAssistantDisplay = hasInteractiveQuiz ? parsed?.cleanText || '' : baseAssistantForDisplay
          /** JSON-Spec und alte Word/PDF-Outline-Blöcke nie anzeigen — nur lesbaren Text. */
          const assistantAfterExcel = stripSubscriptionUsageMarker(
            stripWordSpecMarkerBlock(
              stripPdfSpecMarkerBlock(
                stripPptxPatchBlock(
                  stripPptxHtmlBlock(
                    stripDiagramSpecBlock(stripChartSpecBlock(stripExcelSpecBlock(rawAssistantDisplay))),
                  ),
                ),
              ),
            ),
          )
          const thinkingClarifyStreaming =
            isAssistant &&
            !isWordAssistantTurn &&
            !isPptxAssistantTurn &&
            chatThinkingMode === 'thinking' &&
            Boolean(message.metadata?.liveStream) &&
            message.metadata?.thinkingStreamKind === 'clarify' &&
            !messageContainsCompleteThinkingClarifyBlock(rawContent)
          /** Immer Clarify-JSON ausblenden, wenn der Block gültig ist — nicht an den aktuellen Composer-Modus koppeln (nach Reload oft «normal»). */
          const userSectionReplyParsed =
            message.role === 'user' ? parseSectionRefFromUserContent(rawContent) : null
          const displayContent = isAssistant
            ? isWordAssistantTurn || isPdfAssistantTurn
              ? assistantAfterExcel
              : stripThinkingClarifyMarkersForDisplay(assistantAfterExcel)
            : userSectionReplyParsed
              ? stripAttachmentBlocksForDisplay(userSectionReplyParsed.userText)
              : stripAttachmentBlocksForDisplay(rawContent)
          const pastedImageIds = message.role === 'user' ? extractPastedImageIdsFromContent(rawContent) : []
          const savedDocuments =
            message.role === 'user' ? resolveUserMessageDocumentAttachments(message) : []
          const showUserInlineImages = message.role === 'user' && pastedImageIds.length > 0
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
          const showPptxFallbackText =
            isAssistant &&
            Boolean(message.metadata?.pptxExport) &&
            !String(displayContent ?? '').trim()
          const isLatestMessage = message.id === lastVisibleMessageId
          const showWordFinalizeHint =
            isAssistant &&
            isLatestMessage &&
            !isSending &&
            Boolean(onFinalizeWordDocument) &&
            canFinalizeWordExportFromThread(messages) &&
            !message.metadata?.wordExport
          const showPdfFinalizeHint =
            isAssistant &&
            isLatestMessage &&
            !isSending &&
            Boolean(onFinalizePdfDocument) &&
            canFinalizePdfExportFromThread(messages) &&
            !message.metadata?.pdfExport
          const showExcelFinalizeHint =
            isAssistant &&
            isLatestMessage &&
            !isSending &&
            Boolean(onFinalizeExcelDocument) &&
            canFinalizeExcelExportFromThread(messages) &&
            !message.metadata?.excelExport
          /** `canFinalizePptxExportFromThread` berücksichtigt bereits, ob ein vorhandener `pptxExport` durch spätere Edits veraltet ist — kein zusätzliches `!message.metadata?.pptxExport` nötig (das würde nach einem Edit fälschlich blockieren). */
          const showPptxFinalizeHint =
            isAssistant &&
            isLatestMessage &&
            !isSending &&
            Boolean(onFinalizePptxDocument) &&
            canFinalizePptxExportFromThread(messages)
          const isStreamingAssistant =
            isAssistant &&
            !hasInteractiveQuiz &&
            !message.metadata?.excelExport &&
            !message.metadata?.wordExport &&
            !message.metadata?.pdfExport &&
            !message.metadata?.pptxExport &&
            (Boolean(message.metadata?.liveStream) ||
              animatedContent.length < rawContent.length)
          const showSubscriptionUsagePreview =
            Boolean(subscriptionUsageDisplay) &&
            isAssistant &&
            !isStreamingAssistant &&
            (messageContainsSubscriptionUsageMarker(rawContent) || isSubscriptionUsageAssistantTurn)
          const showExcelSpecPreviewBuilding =
            isExcelAssistantTurn &&
            !message.metadata?.excelExport &&
            !excelSpecForPreview &&
            (isStreamingAssistant ||
              Boolean(message.metadata?.liveStream) ||
              hasExcelSpecMarkers(rawContent))
          const showChartSpecPreviewBuilding =
            isChartAssistantTurn &&
            !chartSpecForPreview &&
            (isStreamingAssistant ||
              Boolean(message.metadata?.liveStream) ||
              hasChartSpecMarkers(rawContent))
          const showChartSpecMissingHint =
            isChartAssistantTurn &&
            !chartSpecForPreview &&
            !showChartSpecPreviewBuilding &&
            !isSending
          const showDiagramSpecPreviewBuilding =
            isDiagramAssistantTurn &&
            !diagramSpecForPreview &&
            (isStreamingAssistant ||
              Boolean(message.metadata?.liveStream) ||
              hasDiagramSpecMarkers(rawContent))
          const showDiagramSpecMissingHint =
            isDiagramAssistantTurn &&
            !diagramSpecForPreview &&
            !showDiagramSpecPreviewBuilding &&
            !isSending
          const showPptxCardBuilding =
            isPptxAssistantTurn &&
            !message.metadata?.pptxExport &&
            pptxSlidesForPreview.length === 0 &&
            (isStreamingAssistant ||
              Boolean(message.metadata?.liveStream) ||
              hasPptxHtmlMarkers(rawContent))
          /**
           * Word-Vorschau-Karte: erst wenn der Entwurf fertig ist (nicht mehr streamt). Gleiche
           * Outline-Pipeline wie der Export → Karte/Modal zeigen exakt, was die .docx wird. Ersetzt
           * die Roh-Markdown-Wand im Chat (analog zur Präsentations-Karte).
           */
          const parsedWordCardOutline =
            isWordAssistantTurn && !isStreamingAssistant && !message.metadata?.liveStream
              ? extractWordOutlineFromAssistantContent(rawContent, 'word')
              : null
          // Autor fürs Titelblatt = Anzeigename (gleiche Quelle wie der Export).
          const wordCardOutline =
            parsedWordCardOutline && documentAuthorName?.trim() && parsedWordCardOutline.title
              ? { ...parsedWordCardOutline, author: documentAuthorName.trim() }
              : parsedWordCardOutline
          const showWordCard = wordCardOutline !== null
          /** Word steht im Export-Popover IMMER zur Verfügung (auch wenn die Karte/das Modal schon eine Word-Aktion bietet) — gleicher Inhalt, beide Formate (Word + PDF) wählbar. */
          const effectiveCanExportWord = showWordFinalizeHint
          /**
           * Word-Turn wird gerade generiert: KEIN Roh-Markdown im Chat zeigen, nur einen Loader, bis die
           * fertige Vorschau-Karte erscheint (analog Präsentation). `showWordCard` ist während des Streams
           * noch false (siehe `wordCardOutline`), daher greift dieser Zweig nur in der Bauphase.
           */
          const showWordCardBuilding =
            isWordAssistantTurn &&
            !showWordCard &&
            !message.metadata?.wordExport &&
            (isStreamingAssistant || Boolean(message.metadata?.liveStream))
          const showOrbitLoader =
            isAssistant &&
            isLatestMessage &&
            showLatestAssistantOrbitLoader &&
            !isWordAssistantTurn &&
            !isPptxAssistantTurn &&
            !isPdfAssistantTurn
          const assistantCopySource = hasInteractiveQuiz ? parsed?.cleanText || '' : rawContent
          const assistantCopyText = isAssistant
            ? extractAssistantMessageCopyText(assistantCopySource)
            : ''
          const showAssistantCopyButton =
            isAssistant &&
            !isStreamingAssistant &&
            !thinkingClarifyStreaming &&
            !showOrbitLoader &&
            assistantCopyText.length > 0
          const showAssistantAuthor = isAssistant && !showOrbitLoader

          const userMessageCopyText =
            message.role === 'user' ? stripAttachmentBlocksForDisplay(rawContent) : ''
          const userMessageLongPressHandlers =
            message.role === 'user' && userMessageCopyText
              ? userMessageLongPress.bindUserMessageLongPress(message.id, userMessageCopyText)
              : undefined
          const userMessagePressActive =
            message.role === 'user' && userMessageLongPress.isMessagePressActive(message.id)
          const isUserMessage = message.role === 'user'
          const userMessageHasAttachments =
            isUserMessage && (showUserInlineImages || savedDocuments.length > 0)
          const userMessageShowBubble =
            isUserMessage &&
            (Boolean(String(displayContent ?? '').trim()) ||
              Boolean(userSectionReplyParsed?.sectionRef) ||
              (showInstantAnalyzeDebug &&
                Boolean(message.metadata?.instantAnalyzeDebug || message.metadata?.thinkingAnalyzeDebug)))

          if (isUserMessage) {
            return (
              <article
                key={message.id}
                className={`chat-user-message-turn${
                  isLatestMessage ? ' chat-message--user-enter' : ''
                }`}
              >
                {userMessageHasAttachments ? (
                  <div className="chat-user-message-attachments" aria-label="Anhänge">
                    {showUserInlineImages ? (
                      <div className="chat-user-inline-images" aria-label="Eingefügte Bilder">
                        {pastedImageIds.map((imageId) => {
                          const inlineSrc =
                            sentPastedImagePreviews[imageId] ??
                            extractBildDataUrlFromStoredContent(rawContent, imageId)
                          if (inlineSrc) {
                            return (
                              <button
                                key={imageId}
                                type="button"
                                className="chat-user-inline-image-trigger"
                                aria-label="Bild vergrößern"
                                onClick={() => onImagePreview(inlineSrc)}
                              >
                                <img
                                  className="chat-user-inline-image"
                                  src={inlineSrc}
                                  alt="Eingefügtes Bild"
                                />
                              </button>
                            )
                          }
                          const storagePath =
                            extractChatMediaStoragePathFromStoredContent(rawContent, imageId) ??
                            (message.metadata?.visionImage?.attachmentId === imageId
                              ? message.metadata.visionImage.path
                              : undefined)
                          if (!storagePath) {
                            return null
                          }
                          return (
                            <ChatMediaInlineImage
                              key={imageId}
                              storagePath={storagePath}
                              alt="Eingefügtes Bild"
                              className="chat-user-inline-image"
                              onPreview={onImagePreview}
                            />
                          )
                        })}
                      </div>
                    ) : null}
                    {savedDocuments.length > 0 ? (
                      <div
                        className="chat-user-saved-attachments chat-attachment-chips"
                        aria-label="Angehängte Dateien"
                      >
                        {savedDocuments.map((attachment) => {
                          const canPreview =
                            !attachment.textOnly ||
                            extractDateiTextFromContent(rawContent, attachment.name).length > 0
                          const chipContent = (
                            <>
                              <img
                                className="ui-icon chat-attachment-chip-icon"
                                src={fileIcon}
                                alt=""
                                aria-hidden="true"
                              />
                              <span className="chat-attachment-chip-name">{attachment.name}</span>
                            </>
                          )
                          if (canPreview && onDocumentPreview) {
                            return (
                              <button
                                key={`${message.id}-datei-${attachment.id}`}
                                type="button"
                                className="chat-attachment-chip chat-attachment-chip--saved-file chat-attachment-chip--preview"
                                aria-label={`Dokument «${attachment.name}» anzeigen`}
                                onClick={() =>
                                  onDocumentPreview({
                                    attachment,
                                    messageContent: rawContent,
                                  })
                                }
                              >
                                {chipContent}
                              </button>
                            )
                          }
                          return (
                            <span
                              key={`${message.id}-datei-${attachment.id}`}
                              className="chat-attachment-chip chat-attachment-chip--saved-file"
                            >
                              {chipContent}
                            </span>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {userMessageShowBubble ? (
                  <div
                    ref={
                      userMessageLongPress.shouldShowCopyMenu(message.id)
                        ? userMessageMenuAnchorRef
                        : undefined
                    }
                    className={`chat-message is-user chat-user-message-bubble${
                      userMessagePressActive ? ' is-message-press-active' : ''
                    }`}
                    {...userMessageLongPressHandlers}
                  >
                    {userSectionReplyParsed?.sectionRef ? (
                      <ChatMessageReplyQuotePreview reference={userSectionReplyParsed.sectionRef} />
                    ) : null}
                    {showInstantAnalyzeDebug && message.metadata?.instantAnalyzeDebug ? (
                      <ChatInstantAnalyzeDebugPanel debug={message.metadata.instantAnalyzeDebug} />
                    ) : null}
                    {showInstantAnalyzeDebug && message.metadata?.thinkingAnalyzeDebug ? (
                      <ChatThinkingAnalyzeDebugPanel debug={message.metadata.thinkingAnalyzeDebug} />
                    ) : null}
                    {displayContent ? <p>{renderInlineMarkdown(displayContent)}</p> : null}
                    {isMobileComposer && userMessageLongPress.shouldShowCopyMenu(message.id) ? (
                      <ChatUserMessageActionMenu
                        key={userMessageLongPress.menuState?.nonce}
                        anchorRef={userMessageMenuAnchorRef}
                        menuNonce={userMessageLongPress.menuState?.nonce ?? 0}
                        onCopy={() => {
                          const text = userMessageLongPress.getMenuCopyText()
                          if (!text) {
                            return false
                          }
                          return onCopyUserMessage(text)
                        }}
                        onClose={userMessageLongPress.closeMenu}
                      />
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          }

          return (
            <article
              key={message.id}
              className={`chat-message is-assistant${isStreamingAssistant ? ' chat-message--streaming' : ''}${
                isLatestMessage ? ' chat-message--assistant-enter' : ''
              }`}
            >
              {showOrbitLoader ? (
                <div className="chat-message-orbit-loader-wrap">
                  <ChatPendingReplyLoader statusLabel={streamingStatusLabel} sendPhase={sendPhase} />
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
              {thinkingClarifyStreaming ? (
                <p className="chat-thinking-stream-hint" role="status">
                  KI formuliert eine Rückfrage…
                </p>
              ) : showWordCard && wordCardOutline ? (
                <WordDocumentCard
                  outline={wordCardOutline}
                  onOpen={(pages) => onWordPreview?.(message.id, pages, wordCardOutline.fileName)}
                />
              ) : showWordCardBuilding ? (
                <WordDocumentCardBuilding />
              ) : displayContent ? (
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
                      const unsplash = message.metadata?.unsplashSearch
                      const assistantRichContent = directAnswerMcq
                        ? directAnswerMcq.correctLetter
                          ? directAnswerMcq.rationale.trim()
                          : isStreamingAssistant
                            ? ''
                            : displayContent
                        : displayContent
                      return (
                        <div className="chat-message-body chat-message-body--rich chat-message-body--unsplash">
                          {directAnswerMcq ? (
                            <DirectAnswerMcqPreview
                              prompt={directAnswerMcq.prompt}
                              options={directAnswerMcq.options}
                              correctLetter={directAnswerMcq.correctLetter}
                              isStreaming={isStreamingAssistant}
                            />
                          ) : null}
                          {assistantRichContent ? (
                            renderAssistantRichContent(
                              assistantRichContent,
                              buildAssistantRichOptions(message.id),
                            )
                          ) : null}
                          {unsplash ? (
                            <UnsplashPhotoResults query={unsplash.query} photos={unsplash.photos} />
                          ) : null}
                          {showSubscriptionUsagePreview && subscriptionUsageDisplay ? (
                            <ChatSubscriptionUsagePreview display={subscriptionUsageDisplay} />
                          ) : null}
                        </div>
                      )
                    })()
                  ) : (
                    <div className="chat-message-body chat-message-body--rich chat-message-body--unsplash">
                      {renderAssistantRichContent(
                        displayContent,
                        buildAssistantRichOptions(message.id),
                      )}
                      {message.metadata?.unsplashSearch ? (
                        <UnsplashPhotoResults
                          query={message.metadata.unsplashSearch.query}
                          photos={message.metadata.unsplashSearch.photos}
                        />
                      ) : null}
                      {showSubscriptionUsagePreview && subscriptionUsageDisplay ? (
                        <ChatSubscriptionUsagePreview display={subscriptionUsageDisplay} />
                      ) : null}
                    </div>
                  )
              ) : null}
              {(showAssistantCopyButton || effectiveCanExportWord || showPdfFinalizeHint) ? (
                <div className="chat-message-actions">
                  {showAssistantCopyButton ? (
                    <ChatAssistantMessageCopyButton
                      onCopy={() => onCopyUserMessage(assistantCopyText)}
                    />
                  ) : null}
                  {(effectiveCanExportWord || showPdfFinalizeHint) ? (
                    <ChatDocumentExportButton
                      canExportWord={effectiveCanExportWord}
                      canExportPdf={showPdfFinalizeHint}
                      wordBusy={wordFinalizeBusy}
                      pdfBusy={pdfFinalizeBusy}
                      onExportWord={() => void onFinalizeWordDocument?.()}
                      onExportPdf={() => void onFinalizePdfDocument?.()}
                    />
                  ) : null}
                </div>
              ) : null}
              {showExcelFallbackText ? (
                isMobileComposer ? (
                  <ChatExportActionHint
                    label={
                      excelDownloadBusyId === message.id
                        ? 'Wird vorbereitet…'
                        : 'Excel-Datei herunterladen'
                    }
                    busy={excelDownloadBusyId === message.id}
                    onAction={() => {
                      void downloadExcelExport(message)
                    }}
                  />
                ) : (
                  <p className="chat-message-body chat-excel-fallback-text">
                    Die Excel-Datei ist bereit — nutze den Download-Button unten.
                  </p>
                )
              ) : null}
              {showWordFallbackText ? (
                isMobileComposer ? (
                  <ChatExportActionHint
                    label={
                      wordDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Word-Datei herunterladen'
                    }
                    busy={wordDownloadBusyId === message.id}
                    onAction={() => {
                      void downloadWordExport(message)
                    }}
                  />
                ) : (
                  <p className="chat-message-body chat-excel-fallback-text">
                    Die Word-Datei ist bereit — nutze den Download-Button unten.
                  </p>
                )
              ) : null}
              {showPdfFallbackText ? (
                isMobileComposer ? (
                  <ChatExportActionHint
                    label={
                      pdfDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'PDF-Datei herunterladen'
                    }
                    busy={pdfDownloadBusyId === message.id}
                    onAction={() => {
                      void downloadPdfExport(message)
                    }}
                  />
                ) : (
                  <p className="chat-message-body chat-excel-fallback-text">
                    Die PDF-Datei ist bereit — nutze den Download-Button unten.
                  </p>
                )
              ) : null}
              {excelSpecForPreview ? (
                <ExcelSpecPreview spec={excelSpecForPreview} />
              ) : showExcelSpecPreviewBuilding ? (
                <ExcelSpecPreviewBuilding />
              ) : null}
              {chartSpecForPreview ? (
                <ChartSpecPreview spec={chartSpecForPreview} />
              ) : showChartSpecPreviewBuilding ? (
                <ChartSpecPreviewBuilding />
              ) : showChartSpecMissingHint ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Das Diagramm konnte nicht geladen werden — die KI hat kein gültiges Chart-JSON geliefert.
                  Bitte die Anfrage erneut senden.
                </p>
              ) : null}
              {diagramSpecForPreview ? (
                <DiagramSpecPreview spec={diagramSpecForPreview} />
              ) : showDiagramSpecPreviewBuilding ? (
                <DiagramSpecPreviewBuilding />
              ) : showDiagramSpecMissingHint ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Das Struktur-Diagramm konnte nicht geladen werden — die KI hat keinen gültigen Mermaid-Block
                  geliefert. Bitte die Anfrage erneut senden.
                </p>
              ) : null}
              {pptxSlidesForPreview.length > 0 ? (
                <PptxPresentationCard
                  slides={pptxSlidesForPreview}
                  onOpen={() => onPptxPreview?.(message.id, pptxSlidesForPreview)}
                />
              ) : showPptxCardBuilding ? (
                <PptxPresentationCardBuilding />
              ) : null}
              {showPptxFallbackText ? (
                isMobileComposer ? (
                  <ChatExportActionHint
                    label={
                      pptxDownloadBusyId === message.id
                        ? 'Wird vorbereitet…'
                        : 'PowerPoint-Datei herunterladen'
                    }
                    busy={pptxDownloadBusyId === message.id}
                    onAction={() => {
                      void downloadPptxExport(message)
                    }}
                  />
                ) : (
                  <p className="chat-message-body chat-excel-fallback-text">
                    Die PowerPoint-Datei ist bereit — nutze den Download-Button unten.
                  </p>
                )
              ) : null}
              {showPptxFinalizeHint ? (
                <ChatExportActionHint
                  label={
                    pptxFinalizeBusy ? 'PowerPoint wird erstellt…' : 'PowerPoint generieren'
                  }
                  busy={pptxFinalizeBusy}
                  onAction={() => {
                    void onFinalizePptxDocument?.()
                  }}
                />
              ) : null}
              {showExcelFinalizeHint ? (
                <ChatExportActionHint
                  label={
                    excelFinalizeBusy ? 'Excel wird erstellt…' : 'Excel generieren'
                  }
                  busy={excelFinalizeBusy}
                  onAction={() => {
                    void onFinalizeExcelDocument?.()
                  }}
                />
              ) : null}
              {isMobileComposer && message.metadata?.excelExport && !showExcelFallbackText ? (
                <ChatExportActionHint
                  label={
                    excelDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Excel-Datei herunterladen'
                  }
                  busy={excelDownloadBusyId === message.id}
                  onAction={() => {
                    void downloadExcelExport(message)
                  }}
                />
              ) : null}
              {isMobileComposer && message.metadata?.wordExport && !showWordFallbackText ? (
                <ChatExportActionHint
                  label={
                    wordDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Word-Datei herunterladen'
                  }
                  busy={wordDownloadBusyId === message.id}
                  onAction={() => {
                    void downloadWordExport(message)
                  }}
                />
              ) : null}
              {isMobileComposer && message.metadata?.pdfExport && !showPdfFallbackText ? (
                <ChatExportActionHint
                  label={
                    pdfDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'PDF-Datei herunterladen'
                  }
                  busy={pdfDownloadBusyId === message.id}
                  onAction={() => {
                    void downloadPdfExport(message)
                  }}
                />
              ) : null}
              {isMobileComposer && message.metadata?.pptxExport && !showPptxFallbackText ? (
                <ChatExportActionHint
                  label={
                    pptxDownloadBusyId === message.id
                      ? 'Wird vorbereitet…'
                      : 'PowerPoint-Datei herunterladen'
                  }
                  busy={pptxDownloadBusyId === message.id}
                  onAction={() => {
                    void downloadPptxExport(message)
                  }}
                />
              ) : null}

              {message.metadata?.excelExport && !isMobileComposer ? (
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

              {message.metadata?.wordExport && !isMobileComposer ? (
                <div className="chat-file-card">
                  <div className="chat-file-card__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                      <line x1="9" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="chat-file-card__info">
                    <span className="chat-file-card__name">{message.metadata.wordExport.fileName}</span>
                    <span className="chat-file-card__type">Word-Dokument</span>
                  </div>
                  <button
                    type="button"
                    className="chat-file-card__download-btn"
                    disabled={wordDownloadBusyId === message.id}
                    aria-label="Word-Datei herunterladen"
                    title="Herunterladen"
                    onClick={() => { void downloadWordExport(message) }}
                  >
                    {wordDownloadBusyId === message.id ? (
                      <span style={{ fontSize: '0.75rem' }}>…</span>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : null}

              {message.metadata?.pdfExport && !isMobileComposer ? (
                <div className="chat-file-card">
                  <div className="chat-file-card__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="chat-file-card__info">
                    <span className="chat-file-card__name">{message.metadata.pdfExport.fileName}</span>
                    <span className="chat-file-card__type">PDF-Dokument</span>
                  </div>
                  <button
                    type="button"
                    className="chat-file-card__download-btn"
                    disabled={pdfDownloadBusyId === message.id}
                    aria-label="PDF-Datei herunterladen"
                    title="Herunterladen"
                    onClick={() => { void downloadPdfExport(message) }}
                  >
                    {pdfDownloadBusyId === message.id ? (
                      <span style={{ fontSize: '0.75rem' }}>…</span>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : null}

              {message.metadata?.pptxExport && !isMobileComposer ? (
                <div className="chat-excel-download">
                  <button
                    type="button"
                    className="chat-excel-download-button"
                    disabled={pptxDownloadBusyId === message.id}
                    onClick={() => {
                      void downloadPptxExport(message)
                    }}
                  >
                    {pptxDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'PowerPoint herunterladen'}
                  </button>
                </div>
              ) : null}

              {hasInteractiveQuiz ? (
                <section className="interactive-quiz-block" aria-label="Interaktive Prüfungsfragen">
                  {parsed?.quiz?.title ? <h4 className="interactive-quiz-title">{parsed.quiz.title}</h4> : null}

                  {parsed?.quiz?.questions.map((question) => {
                    const current = getQuizAnswerState(message.id, question.id)
                    const key = `${message.id}::${question.id}`
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
          {showBootstrapPendingRow ? (
            <div className="chat-message-bootstrap-pending" aria-live="polite" aria-busy="true">
              <ChatPendingReplyLoader statusLabel={bootstrapStatusLabel} sendPhase={sendPhase} />
            </div>
          ) : null}
          {showPendingAssistantRow ? (
            <div
              className={`chat-message is-assistant chat-message--pending${
                pendingImageGeneration
                  ? ' chat-message--pending-image'
                  : pendingExcelGeneration ||
                      pendingWordGeneration ||
                      pendingPptxGeneration ||
                      pendingPdfGeneration
                    ? ' chat-message--pending-excel'
                    : ''
              }`}
              aria-live="polite"
              aria-busy="true"
            >
              {pendingImageSearch ? (
                <>
                  <strong className="chat-message-author">Straton AI</strong>
                  <ChatPendingReplyLoader sendPhase="image_search" />
                </>
              ) : null}
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
              ) : pendingWordGeneration ? (
                <>
                  <strong className="chat-message-author">Straton AI</strong>
                  <div className="chat-pending-orbit-wrap chat-pending-special-loader">
                    <ChatGenDotsLoader shape="document" ariaLabel="Word-Dokument wird generiert" />
                    <p className="chat-pending-status">{getChatSendPhaseLabel('word')}</p>
                  </div>
                </>
              ) : pendingPptxGeneration ? (
                <>
                  <strong className="chat-message-author">Straton AI</strong>
                  <div className="chat-pending-orbit-wrap chat-pending-special-loader">
                    <ChatGenDotsLoader shape="slide" ariaLabel="Präsentation wird generiert" />
                    <p className="chat-pending-status">Präsentation wird vorbereitet …</p>
                  </div>
                </>
              ) : pendingExcelGeneration ||
                pendingPdfGeneration ||
                pendingChartGeneration ||
                pendingDiagramGeneration ? (
                <>
                <strong className="chat-message-author">Straton AI</strong>
                <div className="chat-pending-orbit-wrap chat-pending-special-loader">
                <div
                  className="chat-excel-gen-loader-panel"
                  role="status"
                  aria-label={
                    pendingPdfGeneration
                      ? 'PDF-Vorschau wird erstellt'
                      : pendingChartGeneration
                        ? 'Diagramm wird erstellt'
                        : pendingDiagramGeneration
                          ? 'Struktur-Diagramm wird erstellt'
                          : 'Excel-Vorschau wird erstellt'
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
                    pendingPdfGeneration
                      ? 'pdf'
                      : pendingChartGeneration
                        ? 'chart'
                        : pendingDiagramGeneration
                          ? 'diagram'
                          : 'excel',
                  )}
                </p>
                </div>
                </>
              ) : (
                <ChatPendingReplyLoader statusLabel={pendingStatusLabel} sendPhase={sendPhase} />
              )}
            </div>
          ) : null}
        </div>
    </div>
  )
}
