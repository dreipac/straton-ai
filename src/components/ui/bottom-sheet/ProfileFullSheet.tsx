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
  type ReactNode,
} from 'react'
import closeIcon from '../../../assets/icons/close.svg'

export type ProfileFullSheetHandle = {
  requestClose: () => void
  containsNode: (node: Node | null) => boolean
}

type ProfileFullSheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Titel in der Kopfzeile (zentriert, mit Trennlinie zum Inhalt). */
  title?: string
  /** Optionaler Klassenname für den scrollbaren Body-Bereich. */
  bodyClassName?: string
}

/** Etwas langsamer als Standard-Sheet — Vollbild-Einstieg. */
const SHEET_MS = 560
const SHEET_MS_REDUCED = 45

export const ProfileFullSheet = forwardRef<ProfileFullSheetHandle, ProfileFullSheetProps>(
  function ProfileFullSheet(
    { open, onClose, children, title = 'Einstellungen', bodyClassName }: ProfileFullSheetProps,
    ref,
  ) {
    const titleId = useId()
    const rootRef = useRef<HTMLDivElement | null>(null)
    const closingRef = useRef(false)
    const exitTimerRef = useRef<number | null>(null)
    const [isShown, setIsShown] = useState(false)

    const sheetMs = useMemo(() => {
      if (typeof window === 'undefined') {
        return SHEET_MS
      }
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? SHEET_MS_REDUCED : SHEET_MS
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
      }, sheetMs)
    }, [onClose, sheetMs])

    useImperativeHandle(
      ref,
      () => ({
        requestClose,
        containsNode: (node: Node | null) => !!(node && rootRef.current?.contains(node)),
      }),
      [requestClose],
    )

    useLayoutEffect(() => {
      if (!open) {
        return
      }
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

    if (!open) {
      return null
    }

    return (
      <div
        ref={rootRef}
        className={`profile-full-sheet-root${isShown ? ' is-shown' : ''}`}
        role="presentation"
      >
        <div
          className="profile-full-sheet-backdrop"
          aria-hidden="true"
          onClick={() => {
            requestClose()
          }}
        />
        <div
          className="profile-full-sheet-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="profile-full-sheet-header-wrap">
            <header className="profile-full-sheet-header">
              <button
                type="button"
                className="profile-full-sheet-close"
                aria-label="Schließen"
                onClick={() => {
                  requestClose()
                }}
              >
                <img className="profile-full-sheet-close-icon" src={closeIcon} alt="" aria-hidden="true" />
              </button>
              <h1 id={titleId} className="profile-full-sheet-title">
                {title}
              </h1>
              <span className="profile-full-sheet-header-spacer" aria-hidden="true" />
            </header>
          </div>
          <div className={`profile-full-sheet-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
        </div>
      </div>
    )
  },
)
