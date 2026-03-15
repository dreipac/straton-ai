import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import sendIcon from '../../../assets/icons/send.svg'
import type { ChatMessage } from '../types'

type ChatWindowProps = {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  greetingName: string
  onSendMessage: (content: string) => Promise<void>
}

export function ChatWindow({
  messages,
  isSending,
  error,
  greetingName,
  onSendMessage,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const isEmptyState = messages.length === 0
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [caretLeft, setCaretLeft] = useState(0)
  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement | null>(null)
  const measurerRef = useRef<HTMLSpanElement | null>(null)
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set())
  const animationTimersRef = useRef<number[]>([])
  const wasSendingRef = useRef(isSending)

  const updateSmoothCaret = useCallback(() => {
    const inputElement = inputRef.current
    const measurerElement = measurerRef.current
    if (!inputElement || !measurerElement) {
      return
    }

    const cursorIndex = inputElement.selectionStart ?? inputElement.value.length
    const textBeforeCursor = inputElement.value.slice(0, cursorIndex).replace(/ /g, '\u00a0')
    measurerElement.textContent = textBeforeCursor || '\u200b'

    const computed = window.getComputedStyle(inputElement)
    const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0
    const paddingRight = Number.parseFloat(computed.paddingRight) || 0
    const measuredWidth = measurerElement.getBoundingClientRect().width
    const nextLeft = paddingLeft + measuredWidth - inputElement.scrollLeft
    const maxLeft = inputElement.clientWidth - paddingRight - 2
    setCaretLeft(Math.min(Math.max(nextLeft, paddingLeft), Math.max(maxLeft, paddingLeft)))
  }, [])

  useLayoutEffect(() => {
    updateSmoothCaret()
  }, [draft, updateSmoothCaret])

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      animationTimersRef.current = []
    }
  }, [])

  useEffect(() => {
    const latestMessage = messages[messages.length - 1]
    const shouldAnimateLatestAssistant =
      wasSendingRef.current &&
      !isSending &&
      latestMessage?.role === 'assistant' &&
      !animatedAssistantIdsRef.current.has(latestMessage.id)

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue
      }

      const alreadyHandled = animatedAssistantIdsRef.current.has(message.id)
      if (alreadyHandled) {
        continue
      }

      if (shouldAnimateLatestAssistant && latestMessage?.id === message.id) {
        const fullContent = message.content
        const stepSize = Math.max(1, Math.ceil(fullContent.length / 90))
        let cursor = 0

        const run = () => {
          cursor = Math.min(cursor + stepSize, fullContent.length)
          setAnimatedAssistantContent((prev) => ({
            ...prev,
            [message.id]: fullContent.slice(0, cursor),
          }))

          if (cursor < fullContent.length) {
            const timerId = window.setTimeout(run, 18)
            animationTimersRef.current.push(timerId)
            return
          }

          animatedAssistantIdsRef.current.add(message.id)
        }

        const startTimerId = window.setTimeout(run, 0)
        animationTimersRef.current.push(startTimerId)
        continue
      }

      const immediateTimerId = window.setTimeout(() => {
        setAnimatedAssistantContent((prev) => ({ ...prev, [message.id]: message.content }))
      }, 0)
      animationTimersRef.current.push(immediateTimerId)
      animatedAssistantIdsRef.current.add(message.id)
    }

    wasSendingRef.current = isSending
  }, [isSending, messages])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.trim() || isSending) {
      return
    }

    const content = draft
    setDraft('')
    await onSendMessage(content)
  }

  if (isEmptyState) {
    return (
      <section className="chat-panel is-empty">
        <div className="chat-empty-compose">
          <h2 className="chat-empty-title">Wie kann ich dir heute helfen, {greetingName}?</h2>
          {error ? <p className="error-text">{error}</p> : null}
          <form className="chat-input-row is-centered" onSubmit={handleSubmit}>
            <div className="chat-input-field">
              <input
                ref={inputRef}
                className="chat-input has-smooth-caret"
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyUp={updateSmoothCaret}
                onClick={updateSmoothCaret}
                onSelect={updateSmoothCaret}
                onScroll={updateSmoothCaret}
                onFocus={() => {
                  setIsInputFocused(true)
                  updateSmoothCaret()
                }}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Nachricht eingeben..."
                disabled={isSending}
              />
              <span ref={measurerRef} className="chat-caret-measurer" aria-hidden="true" />
              {isInputFocused ? <span className="chat-smooth-caret" style={{ left: `${caretLeft}px` }} /> : null}
            </div>
            <button type="submit" disabled={isSending || !draft.trim()}>
              <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
            </button>
          </form>
          <p className="chat-input-hint">
            Straton kann Fehler machen, überprüfe wichtige Informationen
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="chat-panel">
      <div className="chat-messages">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
          >
            {message.role === 'assistant' ? <strong>Straton AI</strong> : null}
            <p>
              {message.role === 'assistant'
                ? (animatedAssistantContent[message.id] ?? message.content)
                : message.content}
            </p>
          </article>
        ))}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <div className="chat-input-field">
          <input
            ref={inputRef}
            className="chat-input has-smooth-caret"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyUp={updateSmoothCaret}
            onClick={updateSmoothCaret}
            onSelect={updateSmoothCaret}
            onScroll={updateSmoothCaret}
            onFocus={() => {
              setIsInputFocused(true)
              updateSmoothCaret()
            }}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Nachricht eingeben..."
            disabled={isSending}
          />
          <span ref={measurerRef} className="chat-caret-measurer" aria-hidden="true" />
          {isInputFocused ? <span className="chat-smooth-caret" style={{ left: `${caretLeft}px` }} /> : null}
        </div>
        <button type="submit" disabled={isSending || !draft.trim()}>
          <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
