import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import type { PptxSlide } from '../utils/pptxOutline'

export type ChatSlidePreviewState = {
  slides: PptxSlide[]
}

export function useChatSlidePreview() {
  const [preview, setPreview] = useState<ChatSlidePreviewState | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const closePendingRef = useRef(false)

  useLayoutEffect(() => {
    if (!preview) {
      setOpen(false)
      return
    }
    closePendingRef.current = false
    setActiveIndex(0)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [preview])

  function openSlidePreview(slides: PptxSlide[]) {
    if (slides.length === 0) {
      return
    }
    setPreview({ slides })
  }

  function closeSlidePreview() {
    closePendingRef.current = true
    setOpen(false)
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') {
      return
    }
    if (closePendingRef.current) {
      closePendingRef.current = false
      setPreview(null)
      setActiveIndex(0)
    }
  }

  function goToSlide(index: number) {
    setPreview((current) => {
      if (!current) {
        return current
      }
      const clamped = Math.max(0, Math.min(current.slides.length - 1, index))
      setActiveIndex(clamped)
      return current
    })
  }

  function stepSlide(delta: number) {
    setPreview((current) => {
      if (!current) {
        return current
      }
      setActiveIndex((index) => Math.max(0, Math.min(current.slides.length - 1, index + delta)))
      return current
    })
  }

  function goNextSlide() {
    stepSlide(1)
  }

  function goPrevSlide() {
    stepSlide(-1)
  }

  useEffect(() => {
    if (!preview) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSlidePreview()
      } else if (event.key === 'ArrowRight') {
        goNextSlide()
      } else if (event.key === 'ArrowLeft') {
        goPrevSlide()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable step/close functions, nur preview relevant
  }, [preview])

  return {
    preview,
    open,
    activeIndex,
    openSlidePreview,
    closeSlidePreview,
    handleTransitionEnd,
    goToSlide,
    goNextSlide,
    goPrevSlide,
  }
}
