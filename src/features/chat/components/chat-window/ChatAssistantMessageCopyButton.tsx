import { useEffect, useState } from 'react'

const COPY_FEEDBACK_MS = 1000

type ChatAssistantMessageCopyButtonProps = {
  onCopy: () => boolean | Promise<boolean>
}

export function ChatAssistantMessageCopyButton({ onCopy }: ChatAssistantMessageCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function handleClick() {
    const ok = await onCopy()
    if (ok) {
      setCopied(true)
    }
  }

  const label = copied ? 'Kopiert' : 'Antwort kopieren'

  return (
    <div className="chat-assistant-message-copy">
      <button
        type="button"
        className={`chat-assistant-message-copy-btn${copied ? ' is-copied' : ''}`}
        aria-label={label}
        title={label}
        onClick={() => void handleClick()}
      >
        {copied ? (
          <svg
            className="chat-assistant-message-copy-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            className="chat-assistant-message-copy-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
