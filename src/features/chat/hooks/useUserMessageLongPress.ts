import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import { hapticLightImpact } from '../../../utils/haptics'
import { openNativeSelectPicker } from '../utils/openNativeSelectPicker'

const LONG_PRESS_MS = 520
const MOVE_CANCEL_PX = 14

export type UserMessageCopyMenuState = {
  messageId: string
  copyText: string
}

export function useUserMessageLongPress(enabled: boolean) {
  const [pressingMessageId, setPressingMessageId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<UserMessageCopyMenuState | null>(null)
  const menuSelectRef = useRef<HTMLSelectElement>(null)
  const menuCopyTextRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const pendingMessageRef = useRef<{ id: string; copyText: string } | null>(null)
  const longPressArmedMessageIdRef = useRef<string | null>(null)

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
    longPressArmedMessageIdRef.current = null
    clearTimer()
  }, [clearTimer])

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

  const shouldMountMenuOverlay = useCallback(
    (messageId: string) => pressingMessageId === messageId || menuState?.messageId === messageId,
    [menuState, pressingMessageId],
  )

  const bindUserMessageLongPress = useCallback(
    (messageId: string, copyText: string) => {
      if (!enabled) {
        return {}
      }

      const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
        if (event.touches.length !== 1) {
          return
        }
        const touch = event.touches[0]
        longPressArmedMessageIdRef.current = null
        pendingMessageRef.current = { id: messageId, copyText }
        startRef.current = { x: touch.clientX, y: touch.clientY }
        setPressingMessageId(messageId)
        clearTimer()
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          const pending = pendingMessageRef.current
          if (pending?.id === messageId) {
            longPressArmedMessageIdRef.current = messageId
            hapticLightImpact()
          }
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
          clearTimer()
          startRef.current = null
          pendingMessageRef.current = null
          longPressArmedMessageIdRef.current = null
          setPressingMessageId((current) => (current === messageId ? null : current))
        }
      }

      const endPress = () => {
        clearTimer()
        const pending = pendingMessageRef.current
        const armedId = longPressArmedMessageIdRef.current
        startRef.current = null
        pendingMessageRef.current = null
        longPressArmedMessageIdRef.current = null

        if (armedId === messageId && pending?.id === messageId) {
          const text = pending.copyText.trim()
          if (text) {
            menuCopyTextRef.current = text
            setMenuState({ messageId, copyText: text })
            const select = menuSelectRef.current
            if (select) {
              openNativeSelectPicker(select)
            }
          }
          setPressingMessageId(null)
          return
        }

        setPressingMessageId((current) => (current === messageId ? null : current))
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
    [clearTimer, enabled],
  )

  return {
    menuState,
    menuSelectRef,
    getMenuCopyText,
    closeMenu,
    isMessagePressActive,
    shouldMountMenuOverlay,
    bindUserMessageLongPress,
  }
}
