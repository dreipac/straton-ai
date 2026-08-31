import fileIcon from '../../../../assets/icons/file.svg'
import { splitFileNameForDisplay, type ChatWindowPendingAttachment } from './chatWindowMessageUtils'

type ChatComposerAttachmentChipsProps = {
  pendingAttachments: ChatWindowPendingAttachment[]
  onRemoveAttachment: (id: string) => void
  onPreviewImage: (src: string) => void
}

/** Icon links in einem abgerundeten Quadrat, rechts Name + Endung dezent darunter. */
function ChatComposerFileChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  const { base, ext } = splitFileNameForDisplay(name)
  return (
    <span className="chat-attachment-chip chat-attach-removable">
      <span className="chat-attachment-chip-icon-wrap" aria-hidden="true">
        <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" />
      </span>
      <span className="chat-attachment-chip-text">
        <span className="chat-attachment-chip-name">{base}</span>
        {ext ? <span className="chat-attachment-chip-ext">{ext}</span> : null}
      </span>
      <button type="button" className="chat-attachment-chip-remove" aria-label={`${name} entfernen`} onClick={onRemove}>
        ×
      </button>
    </span>
  )
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
          <ChatComposerFileChip key={item.id} name={item.name} onRemove={() => onRemoveAttachment(item.id)} />
        ),
      )}
    </div>
  )
}
