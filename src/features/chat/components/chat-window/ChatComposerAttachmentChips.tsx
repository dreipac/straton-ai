import fileIcon from '../../../../assets/icons/file.svg'
import type { ChatWindowPendingAttachment } from './chatWindowMessageUtils'

type ChatComposerAttachmentChipsProps = {
  pendingAttachments: ChatWindowPendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onPreviewImage: (src: string) => void
}

export function ChatComposerAttachmentChips({
  pendingAttachments,
  onRemoveAttachment,
  onPreviewImage,
}: ChatComposerAttachmentChipsProps) {
  if (pendingAttachments.length === 0) {
    return null
  }

  return (
    <div className="chat-attachment-chips" aria-label="Anhänge">
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
