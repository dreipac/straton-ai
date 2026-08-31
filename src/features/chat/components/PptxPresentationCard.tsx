import { useLayoutEffect, useRef, useState } from 'react'
import { buildPptxSlideSrcDoc, PPTX_SLIDE_NATIVE_WIDTH, type PptxSlide } from '../utils/pptxOutline'
import { ChatGenDotsLoader } from './ChatGenDotsLoader'

type Props = {
  slides: PptxSlide[]
  onOpen: () => void
}

/** Loader während die Präsentation generiert wird — Punkt-Loader im 16:9-Format (kein Textblock). */
export function PptxPresentationCardBuilding() {
  return (
    <div className="chat-gen-dots-wrap" aria-live="polite">
      <ChatGenDotsLoader shape="slide" ariaLabel="Präsentation wird generiert" />
    </div>
  )
}

/** Skaliert die feste 1280px-Folie exakt auf die tatsächlich gerenderte (fluide) Thumbnail-Breite. */
function useThumbScale() {
  const ref = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const update = () => {
      const { width } = el.getBoundingClientRect()
      if (width > 0) {
        setScale(width / PPTX_SLIDE_NATIVE_WIDTH)
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, scale }
}

/** Kompakte Karte im Chat — zeigt die Titelfolie als echte Vorschau, Klick öffnet alle Folien im Modal. */
export function PptxPresentationCard({ slides, onOpen }: Props) {
  const { ref: thumbRef, scale } = useThumbScale()
  if (slides.length === 0) {
    return null
  }
  const coverSlide = slides[0]

  return (
    <button
      type="button"
      className="pptx-presentation-card"
      onClick={onOpen}
      aria-label={`Präsentation ansehen — ${slides.length} ${slides.length === 1 ? 'Folie' : 'Folien'}`}
    >
      <span className="pptx-presentation-card__thumb" ref={thumbRef}>
        {scale > 0 ? (
          <iframe
            className="pptx-presentation-card__iframe"
            sandbox="allow-same-origin"
            srcDoc={buildPptxSlideSrcDoc(coverSlide)}
            tabIndex={-1}
            aria-hidden="true"
            title=""
            style={{ transform: `scale(${scale})` }}
          />
        ) : null}
      </span>
      <span className="pptx-presentation-card__footer">
        <span className="pptx-presentation-card__icon" aria-hidden="true">
          📊
        </span>
        <span className="pptx-presentation-card__count">
          {slides.length} {slides.length === 1 ? 'Folie' : 'Folien'}
        </span>
      </span>
    </button>
  )
}
