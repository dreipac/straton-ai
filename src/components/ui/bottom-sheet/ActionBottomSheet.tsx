import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'

export type ActionBottomSheetItem = {
  id: string
  label: string
  iconSrc?: string
  variant?: 'default' | 'danger'
  /** Zusätzliche Klassen am Aktions-Button (z. B. farbige Varianten im Chat-Composer). */
  actionClassName?: string
  onClick: () => void
  /**
   * false = nach Klick kein animiertes Schließen (Sheet bleibt offen bis Parent es abklemmt).
   * Standard: animiert schließen wie beim Backdrop.
   */
  closeSheetAfter?: boolean
}

type ActionBottomSheetProps = {
  open: boolean
  onClose: () => void
  /** Kurzer Titel über den Aktionen (z. B. Chat-Name). */
  title?: string
  actions: ActionBottomSheetItem[]
  /** Für `aria-labelledby` — eindeutig pro Sheet-Instanz. */
  ariaLabel?: string
}

/** Muss zu `--straton-sheet-exit-ms` in `mobile.css` passen (Default 440ms, reduced ~45ms). */
const EXIT_MS = 440
const EXIT_MS_REDUCED_MOTION = 55

/**
 * Mobile/PWA: Bottom Sheet (~40% Höhe), oben abgerundet, grosse Touch-Buttons.
 */
export const ActionBottomSheet = forwardRef<HTMLDivElement, ActionBottomSheetProps>(function ActionBottomSheet(
  { open, onClose, title, actions, ariaLabel = 'Aktionen' }: ActionBottomSheetProps,
  forwardedRef,
) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closingRef = useRef(false)
  const exitTimerRef = useRef<number | null>(null)

  const [isShown, setIsShown] = useState(false)

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

  /** `isShown` bei jedem Öffnen neu triggern (Enter-Animation); bei Schließen zurücksetzen — sonst bleibt das Sheet nach erneutem Öffnen unsichtbar (leere deps lief nur beim ersten Mount). */
  useLayoutEffect(() => {
    if (!open) {
      setIsShown(false)
      closingRef.current = false
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      return
    }

    closingRef.current = false
    setIsShown(false)
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsShown(true)
      return
    }
    const id = requestAnimationFrame(() => setIsShown(true))
    return () => cancelAnimationFrame(id)
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
      panelRef.current?.querySelector<HTMLButtonElement>('button.action-bottom-sheet-action')?.focus()
    }, 120)
    return () => window.clearTimeout(t)
  }, [open, isShown])

  const startActionBreath = useCallback((btn: HTMLButtonElement) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    if (btn.classList.contains('is-pressing')) {
      return
    }
    btn.classList.add('is-pressing')
    const onAnimEnd = (e: AnimationEvent) => {
      if (e.animationName !== 'actionSheetButtonBreath') {
        return
      }
      btn.classList.remove('is-pressing')
      btn.removeEventListener('animationend', onAnimEnd)
    }
    btn.addEventListener('animationend', onAnimEnd)
  }, [])

  function handleActionPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return
    }
    startActionBreath(event.currentTarget)
  }

  if (!open) {
    return null
  }

  return (
    <div
      ref={forwardedRef}
      className={`action-bottom-sheet-root${isShown ? ' is-shown' : ''}`}
      role="presentation"
    >
      <div
        className="action-bottom-sheet-backdrop"
        aria-hidden="true"
        onClick={() => {
          requestClose()
        }}
      />
      <div
        ref={panelRef}
        className="action-bottom-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={title?.trim() ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="action-bottom-sheet-handle" aria-hidden="true" />
        {title?.trim() ? (
          <p id={titleId} className="action-bottom-sheet-title">
            {title.trim()}
          </p>
        ) : null}
        <div className="action-bottom-sheet-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`action-bottom-sheet-action${action.variant === 'danger' ? ' is-danger' : ''}${action.actionClassName ? ` ${action.actionClassName}` : ''}`}
              onPointerDown={handleActionPointerDown}
              onClick={(e) => {
                if (e.detail === 0) {
                  startActionBreath(e.currentTarget)
                }
                action.onClick()
                if (action.closeSheetAfter !== false) {
                  requestClose()
                }
              }}
            >
              {action.iconSrc ? (
                <img className="action-bottom-sheet-action-icon" src={action.iconSrc} alt="" aria-hidden="true" />
              ) : null}
              <span className="action-bottom-sheet-action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
