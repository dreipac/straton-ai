type ChatExportActionHintProps = {
  label: string
  busy?: boolean
  onAction: () => void
}

/** Akzent-Link unter der KI-Antwort (Word/PDF/Excel-Aktionen). */
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
