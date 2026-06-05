import type { RefObject } from 'react'
import fileIcon from '../../../../assets/icons/file.svg'
import { ChatExportActionHint } from '../ChatExportActionHint'
import { ChatInstantAnalyzeDebugPanel } from '../ChatInstantAnalyzeDebugPanel'
import { ChatThinkingAnalyzeDebugPanel } from '../ChatThinkingAnalyzeDebugPanel'
import { ChatMediaInlineImage } from '../ChatMediaInlineImage'
import { ChatPendingReplyLoader } from '../ChatPendingReplyLoader'
import { ChatMessageReplyQuotePreview } from '../ChatComposerReplyQuoteBar'
import { ChatUserMessageMenuSelect } from '../ChatUserMessageMenuSelect'
import { ChatAssistantMessageCopyButton } from './ChatAssistantMessageCopyButton'
import { extractAssistantMessageCopyText } from '../../utils/chatMessageCopy'
import { WordOutlinePaper, WordOutlinePaperBuilding } from '../WordOutlinePaper'
import { UnsplashPhotoResults } from '../UnsplashPhotoResults'
import {
  canFinalizeExcelExportFromThread,
  hasExcelSpecMarkers,
  parseExcelSpecFromContent,
  stripExcelSpecBlock,
} from '../../excel/excelSpec'
import { userMessageHadDirectAnswerIntent } from '../../constants/chatDirectAnswerInstruction'
import { userMessageRequestsChart } from '../../constants/instantAnalyzeRoute'
import { DirectAnswerMcqPreview } from '../DirectAnswerMcqPreview'
import { buildDirectAnswerMcqPreview } from '../../utils/directAnswerMcq'
import { ChartSpecPreview, ChartSpecPreviewBuilding } from '../ChartSpecPreview'
import { ExcelSpecPreview, ExcelSpecPreviewBuilding } from '../ExcelSpecPreview'
import {
  hasChartSpecMarkers,
  parseChartSpecFromContent,
  stripChartSpecBlock,
} from '../../chart/chartSpec'
import type { ChatMessage } from '../../types'
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
  extractLeadingBannerTitleFromOutlineText,
  normalizeHeadingLevelsForWord,
  tryHeuristicWordOutlineFromPlainText,
  usesStratonWordMarkdownConvention,
  resolveWordOutlinePresentation,
  isLikelyDocumentOutlinePayload,
} from '../../utils/wordOutline'
import { canFinalizePdfExportFromThread } from '../../pdf/pdfOutline'
import type { ChatThinkingMode } from '../../constants/chatThinkingMode'
import type { useUserMessageLongPress } from '../../hooks/useUserMessageLongPress'
import type { QuizAnswerState } from '../../hooks/useChatMessageList'
import { getChatSendPhaseLabel } from '../../constants/chatSendPhase'
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
  extractDateiFileNamesFromContent,
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
  pendingStatusLabel: string | undefined
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
  excelDownloadBusyId: string | null
  wordDownloadBusyId: string | null
  pdfDownloadBusyId: string | null
  onFinalizeWordDocument?: () => void | Promise<void>
  wordFinalizeBusy: boolean
  onFinalizePdfDocument?: () => void | Promise<void>
  pdfFinalizeBusy: boolean
  onFinalizeExcelDocument?: () => void | Promise<void>
  excelFinalizeBusy: boolean
  onCopyUserMessage: (text: string) => boolean | Promise<boolean>
}

