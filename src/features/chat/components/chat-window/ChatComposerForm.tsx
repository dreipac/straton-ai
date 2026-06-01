import type { ReactNode } from 'react'
import { ChatComposerAttachmentChips } from './ChatComposerAttachmentChips'
import { ChatComposerSlashMenu } from './ChatComposerSlashMenu'
import type { useChatComposer } from '../../hooks/useChatComposer'

type ComposerState = ReturnType<typeof useChatComposer>

type ChatComposerFormProps = {
  centered: boolean
  composer: ComposerState
  isSending: boolean
  tokenLimitReached: boolean
  thinkingCreditsBlocked: boolean
  leftActions: ReactNode
  sendActions: ReactNode
  composerReplyQuoteSlot: ReactNode
  composerInputRowTouchHandlers?: Record<string, unknown>
  messageBoxTouchStateClass?: string
  onPreviewImage: (src: string) => void
}

export function ChatComposerForm({
  centered,
  composer,
  isSending,
  tokenLimitReached,
  thinkingCreditsBlocked,
  leftActions,
  sendActions,
  composerReplyQuoteSlot,
  composerInputRowTouchHandlers,
  messageBoxTouchStateClass,
  onPreviewImage,
}: ChatComposerFormProps) {
  const {
    isMobileCompactComposer,
    draft,
    showSlashMenu,
    slashMenuHighlightIndex,
    setSlashMenuHighlightIndex,
    inputRef,
    fileInputRef,
    composerSectionReply,
    composePlaceholder,
    handleSubmit,
    handleDraftChange,
    handleComposeKeyDown,
    handleComposePaste,
    handleAttachFiles,
    handleSelectExcelSlashCommand,
    handleSelectWordSlashCommand,
    handleSelectPdfSlashCommand,
    handleSelectImageSlashCommand,
    buildComposerInputRowClass,
    imageGenCommandSelected,
    excelCommandSelected,
    wordCommandSelected,
    pdfCommandSelected,
    pendingAttachments,
    setImageGenCommandSelected,
    setExcelCommandSelected,
    setWordCommandSelected,
    setPdfCommandSelected,
    removeAttachment,
  } = composer

  return (
    <form
      className={buildComposerInputRowClass(centered, messageBoxTouchStateClass)}
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
      <div className="chat-left-actions">{leftActions}</div>
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
        <ChatComposerAttachmentChips
          imageGenCommandSelected={imageGenCommandSelected}
          excelCommandSelected={excelCommandSelected}
          wordCommandSelected={wordCommandSelected}
          pdfCommandSelected={pdfCommandSelected}
          pendingAttachments={pendingAttachments}
          onClearImageGen={() => setImageGenCommandSelected(false)}
          onClearExcel={() => setExcelCommandSelected(false)}
          onClearWord={() => setWordCommandSelected(false)}
          onClearPdf={() => setPdfCommandSelected(false)}
          onRemoveAttachment={removeAttachment}
          onPreviewImage={onPreviewImage}
        />
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
            {sendActions}
          </div>
        ) : (
          <div className="chat-input-field">
            <div className="chat-input-field-grow">
              {showSlashMenu ? (
                <ChatComposerSlashMenu
                  highlightIndex={slashMenuHighlightIndex}
                  onHighlightIndex={setSlashMenuHighlightIndex}
                  onSelectExcel={handleSelectExcelSlashCommand}
                  onSelectWord={handleSelectWordSlashCommand}
                  onSelectPdf={handleSelectPdfSlashCommand}
                  onSelectImage={handleSelectImageSlashCommand}
                />
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
      {!isMobileCompactComposer ? sendActions : null}
    </form>
  )
}
