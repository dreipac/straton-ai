import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import { hapticLightImpact } from '../../../utils/haptics'

const LONG_PRESS_MS = 380
const MOVE_CANCEL_PX = 18

export type UserMessageCopyMenuState = {
  messageId: string
  copyText: string
  nonce: number
}

export function useUserMessageLongPress(enabled: boolean) {
  const [pressingMessageId, setPressingMessageId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<UserMessageCopyMenuState | null>(null)
  const menuCopyTextRef = useRef('')
  const menuNonceRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const pendingMessageRef = useRef<{ id: string; copyText: string } | null>(null)
  const activePressMessageIdRef = useRef<string | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const closeMenu = useCallback(() => {
    setMenuState(null)
    setPressingMessageId(null)
    menuCopyTextRef.current = ''
    pendingMessageRef.current = null
    startRef.current = null
    activePressMessageIdRef.current = null
    clearTimer()
  }, [clearTimer])

  const openCopyMenu = useCallback((messageId: string, copyText: string) => {
    const text = copyText.trim()
    if (!text) {
      return
    }
    menuNonceRef.current += 1
    menuCopyTextRef.current = text
    setMenuState({ messageId, copyText: text, nonce: menuNonceRef.current })
    setPressingMessageId(null)
  }, [])

  const getMenuCopyText = useCallback(
    () => menuCopyTextRef.current.trim() || menuState?.copyText?.trim() || '',
    [menuState],
  )

  useEffect(() => {
    if (!enabled) {
      closeMenu()
    }
  }, [closeMenu, enabled])

  useEffect(() => () => clearTimer(), [clearTimer])

  const isMessagePressActive = useCallback(
    (messageId: string) => pressingMessageId === messageId,
    [pressingMessageId],
  )

  const shouldShowCopyMenu = useCallback(
    (messageId: string) => menuState?.messageId === messageId,
    [menuState],
  )

  const bindUserMessageLongPress = useCallback(
    (messageId: string, copyText: string) => {
      if (!enabled) {
        return {}
      }

      const resetPress = () => {
        clearTimer()
        startRef.current = null
        pendingMessageRef.current = null
        if (activePressMessageIdRef.current === messageId) {
          activePressMessageIdRef.current = null
        }
        setPressingMessageId((current) => (current === messageId ? null : current))
      }

      const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
        if (event.touches.length !== 1) {
          return
        }
        const touch = event.touches[0]
        activePressMessageIdRef.current = messageId
        pendingMessageRef.current = { id: messageId, copyText }
        startRef.current = { x: touch.clientX, y: touch.clientY }
        setPressingMessageId(messageId)
        clearTimer()
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          const pending = pendingMessageRef.current
          if (pending?.id !== messageId || activePressMessageIdRef.current !== messageId) {
            return
          }
          hapticLightImpact()
          openCopyMenu(messageId, pending.copyText)
        }, LONG_PRESS_MS)
      }

      const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
        if (!startRef.current || timerRef.current === null) {
          return
        }
        const touch = event.touches[0]
        if (!touch) {
          return
        }
        const dx = Math.abs(touch.clientX - startRef.current.x)
        const dy = Math.abs(touch.clientY - startRef.current.y)
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          resetPress()
        }
      }

      const endPress = () => {
        if (activePressMessageIdRef.current !== messageId) {
          return
        }
        resetPress()
      }

      return {
        onTouchStart,
        onTouchMove,
        onTouchEnd: endPress,
        onTouchCancel: endPress,
        onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault()
        },
      }
    },
    [clearTimer, enabled, openCopyMenu],
  )

  return {
    menuState,
    getMenuCopyText,
    closeMenu,
    isMessagePressActive,
    shouldShowCopyMenu,
    bindUserMessageLongPress,
  }
}
