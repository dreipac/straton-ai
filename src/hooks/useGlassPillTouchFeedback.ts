import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

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
  const isPressedRef = useRef(false)
  const [isTouchActive, setIsTouchActive] = useState(false)

  const activate = useCallback(() => {
    if (isPressedRef.current) {
      return
    }
    isPressedRef.current = true
    setIsTouchActive(true)
  }, [])

  const release = useCallback(() => {
    if (!isPressedRef.current) {
      return
    }
    isPressedRef.current = false
    setIsTouchActive(false)
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
