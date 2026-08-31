import { useEffect, useState } from 'react'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { getChatThreadById, listMessagesForThread } from '../../chat/services/chat.persistence'
import type { ChatMessage, ChatThread } from '../../chat/types'

type AdminFeedbackChatViewerModalProps = {
  threadId: string
  onClose: () => void
}

/**
 * Read-only Transkript-Ansicht für Admins, um einen als Feedback-Anhang ausgewählten Chat zu
 * öffnen — bewusst kein Wiederverwenden von ChatMessageList (die ist tief auf den eingeloggten
 * Owner/Composer/Aktionen zugeschnitten); reiner Text reicht hier für den Kontext.
 */
export function AdminFeedbackChatViewerModal({ threadId, onClose }: AdminFeedbackChatViewerModalProps) {
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getChatThreadById(threadId), listMessagesForThread(threadId)])
      .then(([threadResult, messagesResult]) => {
        if (cancelled) {
          return
        }
        setThread(threadResult)
        setMessages(messagesResult)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Chat konnte nicht geladen werden.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [threadId])

  return (
    <ModalShell isOpen={true} onRequestClose={onClose}>
      <section
        className="rename-modal admin-feedback-chat-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Angehängter Chat"
      >
        <ModalHeader
          title={thread?.title ?? 'Angehängter Chat'}
          headingLevel="h3"
          className="rename-modal-header"
          onClose={onClose}
          closeLabel="Chat-Ansicht schließen"
        />

        {isLoading ? <p className="admin-feedback-chat-viewer-status">Lädt…</p> : null}
        {error ? (
          <p className="admin-feedback-chat-viewer-status error-text">{error}</p>
        ) : null}
        {!isLoading && !error && messages.length === 0 ? (
          <p className="admin-feedback-chat-viewer-status">Dieser Chat enthält keine Nachrichten.</p>
        ) : null}

        <div className="admin-feedback-chat-viewer-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`admin-feedback-chat-viewer-message admin-feedback-chat-viewer-message--${message.role}`}
            >
              <p className="admin-feedback-chat-viewer-message-role">
                {message.role === 'user' ? 'Nutzer' : message.role === 'assistant' ? 'Assistent' : 'System'}
              </p>
              <p className="admin-feedback-chat-viewer-message-content">{message.content}</p>
            </div>
          ))}
        </div>
      </section>
    </ModalShell>
  )
}
