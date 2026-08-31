import { useLayoutEffect, useRef, type RefObject } from 'react'

const RESIZE_GROW_MS = 680
const RESIZE_SHRINK_MS = 480
const RESIZE_GROW_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const RESIZE_SHRINK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const RESIZE_MIN_DELTA_PX = 6

type UseBottomSheetPanelFlipOptions = {
  enabled: boolean
  /** Wechsel dieses Werts löst die FLIP-Animation aus (z. B. Einführungsmodus). */
  resizeKey: string
  panelClassName?: string
}

/**
 * FLIP-Resize für Bottom Sheets (nur transform — flüssig auf iOS/PWA).
 * Wachsen etwas langsamer als Schrumpfen, damit beide Richtungen gleichmässig wirken.
 */
export function useBottomSheetPanelFlip(
  panelRef: RefObject<HTMLDivElement | null>,
  { enabled, resizeKey, panelClassName = 'introduction-sheet-panel--resize-flip' }: UseBottomSheetPanelFlipOptions,
) {
  const prevHeightRef = useRef<number | null>(null)
  const prevKeyRef = useRef(resizeKey)

  useLayoutEffect(() => {
    if (!enabled) {
      prevHeightRef.current = null
      prevKeyRef.current = resizeKey
      return
    }

    const panel = panelRef.current
    if (!panel) {
      return
    }

    const lastHeight = panel.getBoundingClientRect().height
    const firstHeight = prevHeightRef.current
    const keyChanged = prevKeyRef.current !== resizeKey

    if (firstHeight != null && keyChanged) {
      const invertY = firstHeight - lastHeight

      if (Math.abs(invertY) >= RESIZE_MIN_DELTA_PX) {
        const reducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const isGrowing = invertY < 0
        const durationMs = reducedMotion ? 120 : isGrowing ? RESIZE_GROW_MS : RESIZE_SHRINK_MS
        const easing = isGrowing ? RESIZE_GROW_EASE : RESIZE_SHRINK_EASE

        const animPanel = panel
        animPanel.classList.add(panelClassName)
        animPanel.style.transition = 'none'
        animPanel.style.transform = `translate3d(0, ${-invertY}px, 0)`

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            animPanel.style.transition = `transform ${durationMs}ms ${easing}`
            animPanel.style.transform = 'translate3d(0, 0, 0)'
          })
        })

        function cleanup(event: TransitionEvent) {
          if (event.propertyName !== 'transform') {
            return
          }
          animPanel.classList.remove(panelClassName)
          animPanel.style.transition = ''
          animPanel.style.transform = ''
          animPanel.removeEventListener('transitionend', cleanup)
        }

        animPanel.addEventListener('transitionend', cleanup)
      }
    }

    prevHeightRef.current = lastHeight
    prevKeyRef.current = resizeKey
  }, [enabled, panelClassName, panelRef, resizeKey])
}
