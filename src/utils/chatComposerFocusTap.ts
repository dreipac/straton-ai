import type { PointerEvent as ReactPointerEvent } from 'react'

export function isChatInputFocused(): boolean {
  const el = document.activeElement
  return el instanceof HTMLTextAreaElement && el.classList.contains('chat-input')
}

/**
 * iOS/WKWebView: Bei fokussierter Message-Box liefert der erste Tap auf andere Controls oft nur blur, kein click.
 * `preventDefault` auf touch/pen pointerdown lässt Klicks auf Pills/Schnellkacheln sofort durch (vgl. Senden-Button).
 */
export function preventIosBlurOnlyTapWhenChatInputFocused(
  event: ReactPointerEvent<HTMLElement>,
): void {
  if (event.button !== 0) {
    return
  }
  const touchLike = event.pointerType === 'touch' || event.pointerType === 'pen'
  if (!touchLike || !isChatInputFocused()) {
    return
  }
  event.preventDefault()
}
