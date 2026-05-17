import { useCallback, useRef, useState, type AnimationEvent, type PointerEvent as ReactPointerEvent } from 'react'

const SPRING_ANIMATION_NAME = 'tap-feedback-spring-scale'

export type GlassPillTouchHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
}

export type GlassPillTouchFeedback = {
  isTapSpring: boolean
  touchHandlers: GlassPillTouchHandlers
  touchClassName: string
}

/** Tap-Feder: ein Durchlauf Scale + Aufhellen pro Tipp (läuft auch nach Loslassen zu Ende). */
export function useGlassPillTouchFeedback(): GlassPillTouchFeedback {
  const isSpringingRef = useRef(false)
  const [isTapSpring, setIsTapSpring] = useState(false)

  const playSpring = useCallback(() => {
    setIsTapSpring(false)
    window.requestAnimationFrame(() => {
      isSpringingRef.current = true
      setIsTapSpring(true)
    })
  }, [])

  const finishSpring = useCallback(() => {
    if (!isSpringingRef.current) {
      return
    }
    isSpringingRef.current = false
    setIsTapSpring(false)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      playSpring()
    },
    [playSpring],
  )

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const onPointerLeave = useCallback(() => {
    /* Feder-Animation läuft unabhängig vom Finger weiter. */
  }, [])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) {
        return
      }
      if (event.animationName !== SPRING_ANIMATION_NAME) {
        return
      }
      finishSpring()
    },
    [finishSpring],
  )

  return {
    isTapSpring,
    touchHandlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onAnimationEnd,
    },
    touchClassName: isTapSpring ? 'is-tap-spring' : '',
  }
}

export function glassPillTouchClass(
  isTapSpring: boolean,
  ...extra: Array<string | false | null | undefined>
): string {
  return ['glass-pill-touch', isTapSpring ? 'is-tap-spring' : '', ...extra.filter(Boolean)].join(' ')
}
