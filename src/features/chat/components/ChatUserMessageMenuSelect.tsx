import { useEffect, useRef } from 'react'
import { openNativeSelectPicker } from '../utils/openNativeSelectPicker'

export type ChatUserMessageMenuSelectProps = {
  onSelectCopy: () => void
  onClose: () => void
}

/**
 * Native `<select>` über der Nutzer-Bubble (iOS/PWA System-Aktionsliste), analog Titel-Pille.
 */
export function ChatUserMessageMenuSelect({ onSelectCopy, onClose }: ChatUserMessageMenuSelectProps) {
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const dismissTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const el = selectRef.current
    if (!el) {
      return
    }
    const id = window.requestAnimationFrame(() => {
      openNativeSelectPicker(el)
    })
    return () => {
      window.cancelAnimationFrame(id)
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
      }
    }
  }, [])

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
    <label className="chat-user-message-menu">
      <select
        ref={selectRef}
        className="chat-user-message-menu-select"
        value=""
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
}
