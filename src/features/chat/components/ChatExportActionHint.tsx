type ChatExportActionHintProps = {
  label: string
  busy?: boolean
  onAction: () => void
}

/** Fetter Akzent-Text in der KI-Antwort (Mobile: statt Composer-Sheet / Download-Button). */
export function ChatExportActionHint({ label, busy = false, onAction }: ChatExportActionHintProps) {
  return (
    <p className="chat-export-action-hint">
      <button
        type="button"
        className="chat-export-action-hint__btn"
        disabled={busy}
        onClick={() => {
          onAction()
        }}
      >
        {label}
      </button>
    </p>
  )
}
