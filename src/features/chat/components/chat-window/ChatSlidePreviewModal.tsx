import { useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import type { ChatSlidePreviewState } from '../../hooks/useChatSlidePreview'
import {
  PPTX_SLIDE_NATIVE_HEIGHT,
  PPTX_SLIDE_NATIVE_WIDTH,
  buildPptxSlideSrcDoc,
  extractPptxSlideTitle,
} from '../../utils/pptxOutline'

type ChatSlidePreviewModalProps = {
  preview: ChatSlidePreviewState
  open: boolean
  activeIndex: number
  onClose: () => void
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void
  onGoToSlide: (index: number) => void
  onNextSlide: () => void
  onPrevSlide: () => void
}

/**
 * Skaliert das feste 1280×720-Folien-Dokument auf beiden Achsen in die tatsächlich verfügbare
 * Stage-Fläche (min von Breite/Höhe) — dadurch ist die Folie immer vollständig sichtbar, nie
 * angeschnitten, egal wie das Modal-Fenster gerade proportioniert ist.
 */
function useSlideStageScale() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setScale(Math.min(width / PPTX_SLIDE_NATIVE_WIDTH, height / PPTX_SLIDE_NATIVE_HEIGHT))
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { containerRef, scale }
}

export function ChatSlidePreviewModal({
  preview,
  open,
  activeIndex,
  onClose,
  onTransitionEnd,
  onGoToSlide,
  onNextSlide,
  onPrevSlide,
}: ChatSlidePreviewModalProps) {
  const { slides } = preview
  const activeSlide = slides[activeIndex] ?? slides[0]
  const { containerRef, scale } = useSlideStageScale()
  if (!activeSlide) {
    return null
  }

  return (
    <div
      className={`chat-slide-preview${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Präsentationsvorschau"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('.chat-slide-preview-panel')) {
          return
        }
        onClose()
      }}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="chat-slide-preview-panel">
        <header className="chat-slide-preview-header">
          <p className="chat-slide-preview-kicker">Präsentation · {slides.length} Folien</p>
          <button type="button" className="chat-slide-preview-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <div className="chat-slide-preview-body">
          <aside className="chat-slide-preview-rail" aria-label="Alle Folien">
            {slides.map((slide, i) => (
              <button
                key={`rail-${i}`}
                type="button"
                className={`chat-slide-preview-rail-item${i === activeIndex ? ' is-active' : ''}`}
                onClick={() => onGoToSlide(i)}
                aria-current={i === activeIndex}
                aria-label={extractPptxSlideTitle(slide) || `Folie ${i + 1}`}
              >
                <span className="chat-slide-preview-rail-thumb">
                  <span className="chat-slide-preview-rail-index">{i + 1}</span>
                  <iframe
                    className="chat-slide-preview-rail-iframe"
                    sandbox="allow-same-origin"
                    srcDoc={buildPptxSlideSrcDoc(slide)}
                    tabIndex={-1}
                    aria-hidden="true"
                    title=""
                  />
                </span>
              </button>
            ))}
          </aside>

          <div className="chat-slide-preview-main">
            <h2 className="chat-slide-preview-slide-label">
              Folie {activeIndex + 1} von {slides.length}
            </h2>
            <div className="chat-slide-preview-stage">
              <button
                type="button"
                className="chat-slide-preview-nav chat-slide-preview-nav--prev"
                onClick={onPrevSlide}
                disabled={activeIndex === 0}
                aria-label="Vorherige Folie"
              >
                ‹
              </button>
              <div className="chat-slide-preview-frame" ref={containerRef}>
                <iframe
                  key={activeIndex}
                  className="chat-slide-preview-iframe"
                  sandbox="allow-same-origin"
                  srcDoc={buildPptxSlideSrcDoc(activeSlide)}
                  title={extractPptxSlideTitle(activeSlide) || `Folie ${activeIndex + 1}`}
                  style={{
                    width: `${PPTX_SLIDE_NATIVE_WIDTH}px`,
                    height: `${PPTX_SLIDE_NATIVE_HEIGHT}px`,
                    transform: `scale(${scale})`,
                  }}
                />
              </div>
              <button
                type="button"
                className="chat-slide-preview-nav chat-slide-preview-nav--next"
                onClick={onNextSlide}
                disabled={activeIndex === slides.length - 1}
                aria-label="Nächste Folie"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <footer className="chat-slide-preview-footer">
          <button type="button" className="chat-slide-preview-download" disabled title="Bald verfügbar">
            Als PowerPoint herunterladen
          </button>
        </footer>
      </div>
    </div>
  )
}
