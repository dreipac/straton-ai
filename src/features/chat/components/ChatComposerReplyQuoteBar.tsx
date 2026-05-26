import { useEffect, useRef, useState } from 'react'
import type { AssistantSectionReference } from '../utils/assistantSectionReply'

const REPLY_QUOTE_DISMISS_MS = 300
/** Muss zu `grid-template-rows` in chat.css passen (0.32s). */
export const REPLY_QUOTE_OPEN_MS = 340

export type ChatComposerReplyQuoteBarProps = {
  reference: AssistantSectionReference
  onDismiss: () => void
}

export type ChatComposerReplyQuoteSlotProps = {
  reference: AssistantSectionReference | null
  onDismiss: () => void
  /** Nach abgeschlossener Einblend-Animation (Mobile: danach Fokus/Tastatur). */
  onOpenSettled?: () => void
}

/** Animiert Ein-/Ausblenden der Referenz und Höhenwachstum der Message Box. */
export function ChatComposerReplyQuoteSlot({
  reference,
  onDismiss,
  onOpenSettled,
}: ChatComposerReplyQuoteSlotProps) {
  const [closing, setClosing] = useState(false)
  const dismissTimerRef = useRef<number | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const openSettledRef = useRef(false)
  const open = Boolean(reference) && !closing

  useEffect(() => {
    setClosing(false)
    openSettledRef.current = false
  }, [reference?.messageId, reference?.blockIndex])

  useEffect(() => {
    if (!reference || closing || !onOpenSettled) {
      return
    }

    const anchor = anchorRef.current
    let fallbackTimer = 0

    const notifySettled = () => {
      if (openSettledRef.current) {
        return
      }
      openSettledRef.current = true
      onOpenSettled()
    }

    function onTransitionEnd(event: TransitionEvent) {
      if (event.target !== anchor || event.propertyName !== 'grid-template-rows') {
        return
      }
      if (!anchor?.classList.contains('is-open')) {
        return
      }
      notifySettled()
    }

    if (anchor) {
      anchor.addEventListener('transitionend', onTransitionEnd)
    }
    fallbackTimer = window.setTimeout(notifySettled, REPLY_QUOTE_OPEN_MS + 40)

    return () => {
      if (anchor) {
        anchor.removeEventListener('transitionend', onTransitionEnd)
      }
      window.clearTimeout(fallbackTimer)
    }
  }, [closing, onOpenSettled, reference])

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
      ref={anchorRef}
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
