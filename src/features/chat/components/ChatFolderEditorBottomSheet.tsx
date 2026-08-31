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
  type FormEvent,
} from 'react'
import type { ChatFolderColorId } from '../constants/chatFolderColors'
import { ChatFolderEditorForm } from './ChatFolderEditorForm'

export type ChatFolderEditorBottomSheetHandle = {
  requestClose: () => void
}

type ChatFolderEditorBottomSheetProps = {
  open: boolean
  onClose: () => void
  heading: string
  name: string
  color: ChatFolderColorId | null
  onNameChange: (value: string) => void
  onColorChange: (value: ChatFolderColorId | null) => void
  submitLabel: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

const EXIT_MS = 440
const EXIT_MS_REDUCED_MOTION = 55

export const ChatFolderEditorBottomSheet = forwardRef<
  ChatFolderEditorBottomSheetHandle,
  ChatFolderEditorBottomSheetProps
>(function ChatFolderEditorBottomSheet(
  {
    open,
    onClose,
    heading,
    name,
    color,
    onNameChange,
    onColorChange,
    submitLabel,
    onSubmit,
  },
  forwardedRef,
) {
  const titleId = useId()
  const inputId = useId()
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

  if (!open) {
    return null
  }

  return (
    <div className={`rename-bottom-sheet-root${isShown ? ' is-shown' : ''}`} role="presentation">
      <div
        className="rename-bottom-sheet-backdrop"
        aria-hidden="true"
        onClick={() => {
          requestClose()
        }}
      />
      <div className="rename-bottom-sheet-panel-outer">
        <div
          className="rename-bottom-sheet-panel rename-bottom-sheet-panel--folder-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
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
              aria-label="Schließen"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ChatFolderEditorForm
            className="rename-bottom-sheet-form chat-folder-editor-sheet-form"
            inputId={inputId}
            name={name}
            color={color}
            onNameChange={onNameChange}
            onColorChange={onColorChange}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
          />
        </div>
      </div>
    </div>
  )
})
