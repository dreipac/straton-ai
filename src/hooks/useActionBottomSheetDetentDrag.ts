import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

export type BottomSheetDetent = 1 | 2

const DRAG_CLOSE_PX = 76
const DRAG_EXPAND_PX = 44
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

  const isDraggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const detentAtDragStartRef = useRef<BottomSheetDetent>(1)
  const dragOffsetRef = useRef(0)
  const expandPreviewRef = useRef(0)

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
      setIsDragging(false)
    }
  }, [open])

  const handleHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      dragStartYRef.current = event.clientY
      detentAtDragStartRef.current = detent
      isDraggingRef.current = true
      setIsDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [detent],
  )

  const handleHandlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) {
      return
    }
    const deltaY = event.clientY - dragStartYRef.current

    if (detentAtDragStartRef.current === 1 && deltaY < 0) {
      const upPx = Math.min(-deltaY, MAX_UP_PREVIEW_PX)
      setExpandPreviewPx(upPx)
      setDragOffset(0)
      return
    }

    setExpandPreviewPx(0)
    setDragOffset(deltaY > 0 ? deltaY : 0)
  }, [])

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) {
      return
    }

    isDraggingRef.current = false
    setIsDragging(false)

    const offset = dragOffsetRef.current
    const preview = expandPreviewRef.current

    if (detentAtDragStartRef.current === 1) {
      if (offset >= DRAG_CLOSE_PX) {
        setExpandPreviewPx(0)
        setDragOffset(0)
        onRequestClose()
        return
      }
      if (preview >= DRAG_EXPAND_PX) {
        setDetent(2)
        setExpandPreviewPx(0)
        setDragOffset(0)
        return
      }
    }

    if (detentAtDragStartRef.current === 2) {
      if (offset >= DRAG_CLOSE_PX) {
        setExpandPreviewPx(0)
        setDragOffset(0)
        onRequestClose()
        return
      }
      if (offset >= DRAG_COLLAPSE_PX) {
        setDetent(1)
        setDragOffset(0)
        setExpandPreviewPx(0)
        return
      }
    }

    setDragOffset(0)
    setExpandPreviewPx(0)
  }, [onRequestClose])

  const handleHandlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finishDrag()
    },
    [finishDrag],
  )

  const handleHandlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finishDrag()
    },
    [finishDrag],
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
    handleHandlePointerMove,
    handleHandlePointerUp,
    handleHandlePointerCancel,
  }
}
