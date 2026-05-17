import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Muss ≥ `--tap-feedback-scale-duration` in `ui.css` sein, sonst bricht Scale auf iOS ab. */
const TAP_SCALE_TRANSITION_MS = 280
const MIN_RELEASE_MS = TAP_SCALE_TRANSITION_MS
const MAX_RELEASE_MS = TAP_SCALE_TRANSITION_MS + 140

export type GlassPillTouchHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void
}

export type GlassPillTouchFeedback = {
  isTouchActive: boolean
  touchHandlers: GlassPillTouchHandlers
  touchClassName: string
}

/** Tap-Feedback wie «Neuer Chat» (Scale + Aufhellen) für Milk-Glass-Pills. */
export function useGlassPillTouchFeedback(): GlassPillTouchFeedback {
  const pressStartRef = useRef(0)
  const releaseTimerRef = useRef<number | null>(null)
  const isPressedRef = useRef(false)
  const [isTouchActive, setIsTouchActive] = useState(false)

  const activate = useCallback(() => {
    if (isPressedRef.current) {
      return
    }
    isPressedRef.current = true
    pressStartRef.current = Date.now()
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
    setIsTouchActive(true)
  }, [])

  const release = useCallback(() => {
    if (!isPressedRef.current) {
      return
    }
    isPressedRef.current = false
    const elapsed = Date.now() - pressStartRef.current
    const holdMs = Math.min(MAX_RELEASE_MS, Math.max(MIN_RELEASE_MS, elapsed))
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
    }
    releaseTimerRef.current = window.setTimeout(() => {
      setIsTouchActive(false)
      releaseTimerRef.current = null
    }, holdMs)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      activate()
    },
    [activate],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      release()
    },
    [release],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      release()
    },
    [release],
  )

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        release()
      }
    },
    [release],
  )

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current)
      }
    }
  }, [])

  return {
    isTouchActive,
    touchHandlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
    },
    touchClassName: isTouchActive ? 'is-touch-active' : '',
  }
}

export function glassPillTouchClass(
  isTouchActive: boolean,
  ...extra: Array<string | false | null | undefined>
): string {
  return ['glass-pill-touch', isTouchActive ? 'is-touch-active' : '', ...extra.filter(Boolean)].join(' ')
}
