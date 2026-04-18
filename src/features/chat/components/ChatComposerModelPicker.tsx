import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionBottomSheet } from '../../../components/ui/bottom-sheet/ActionBottomSheet'
import { isMobileViewport, mobileMediaQuery } from '../../../utils/mobile'
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

function useMobileModelPickerSheet(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? isMobileViewport() : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mq = window.matchMedia(mobileMediaQuery())
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

export function ChatComposerModelPicker({ value, onChange, disabled }: ChatComposerModelPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const isMobileSheet = useMobileModelPickerSheet()

  const current = getChatComposerModelMeta(value)

  const sheetActions = useMemo(
    () =>
      CHAT_COMPOSER_MODELS.map((option) => ({
        id: option.id,
        label: option.id === value ? `${option.label} · aktiv` : option.label,
        onClick: () => {
          onChange(option.id)
        },
      })),
    [value, onChange],
  )

  useEffect(() => {
    if (!open || isMobileSheet) {
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
  }, [open, isMobileSheet])

  useEffect(() => {
    if (!open || isMobileSheet) {
      return
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, isMobileSheet])

  return (
    <>
      <div className="chat-model-picker" ref={rootRef}>
        <button
          type="button"
          className="chat-model-picker-trigger"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup={isMobileSheet ? 'dialog' : 'listbox'}
          aria-label={`KI-Modell: ${current.label}. Auswahl öffnen`}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="chat-model-picker-label">{current.label}</span>
          <span className="chat-model-picker-chevron" aria-hidden />
        </button>
        {!isMobileSheet && open ? (
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
      {isMobileSheet ? (
        <ActionBottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="KI-Modell"
          ariaLabel="KI-Modell wählen"
          actions={sheetActions}
        />
      ) : null}
    </>
  )
}
