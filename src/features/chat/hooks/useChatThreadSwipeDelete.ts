import { useCallback, useEffect, useRef, type RefObject } from 'react'

export const CHAT_THREAD_SWIPE_ACTION_PX = 76
const CHAT_THREAD_SWIPE_AUTO_DELETE_PX = 118
const CHAT_THREAD_SWIPE_AXIS_MIN_PX = 8
const SWIPE_OPEN_NOTIFY_RATIO = 0.45
/** Zeile kollabiert; danach sofort optimistisch aus der Liste */
export const CHAT_THREAD_SWIPE_DELETE_ANIMATION_MS = 320
const SWIPE_DISMISS_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

type TouchStartRef = { x: number; y: number } | null
type PendingVisual = { next: number; dragging: boolean }

function clampOffset(px: number): number {
  const hardMax = CHAT_THREAD_SWIPE_AUTO_DELETE_PX + 24
  if (px <= 0) {
    return 0
  }
  if (px <= hardMax) {
    return px
  }
  return hardMax + (px - hardMax) * 0.12
}

function swipeProgress(offsetPx: number): number {
  return Math.min(1, offsetPx / CHAT_THREAD_SWIPE_ACTION_PX)
}

export function useChatThreadSwipeDelete({
  enabled,
  isOpen,
  hostRef,
  panelRef,
  onOpen,
  onClose,
  onSwipeDeleteStart,
  onDeleteTap,
  onDeleteFullSwipe,
  onSwipeGestureStart,
}: {
  enabled: boolean
  isOpen: boolean
  hostRef: RefObject<HTMLDivElement | null>
  panelRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onClose: () => void
  onSwipeDeleteStart: () => void
  onDeleteTap: () => void
  onDeleteFullSwipe: () => void
  /** Long-Press abbrechen, sobald horizontale Swipe-Geste erkannt wird */
  onSwipeGestureStart?: () => void
}) {
  const offsetRef = useRef(0)
  const offsetAtTouchStartRef = useRef(0)
  const touchStartRef = useRef<TouchStartRef>(null)
  const horizontalRef = useRef(false)
  const didNotifyOpenRef = useRef(false)
  const isDraggingRef = useRef(false)
  const isDismissingRef = useRef(false)
  const visualFlagsRef = useRef({ deleteArmed: false, dragging: false, hasSwipeOffset: false })
  const lastVisualRef = useRef({ offsetPx: -1, progressKey: -1, underlayKey: -1 })
  const rafRef = useRef(0)
  const pendingVisualRef = useRef<PendingVisual | null>(null)
  const underlayRef = useRef<HTMLElement | null>(null)
  const hostWidthRef = useRef(0)
  const dismissFinishTimerRef = useRef(0)

  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const onSwipeDeleteStartRef = useRef(onSwipeDeleteStart)
  const onDeleteTapRef = useRef(onDeleteTap)
  const onDeleteFullSwipeRef = useRef(onDeleteFullSwipe)
  const onSwipeGestureStartRef = useRef(onSwipeGestureStart)
  onOpenRef.current = onOpen
  onCloseRef.current = onClose
  onSwipeDeleteStartRef.current = onSwipeDeleteStart
  onDeleteTapRef.current = onDeleteTap
  onDeleteFullSwipeRef.current = onDeleteFullSwipe
  onSwipeGestureStartRef.current = onSwipeGestureStart

  const applyOffsetVisual = useCallback((next: number, dragging: boolean) => {
    const clamped = clampOffset(next)
    offsetRef.current = clamped
    const host = hostRef.current
    const panel = panelRef.current
    if (!host || !panel) {
      return
    }

    if (!underlayRef.current) {
      underlayRef.current = host.querySelector('.chat-thread-swipe-underlay')
    }

    const flags = visualFlagsRef.current
    const progress = swipeProgress(clamped)
    const deleteArmed = clamped >= CHAT_THREAD_SWIPE_ACTION_PX * SWIPE_OPEN_NOTIFY_RATIO

    if (flags.deleteArmed !== deleteArmed) {
      host.classList.toggle('is-swipe-delete-armed', deleteArmed)
      flags.deleteArmed = deleteArmed
    }
    if (flags.dragging !== dragging) {
      host.classList.toggle('is-dragging', dragging)
      flags.dragging = dragging
    }
    const hasSwipeOffset = clamped > 0.5
    if (flags.hasSwipeOffset !== hasSwipeOffset) {
      host.classList.toggle('has-swipe-offset', hasSwipeOffset)
      flags.hasSwipeOffset = hasSwipeOffset
    }

    const hostWidth = hostWidthRef.current || 1
    const underlayScale = hostWidth > 0 ? Math.min(1, clamped / hostWidth) : 0
    const offsetPx = Math.round(clamped)
    const progressKey = Math.round(progress * 100)
    const underlayKey = Math.round(underlayScale * 1000)
    const last = lastVisualRef.current

    if (offsetPx !== last.offsetPx) {
      last.offsetPx = offsetPx
      host.style.setProperty('--thread-swipe-offset', `${offsetPx}px`)
    }
    if (progressKey !== last.progressKey) {
      last.progressKey = progressKey
      host.style.setProperty('--thread-swipe-progress', String(progressKey / 100))
    }
    if (underlayKey !== last.underlayKey) {
      last.underlayKey = underlayKey
      host.style.setProperty('--thread-swipe-underlay-scale', String(underlayKey / 1000))
    }

    if (dragging) {
      panel.style.touchAction = horizontalRef.current ? 'none' : 'pan-y'
    } else {
      panel.style.touchAction = ''
    }
  }, [hostRef, panelRef])

  const flushPendingVisual = useCallback(() => {
    rafRef.current = 0
    const pending = pendingVisualRef.current
    if (!pending) {
      return
    }
    pendingVisualRef.current = null
    applyOffsetVisual(pending.next, pending.dragging)
  }, [applyOffsetVisual])

  const scheduleOffsetVisual = useCallback(
    (next: number, dragging: boolean) => {
      pendingVisualRef.current = { next, dragging }
      if (rafRef.current !== 0) {
        return
      }
      rafRef.current = requestAnimationFrame(flushPendingVisual)
    },
    [flushPendingVisual],
  )

  const syncOpenStateAfterGesture = useCallback((shouldBeOpen: boolean) => {
    if (shouldBeOpen && !didNotifyOpenRef.current) {
      didNotifyOpenRef.current = true
      onOpenRef.current()
      return
    }
    if (!shouldBeOpen && didNotifyOpenRef.current) {
      didNotifyOpenRef.current = false
      onCloseRef.current()
    }
  }, [])

  const snapClosed = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      pendingVisualRef.current = null
    }
    applyOffsetVisual(0, false)
    syncOpenStateAfterGesture(false)
  }, [applyOffsetVisual, syncOpenStateAfterGesture])

  const snapOpen = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      pendingVisualRef.current = null
    }
    applyOffsetVisual(CHAT_THREAD_SWIPE_ACTION_PX, false)
    syncOpenStateAfterGesture(true)
  }, [applyOffsetVisual, syncOpenStateAfterGesture])

  const clearDismissFinishTimer = useCallback(() => {
    if (dismissFinishTimerRef.current !== 0) {
      window.clearTimeout(dismissFinishTimerRef.current)
      dismissFinishTimerRef.current = 0
    }
  }, [])

  const readThreadListGapPx = useCallback((row: HTMLElement): number => {
    const list = row.parentElement
    if (!list) {
      return 7.2
    }
    const styles = getComputedStyle(list)
    const rowGap = Number.parseFloat(styles.rowGap)
    if (Number.isFinite(rowGap) && rowGap > 0) {
      return rowGap
    }
    const gap = Number.parseFloat(styles.gap)
    return Number.isFinite(gap) && gap > 0 ? gap : 7.2
  }, [])

  const runDismiss = useCallback(
    (deleteFn: () => void) => {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
        pendingVisualRef.current = null
      }
      clearDismissFinishTimer()

      const host = hostRef.current
      const panel = panelRef.current
      if (!host || !panel) {
        deleteFn()
        return
      }

      const startOffset = offsetRef.current
      const hostWidth = hostWidthRef.current || host.getBoundingClientRect().width || 1
      const underlayScale = hostWidth > 0 ? Math.min(1, startOffset / hostWidth) : 0

      isDraggingRef.current = false
      horizontalRef.current = false
      isDismissingRef.current = true
      didNotifyOpenRef.current = false
      offsetRef.current = 0
      visualFlagsRef.current = { deleteArmed: false, dragging: false, hasSwipeOffset: false }
      lastVisualRef.current = { offsetPx: -1, progressKey: -1, underlayKey: -1 }

      host.classList.remove('is-dragging', 'is-swipe-delete-armed', 'has-swipe-offset')
      panel.style.touchAction = ''

      host.style.setProperty('--thread-swipe-dismiss-from', `${startOffset}px`)
      host.style.setProperty('--thread-swipe-underlay-scale', underlayScale.toFixed(4))
      host.style.setProperty('--thread-swipe-progress', '0')
      host.classList.add('is-swipe-dismissing-host')

      const row = host.closest('.chat-thread-row') as HTMLElement | null
      let rowHeight = 0
      let listGapPx = 7.2
      if (row) {
        rowHeight = row.offsetHeight
        listGapPx = readThreadListGapPx(row)
        row.style.overflow = 'hidden'
        row.style.boxSizing = 'border-box'
        row.style.height = `${rowHeight}px`
        row.style.marginBottom = '0px'
        row.style.opacity = '1'
        row.style.transform = 'translate3d(0, 0, 0)'
        row.style.willChange = 'transform, opacity, height, margin-bottom'
        row.classList.add('is-swipe-dismissing')
      }

      syncOpenStateAfterGesture(false)
      onSwipeDeleteStartRef.current()

      void host.offsetHeight

      let dismissFinished = false
      const finishDismiss = () => {
        if (dismissFinished) {
          return
        }
        dismissFinished = true
        clearDismissFinishTimer()
        row?.removeEventListener('transitionend', onRowTransitionEnd)
        isDismissingRef.current = false
        deleteFn()
      }

      function onRowTransitionEnd(event: TransitionEvent) {
        if (event.target !== row || event.propertyName !== 'height') {
          return
        }
        finishDismiss()
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!row || rowHeight <= 0) {
            finishDismiss()
            return
          }
          const durationMs = CHAT_THREAD_SWIPE_DELETE_ANIMATION_MS
          row.style.transition = [
            `height ${durationMs}ms ${SWIPE_DISMISS_EASING}`,
            `opacity ${durationMs}ms ${SWIPE_DISMISS_EASING}`,
            `transform ${durationMs}ms ${SWIPE_DISMISS_EASING}`,
            `margin-bottom ${durationMs}ms ${SWIPE_DISMISS_EASING}`,
          ].join(', ')
          row.style.height = '0'
          row.style.opacity = '0'
          row.style.transform = 'translate3d(0, 4px, 0)'
          row.style.marginBottom = `${-listGapPx}px`
          row.addEventListener('transitionend', onRowTransitionEnd)
          dismissFinishTimerRef.current = window.setTimeout(
            finishDismiss,
            durationMs + 48,
          )
        })
      })
    },
    [clearDismissFinishTimer, hostRef, panelRef, readThreadListGapPx, syncOpenStateAfterGesture],
  )

  const finishGesture = useCallback(() => {
    flushPendingVisual()
    const offset = offsetRef.current
    if (offset >= CHAT_THREAD_SWIPE_AUTO_DELETE_PX) {
      runDismiss(() => onDeleteFullSwipeRef.current())
      return
    }
    if (offset >= CHAT_THREAD_SWIPE_ACTION_PX * 0.42) {
      snapOpen()
      return
    }
    snapClosed()
  }, [flushPendingVisual, runDismiss, snapClosed, snapOpen])

  useEffect(() => {
    return () => {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current)
      }
      clearDismissFinishTimer()
    }
  }, [clearDismissFinishTimer])

  useEffect(() => {
    underlayRef.current = null
    if (!enabled || isDraggingRef.current || isDismissingRef.current) {
      return
    }
    if (isOpen) {
      applyOffsetVisual(CHAT_THREAD_SWIPE_ACTION_PX, false)
      didNotifyOpenRef.current = true
      return
    }
    if (offsetRef.current !== 0) {
      applyOffsetVisual(0, false)
      didNotifyOpenRef.current = false
    }
  }, [applyOffsetVisual, enabled, isOpen])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !enabled) {
      return
    }

    function handleTouchStart(event: TouchEvent) {
      if (isDismissingRef.current || event.touches.length !== 1) {
        return
      }
      const host = hostRef.current
      if (host) {
        hostWidthRef.current = host.getBoundingClientRect().width || 0
      }
      const touch = event.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      offsetAtTouchStartRef.current = offsetRef.current
      horizontalRef.current = false
      isDraggingRef.current = true
      scheduleOffsetVisual(offsetRef.current, true)
    }

    function handleTouchMove(event: TouchEvent) {
      if (!touchStartRef.current || isDismissingRef.current || event.touches.length !== 1) {
        return
      }
      const touch = event.touches[0]
      const dxFromStart = touchStartRef.current.x - touch.clientX
      const dy = touch.clientY - touchStartRef.current.y
      const baseOffset = offsetAtTouchStartRef.current

      if (!horizontalRef.current) {
        const absDx = Math.abs(dxFromStart)
        const horizontalIntent =
          absDx >= CHAT_THREAD_SWIPE_AXIS_MIN_PX || (baseOffset > 0 && absDx > 4)

        if (!horizontalIntent && absDx < CHAT_THREAD_SWIPE_AXIS_MIN_PX && Math.abs(dy) < CHAT_THREAD_SWIPE_AXIS_MIN_PX) {
          return
        }
        if (Math.abs(dy) > absDx && Math.abs(dy) > 12) {
          touchStartRef.current = null
          isDraggingRef.current = false
          horizontalRef.current = false
          scheduleOffsetVisual(offsetRef.current, false)
          return
        }
        horizontalRef.current = true
        onSwipeGestureStartRef.current?.()
        const host = hostRef.current
        if (host) {
          host.style.touchAction = 'none'
        }
        const panelEl = panelRef.current
        if (panelEl) {
          panelEl.style.touchAction = 'none'
        }
      }

      const nextOffset = clampOffset(baseOffset + dxFromStart)
      scheduleOffsetVisual(nextOffset, true)

      if (horizontalRef.current && (nextOffset > 0 || baseOffset > 0) && event.cancelable) {
        event.preventDefault()
      }
    }

    function handleTouchEnd() {
      if (isDismissingRef.current) {
        return
      }
      touchStartRef.current = null
      horizontalRef.current = false
      isDraggingRef.current = false
      const host = hostRef.current
      if (host) {
        host.style.touchAction = ''
      }
      finishGesture()
    }

    function handleTouchCancel() {
      touchStartRef.current = null
      horizontalRef.current = false
      isDraggingRef.current = false
      const host = hostRef.current
      if (host) {
        host.style.touchAction = ''
      }
      if (!isDismissingRef.current) {
        snapClosed()
      }
    }

    panel.addEventListener('touchstart', handleTouchStart, { passive: true })
    panel.addEventListener('touchmove', handleTouchMove, { passive: false })
    panel.addEventListener('touchend', handleTouchEnd, { passive: true })
    panel.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      panel.removeEventListener('touchstart', handleTouchStart)
      panel.removeEventListener('touchmove', handleTouchMove)
      panel.removeEventListener('touchend', handleTouchEnd)
      panel.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [enabled, finishGesture, hostRef, panelRef, scheduleOffsetVisual, snapClosed])

  const onDeleteButtonClick = useCallback(() => {
    runDismiss(() => onDeleteTapRef.current())
  }, [runDismiss])

  return {
    onDeleteButtonClick,
    snapClosed,
    getOffsetPx: () => offsetRef.current,
  }
}
