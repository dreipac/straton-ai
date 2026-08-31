import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import type { PptxSlide } from '../utils/pptxOutline'

export type ChatSlidePreviewState = {
  messageId: string
  slides: PptxSlide[]
}

export function useChatSlidePreview() {
  const [preview, setPreview] = useState<ChatSlidePreviewState | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const closePendingRef = useRef(false)

  /**
   * Dependency bewusst nur `preview?.messageId`, nicht das ganze `preview`-Objekt: `updatePreviewSlides`
   * tauscht nur die Folien aus (gleiche ID, z.B. nach einem Editier-Turn) — soll NICHT die Öffnen-
   * Animation/den Folien-Index zurücksetzen. Nur ein echter ID-Wechsel (neue/andere Präsentation
   * geöffnet) gilt als "neu öffnen".
   */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- siehe Kommentar oben, absichtlich nur messageId
  }, [preview?.messageId])

  function openSlidePreview(messageId: string, slides: PptxSlide[]) {
    if (slides.length === 0) {
      return
    }
    setPreview({ messageId, slides })
  }

  /** Editier-Turn: gleiche Präsentation (gleiche `messageId`), nur die Folien aktualisieren — kein Reset von Animation/Index, siehe `useLayoutEffect` oben. */
  function updatePreviewSlides(slides: PptxSlide[]) {
    if (slides.length === 0) {
      return
    }
    setPreview((prev) => (prev ? { ...prev, slides } : prev))
    setActiveIndex((index) => Math.min(index, slides.length - 1))
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
    if (!preview) {
      return
    }
    setActiveIndex(Math.max(0, Math.min(preview.slides.length - 1, index)))
  }

  function stepSlide(delta: number) {
    if (!preview) {
      return
    }
    const length = preview.slides.length
    setActiveIndex((index) => Math.max(0, Math.min(length - 1, index + delta)))
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
    updatePreviewSlides,
    closeSlidePreview,
    handleTransitionEnd,
    goToSlide,
    goNextSlide,
    goPrevSlide,
  }
}
