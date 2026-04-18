import { useEffect, useRef, useState } from 'react'
import {
  CHAT_COMPOSER_MODELS,
  type ChatComposerModelId,
  getChatComposerModelMeta,
} from '../constants/chatComposerModels'

export type ChatComposerModelPickerProps = {
  value: ChatComposerModelId
  onChange: (id: ChatComposerModelId) => void
  disabled?: boolean
}

export function ChatComposerModelPicker({ value, onChange, disabled }: ChatComposerModelPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const current = getChatComposerModelMeta(value)

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
    <div className="chat-model-picker" ref={rootRef}>
      <button
        type="button"
        className="chat-model-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`KI-Modell: ${current.label}. Auswahl öffnen`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="chat-model-picker-label">{current.label}</span>
        <span className="chat-model-picker-chevron" aria-hidden />
      </button>
      {open ? (
        <div
          className="chat-slash-menu thread-menu chat-model-picker-dropdown"
          role="listbox"
          aria-label="KI-Modell wählen"
        >
          {CHAT_COMPOSER_MODELS.map((option) => (
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
