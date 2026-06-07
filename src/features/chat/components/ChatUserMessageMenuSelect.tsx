import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type ChatUserMessageActionMenuProps = {
  anchorRef: RefObject<HTMLElement | null>
  menuNonce: number
  onCopy: () => boolean | Promise<boolean>
  onClose: () => void
}

/**
 * Long-Press-Menü mit echtem Button — Backdrop + Menü im selben Body-Portal,
 * damit das Menü auf iOS über dem Backdrop liegt und klickbar bleibt.
 */
export function ChatUserMessageActionMenu({
  anchorRef,
  menuNonce,
  onCopy,
  onClose,
}: ChatUserMessageActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [backdropInteractive, setBackdropInteractive] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const openFrameRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) {
      return
    }
    const rect = anchor.getBoundingClientRect()
    setPosition({ top: rect.top, left: rect.right })
  }, [anchorRef])

  useLayoutEffect(() => {
    setOpen(false)
    setBackdropInteractive(false)
    updatePosition()
    void anchorRef.current?.offsetHeight

    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        openFrameRef.current = null
        setOpen(true)
      })
    })

    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      setOpen(true)
    }, 48)

    return () => {
      if (openFrameRef.current !== null) {
        cancelAnimationFrame(openFrameRef.current)
        openFrameRef.current = null
      }
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current)
        openTimerRef.current = null
      }
      setOpen(false)
      setBackdropInteractive(false)
    }
  }, [anchorRef, menuNonce, updatePosition])

  useEffect(() => {
    function enableBackdrop() {
      requestAnimationFrame(() => {
        setBackdropInteractive(true)
      })
    }

    function onTouchRelease() {
      document.removeEventListener('touchend', onTouchRelease, true)
      document.removeEventListener('touchcancel', onTouchRelease, true)
      enableBackdrop()
    }

    document.addEventListener('touchend', onTouchRelease, true)
    document.addEventListener('touchcancel', onTouchRelease, true)

    const fallbackTimer = window.setTimeout(enableBackdrop, 420)

    return () => {
      window.clearTimeout(fallbackTimer)
      document.removeEventListener('touchend', onTouchRelease, true)
      document.removeEventListener('touchcancel', onTouchRelease, true)
    }
  }, [menuNonce])

  useEffect(() => {
    updatePosition()
    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition])

  async function handleCopyClick() {
    const ok = await onCopy()
    if (ok) {
      onClose()
    }
  }

  if (!position || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="chat-user-message-menu-layer">
      <button
        type="button"
        className={`chat-user-message-menu-backdrop${open ? ' is-open' : ''}${
          backdropInteractive ? '' : ' is-touch-deferred'
        }`}
        aria-label="Menü schließen"
        onClick={onClose}
      />
      <div
        className={`chat-user-message-menu${open ? ' is-open' : ''}`}
        style={{ top: position.top, left: position.left }}
        role="menu"
        aria-label="Nachrichten-Aktionen"
      >
        <button
          type="button"
          className="chat-user-message-menu-action"
          role="menuitem"
          onClick={() => void handleCopyClick()}
        >
          <svg
            className="chat-user-message-menu-action-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
          Kopieren
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** @deprecated Alias — gleiche Komponente, neuer Name. */
export const ChatUserMessageMenuSelect = ChatUserMessageActionMenu
