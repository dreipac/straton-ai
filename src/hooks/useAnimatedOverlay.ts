import { useCallback, useEffect, useRef, useState } from 'react'

/** Mount/Visible-Pattern für Modale mit Ausblend-Animation. */
export function useAnimatedOverlay(animationMs: number) {
  const closeTimerRef = useRef<number | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const open = useCallback(() => {
    clearCloseTimer()
    setIsMounted(true)
    window.requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [clearCloseTimer])

  const close = useCallback(() => {
    setIsVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setIsMounted(false)
      closeTimerRef.current = null
    }, animationMs)
  }, [animationMs])

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  return {
    isMounted,
    isVisible,
    setIsMounted,
    setIsVisible,
    open,
    close,
    closeTimerRef,
    clearCloseTimer,
  }
}
