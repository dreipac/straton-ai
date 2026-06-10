import { useEffect, useRef, useState } from 'react'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { chatToolbarMobileMediaQuery, isChatToolbarMobileViewport } from '../../../utils/mobile'
import { type ChatThinkingMode, filterChatThinkingModeOptions } from '../constants/chatThinkingMode'

export type ChatComposerThinkingModePickerProps = {
  value: ChatThinkingMode
  onChange: (mode: ChatThinkingMode) => void
  disabled?: boolean
  allowCustomMode?: boolean
}

function thinkingModePickerRootClass(value: ChatThinkingMode): string {
  return `chat-model-picker chat-thinking-mode-picker chat-thinking-mode-picker--${value}`
}

const thinkingModeTileTriggerClass =
  'chat-model-picker-trigger chat-composer-tile-btn chat-composer-tile-btn--pill'

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
  allowCustomMode = false,
}: ChatComposerThinkingModePickerProps) {
  const options = filterChatThinkingModeOptions(allowCustomMode)
  const currentLabel = options.find((o) => o.id === value)?.label ?? 'Smart Instant'

  return (
    <div className={thinkingModePickerRootClass(value)}>
      <span
        className={`chat-composer-native-select-wrap ${thinkingModeTileTriggerClass}`}
      >
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
            if (next === 'normal' || next === 'thinking' || next === 'custom') {
              onChange(next)
            }
            event.currentTarget.blur()
          }}
        >
          {options.map((option) => (
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
  allowCustomMode = false,
}: ChatComposerThinkingModePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const options = filterChatThinkingModeOptions(allowCustomMode)

  const currentLabel = options.find((o) => o.id === value)?.label ?? 'Smart Instant'

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
    <div className={thinkingModePickerRootClass(value)} ref={rootRef}>
      <button
        type="button"
        className={thinkingModeTileTriggerClass}
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
          aria-label="Smart Instant, Custom oder Thinking wählen"
        >
          {options.map((option) => (
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
