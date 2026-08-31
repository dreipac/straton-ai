import { useCallback, useRef, useState } from 'react'
import { MenuItem } from '../../../components/ui/menu/MenuItem'
import { PopoverMenu } from '../../../components/ui/menu/PopoverMenu'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
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
  const close = useCallback(() => setOpen(false), [])

  const currentLabel =
    CHAT_REPLY_MODE_OPTIONS.find((o) => o.id === value)?.label ?? 'Comfort'

  return (
    <div className="chat-model-picker chat-reply-mode-picker" ref={rootRef}>
      <button
        type="button"
        className="chat-model-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Antwortmodus: ${currentLabel}. Auswahl öffnen`}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="chat-model-picker-label">{currentLabel}</span>
        <span className="chat-model-picker-chevron" aria-hidden />
      </button>
      <PopoverMenu
        open={open}
        onClose={close}
        direction="up"
        role="listbox"
        anchorRef={rootRef}
        ariaLabel="Antwortmodus wählen"
        className="chat-model-picker-dropdown"
      >
        {CHAT_REPLY_MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.id}
            role="option"
            aria-selected={option.id === value}
            className={`chat-model-picker-item${option.id === value ? ' is-selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              onChange(option.id)
              setOpen(false)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </PopoverMenu>
    </div>
  )
}
