import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'

export function useChatImageLightbox() {
  const [imageLightboxSrc, setImageLightboxSrc] = useState<string | null>(null)
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false)
  const imageLightboxClosePendingRef = useRef(false)

  useLayoutEffect(() => {
    if (!imageLightboxSrc) {
      setImageLightboxOpen(false)
      return
    }
    imageLightboxClosePendingRef.current = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setImageLightboxOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [imageLightboxSrc])

  function closeImageLightbox() {
    imageLightboxClosePendingRef.current = true
    setImageLightboxOpen(false)
  }

  function handleImageLightboxTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') {
      return
    }
    if (imageLightboxClosePendingRef.current) {
      imageLightboxClosePendingRef.current = false
      setImageLightboxSrc(null)
    }
  }

  useEffect(() => {
    if (!imageLightboxSrc) {
      return
    }
    const onKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        closeImageLightbox()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imageLightboxSrc])

  return {
    imageLightboxSrc,
    setImageLightboxSrc,
    imageLightboxOpen,
    closeImageLightbox,
    handleImageLightboxTransitionEnd,
  }
}
