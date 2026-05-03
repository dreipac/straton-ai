import { useCallback, useEffect, useRef } from 'react'

/** Linker Rand: Finger startet hier → Wisch nach rechts öffnet die Sidebar (Compact-Layout / PWA). */
const LEFT_EDGE_PX = 28
const MIN_OPEN_DX = 56
const MIN_CLOSE_DX = 56
const AXIS_DOMINANCE = 1.2

function touchById(
  list: { length: number; [i: number]: { clientX: number; clientY: number; identifier: number } },
  id: number,
): { clientX: number; clientY: number; identifier: number } | undefined {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].identifier === id) {
      return list[i]
    }
  }
  return undefined
}

export type MobileSidebarEdgeSwipeOptions = {
  enabled: boolean
  isOpen: boolean
  swipeOpenBlocked: boolean
  swipeCloseBlocked: boolean
  onOpen: () => void
  onClose: () => void
}

/**
 * iPhone / PWA: am linken Rand nach rechts wischen → Sidebar öffnen;
 * bei geöffneter Sidebar auf dem abgedunkelten Bereich nach links wischen → schließen.
 * Nutzt passive Listener (kein preventDefault) — vertikales Scrollen bricht die Geste ab.
 */
export function useMobileSidebarEdgeSwipe(options: MobileSidebarEdgeSwipeOptions) {
  const opts = useRef(options)
  opts.current = options


  useEffect(() => {
    let openGesture: { id: number; x0: number; y0: number; cancelled: boolean } | null = null

    function onTouchStart(e: TouchEvent) {
      const o = opts.current
      if (!o.enabled || o.isOpen || o.swipeOpenBlocked) {
        return
      }
      if (e.touches.length !== 1) {
        return
      }
      const t = e.touches[0]
      if (t.clientX > LEFT_EDGE_PX) {
        return
      }
      openGesture = { id: t.identifier, x0: t.clientX, y0: t.clientY, cancelled: false }
    }

    function onTouchMove(e: TouchEvent) {
      if (!openGesture) {
        return
      }
      const t = touchById(e.touches, openGesture.id)
      if (!t) {
        return
      }
      const dx = t.clientX - openGesture.x0
      const dy = t.clientY - openGesture.y0
      if (Math.abs(dy) > 32 && Math.abs(dy) > Math.abs(dx) * AXIS_DOMINANCE) {
        openGesture.cancelled = true
      }
    }

    function finishOpen(e: TouchEvent) {
      if (!openGesture) {
        return
      }
      const t = touchById(e.changedTouches, openGesture.id)
      const g = openGesture
      openGesture = null
      if (!t || g.cancelled) {
        return
      }
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx >= MIN_OPEN_DX && dx >= Math.abs(dy) * AXIS_DOMINANCE) {
        opts.current.onOpen()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', finishOpen, { passive: true })
    document.addEventListener('touchcancel', finishOpen, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', finishOpen)
      document.removeEventListener('touchcancel', finishOpen)
    }
  }, [])

  const closeGesture = useRef<{ id: number; x0: number; y0: number; cancelled: boolean } | null>(null)

  const onBackdropTouchStart = useCallback((e: React.TouchEvent) => {
    const o = opts.current
    if (!o.enabled || !o.isOpen || o.swipeCloseBlocked) {
      return
    }
    if (e.touches.length !== 1) {
      return
    }
    const t = e.touches[0]
    closeGesture.current = { id: t.identifier, x0: t.clientX, y0: t.clientY, cancelled: false }
  }, [])

  const onBackdropTouchMove = useCallback((e: React.TouchEvent) => {
    const g = closeGesture.current
    if (!g) {
      return
    }
    const t = touchById(e.touches, g.id)
    if (!t) {
      return
    }
    const dx = t.clientX - g.x0
    const dy = t.clientY - g.y0
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * AXIS_DOMINANCE) {
      g.cancelled = true
    }
  }, [])

  const onBackdropTouchEnd = useCallback((e: React.TouchEvent) => {
    const g = closeGesture.current
    closeGesture.current = null
    if (!g || g.cancelled) {
      return
    }
    const t = touchById(e.changedTouches, g.id)
    if (!t) {
      return
    }
    const dx = t.clientX - g.x0
    const dy = t.clientY - g.y0
    if (dx <= -MIN_CLOSE_DX && Math.abs(dx) >= Math.abs(dy) * AXIS_DOMINANCE) {
      opts.current.onClose()
    }
  }, [])

  return {
    backdropSwipeHandlers: {
      onTouchStart: onBackdropTouchStart,
      onTouchMove: onBackdropTouchMove,
      onTouchEnd: onBackdropTouchEnd,
      onTouchCancel: onBackdropTouchEnd,
    } as const,
  }
}
