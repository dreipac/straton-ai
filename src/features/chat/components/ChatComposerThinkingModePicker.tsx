import { useEffect, useRef, useState } from 'react'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { chatToolbarMobileMediaQuery, isChatToolbarMobileViewport } from '../../../utils/mobile'
import { CHAT_THINKING_MODE_OPTIONS, type ChatThinkingMode } from '../constants/chatThinkingMode'

export type ChatComposerThinkingModePickerProps = {
  value: ChatThinkingMode
  onChange: (mode: ChatThinkingMode) => void
  disabled?: boolean
}

function useChatToolbarMobilePicker(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? isChatToolbarMobileViewport() : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mq = window.matchMedia(chatToolbarMobileMediaQuery())
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return mobile
}

/** Native `<select>` auf Mobile (≤860px) — System-Picker statt Bottom Sheet. */
function ChatComposerThinkingModeNativeSelect({
  value,
  onChange,
  disabled,
}: ChatComposerThinkingModePickerProps) {
  const currentLabel =
    CHAT_THINKING_MODE_OPTIONS.find((o) => o.id === value)?.label ?? 'Instant'

  return (
    <div className="chat-model-picker chat-thinking-mode-picker">
      <span className="chat-composer-native-select-wrap">
        <span className="chat-model-picker-label" aria-hidden="true">
          {currentLabel}
        </span>
        <span className="chat-model-picker-chevron" aria-hidden="true" />
        <select
          className="chat-composer-native-select"
          value={value}
          disabled={disabled}
          aria-label={`Bearbeitungsmodus: ${currentLabel}`}
          onChange={(event) => {
            const next = event.target.value
            if (next === 'normal' || next === 'thinking') {
              onChange(next)
            }
            event.currentTarget.blur()
          }}
        >
          {CHAT_THINKING_MODE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}

export function ChatComposerThinkingModePicker(props: ChatComposerThinkingModePickerProps) {
  const isMobileNative = useChatToolbarMobilePicker()

  if (isMobileNative) {
    return <ChatComposerThinkingModeNativeSelect {...props} />
  }

  return <ChatComposerThinkingModeDropdown {...props} />
}

function ChatComposerThinkingModeDropdown({
  value,
  onChange,
  disabled,
}: ChatComposerThinkingModePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const currentLabel =
    CHAT_THINKING_MODE_OPTIONS.find((o) => o.id === value)?.label ?? 'Instant'

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
    <div className="chat-model-picker chat-thinking-mode-picker" ref={rootRef}>
      <button
        type="button"
        className="chat-model-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Bearbeitungsmodus: ${currentLabel}. Auswahl öffnen`}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="chat-model-picker-label">{currentLabel}</span>
        <span className="chat-model-picker-chevron" aria-hidden />
      </button>
      {open ? (
        <div
          className="chat-slash-menu thread-menu chat-model-picker-dropdown"
          role="listbox"
          aria-label="Instant oder Thinking wählen"
        >
          {CHAT_THINKING_MODE_OPTIONS.map((option) => (
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
