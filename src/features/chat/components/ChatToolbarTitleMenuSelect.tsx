export type ChatToolbarTitleMenuSelectProps = {
  title: string
  onSelectRename: () => void
  onSelectDelete: () => void
  renameDisabled?: boolean
  deleteDisabled?: boolean
}

/**
 * Native `<select>` über der Titel-Pille (iOS/PWA System-Aktionsliste).
 */
export function ChatToolbarTitleMenuSelect({
  title,
  onSelectRename,
  onSelectDelete,
  renameDisabled = false,
  deleteDisabled = false,
}: ChatToolbarTitleMenuSelectProps) {
  return (
    <label className="chat-toolbar-mobile-title">
      <span className="chat-mobile-top-bar-title" title={title}>
        {title}
      </span>
      <select
        className="chat-toolbar-mobile-title-select"
        value=""
        aria-label="Chat-Aktionen"
        onChange={(event) => {
          const action = event.target.value
          if (action === 'rename') {
            onSelectRename()
          } else if (action === 'delete') {
            onSelectDelete()
          }
          event.target.value = ''
          event.currentTarget.blur()
        }}
      >
        <option value="" disabled hidden>
          {title}
        </option>
        <option value="rename" disabled={renameDisabled}>
          Umbenennen
        </option>
        <option value="delete" disabled={deleteDisabled}>
          Löschen
        </option>
      </select>
    </label>
  )
}
