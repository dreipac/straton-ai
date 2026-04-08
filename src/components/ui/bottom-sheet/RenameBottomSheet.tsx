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
  type FormEvent,
} from 'react'
import { PrimaryButton } from '../buttons/PrimaryButton'

export type RenameBottomSheetHandle = {
  requestClose: () => void
}

type RenameBottomSheetProps = {
  open: boolean
  /** Nach Abschluss der Schliess-Animation (Backdrop / Panel). */
  onClose: () => void
  heading: string
  inputLabel: string
  inputId: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  saveLabel?: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

/** Muss zu `--straton-sheet-exit-ms` in `mobile.css` passen. */
const EXIT_MS = 440
const EXIT_MS_REDUCED_MOTION = 55

export const RenameBottomSheet = forwardRef<RenameBottomSheetHandle, RenameBottomSheetProps>(
  function RenameBottomSheet(
    {
      open,
      onClose,
      heading,
      inputLabel,
      inputId,
      value,
      onChange,
      placeholder = '',
      saveLabel = 'Speichern',
      onSubmit,
    }: RenameBottomSheetProps,
    forwardedRef,
  ) {
    const titleId = useId()
    const panelRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const closingRef = useRef(false)
    const exitTimerRef = useRef<number | null>(null)

    const [isShown, setIsShown] = useState(false)
    /** Tastatur / Visual Viewport: Panel nach oben, Hoehe an sichtbaren Bereich. */
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
        onClose()
      }, sheetExitMs)
    }, [onClose, sheetExitMs])

    useImperativeHandle(
      forwardedRef,
      () => ({
        requestClose,
      }),
      [requestClose],
    )

    useLayoutEffect(() => {
      const id = requestAnimationFrame(() => setIsShown(true))
      return () => cancelAnimationFrame(id)
    }, [])

    useLayoutEffect(() => {
      if (!open) {
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
        const defaultMaxPx = innerH * 0.7
        const keyboardLikely = overlap > 12 || visibleH < innerH * 0.76
        const maxPx = keyboardLikely
          ? Math.max(200, visibleH - margin)
          : Math.max(200, Math.min(defaultMaxPx, visibleH - margin))

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
    }, [open])

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
      if (!open) {
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
    }, [open, requestClose])

    useEffect(() => {
      if (!open || !isShown) {
        return
      }
      const t = window.setTimeout(() => {
        const el = inputRef.current
        if (!el) {
          return
        }
        el.focus({ preventScroll: true })
        el.select()
      }, 280)
      return () => window.clearTimeout(t)
    }, [open, isShown])

    if (!open) {
      return null
    }

    const outerStyle: CSSProperties =
      vvAdjust.liftPx > 0
        ? { transform: `translate3d(0, -${vvAdjust.liftPx}px, 0)` }
        : {}

    const panelStyle: CSSProperties =
      vvAdjust.maxHeightPx != null
        ? { maxHeight: vvAdjust.maxHeightPx, minHeight: 'auto' }
        : {}

    return (
      <div
        className={`rename-bottom-sheet-root${isShown ? ' is-shown' : ''}`}
        role="presentation"
      >
        <div
          className="rename-bottom-sheet-backdrop"
          aria-hidden="true"
          onClick={() => {
            requestClose()
          }}
        />
        <div className="rename-bottom-sheet-panel-outer" style={outerStyle}>
          <div
            ref={panelRef}
            className="rename-bottom-sheet-panel"
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rename-bottom-sheet-handle" aria-hidden="true" />
            <div className="rename-bottom-sheet-header">
              <h3 id={titleId} className="rename-bottom-sheet-heading">
                {heading}
              </h3>
              <button
                type="button"
                className="rename-bottom-sheet-close"
                onClick={() => requestClose()}
                aria-label="Schliessen"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <form className="rename-bottom-sheet-form" onSubmit={onSubmit}>
              <label className="rename-bottom-sheet-label" htmlFor={inputId}>
                {inputLabel}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                className="rename-bottom-sheet-input"
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                enterKeyHint="done"
              />
              <PrimaryButton
                type="submit"
                className="rename-bottom-sheet-save"
                disabled={!value.trim()}
              >
                {saveLabel}
              </PrimaryButton>
            </form>
          </div>
        </div>
      </div>
    )
  }
)
