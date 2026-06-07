import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useToast } from '../../../components/toast/ToastProvider'
import { ActionBottomSheet } from '../../../components/ui/bottom-sheet/ActionBottomSheet'
import { useGlassPillTouchFeedback } from '../../../hooks/useGlassPillTouchFeedback'
import duringIcon from '../../../assets/icons/during.svg'
import sendIcon from '../../../assets/icons/send.svg'
import type { ChatMessage, InstantAnalyzeDebugMeta, ThinkingAnalyzeDebugMeta } from '../types'
import type { AssistantRichContentOptions } from '../utils/renderAssistantRichContent'
import { ChatComposerReplyQuoteSlot } from './ChatComposerReplyQuoteBar'
import { ChatContextUsageRing } from './ChatContextUsageRing'
import { ChatInstantAnalyzeDebugPanel } from './ChatInstantAnalyzeDebugPanel'
import { ChatThinkingAnalyzeDebugPanel } from './ChatThinkingAnalyzeDebugPanel'
import { ChatEmptyGreetingTitle } from './ChatEmptyGreetingTitle'
import { getChatEmptyGreeting } from '../utils/chatEmptyGreeting'
import type { ChatComposerModelId } from '../constants/chatComposerModels'
import type { ChatReplyMode } from '../constants/chatReplyMode'
import type { ChatThinkingMode } from '../constants/chatThinkingMode'
import { ChatComposerAttachMenu } from './ChatComposerAttachMenu'
import { ChatComposerModelPicker } from './ChatComposerModelPicker'
import { ChatComposerThinkingModePicker } from './ChatComposerThinkingModePicker'
import { ThinkingClarifyModal } from './ThinkingClarifyModal'
import { useUserMessageLongPress } from '../hooks/useUserMessageLongPress'
import { useVisualKeyboardInset } from '../hooks/useVisualKeyboardInset'
import { copyTextToClipboard } from '../../../utils/copyTextToClipboard'
import type { ThinkingClarifyDialogState } from '../utils/thinkingClarify'
import type { AccountSubscriptionDisplay } from '../../settings/utils/accountSubscriptionDisplay'
import { ThinkingClarifyFreeTextModal } from './ThinkingClarifyFreeTextModal'
import { QuizFormatChoiceModal } from './QuizFormatChoiceModal'
import type { ChatSendPhaseState } from '../constants/chatSendPhase'
import { CHAT_WINDOW_MOBILE_SEND_DURING_ICON_DELAY_MS } from './chat-window/chatWindowConstants'
import { ChatMessageList } from './chat-window/ChatMessageList'
import { useChatMessageList } from '../hooks/useChatMessageList'
import { useChatComposer } from '../hooks/useChatComposer'
import { useChatComposerSectionReply } from '../hooks/useChatComposerSectionReply'
import { useChatImageLightbox } from '../hooks/useChatImageLightbox'
import { useChatDocumentPreview } from '../hooks/useChatDocumentPreview'
import { ChatComposerForm } from './chat-window/ChatComposerForm'
import { ChatComposerThinkingCreditsHint } from './chat-window/ChatComposerThinkingCreditsHint'
import { ChatImageLightbox } from './chat-window/ChatImageLightbox'
import { ChatDocumentPreviewModal } from './chat-window/ChatDocumentPreviewModal'

