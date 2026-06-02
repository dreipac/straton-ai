import fileIcon from '../../../../assets/icons/file.svg'
import type { ChatWindowPendingAttachment } from './chatWindowMessageUtils'

type ChatComposerAttachmentChipsProps = {
  imageGenCommandSelected: boolean
  excelCommandSelected: boolean
  wordCommandSelected: boolean
  pdfCommandSelected: boolean
  pendingAttachments: ChatWindowPendingAttachment[]
  onClearImageGen: () => void
  onClearExcel: () => void
  onClearWord: () => void
  onClearPdf: () => void
  onRemoveAttachment: (id: string) => void
  onPreviewImage: (src: string) => void
}

export function ChatComposerAttachmentChips({
  imageGenCommandSelected,
  excelCommandSelected,
  wordCommandSelected,
  pdfCommandSelected,
  pendingAttachments,
  onClearImageGen,
  onClearExcel,
  onClearWord,
  onClearPdf,
  onRemoveAttachment,
  onPreviewImage,
}: ChatComposerAttachmentChipsProps) {
  const visible =
    pendingAttachments.length > 0 ||
    imageGenCommandSelected ||
    excelCommandSelected ||
    wordCommandSelected ||
    pdfCommandSelected

  if (!visible) {
    return null
  }

  return (
    <div className="chat-attachment-chips" aria-label="Anhänge">
      {imageGenCommandSelected ? (
        <span className="chat-attach-removable">
          <span className="chat-compose-mode-badge chat-compose-mode-badge--image" title="Bildgenerierung aktiv">
            <span className="chat-compose-mode-badge-label">Bilder</span>
          </span>
          <button type="button" className="chat-attachment-chip-remove" aria-label="Bildgenerierung entfernen" onClick={onClearImageGen}>
            ×
          </button>
        </span>
      ) : null}
      {excelCommandSelected ? (
        <span className="chat-attach-removable">
          <span className="chat-compose-mode-badge chat-compose-mode-badge--excel" title="Excel-Befehl aktiv">
            <span className="chat-compose-mode-badge-label">Excel</span>
          </span>
          <button type="button" className="chat-attachment-chip-remove" aria-label="Excel-Befehl entfernen" onClick={onClearExcel}>
            ×
          </button>
        </span>
      ) : null}
      {wordCommandSelected ? (
        <span className="chat-attach-removable">
          <span className="chat-compose-mode-badge chat-compose-mode-badge--word" title="Word-Export aktiv">
            <span className="chat-compose-mode-badge-label">Word</span>
          </span>
          <button type="button" className="chat-attachment-chip-remove" aria-label="Word-Befehl entfernen" onClick={onClearWord}>
            ×
          </button>
        </span>
      ) : null}
      {pdfCommandSelected ? (
        <span className="chat-attach-removable">
          <span className="chat-compose-mode-badge chat-compose-mode-badge--pdf" title="PDF-Export aktiv">
            <span className="chat-compose-mode-badge-label">PDF</span>
          </span>
          <button type="button" className="chat-attachment-chip-remove" aria-label="PDF-Befehl entfernen" onClick={onClearPdf}>
            ×
          </button>
        </span>
      ) : null}
      {pendingAttachments.map((item) =>
        item.kind === 'pasted-image' && item.previewDataUrl ? (
          <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image chat-attach-removable">
            <button
              type="button"
              className="chat-attachment-inline-preview-trigger"
              aria-label="Vorschau vergrößern"
              onClick={() => {
                const u = item.previewDataUrl
                if (u) {
                  onPreviewImage(u)
                }
              }}
            >
              <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
            </button>
            <button
              type="button"
              className="chat-attachment-chip-remove"
              aria-label={`${item.name} entfernen`}
              onClick={() => onRemoveAttachment(item.id)}
            >
              ×
            </button>
          </span>
        ) : (
          <span key={item.id} className="chat-attachment-chip chat-attach-removable">
            <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" aria-hidden="true" />
            <span className="chat-attachment-chip-name">{item.name}</span>
            <button
              type="button"
              className="chat-attachment-chip-remove"
              aria-label={`${item.name} entfernen`}
              onClick={() => onRemoveAttachment(item.id)}
            >
              ×
            </button>
          </span>
        ),
      )}
    </div>
  )
}
