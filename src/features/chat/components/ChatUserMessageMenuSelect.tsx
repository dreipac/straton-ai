import { forwardRef, useRef } from 'react'

export type ChatUserMessageMenuSelectProps = {
  onSelectCopy: () => void
  onClose: () => void
}

/**
 * Verstecktes natives `<select>` — Öffnen per `openNativeSelectPicker` aus dem Long-Press-touchend
 * (iOS erlaubt showPicker nur synchron zur Nutzergeste, nicht mitten in touchstart).
 */
export const ChatUserMessageMenuSelect = forwardRef<HTMLSelectElement, ChatUserMessageMenuSelectProps>(
  function ChatUserMessageMenuSelect({ onSelectCopy, onClose }, ref) {
    const dismissTimerRef = useRef<number | null>(null)

    function scheduleDismiss() {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
      }
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null
        onClose()
      }, 420)
    }

    return (
      <label className="chat-user-message-menu-host" aria-hidden="true">
        <select
          ref={ref}
          className="chat-user-message-menu-select"
          value=""
          tabIndex={-1}
          aria-label="Nachrichten-Aktionen"
          onChange={(event) => {
            if (dismissTimerRef.current !== null) {
              window.clearTimeout(dismissTimerRef.current)
              dismissTimerRef.current = null
            }
            const action = event.target.value
            if (action === 'copy') {
              onSelectCopy()
            }
            event.target.value = ''
            event.currentTarget.blur()
            onClose()
          }}
          onBlur={scheduleDismiss}
        >
          <option value="" disabled hidden>
            Nachricht
          </option>
          <option value="copy">Kopieren</option>
        </select>
      </label>
    )
  },
)