const EMPTY_CHAT_MESSAGES: ChatMessage[] = []

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
  liveThinkingAnalyzeDebug?: ThinkingAnalyzeDebugMeta | null
  error: string | null
  greetingName: string
  tokenLimitReached?: boolean
  composerModelId: ChatComposerModelId
  onComposerModelChange: (id: ChatComposerModelId) => void
  /** Abo ohne Modellwahl: false = Composer-Modell-Picker ausblenden. */
  showComposerModelPicker?: boolean
  chatReplyMode: ChatReplyMode
  onChatReplyModeChange: (mode: ChatReplyMode) => void
  /** Abo: Custom-Modus im Bearbeitungsmodus-Picker. */
  allowCustomChatMode?: boolean
  chatThinkingMode: ChatThinkingMode
  onChatThinkingModeChange: (mode: ChatThinkingMode) => void
  /** Auf schmalen Viewports sitzt der Comfort/Strict-Schalter in der Oberleiste (`ChatToolbarReplyModeSelect`). */
  showReplyModePicker?: boolean
  /** Thinking-Rückfragen (Popup über der Message Box). */
  thinkingClarifyDialog?: ThinkingClarifyDialogState | null
  onDismissThinkingClarify?: () => void
  onSubmitThinkingClarifyAnswer?: (text: string) => void | Promise<void>
  composerUserId?: string | null
  onSendMessage: (
    content: string,
    opts?: import('../types/chatSendOptions').ChatSendMessageOptions,
  ) => Promise<void>
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
  /** Nach /Excel: .xlsx erzeugen, wenn die Tabellen-Vorschau passt. */
  onFinalizeExcelDocument?: () => void | Promise<void>
  excelFinalizeBusy?: boolean
  /** Abo: max. geschätzte Tokens für Chat-Verlauf (Kontext-Ring). */
  mainChatContextMaxTokens?: number | null
  /** Live Abo-Verbrauch — Karten in Assistentenantworten. */
  subscriptionUsageDisplay?: AccountSubscriptionDisplay | null
}

