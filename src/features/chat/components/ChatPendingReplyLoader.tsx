type ChatPendingReplyLoaderProps = {
  statusLabel?: string
}

/** Ladeanzeige während eine KI-Textantwort generiert wird (zwei Punkte im Halbkreis). */
export function ChatPendingReplyLoader({ statusLabel }: ChatPendingReplyLoaderProps) {
  const ariaLabel = statusLabel?.trim() || 'Antwort wird generiert'
  return (
    <div className="chat-pending-orbit-wrap">
      <div className="chat-pending-orbit" role="status" aria-label={ariaLabel}>
        <div className="chat-pending-orbit-swing" aria-hidden="true">
          <span className="chat-pending-orbit-dot chat-pending-orbit-dot--large" />
          <span className="chat-pending-orbit-dot chat-pending-orbit-dot--small" />
        </div>
      </div>
      {statusLabel ? (
        <p className="chat-pending-status" role="status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}
    </div>
  )
}
