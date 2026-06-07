import type { TransitionEvent } from 'react'
import type { ChatDocumentPreviewState } from '../../hooks/useChatDocumentPreview'
import { DocumentPreviewContent } from './DocumentPreviewContent'

type ChatDocumentPreviewModalProps = {
  preview: ChatDocumentPreviewState
  open: boolean
  previewText: string
  showPdfEmbed: boolean
  signedUrl: string | null
  loading: boolean
  error: string | null
  canDownload: boolean
  onClose: () => void
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void
  onDownload: () => void | Promise<void>
}

export function ChatDocumentPreviewModal({
  preview,
  open,
  previewText,
  showPdfEmbed,
  signedUrl,
  loading,
  error,
  canDownload,
  onClose,
  onTransitionEnd,
  onDownload,
}: ChatDocumentPreviewModalProps) {
  const hasText = previewText.trim().length > 0

  return (
    <div
      className={`chat-document-preview${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label={`Dokumentvorschau: ${preview.attachment.name}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('.chat-document-preview-panel')) {
          return
        }
        onClose()
      }}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="chat-document-preview-panel">
        <header className="chat-document-preview-header">
          <div className="chat-document-preview-title-wrap">
            <p className="chat-document-preview-kicker">Anhang</p>
            <h2 className="chat-document-preview-title">{preview.attachment.name}</h2>
          </div>
          <button type="button" className="chat-document-preview-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        {loading ? <p className="chat-document-preview-status">Vorschau wird geladen …</p> : null}
        {error ? (
          <p className="chat-document-preview-error" role="alert">
            {error}
          </p>
        ) : null}

        {showPdfEmbed && signedUrl ? (
          <iframe
            className="chat-document-preview-pdf"
            src={signedUrl}
            title={`PDF-Vorschau: ${preview.attachment.name}`}
          />
        ) : null}

        <div className="chat-document-preview-body">
          {hasText ? (
            <DocumentPreviewContent text={previewText} />
          ) : (
            <p className="chat-document-preview-empty">Kein auslesbarer Text in diesem Dokument gefunden.</p>
          )}
        </div>

        {canDownload ? (
          <footer className="chat-document-preview-footer">
            <button type="button" className="chat-document-preview-download" onClick={() => void onDownload()}>
              Original herunterladen
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