export function ChatMessageList(props: ChatMessageListProps) {
  const {
    messagesScrollRef,
    messages,
    animatedAssistantContent,
    sentPastedImagePreviews,
    onImagePreview,
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
    pendingStatusLabel,
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
    excelDownloadBusyId,
    wordDownloadBusyId,
    pdfDownloadBusyId,
    onFinalizeWordDocument,
    wordFinalizeBusy,
    onFinalizePdfDocument,
    pdfFinalizeBusy,
    onFinalizeExcelDocument,
    excelFinalizeBusy,
    onCopyUserMessage,
  } = props

  return (
    <div className="chat-messages" ref={messagesScrollRef}>
        <div className="chat-messages-inner">
        {messages.map((message, messageIndex) => {
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
          const isChartAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageRequestsChart(
                  precedingUserForWordPaper.content,
                  precedingUserForWordPaper.metadata,
                ),
            )
          const isDirectAnswerAssistantTurn =
            isAssistant &&
            Boolean(
              precedingUserForWordPaper &&
                userMessageHadDirectAnswerIntent(
                  precedingUserForWordPaper.content,
                  precedingUserForWordPaper.metadata,
                ),
            )
          const directAnswerMcq =
            isDirectAnswerAssistantTurn && precedingUserForWordPaper
              ? buildDirectAnswerMcqPreview(
                  precedingUserForWordPaper.content,
                  rawContent,
                  messages,
                  messageIndex,
                )
              : null
          /** Papier-Karte nur nach explizitem /Word oder /PDF — nicht bei zufälligen ####-Zeilen im Normalchat. */
          const showWordPaperLayout = isWordAssistantTurn || isPdfAssistantTurn
          const excelSpecForPreview =
            isExcelAssistantTurn && !message.metadata?.excelExport
              ? parseExcelSpecFromContent(rawContent).spec
              : null
          const chartSpecForPreview = isChartAssistantTurn
            ? parseChartSpecFromContent(rawContent).spec
            : null
          const parsed = isAssistant ? parseInteractiveContentWithFallback(rawContent) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = safeMessageContent(animatedAssistantContent[message.id] ?? rawContent)
          /** Nach Excel-Export: gespeicherten Text nutzen (ohne Spec), nicht den Animations-Puffer mit altem JSON. */
          const baseAssistantForDisplay = message.metadata?.liveStream
            ? stripChartSpecBlock(stripExcelSpecBlock(rawContent))
            : message.metadata?.excelExport || message.metadata?.wordExport || message.metadata?.pdfExport
              ? rawContent
              : animatedContent
          const rawAssistantDisplay = hasInteractiveQuiz ? parsed?.cleanText || '' : baseAssistantForDisplay
          /** JSON-Spec im Chat nie anzeigen — nur Einleitungstext vor den Spec-Markern. */
          const assistantAfterExcel = stripChartSpecBlock(stripExcelSpecBlock(rawAssistantDisplay))
          const thinkingClarifyStreaming =
            isAssistant &&
            !isWordAssistantTurn &&
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
          const thinkingFinalStreaming =
            isAssistant &&
            !isWordAssistantTurn &&
            chatThinkingMode === 'thinking' &&
            Boolean(message.metadata?.liveStream) &&
            message.metadata?.thinkingStreamKind === 'final' &&
            !String(displayContent ?? '').trim()
          const pastedImageIds = message.role === 'user' ? extractPastedImageIdsFromContent(rawContent) : []
          const savedDateiNames =
            message.role === 'user' ? extractDateiFileNamesFromContent(rawContent) : []
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
          const isLatestMessage = message.id === messages[messages.length - 1]?.id
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
          const isStreamingAssistant =
            isAssistant &&
            !hasInteractiveQuiz &&
            !message.metadata?.excelExport &&
            !message.metadata?.wordExport &&
            !message.metadata?.pdfExport &&
            (Boolean(message.metadata?.liveStream) ||
              animatedContent.length < rawContent.length)
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
          const showOrbitLoader = isAssistant && isLatestMessage && showLatestAssistantOrbitLoader
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

          return (
            <article
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${isStreamingAssistant ? ' chat-message--streaming' : ''}${
                isLatestMessage && message.role === 'user' ? ' chat-message--user-enter' : ''
              }${isLatestMessage && isAssistant ? ' chat-message--assistant-enter' : ''}${
                userMessagePressActive ? ' is-message-press-active' : ''
              }`}
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
                          <img className="chat-user-inline-image" src={inlineSrc} alt="Eingefügtes Bild" />
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
              {message.role === 'user' && savedDateiNames.length > 0 ? (
                <div className="chat-user-saved-attachments chat-attachment-chips" aria-label="Angehängte Dateien">
                  {savedDateiNames.map((name, fileIndex) => (
                    <span
                      key={`${message.id}-datei-${fileIndex}`}
                      className="chat-attachment-chip chat-attachment-chip--saved-file"
                    >
                      <img
                        className="ui-icon chat-attachment-chip-icon"
                        src={fileIcon}
                        alt=""
                        aria-hidden="true"
                      />
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
              {message.role === 'user' &&
              showInstantAnalyzeDebug &&
              message.metadata?.thinkingAnalyzeDebug ? (
                <ChatThinkingAnalyzeDebugPanel debug={message.metadata.thinkingAnalyzeDebug} />
              ) : null}
              {thinkingClarifyStreaming ? (
                <p className="chat-thinking-stream-hint" role="status">
                  KI formuliert eine Rückfrage…
                </p>
              ) : thinkingFinalStreaming ? (
                <p className="chat-thinking-stream-hint" role="status">
                  Ausführliche Antwort wird erstellt…
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
                    </div>
                  )
                ) : (
                  <p>{renderInlineMarkdown(displayContent)}</p>
                )
              ) : null}
              {showAssistantCopyButton ? (
                <ChatAssistantMessageCopyButton
                  onCopy={() => onCopyUserMessage(assistantCopyText)}
                />
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
              {showWordFinalizeHint ? (
                <ChatExportActionHint
                  label={
                    wordFinalizeBusy
                      ? 'Word wird erstellt…'
                      : 'Word generieren'
                  }
                  busy={wordFinalizeBusy}
                  onAction={() => {
                    void onFinalizeWordDocument?.()
                  }}
                />
              ) : null}
              {showPdfFinalizeHint ? (
                <ChatExportActionHint
                  label={
                    pdfFinalizeBusy
                      ? 'PDF wird erstellt…'
                      : 'PDF generieren'
                  }
                  busy={pdfFinalizeBusy}
                  onAction={() => {
                    void onFinalizePdfDocument?.()
                  }}
                />
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
              {isMobileComposer && userMessageLongPress.shouldMountMenuOverlay(message.id) ? (
                <ChatUserMessageMenuSelect
                  ref={userMessageLongPress.menuSelectRef}
                  onSelectCopy={() => {
                    const text = userMessageLongPress.getMenuCopyText()
                    if (text) {
                      void onCopyUserMessage(text)
                    }
                  }}
                  onClose={userMessageLongPress.closeMenu}
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

              {message.metadata?.pdfExport && !isMobileComposer ? (
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
              <ChatPendingReplyLoader statusLabel={bootstrapStatusLabel} />
            </div>
          ) : null}
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
              {pendingImageSearch ? (
                <>
                  <strong className="chat-message-author">Straton AI</strong>
                  <ChatPendingReplyLoader statusLabel={getChatSendPhaseLabel('image_search')} />
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
              ) : pendingExcelGeneration ||
                pendingWordGeneration ||
                pendingPdfGeneration ||
                pendingChartGeneration ? (
                <>
                <strong className="chat-message-author">Straton AI</strong>
                <div className="chat-pending-orbit-wrap chat-pending-special-loader">
                <div
                  className="chat-excel-gen-loader-panel"
                  role="status"
                  aria-label={
                    pendingWordGeneration
                      ? 'Word-Vorschau wird erstellt'
                      : pendingPdfGeneration
                        ? 'PDF-Vorschau wird erstellt'
                        : pendingChartGeneration
                          ? 'Diagramm wird erstellt'
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
                    pendingWordGeneration
                      ? 'word'
                      : pendingPdfGeneration
                        ? 'pdf'
                        : pendingChartGeneration
                          ? 'chart'
                          : 'excel',
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
  )
}