export function ChatWindow({
  threadKey,
  messages,
  isSending,
  sendPhase = null,
  showInstantAnalyzeDebug = false,
  liveInstantAnalyzeDebug = null,
  liveThinkingAnalyzeDebug = null,
  error,
  greetingName,
  tokenLimitReached = false,
  composerModelId,
  onComposerModelChange,
  showComposerModelPicker = true,
  chatReplyMode,
  onChatReplyModeChange,
  chatThinkingMode,
  allowCustomChatMode = false,
  onChatThinkingModeChange,
  showReplyModePicker = true,
  thinkingClarifyDialog = null,
  onDismissThinkingClarify = () => {},
  onSubmitThinkingClarifyAnswer = async () => {},
  composerUserId = null,
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
  onFinalizeExcelDocument,
  excelFinalizeBusy = false,
  mainChatContextMaxTokens = null,
  subscriptionUsageDisplay = null,
}: ChatWindowProps) {
  const messageList = Array.isArray(messages) ? messages : EMPTY_CHAT_MESSAGES
  const messageListModel = useChatMessageList({
    threadKey,
    messages: messageList,
    isSending,
    sendPhase,
  })
  const {
    messagesScrollRef,
    animatedAssistantContent,
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
  } = messageListModel
  const isEmptyState = messageList.length === 0 && !isSending
  const emptyChatGreeting = useMemo(() => getChatEmptyGreeting(greetingName), [greetingName])

  const clearSectionReplyEmbedRef = useRef<() => void>(() => {})

  const composer = useChatComposer({
    threadKey,
    composerUserId,
    isSending,
    tokenLimitReached,
    thinkingCreditsBlocked,
    chatThinkingMode,
    onSendMessage,
    onClearSectionReplyEmbed: () => clearSectionReplyEmbedRef.current(),
  })

  const sectionReply = useChatComposerSectionReply({
    isMobileComposer: composer.isMobileComposer,
    inputRef: composer.inputRef,
    messagesScrollRef,
    composerSectionReply: composer.composerSectionReply,
    setComposerSectionReply: composer.setComposerSectionReply,
  })
  clearSectionReplyEmbedRef.current = sectionReply.clearSectionReplyEmbedSchedule

  const imageLightbox = useChatImageLightbox()
  const documentPreview = useChatDocumentPreview()

  const userMessageLongPress = useUserMessageLongPress(composer.isMobileComposer)
  const mobileComposerSendTouch = useGlassPillTouchFeedback()
  const mobileComposerMessageBoxTouch = useGlassPillTouchFeedback()
  const mobileSendStartedWithTouchRef = useRef(false)
  const [mobileDuringIconReady, setMobileDuringIconReady] = useState(false)
  const { push: pushToast } = useToast()
  const showDuringSendIcon =
    isAssistantReplyStillAnimating ||
    (isSending && (!composer.isMobileComposer || mobileDuringIconReady))

  useEffect(() => {
    if (!isSending) {
      setMobileDuringIconReady(false)
      return
    }
    if (!composer.isMobileComposer) {
      return
    }
    const beganWithTouch = mobileSendStartedWithTouchRef.current
    mobileSendStartedWithTouchRef.current = false
    if (!beganWithTouch) {
      setMobileDuringIconReady(true)
      return
    }
    setMobileDuringIconReady(false)
    const id = window.setTimeout(() => setMobileDuringIconReady(true), CHAT_WINDOW_MOBILE_SEND_DURING_ICON_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [isSending, composer.isMobileComposer])

  const cancelWhileSending = Boolean(isSending && onCancelSend)

  const composerSendButtonClassName = composer.isMobileComposer
    ? ['new-chat-touch-btn', mobileComposerSendTouch.touchStateClass]
        .filter(Boolean)
        .join(' ')
    : undefined

  const composerSendIconEl = (
    <span
      className={
        composer.isMobileComposer ? 'chat-send-icon-stack new-chat-touch-btn__icon' : 'chat-send-icon-stack'
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

  const pendingVisionImageCount = composer.pendingAttachments.filter((a) => a.kind === 'pasted-image').length
  const showContextUsageRing = Boolean(threadKey) && chatThinkingMode !== 'thinking'

  const composerSendButton = (
    <button
      type="submit"
      className={composerSendButtonClassName}
      disabled={
        tokenLimitReached ||
        thinkingCreditsBlocked ||
        composer.isAttachingFiles ||
        (!cancelWhileSending && !composer.draft.trim() && composer.pendingAttachments.length === 0)
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

  const composerSendActions = (
    <div className="chat-composer-send-actions">
      {showContextUsageRing ? (
        <ChatContextUsageRing
          messages={messageList}
          maxTokens={mainChatContextMaxTokens}
          pendingVisionImages={pendingVisionImageCount}
        />
      ) : null}
      {composerSendButton}
    </div>
  )

  const composerInputRowTouchHandlers = composer.isMobileComposer
    ? mobileComposerMessageBoxTouch.touchHandlers
    : undefined

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
    if (!composer.isMobileComposer || !touchLike) {
      return
    }
    event.preventDefault()
    mobileSendStartedWithTouchRef.current = true
    mobileComposerSendTouch.touchHandlers.onPointerDown(event)
  }

  useVisualKeyboardInset()

  const composerReplyQuoteSlot = (
    <ChatComposerReplyQuoteSlot
      reference={composer.composerSectionReply}
      onDismiss={() => {
        sectionReply.clearSectionReplyEmbedSchedule()
        composer.setComposerSectionReply(null)
      }}
      onOpenSettled={
        composer.isMobileComposer ? sectionReply.handleSectionReplyEmbedSettled : undefined
      }
    />
  )

  const quizFormatOverlay = composer.quizFormatPending ? (
    <QuizFormatChoiceModal
      previewText={composer.quizFormatPending.content.split('\n\n')[0]?.slice(0, 280)}
      onDismiss={() => composer.setQuizFormatPending(null)}
      onChoose={composer.handleQuizFormatChosen}
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

  const thinkingCreditsHintEl = (
    <ChatComposerThinkingCreditsHint
      chatThinkingMode={chatThinkingMode}
      thinkingCreditsRemaining={thinkingCreditsRemaining}
      thinkingCreditMax={thinkingCreditMax}
      thinkingDailyGrant={thinkingDailyGrant}
      thinkingCreditsBlocked={thinkingCreditsBlocked}
      tokenLimitReached={tokenLimitReached}
    />
  )

  const composerAttachButton = (
    <ChatComposerAttachMenu
      className={composer.attachButtonClassName}
      disabled={composer.attachControlDisabled}
      ariaLabel={composer.isMobileComposer ? 'Anhang hinzufügen' : 'Anhang-Menü öffnen'}
      isMobile={composer.isMobileComposer}
      onMobileOpen={composer.openMobileAttachSheet}
      onUploadFile={() => composer.openDocumentFilePicker()}
      replyMode={chatReplyMode}
      onReplyModeChange={onChatReplyModeChange}
      showReplyModeOption={showReplyModePicker && !composer.isMobileComposer}
    />
  )

  const composerAttachSheet = (
    <ActionBottomSheet
      open={composer.attachComposerSheetOpen}
      onClose={() => composer.setAttachComposerSheetOpen(false)}
      title="Einfügen"
      ariaLabel="Foto oder Datei anhängen"
      actions={[
        {
          id: 'foto',
          label: 'Foto anhängen',
          actionClassName: 'action-bottom-sheet-action--compose-bilder',
          onClick: () => {
            composer.setAttachComposerSheetOpen(false)
            composer.openImageFilePicker()
          },
        },
        {
          id: 'anhang',
          label: 'Datei anhängen',
          onClick: () => {
            composer.setAttachComposerSheetOpen(false)
            composer.openDocumentFilePicker()
          },
        },
      ]}
    />
  )

  const imageLightboxEl =
    imageLightbox.imageLightboxSrc !== null ? (
      <ChatImageLightbox
        src={imageLightbox.imageLightboxSrc}
        open={imageLightbox.imageLightboxOpen}
        onClose={imageLightbox.closeImageLightbox}
        onTransitionEnd={imageLightbox.handleImageLightboxTransitionEnd}
      />
    ) : null

  const documentPreviewEl =
    documentPreview.preview !== null ? (
      <ChatDocumentPreviewModal
        preview={documentPreview.preview}
        open={documentPreview.open}
        previewText={documentPreview.previewText}
        showPdfEmbed={documentPreview.showPdfEmbed}
        signedUrl={documentPreview.signedUrl}
        loading={documentPreview.loading}
        error={documentPreview.error}
        canDownload={documentPreview.canDownload}
        onClose={documentPreview.closeDocumentPreview}
        onTransitionEnd={documentPreview.handleTransitionEnd}
        onDownload={documentPreview.downloadDocument}
      />
    ) : null

  function buildAssistantRichOptions(messageId: string): AssistantRichContentOptions {
    return {
      onChatImagePreview: imageLightbox.setImageLightboxSrc,
      sectionReply: {
        messageId,
        onReference: sectionReply.beginSectionReplyFromSwipe,
      },
    }
  }

  const composerLeftActions = (
    <>
      {composerAttachButton}
      {composer.showComposerInlinePickers && showComposerModelPicker ? (
        <ChatComposerModelPicker
          value={composerModelId}
          onChange={onComposerModelChange}
          disabled={isSending || tokenLimitReached}
        />
      ) : null}
      {composer.showComposerInlinePickers ? (
        <ChatComposerThinkingModePicker
          value={chatThinkingMode}
          onChange={onChatThinkingModeChange}
          disabled={isSending || tokenLimitReached}
          allowCustomMode={allowCustomChatMode}
        />
      ) : null}
    </>
  )

  async function handleCopyUserMessageText(text: string): Promise<boolean> {
    const ok = await copyTextToClipboard(text)
    pushToast(ok ? 'Nachricht kopiert' : 'Kopieren fehlgeschlagen')
    return ok
  }

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
          {thinkingCreditsHintEl}
          {showInstantAnalyzeDebug && liveInstantAnalyzeDebug ? (
            <div className="chat-empty-instant-debug">
              <ChatInstantAnalyzeDebugPanel debug={liveInstantAnalyzeDebug} compact />
            </div>
          ) : null}
          <ChatComposerForm
            centered
            composer={composer}
            isSending={isSending}
            tokenLimitReached={tokenLimitReached}
            thinkingCreditsBlocked={thinkingCreditsBlocked}
            leftActions={composerLeftActions}
            sendActions={composerSendActions}
            composerReplyQuoteSlot={composerReplyQuoteSlot}
            composerInputRowTouchHandlers={composerInputRowTouchHandlers}
            messageBoxTouchStateClass={mobileComposerMessageBoxTouch.touchStateClass}
            onPreviewImage={imageLightbox.setImageLightboxSrc}
          />
          <p className="chat-input-hint">
            Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
          </p>
          {composerAttachSheet}
        </div>
        {imageLightboxEl}
        {documentPreviewEl}
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
      <ChatMessageList
        messagesScrollRef={messagesScrollRef}
        messages={messageList}
        animatedAssistantContent={animatedAssistantContent}
        sentPastedImagePreviews={composer.sentPastedImagePreviews}
        onImagePreview={imageLightbox.setImageLightboxSrc}
        onDocumentPreview={documentPreview.openDocumentPreview}
        isMobileComposer={composer.isMobileComposer}
        showInstantAnalyzeDebug={showInstantAnalyzeDebug}
        chatThinkingMode={chatThinkingMode}
        isSending={isSending}
        showPendingAssistantRow={showPendingAssistantRow}
        showBootstrapPendingRow={showBootstrapPendingRow}
        bootstrapStatusLabel={bootstrapStatusLabel}
        pendingImageGeneration={pendingImageGeneration}
        pendingImageSearch={pendingImageSearch}
        pendingExcelGeneration={pendingExcelGeneration}
        pendingWordGeneration={pendingWordGeneration}
        pendingPdfGeneration={pendingPdfGeneration}
        pendingChartGeneration={pendingChartGeneration}
        pendingStatusLabel={pendingStatusLabel}
        showLatestAssistantOrbitLoader={showLatestAssistantOrbitLoader}
        streamingStatusLabel={streamingStatusLabel}
        userMessageLongPress={userMessageLongPress}
        buildAssistantRichOptions={buildAssistantRichOptions}
        getQuizAnswerState={getQuizAnswerState}
        updateQuizAnswerValue={updateQuizAnswerValue}
        checkQuizAnswer={checkQuizAnswer}
        quizChecksInProgress={quizChecksInProgress}
        downloadExcelExport={downloadExcelExport}
        downloadWordExport={downloadWordExport}
        downloadPdfExport={downloadPdfExport}
        excelDownloadBusyId={excelDownloadBusyId}
        wordDownloadBusyId={wordDownloadBusyId}
        pdfDownloadBusyId={pdfDownloadBusyId}
        onFinalizeWordDocument={onFinalizeWordDocument}
        wordFinalizeBusy={wordFinalizeBusy}
        onFinalizePdfDocument={onFinalizePdfDocument}
        pdfFinalizeBusy={pdfFinalizeBusy}
        onFinalizeExcelDocument={onFinalizeExcelDocument}
        excelFinalizeBusy={excelFinalizeBusy}
        onCopyUserMessage={handleCopyUserMessageText}
        subscriptionUsageDisplay={subscriptionUsageDisplay}
      />
      {error ? <p className="error-text">{error}</p> : null}

      <div className="chat-composer-stack">
        {quizFormatOverlay}
        {thinkingClarifyOverlay}
        {composer.isMobileComposer ? thinkingCreditsHintEl : null}
        {showInstantAnalyzeDebug && liveInstantAnalyzeDebug && isSending ? (
          <div className="chat-composer-instant-debug">
            <ChatInstantAnalyzeDebugPanel debug={liveInstantAnalyzeDebug} compact />
          </div>
        ) : null}
        {showInstantAnalyzeDebug && liveThinkingAnalyzeDebug && isSending && chatThinkingMode === 'thinking' ? (
          <div className="chat-composer-instant-debug">
            <ChatThinkingAnalyzeDebugPanel debug={liveThinkingAnalyzeDebug} compact />
          </div>
        ) : null}
        {composerAttachSheet}
        <ChatComposerForm
          centered={false}
          composer={composer}
          isSending={isSending}
          tokenLimitReached={tokenLimitReached}
          thinkingCreditsBlocked={thinkingCreditsBlocked}
          leftActions={composerLeftActions}
          sendActions={composerSendActions}
          composerReplyQuoteSlot={composerReplyQuoteSlot}
          composerInputRowTouchHandlers={composerInputRowTouchHandlers}
          messageBoxTouchStateClass={mobileComposerMessageBoxTouch.touchStateClass}
          onPreviewImage={imageLightbox.setImageLightboxSrc}
        />
        {!composer.isMobileComposer ? thinkingCreditsHintEl : null}
        <p className="chat-input-hint">
          Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
        </p>
      </div>
      {imageLightboxEl}
      {documentPreviewEl}
    </section>
  )
}
