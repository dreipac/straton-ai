import {
  CHAT_REPLY_MODE_OPTIONS,
  CHAT_REPLY_MODE_SHORT_LABEL,
  type ChatReplyMode,
} from '../constants/chatReplyMode'

export type ChatToolbarReplyModeSelectProps = {
  value: ChatReplyMode
  onChange: (mode: ChatReplyMode) => void
  disabled?: boolean
}

/**
 * Native `<select>` für iOS/PWA (System-Picker statt Bottom Sheet).
 * Optik wie `chat-main-invite-chip` / Glas-Pille in der Oberleiste.
 */
export function ChatToolbarReplyModeSelect({
  value,
  onChange,
  disabled,
}: ChatToolbarReplyModeSelectProps) {
  const shortLabel = CHAT_REPLY_MODE_SHORT_LABEL[value] ?? 'C'

  return (
    <span className="chat-toolbar-reply-mode-select-wrap">
      <span className="chat-toolbar-reply-mode-select-label" aria-hidden="true">
        {shortLabel}
      </span>
      <select
        className="chat-toolbar-reply-mode-select"
        value={value}
        disabled={disabled}
        aria-label="Antwortmodus: Comfort oder Strict"
        onChange={(event) => {
          const next = event.target.value
          if (next === 'comfort' || next === 'strict') {
            onChange(next)
          }
          /* iOS: Fokus lösen, sonst bleibt ein Rahmen/Fokuszustand und blockiert Folge-Taps */
          event.currentTarget.blur()
        }}
      >
        {CHAT_REPLY_MODE_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  )
}
