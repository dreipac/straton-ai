import { useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import type { ChatWordPreviewState } from '../../hooks/useChatWordPreview'
import {
  WORD_PAGE_NATIVE_HEIGHT,
  WORD_PAGE_NATIVE_WIDTH,
} from '../../constants/wordDocStyle'
import { buildWordPageSrcDoc } from '../../utils/wordPageSrcDoc'

type ChatWordPreviewModalProps = {
  preview: ChatWordPreviewState
  open: boolean
  activeIndex: number
  onClose: () => void
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void
  onGoToPage: (index: number) => void
  onNextPage: () => void
  onPrevPage: () => void
  /** `wordExport` liegt bereits auf der Nachricht vor — Button lädt direkt herunter statt zu generieren. */
  downloadReady: boolean
  downloadBusy: boolean
  onDownload: () => void | Promise<void>
}

/** Skaliert die feste A4-Seite vollständig in die verfügbare Bühne (kein Anschnitt). */
function usePageStageFit() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: WORD_PAGE_NATIVE_WIDTH, height: WORD_PAGE_NATIVE_HEIGHT })
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        const scale = Math.min(width / WORD_PAGE_NATIVE_WIDTH, height / WORD_PAGE_NATIVE_HEIGHT)
        setBox({ width: scale * WORD_PAGE_NATIVE_WIDTH, height: scale * WORD_PAGE_NATIVE_HEIGHT })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { containerRef, box }
}

export function ChatWordPreviewModal({
  preview,
  open,
  activeIndex,
  onClose,
  onTransitionEnd,
  onGoToPage,
  onNextPage,
  onPrevPage,
  downloadReady,
  downloadBusy,
  onDownload,
}: ChatWordPreviewModalProps) {
  const { pages } = preview
  const activePage = pages[activeIndex] ?? pages[0]
  const { containerRef, box } = usePageStageFit()
  const scale = box.width / WORD_PAGE_NATIVE_WIDTH

  if (!activePage) {
    return null
  }

  return (
    <div
      className={`chat-slide-preview chat-word-preview${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Dokumentvorschau"
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
          <p className="chat-slide-preview-kicker">
            Dokument · {pages.length} {pages.length === 1 ? 'Seite' : 'Seiten'}
          </p>
          <button type="button" className="chat-slide-preview-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <div className="chat-slide-preview-body">
          <aside className="chat-slide-preview-rail" aria-label="Alle Seiten">
            {pages.map((page, i) => (
              <div key={`word-rail-${i}`} className="chat-slide-preview-rail-row">
                <span className="chat-slide-preview-rail-num" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  type="button"
                  className={`chat-slide-preview-rail-item chat-word-preview-rail-item${i === activeIndex ? ' is-active' : ''}`}
                  onClick={() => onGoToPage(i)}
                  aria-current={i === activeIndex}
                  aria-label={`Seite ${i + 1}`}
                >
                  <span className="chat-slide-preview-rail-thumb chat-word-preview-rail-thumb">
                    <iframe
                      className="chat-slide-preview-rail-iframe chat-word-preview-rail-iframe"
                      sandbox="allow-same-origin"
                      srcDoc={buildWordPageSrcDoc(page, i)}
                      tabIndex={-1}
                      aria-hidden="true"
                      title=""
                    />
                  </span>
                </button>
              </div>
            ))}
          </aside>

          <div className="chat-slide-preview-main">
            <p className="chat-slide-preview-slide-label">
              Seite {activeIndex + 1} von {pages.length}
            </p>
            <div className="chat-slide-preview-stage">
              <button
                type="button"
                className="chat-slide-preview-nav chat-slide-preview-nav--prev"
                onClick={onPrevPage}
                disabled={activeIndex === 0}
                aria-label="Vorherige Seite"
              >
                ‹
              </button>
              <div className="chat-slide-preview-viewport" ref={containerRef}>
                <div
                  className="chat-slide-preview-frame chat-word-preview-frame"
                  style={{ width: `${box.width}px`, height: `${box.height}px` }}
                >
                  <iframe
                    key={activeIndex}
                    className="chat-slide-preview-iframe chat-word-preview-iframe"
                    sandbox="allow-same-origin"
                    srcDoc={buildWordPageSrcDoc(activePage, activeIndex)}
                    title={`Seite ${activeIndex + 1}`}
                    style={{
                      width: `${WORD_PAGE_NATIVE_WIDTH}px`,
                      height: `${WORD_PAGE_NATIVE_HEIGHT}px`,
                      transform: `scale(${scale})`,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="chat-slide-preview-nav chat-slide-preview-nav--next"
                onClick={onNextPage}
                disabled={activeIndex === pages.length - 1}
                aria-label="Nächste Seite"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <footer className="chat-slide-preview-footer">
          <button
            type="button"
            className="chat-slide-preview-download"
            disabled={downloadBusy}
            onClick={() => {
              void onDownload()
            }}
          >
            {downloadBusy
              ? 'Wird vorbereitet…'
              : downloadReady
                ? 'Als Word herunterladen'
                : 'Word generieren & herunterladen'}
          </button>
        </footer>
      </div>
    </div>
  )
}
