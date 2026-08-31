import { useEffect, useRef, type RefObject } from 'react'

/** Gleicher Breakpoint wie Composer-Mobile (`ChatWindow`). */
export const ASSISTANT_SECTION_REPLY_MOBILE_MQ = '(max-width: 860px)'

/** Maximaler sichtbarer Versatz des Abschnitts beim Wischen. */
const SWIPE_MAX_PX = 72
/** Ab hier gilt die Geste als „eingebettet“ und löst die Referenz aus. */
const SWIPE_TRIGGER_PX = 58
const SWIPE_LOCK_PROGRESS = 0.92
const SWIPE_AXIS_MIN_PX = 8

export function useAssistantSectionReplySwipe(
  enabled: boolean,
  onSwipeReply: () => void,
): { sectionRef: RefObject<HTMLDivElement | null> } {
  const sectionRef = useRef<HTMLDivElement>(null)
  const onSwipeRef = useRef(onSwipeReply)
  onSwipeRef.current = onSwipeReply

  useEffect(() => {
    const hostEl = sectionRef.current
    if (!hostEl || !enabled) {
      return
    }
    const host: HTMLDivElement = hostEl

    let startX = 0
    let startY = 0
    let tracking = false
    let horizontal = false
    let rafId = 0
    let pendingDx = 0
    let lastOffsetPx = -1
    let lastProgressKey = -1
    let lastLocked = false

    function resetSwipeVisual() {
      lastOffsetPx = -1
      lastProgressKey = -1
      lastLocked = false
      host.style.removeProperty('--section-swipe-x')
      host.style.setProperty('--section-swipe-progress', '0')
      host.classList.remove('is-swipe-reply-locked', 'is-swipe-reply-complete')
    }

    function clearDragState() {
      host.classList.remove('is-swipe-dragging')
      resetSwipeVisual()
    }

    function applySwipeVisual(dx: number) {
      const raw = Math.max(0, dx)
      let x = raw
      if (x > SWIPE_MAX_PX) {
        x = SWIPE_MAX_PX + (x - SWIPE_MAX_PX) * 0.18
      }
      const offsetPx = Math.round(x)
      const progress = Math.min(1, raw / SWIPE_MAX_PX)
      const progressKey = Math.round(progress * 100)

      if (offsetPx !== lastOffsetPx) {
        lastOffsetPx = offsetPx
        host.style.setProperty('--section-swipe-x', `${offsetPx}px`)
      }
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey
        host.style.setProperty('--section-swipe-progress', String(progress))
      }

      const locked = progress >= SWIPE_LOCK_PROGRESS
      if (locked !== lastLocked) {
        lastLocked = locked
        host.classList.toggle('is-swipe-reply-locked', locked)
      }
    }

    function flushPendingVisual() {
      rafId = 0
      applySwipeVisual(pendingDx)
    }

    function scheduleSwipeVisual(dx: number) {
      pendingDx = dx
      if (rafId !== 0) {
        return
      }
      rafId = requestAnimationFrame(flushPendingVisual)
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        return
      }
      tracking = true
      horizontal = false
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      host.classList.add('is-swipe-dragging')
      host.classList.remove('is-swipe-reply-complete')
      pendingDx = 0
      scheduleSwipeVisual(0)
    }

    function onMove(event: TouchEvent) {
      if (!tracking || event.touches.length !== 1) {
        return
      }
      const dx = event.touches[0].clientX - startX
      const dy = event.touches[0].clientY - startY

      if (!horizontal) {
        if (dx < SWIPE_AXIS_MIN_PX) {
          return
        }
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 14) {
          tracking = false
          clearDragState()
          return
        }
        horizontal = true
      }

      scheduleSwipeVisual(Math.max(0, dx))
      if (dx > SWIPE_AXIS_MIN_PX) {
        event.preventDefault()
      }
    }

    function onEnd(event: TouchEvent) {
      if (!tracking) {
        return
      }
      tracking = false
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
        flushPendingVisual()
      }

      const touch = event.changedTouches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const triggered = horizontal && dx >= SWIPE_TRIGGER_PX && dx > Math.abs(dy) * 1.12

      host.classList.remove('is-swipe-dragging')

      if (triggered) {
        applySwipeVisual(SWIPE_MAX_PX)
        host.classList.add('is-swipe-reply-complete', 'is-swipe-reply-locked')
        onSwipeRef.current()
        window.setTimeout(() => {
          host.classList.remove('is-swipe-reply-complete', 'is-swipe-reply-locked')
          resetSwipeVisual()
        }, 260)
        return
      }

      resetSwipeVisual()
    }

    function onCancel() {
      tracking = false
      horizontal = false
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      clearDragState()
    }

    host.addEventListener('touchstart', onStart, { passive: true })
    host.addEventListener('touchmove', onMove, { passive: false })
    host.addEventListener('touchend', onEnd, { passive: true })
    host.addEventListener('touchcancel', onCancel, { passive: true })

    return () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
      }
      host.removeEventListener('touchstart', onStart)
      host.removeEventListener('touchmove', onMove)
      host.removeEventListener('touchend', onEnd)
      host.removeEventListener('touchcancel', onCancel)
      host.classList.remove('is-swipe-dragging', 'is-swipe-reply-locked', 'is-swipe-reply-complete')
      resetSwipeVisual()
    }
  }, [enabled])

  return { sectionRef }
}
