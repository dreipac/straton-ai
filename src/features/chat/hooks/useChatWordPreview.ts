import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import type { WordPage } from '../utils/wordPaginate'

export type ChatWordPreviewState = {
  messageId: string
  pages: WordPage[]
  fileName?: string
}

/**
 * Spiegelbild von `useChatSlidePreview`, aber für Word-Seiten (A4) statt Folien. Öffnen-Animation,
 * Seiten-Index, Tastatur (↑/↓ + ←/→) und Schliessen identisch zum Präsentations-Modal.
 */
export function useChatWordPreview() {
  const [preview, setPreview] = useState<ChatWordPreviewState | null>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur ein echter ID-Wechsel öffnet neu
  }, [preview?.messageId])

  function openWordPreview(messageId: string, pages: WordPage[], fileName?: string) {
    if (pages.length === 0) {
      return
    }
    setPreview({ messageId, pages, fileName })
  }

  function closeWordPreview() {
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

  function goToPage(index: number) {
    if (!preview) {
      return
    }
    setActiveIndex(Math.max(0, Math.min(preview.pages.length - 1, index)))
  }

  function stepPage(delta: number) {
    if (!preview) {
      return
    }
    const length = preview.pages.length
    setActiveIndex((index) => Math.max(0, Math.min(length - 1, index + delta)))
  }

  function goNextPage() {
    stepPage(1)
  }

  function goPrevPage() {
    stepPage(-1)
  }

  useEffect(() => {
    if (!preview) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeWordPreview()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        goNextPage()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        goPrevPage()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur preview relevant
  }, [preview])

  return {
    preview,
    open,
    activeIndex,
    openWordPreview,
    closeWordPreview,
    handleTransitionEnd,
    goToPage,
    goNextPage,
    goPrevPage,
  }
}
