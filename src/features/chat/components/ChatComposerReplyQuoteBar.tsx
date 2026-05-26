import { useEffect, useRef, useState } from 'react'
import type { AssistantSectionReference } from '../utils/assistantSectionReply'

const REPLY_QUOTE_DISMISS_MS = 300

export type ChatComposerReplyQuoteBarProps = {
  reference: AssistantSectionReference
  onDismiss: () => void
}

export type ChatComposerReplyQuoteSlotProps = {
  reference: AssistantSectionReference | null
  onDismiss: () => void
}

/** Animiert Ein-/Ausblenden der Referenz und Höhenwachstum der Message Box. */
export function ChatComposerReplyQuoteSlot({ reference, onDismiss }: ChatComposerReplyQuoteSlotProps) {
  const [closing, setClosing] = useState(false)
  const dismissTimerRef = useRef<number | null>(null)
  const open = Boolean(reference) && !closing

  useEffect(() => {
    setClosing(false)
  }, [reference?.messageId, reference?.blockIndex])

  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
      }
    },
    [],
  )

  function handleDismiss() {
    setClosing(true)
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null
      onDismiss()
      setClosing(false)
    }, REPLY_QUOTE_DISMISS_MS)
  }

  return (
    <div
      className={['chat-composer-reply-quote-anchor', open ? 'is-open' : ''].filter(Boolean).join(' ')}
      aria-hidden={!reference}
    >
      <div className="chat-composer-reply-quote-anchor-inner">
        {reference ? <ChatComposerReplyQuoteBar reference={reference} onDismiss={handleDismiss} /> : null}
      </div>
    </div>
  )
}

export function ChatComposerReplyQuoteBar({ reference, onDismiss }: ChatComposerReplyQuoteBarProps) {
  const title = reference.previewTitle?.trim() || 'Abschnitt'
  const excerpt = reference.excerpt.trim()

  return (
    <div className="chat-composer-reply-quote" role="region" aria-label="Antwort auf Abschnitt">
      <div className="chat-composer-reply-quote-body">
        <p className="chat-composer-reply-quote-label">Antwort auf</p>
        <p className="chat-composer-reply-quote-title">{title}</p>
        {excerpt ? <p className="chat-composer-reply-quote-excerpt">{excerpt}</p> : null}
      </div>
      <button
        type="button"
        className="chat-composer-reply-quote-dismiss"
        aria-label="Referenz entfernen"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}

export function ChatMessageReplyQuotePreview({
  reference,
}: {
  reference: AssistantSectionReference
}) {
  const title = reference.previewTitle?.trim() || 'Abschnitt'
  const excerpt = reference.excerpt.trim()

  return (
    <div className="chat-message-reply-quote" aria-label="Bezug auf KI-Abschnitt">
      <div className="chat-composer-reply-quote-body">
        <p className="chat-composer-reply-quote-label">Antwort auf</p>
        <p className="chat-composer-reply-quote-title">{title}</p>
        {excerpt ? <p className="chat-composer-reply-quote-excerpt">{excerpt}</p> : null}
      </div>
    </div>
  )
}
