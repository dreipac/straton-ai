/** Ladeanzeige während eine KI-Textantwort generiert wird (zwei Punkte im Halbkreis). */
export function ChatPendingReplyLoader() {
  return (
    <div className="chat-pending-orbit" role="status" aria-label="Antwort wird generiert">
      <div className="chat-pending-orbit-swing" aria-hidden="true">
        <span className="chat-pending-orbit-dot chat-pending-orbit-dot--large" />
        <span className="chat-pending-orbit-dot chat-pending-orbit-dot--small" />
      </div>
    </div>
  )
}
