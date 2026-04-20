import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

export type ContentBottomSheetHandle = {
  requestClose: () => void
}

type ContentBottomSheetProps = {
  open: boolean
  /** Nach Abschluss der Schliess-Animation. */
  onExitComplete?: () => void
  title?: string
  children: ReactNode
  /** Standard: true */
  closeOnBackdrop?: boolean
  /** Standard: true */
  allowEscape?: boolean
  /** Standard: true */
  showCloseButton?: boolean
  /** Standard: true */
  showHandle?: boolean
  /** Tastatur / Visual Viewport (z. B. Passwort-Felder). */
  adaptVisualViewport?: boolean
  panelClassName?: string
  bodyClassName?: string
}

/** Muss zu `--straton-sheet-exit-ms` in `mobile.css` passen. */
const EXIT_MS = 440
const EXIT_MS_REDUCED_MOTION = 55

export const ContentBottomSheet = forwardRef<ContentBottomSheetHandle, ContentBottomSheetProps>(
  function ContentBottomSheet(
    {
      open,
      onExitComplete,
      title,
      children,
      closeOnBackdrop = true,
      allowEscape = true,
      showCloseButton = true,
      showHandle = true,
      adaptVisualViewport = false,
      panelClassName,
      bodyClassName,
    }: ContentBottomSheetProps,
    forwardedRef,
  ) {
    const titleId = useId()
    const panelRef = useRef<HTMLDivElement | null>(null)
    const closingRef = useRef(false)
    const exitTimerRef = useRef<number | null>(null)

    const [isShown, setIsShown] = useState(false)
    const [vvAdjust, setVvAdjust] = useState<{ liftPx: number; maxHeightPx: number | null }>({
      liftPx: 0,
      maxHeightPx: null,
    })

    const sheetExitMs = useMemo(() => {
      if (typeof window === 'undefined') {
        return EXIT_MS
      }
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? EXIT_MS_REDUCED_MOTION
        : EXIT_MS
    }, [])

    const finishExit = useCallback(() => {
      onExitComplete?.()
    }, [onExitComplete])

    const requestClose = useCallback(() => {
      if (closingRef.current) {
        return
      }
      closingRef.current = true
      setIsShown(false)
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
      }
      exitTimerRef.current = window.setTimeout(() => {
        exitTimerRef.current = null
        closingRef.current = false
        finishExit()
      }, sheetExitMs)
    }, [finishExit, sheetExitMs])

    useImperativeHandle(
      forwardedRef,
      () => ({
        requestClose,
      }),
      [requestClose],
    )

    /** Nur bei `open === true` nach einem Frame einblenden — sonst kein Slide-in (z. B. Beta: erst mounted, sichtbar ein RAF später). */
    useLayoutEffect(() => {
      if (!open) {
        setIsShown(false)
        return
      }
      const id = requestAnimationFrame(() => setIsShown(true))
      return () => cancelAnimationFrame(id)
    }, [open])

    useLayoutEffect(() => {
      if (!open || !adaptVisualViewport) {
        return
      }
      const vp = window.visualViewport
      if (!vp) {
        return
      }

      function syncVisualViewport() {
        const v = window.visualViewport
        if (!v) {
          return
        }
        const innerH = window.innerHeight
        const overlap = Math.max(0, innerH - v.offsetTop - v.height)
        const visibleH = v.height
        const margin = 12
        const defaultMaxPx = innerH * 0.85
        const keyboardLikely = overlap > 12 || visibleH < innerH * 0.76
        const maxPx = keyboardLikely
          ? Math.max(240, visibleH - margin)
          : Math.max(240, Math.min(defaultMaxPx, visibleH - margin))

        setVvAdjust({ liftPx: overlap, maxHeightPx: maxPx })
      }

      const raf = requestAnimationFrame(() => syncVisualViewport())
      vp.addEventListener('resize', syncVisualViewport)
      vp.addEventListener('scroll', syncVisualViewport)
      return () => {
        cancelAnimationFrame(raf)
        vp.removeEventListener('resize', syncVisualViewport)
        vp.removeEventListener('scroll', syncVisualViewport)
      }
    }, [open, adaptVisualViewport])

    useEffect(() => {
      if (!open) {
        return
      }
      const prevHtmlOverflow = document.documentElement.style.overflow
      const prevBodyOverflow = document.body.style.overflow
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = prevHtmlOverflow
        document.body.style.overflow = prevBodyOverflow
      }
    }, [open])

    useEffect(() => {
      return () => {
        if (exitTimerRef.current !== null) {
          window.clearTimeout(exitTimerRef.current)
        }
      }
    }, [])

    useEffect(() => {
      if (!open || !allowEscape) {
        return
      }
      function onKey(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault()
          requestClose()
        }
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [open, allowEscape, requestClose])

    if (!open) {
      return null
    }

    const outerStyle: CSSProperties =
      vvAdjust.liftPx > 0 ? { transform: `translate3d(0, -${vvAdjust.liftPx}px, 0)` } : {}

    const panelStyle: CSSProperties =
      adaptVisualViewport && vvAdjust.maxHeightPx != null
        ? { maxHeight: vvAdjust.maxHeightPx, minHeight: 'auto' }
        : {}

    const headingText = title?.trim() ?? ''

    return (
      <div className={`rename-bottom-sheet-root${isShown ? ' is-shown' : ''}`} role="presentation">
        <div
          className="rename-bottom-sheet-backdrop"
          aria-hidden="true"
          onClick={() => {
            if (!closeOnBackdrop) {
              return
            }
            requestClose()
          }}
        />
        <div className="rename-bottom-sheet-panel-outer" style={outerStyle}>
          <div
            ref={panelRef}
            className={`rename-bottom-sheet-panel${panelClassName ? ` ${panelClassName}` : ''}`}
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingText ? titleId : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {showHandle ? <div className="rename-bottom-sheet-handle" aria-hidden="true" /> : null}
            {headingText || showCloseButton ? (
              <div className="rename-bottom-sheet-header">
                {headingText ? (
                  <h3 id={titleId} className="rename-bottom-sheet-heading">
                    {headingText}
                  </h3>
                ) : (
                  <span className="rename-bottom-sheet-heading" />
                )}
                {showCloseButton ? (
                  <button
                    type="button"
                    className="rename-bottom-sheet-close"
                    onClick={() => requestClose()}
                    aria-label="Schließen"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className={`content-bottom-sheet-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
