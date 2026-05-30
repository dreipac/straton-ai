import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type BottomSheetDetent = 1 | 2

const DRAG_CLOSE_PX = 76
const DRAG_EXPAND_PX = 40
const DRAG_COLLAPSE_PX = 52
const MAX_UP_PREVIEW_PX = 120

type UseActionBottomSheetDetentDragOptions = {
  open: boolean
  onRequestClose: () => void
}

export function useActionBottomSheetDetentDrag({
  open,
  onRequestClose,
}: UseActionBottomSheetDetentDragOptions) {
  const [detent, setDetent] = useState<BottomSheetDetent>(1)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [expandPreviewPx, setExpandPreviewPx] = useState(0)

  const detentRef = useRef<BottomSheetDetent>(1)
  const isDraggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const dragStartYRef = useRef(0)
  const detentAtDragStartRef = useRef<BottomSheetDetent>(1)
  const dragOffsetRef = useRef(0)
  const expandPreviewRef = useRef(0)
  const captureTargetRef = useRef<HTMLElement | null>(null)
  const windowListenersAttachedRef = useRef(false)
  const onRequestCloseRef = useRef(onRequestClose)

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    detentRef.current = detent
  }, [detent])

  useEffect(() => {
    dragOffsetRef.current = dragOffset
  }, [dragOffset])

  useEffect(() => {
    expandPreviewRef.current = expandPreviewPx
  }, [expandPreviewPx])

  useEffect(() => {
    if (!open) {
      setDetent(1)
      setDragOffset(0)
      setExpandPreviewPx(0)
      isDraggingRef.current = false
      activePointerIdRef.current = null
      captureTargetRef.current = null
      setIsDragging(false)
    }
  }, [open])

  const detachWindowDragListeners = useCallback(() => {
    if (!windowListenersAttachedRef.current) {
      return
    }
    windowListenersAttachedRef.current = false
    document.removeEventListener('pointermove', onWindowPointerMove, true)
    document.removeEventListener('pointerup', onWindowPointerEnd, true)
    document.removeEventListener('pointercancel', onWindowPointerEnd, true)
  }, [])

  function onWindowPointerMove(event: PointerEvent) {
    if (activePointerIdRef.current !== event.pointerId || !isDraggingRef.current) {
      return
    }

    event.preventDefault()

    const deltaY = event.clientY - dragStartYRef.current
    if (detentAtDragStartRef.current === 1 && deltaY < 0) {
      const upPx = Math.min(-deltaY, MAX_UP_PREVIEW_PX)
      setExpandPreviewPx(upPx)
      setDragOffset(0)
      return
    }

    setExpandPreviewPx(0)
    setDragOffset(deltaY > 0 ? deltaY : 0)
  }

  function releasePointerCaptureNow() {
    const target = captureTargetRef.current
    const pointerId = activePointerIdRef.current
    if (target && pointerId !== null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    captureTargetRef.current = null
  }

  function onWindowPointerEnd(event: PointerEvent) {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    if (windowListenersAttachedRef.current) {
      windowListenersAttachedRef.current = false
      document.removeEventListener('pointermove', onWindowPointerMove, true)
      document.removeEventListener('pointerup', onWindowPointerEnd, true)
      document.removeEventListener('pointercancel', onWindowPointerEnd, true)
    }

    if (!isDraggingRef.current) {
      releasePointerCaptureNow()
      activePointerIdRef.current = null
      return
    }

    isDraggingRef.current = false
    setIsDragging(false)

    const offset = dragOffsetRef.current
    const preview = expandPreviewRef.current

    releasePointerCaptureNow()
    activePointerIdRef.current = null

    if (detentAtDragStartRef.current === 1) {
      if (offset >= DRAG_CLOSE_PX) {
        setExpandPreviewPx(0)
        setDragOffset(0)
        onRequestCloseRef.current()
        return
      }
      if (preview >= DRAG_EXPAND_PX) {
        setDetent(2)
        setExpandPreviewPx(0)
        setDragOffset(0)
        return
      }
    }

    if (detentAtDragStartRef.current === 2 && offset >= DRAG_COLLAPSE_PX) {
      setDetent(1)
      setDragOffset(0)
      setExpandPreviewPx(0)
      return
    }

    setDragOffset(0)
    setExpandPreviewPx(0)
  }

  const attachWindowDragListeners = useCallback(() => {
    if (windowListenersAttachedRef.current) {
      return
    }
    windowListenersAttachedRef.current = true
    document.addEventListener('pointermove', onWindowPointerMove, {
      capture: true,
      passive: false,
    })
    document.addEventListener('pointerup', onWindowPointerEnd, { capture: true })
    document.addEventListener('pointercancel', onWindowPointerEnd, { capture: true })
  }, [])

  useEffect(() => {
    return () => {
      detachWindowDragListeners()
    }
  }, [detachWindowDragListeners])

  const handleHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      dragStartYRef.current = event.clientY
      detentAtDragStartRef.current = detentRef.current
      captureTargetRef.current = event.currentTarget
      activePointerIdRef.current = event.pointerId
      isDraggingRef.current = true
      setIsDragging(true)
      attachWindowDragListeners()

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    },
    [attachWindowDragListeners],
  )

  const panelStyle = {
    '--sheet-drag-translate': `${Math.max(0, dragOffset)}px`,
    '--sheet-expand-preview': `${expandPreviewPx}px`,
  } as CSSProperties

  const panelClassName = [
    detent === 2 ? 'is-detent-expanded' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    detent,
    panelClassName,
    panelStyle,
    handleHandlePointerDown,
  }
}
