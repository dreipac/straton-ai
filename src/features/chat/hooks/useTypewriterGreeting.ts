import { useEffect, useRef, useState } from 'react'

/** Etwas schneller als zuvor (58ms), aber über rAF zeitgleich mit dem Display. */
const CHAR_DELAY_MS = 48
const PAUSE_BETWEEN_LINES_MS = 360

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function charCountForPhase(elapsedInPhaseMs: number, textLength: number, phaseDurationMs: number): number {
  if (textLength === 0 || phaseDurationMs <= 0) {
    return 0
  }
  const progress = Math.min(1, Math.max(0, elapsedInPhaseMs / phaseDurationMs))
  return Math.min(textLength, Math.max(0, Math.round(progress * textLength)))
}

export type TypewriterGreetingState = {
  greetText: string
  askText: string
  isTyping: boolean
  showCaret: boolean
}

/**
 * Tippt Begrüßung + Frage nacheinander (leerer Chat) — rAF + linearer Fortschritt (weniger Ruckeln als setTimeout pro Zeichen).
 */
export function useTypewriterGreeting(
  greet: string,
  ask: string,
  enabled: boolean,
  resetKey: string,
): TypewriterGreetingState {
  const [greetText, setGreetText] = useState(() =>
    enabled && !prefersReducedMotion() ? '' : greet,
  )
  const [askText, setAskText] = useState(() => (enabled && !prefersReducedMotion() ? '' : ask))
  const [isTyping, setIsTyping] = useState(() => enabled && !prefersReducedMotion())

  const greetRef = useRef(greet)
  const askRef = useRef(ask)
  greetRef.current = greet
  askRef.current = ask

  useEffect(() => {
    if (!enabled) {
      setGreetText(greet)
      setAskText(ask)
      setIsTyping(false)
      return
    }

    if (prefersReducedMotion()) {
      setGreetText(greet)
      setAskText(ask)
      setIsTyping(false)
      return
    }

    setGreetText('')
    setAskText('')
    setIsTyping(true)

    let cancelled = false
    let rafId = 0
    let startMs = 0
    let lastGreetCount = -1
    let lastAskCount = -1

    const greetPhaseMs = greet.length * CHAR_DELAY_MS
    const askPhaseMs = ask.length * CHAR_DELAY_MS
    const totalMs = greetPhaseMs + PAUSE_BETWEEN_LINES_MS + askPhaseMs

    const tick = (now: number) => {
      if (cancelled) {
        return
      }
      if (startMs === 0) {
        startMs = now
      }

      const elapsed = now - startMs
      const g = greetRef.current
      const a = askRef.current

      if (elapsed >= totalMs) {
        if (lastGreetCount !== g.length) {
          setGreetText(g)
          lastGreetCount = g.length
        }
        if (lastAskCount !== a.length) {
          setAskText(a)
          lastAskCount = a.length
        }
        setIsTyping(false)
        return
      }

      let greetCount = g.length
      let askCount = 0

      if (elapsed < greetPhaseMs) {
        greetCount = charCountForPhase(elapsed, g.length, greetPhaseMs)
        askCount = 0
      } else if (elapsed < greetPhaseMs + PAUSE_BETWEEN_LINES_MS) {
        greetCount = g.length
        askCount = 0
      } else {
        greetCount = g.length
        const askElapsed = elapsed - greetPhaseMs - PAUSE_BETWEEN_LINES_MS
        askCount = charCountForPhase(askElapsed, a.length, askPhaseMs)
      }

      if (greetCount !== lastGreetCount) {
        lastGreetCount = greetCount
        setGreetText(g.slice(0, greetCount))
      }
      if (askCount !== lastAskCount) {
        lastAskCount = askCount
        setAskText(a.slice(0, askCount))
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [enabled, greet, ask, resetKey])

  const showCaret = isTyping

  return { greetText, askText, isTyping, showCaret }
}
