import { useEffect, useRef, useState } from 'react'
import { CHAT_REPLY_MODE_OPTIONS, type ChatReplyMode } from '../constants/chatReplyMode'

export type ChatComposerReplyModePickerProps = {
  value: ChatReplyMode
  onChange: (mode: ChatReplyMode) => void
  disabled?: boolean
}

/** Comfort/Strict in der Desktop-Composer-Leiste (Dropdown). Auf ≤860px: `ChatToolbarReplyModeSelect` in der Oberleiste. */
export function ChatComposerReplyModePicker({
  value,
  onChange,
  disabled,
}: ChatComposerReplyModePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const currentLabel =
    CHAT_REPLY_MODE_OPTIONS.find((o) => o.id === value)?.label ?? 'Comfort'

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: MouseEvent) {
      const el = rootRef.current
      if (!el || el.contains(event.target as Node)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div className="chat-model-picker chat-reply-mode-picker" ref={rootRef}>
      <button
        type="button"
        className="chat-model-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Antwortmodus: ${currentLabel}. Auswahl öffnen`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="chat-model-picker-label">{currentLabel}</span>
        <span className="chat-model-picker-chevron" aria-hidden />
      </button>
      {open ? (
        <div
          className="chat-slash-menu thread-menu chat-model-picker-dropdown"
          role="listbox"
          aria-label="Antwortmodus wählen"
        >
          {CHAT_REPLY_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`thread-menu-item chat-model-picker-item${option.id === value ? ' is-selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
