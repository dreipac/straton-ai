import { useCallback, useRef, useState, type AnimationEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../utils/chatComposerFocusTap'

const SPRING_ANIMATION_NAME = 'tap-feedback-spring-scale'
const HOLD_RELEASE_ANIMATION_NAME = 'tap-feedback-hold-release'
/** Nach ~Peak der Feder (34 % von 500 ms) oder längerem Druck → Größe halten bis Loslassen. */
const HOLD_ACTIVATE_MS = 165
const HOLD_RELEASE_MS = 220

export type GlassPillTouchHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
}

export type GlassPillTouchFeedback = {
  isTapSpring: boolean
  isTapHeld: boolean
  isTapHeldReleasing: boolean
  touchHandlers: GlassPillTouchHandlers
  touchClassName: string
  touchStateClass: string
}

function buildTouchStateClass(
  isTapSpring: boolean,
  isTapHeld: boolean,
  isTapHeldReleasing: boolean,
): string {
  return [
    isTapSpring ? 'is-tap-spring' : '',
    isTapHeld ? 'is-tap-held' : '',
    isTapHeldReleasing ? 'is-tap-held-release' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Tap-Feder: kurzer Tipp = Feder-Durchlauf; Gedrückthalten = Peak-Scale bis Loslassen. */
export function useGlassPillTouchFeedback(): GlassPillTouchFeedback {
  const isSpringingRef = useRef(false)
  const isPressedRef = useRef(false)
  const holdActivatedRef = useRef(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isTapSpring, setIsTapSpring] = useState(false)
  const [isTapHeld, setIsTapHeld] = useState(false)
  const [isTapHeldReleasing, setIsTapHeldReleasing] = useState(false)
  const holdReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const clearHoldReleaseTimer = useCallback(() => {
    if (holdReleaseTimerRef.current !== null) {
      clearTimeout(holdReleaseTimerRef.current)
      holdReleaseTimerRef.current = null
    }
  }, [])

  const playSpring = useCallback(() => {
    clearHoldReleaseTimer()
    setIsTapHeldReleasing(false)
    setIsTapHeld(false)
    setIsTapSpring(false)
    window.requestAnimationFrame(() => {
      isSpringingRef.current = true
      setIsTapSpring(true)
    })
  }, [clearHoldReleaseTimer])

  const activateHold = useCallback(() => {
    if (!isPressedRef.current || holdActivatedRef.current) {
      return
    }
    holdActivatedRef.current = true
    isSpringingRef.current = false
    setIsTapSpring(false)
    setIsTapHeld(true)
  }, [])

  const finishSpring = useCallback(() => {
    if (!isSpringingRef.current) {
      return
    }
    isSpringingRef.current = false
    setIsTapSpring(false)
  }, [])

  const releasePress = useCallback(() => {
    isPressedRef.current = false
    clearHoldTimer()
    if (holdActivatedRef.current) {
      holdActivatedRef.current = false
      setIsTapHeld(false)
      setIsTapHeldReleasing(true)
      clearHoldReleaseTimer()
      holdReleaseTimerRef.current = setTimeout(() => {
        holdReleaseTimerRef.current = null
        setIsTapHeldReleasing(false)
      }, HOLD_RELEASE_MS)
    }
  }, [clearHoldReleaseTimer, clearHoldTimer])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return
      }
      preventIosBlurOnlyTapWhenChatInputFocused(event)
      event.currentTarget.setPointerCapture(event.pointerId)
      isPressedRef.current = true
      holdActivatedRef.current = false
      clearHoldTimer()
      playSpring()
      holdTimerRef.current = setTimeout(activateHold, HOLD_ACTIVATE_MS)
    },
    [activateHold, clearHoldTimer, playSpring],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      releasePress()
    },
    [releasePress],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      releasePress()
      finishSpring()
    },
    [finishSpring, releasePress],
  )

  const onPointerLeave = useCallback(() => {
    /* Feder-Animation läuft bei kurzem Tipp weiter; Hold bleibt über Pointer-Capture aktiv. */
  }, [])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) {
        return
      }
      if (event.animationName === SPRING_ANIMATION_NAME) {
        if (holdActivatedRef.current) {
          return
        }
        finishSpring()
        return
      }
      if (event.animationName === HOLD_RELEASE_ANIMATION_NAME) {
        clearHoldReleaseTimer()
        setIsTapHeldReleasing(false)
      }
    },
    [clearHoldReleaseTimer, finishSpring],
  )

  const touchStateClass = buildTouchStateClass(isTapSpring, isTapHeld, isTapHeldReleasing)

  return {
    isTapSpring,
    isTapHeld,
    isTapHeldReleasing,
    touchHandlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onAnimationEnd,
    },
    touchClassName: touchStateClass,
    touchStateClass,
  }
}

export function glassPillTouchClass(
  touch: Pick<GlassPillTouchFeedback, 'isTapSpring' | 'isTapHeld' | 'isTapHeldReleasing'> | boolean,
  ...extra: Array<string | false | null | undefined>
): string {
  const isTapSpring = typeof touch === 'boolean' ? touch : touch.isTapSpring
  const isTapHeld = typeof touch === 'boolean' ? false : touch.isTapHeld
  const isTapHeldReleasing = typeof touch === 'boolean' ? false : touch.isTapHeldReleasing
  return [
    'glass-pill-touch',
    buildTouchStateClass(isTapSpring, isTapHeld, isTapHeldReleasing),
    ...extra.filter(Boolean),
  ].join(' ')
}
