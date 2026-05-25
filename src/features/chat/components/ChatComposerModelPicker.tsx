import { useEffect, useRef, useState } from 'react'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { chatToolbarMobileMediaQuery, isChatToolbarMobileViewport } from '../../../utils/mobile'
import {
  CHAT_COMPOSER_MODELS,
  type ChatComposerModelId,
  getChatComposerModelMeta,
  parseStoredComposerModelId,
} from '../constants/chatComposerModels'

export type ChatComposerModelPickerProps = {
  value: ChatComposerModelId
  onChange: (id: ChatComposerModelId) => void
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
function ChatComposerModelNativeSelect({ value, onChange, disabled }: ChatComposerModelPickerProps) {
  const current = getChatComposerModelMeta(value)

  return (
    <div className="chat-model-picker">
      <span className="chat-composer-native-select-wrap">
        <span className="chat-model-picker-label" aria-hidden="true">
          {current.label}
        </span>
        <span className="chat-model-picker-chevron" aria-hidden="true" />
        <select
          className="chat-composer-native-select"
          value={value}
          disabled={disabled}
          aria-label={`KI-Modell: ${current.label}`}
          onChange={(event) => {
            onChange(parseStoredComposerModelId(event.target.value))
            event.currentTarget.blur()
          }}
        >
          {CHAT_COMPOSER_MODELS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}

export function ChatComposerModelPicker(props: ChatComposerModelPickerProps) {
  const isMobileNative = useChatToolbarMobilePicker()

  if (isMobileNative) {
    return <ChatComposerModelNativeSelect {...props} />
  }

  return <ChatComposerModelDropdown {...props} />
}

function ChatComposerModelDropdown({ value, onChange, disabled }: ChatComposerModelPickerProps) {
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
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
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
