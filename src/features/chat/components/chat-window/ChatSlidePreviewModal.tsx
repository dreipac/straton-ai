import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type TransitionEvent } from 'react'
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
  /** `pptxExport` liegt bereits auf der Nachricht vor — Button lädt direkt herunter statt zu generieren. */
  downloadReady: boolean
  downloadBusy: boolean
  onDownload: () => void | Promise<void>
  /** Editier-Box: gezielte Änderung an der aktuellen Präsentation (Patch statt Neugenerierung). Ohne Handler wird die Box nicht angezeigt. */
  onSubmitEdit?: (instruction: string) => void | Promise<void>
  editBusy?: boolean
  /** Klartext-Hinweis, wenn das Modell den Wunsch als nicht umsetzbar abgelehnt hat (siehe `PPTX_EDIT_UNSUPPORTED_RULE`) — verschwindet bei der nächsten Eingabe. */
  editHint?: string | null
  /** Bisherige Editier-Anweisungen + Antworten zu dieser Präsentation — werden hier statt im normalen Chatverlauf gezeigt (die zugehörigen Nachrichten sind dort ausgeblendet, siehe `pptxEditAnchorMessageId`). */
  editHistory?: { id: string; role: string; content: string }[]
  /** Neue (Preset-basierte) Präsentation — nur Text editierbar (siehe `PPTX_EDIT_CHAT_HINT_TEXT_ONLY`); Design läuft über `onChangeDesign`, nicht den Chat. */
  isTextOnly?: boolean
  /** "Design ändern" — nur sichtbar bei `isTextOnly` (neue Decks). Öffnet den Preset-Picker im Switch-Modus, kein KI-Aufruf. */
  onChangeDesign?: () => void
}

const PPTX_EDIT_QUICK_SUGGESTIONS = [
  'Ändere die Akzentfarbe zu Grün',
  'Füge eine Folie hinzu',
  'Entferne die letzte Folie',
  'Mehr Icons und Boxen',
  'Schlichter gestalten',
] as const

const PPTX_TEXT_ONLY_EDIT_QUICK_SUGGESTIONS = [
  'Schreibe den Titel um',
  'Füge einen Stichpunkt hinzu',
  'Kürze den Text auf einer Folie',
  'Entferne den letzten Punkt',
] as const

/**
 * Skaliert das feste 1280×720-Folien-Dokument auf beiden Achsen in die tatsächlich verfügbare
 * Viewport-Fläche (min von Breite/Höhe) — dadurch ist die Folie immer vollständig sichtbar, nie
 * angeschnitten, egal wie das Modal-Fenster gerade proportioniert ist. Liefert zusätzlich die
 * daraus resultierende Pixel-Box, damit der sichtbare Rahmen exakt den skalierten Inhalt umschliesst
 * (kein Leerraum innerhalb der Umrandung).
 */
function useSlideStageFit() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: PPTX_SLIDE_NATIVE_WIDTH, height: PPTX_SLIDE_NATIVE_HEIGHT })
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        const scale = Math.min(width / PPTX_SLIDE_NATIVE_WIDTH, height / PPTX_SLIDE_NATIVE_HEIGHT)
        setBox({ width: scale * PPTX_SLIDE_NATIVE_WIDTH, height: scale * PPTX_SLIDE_NATIVE_HEIGHT })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { containerRef, box }
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
  downloadReady,
  downloadBusy,
  onDownload,
  onSubmitEdit,
  editBusy = false,
  editHint = null,
  editHistory = [],
  isTextOnly = false,
  onChangeDesign,
}: ChatSlidePreviewModalProps) {
  const { slides } = preview
  const activeSlide = slides[activeIndex] ?? slides[0]
  const { containerRef, box } = useSlideStageFit()
  const scale = box.width / PPTX_SLIDE_NATIVE_WIDTH
  const [editDraft, setEditDraft] = useState('')
  const historyEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' })
  }, [editHistory.length])

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const instruction = editDraft.trim()
    if (!instruction || editBusy) {
      return
    }
    setEditDraft('')
    void onSubmitEdit?.(instruction)
  }

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

        <div className={`chat-slide-preview-body${editBusy ? ' is-editing' : ''}`}>
          <aside className="chat-slide-preview-rail" aria-label="Alle Folien">
            {slides.map((slide, i) => (
              <div key={`rail-${i}`} className="chat-slide-preview-rail-row">
                <span className="chat-slide-preview-rail-num" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  type="button"
                  className={`chat-slide-preview-rail-item${i === activeIndex ? ' is-active' : ''}`}
                  onClick={() => onGoToSlide(i)}
                  aria-current={i === activeIndex}
                  aria-label={extractPptxSlideTitle(slide) || `Folie ${i + 1}`}
                >
                  <span className="chat-slide-preview-rail-thumb">
                    <iframe
                      className="chat-slide-preview-rail-iframe"
                      sandbox="allow-same-origin"
                      srcDoc={buildPptxSlideSrcDoc(slide, i)}
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
              Folie {activeIndex + 1} von {slides.length}
            </p>
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
              <div className="chat-slide-preview-viewport" ref={containerRef}>
                <div
                  className="chat-slide-preview-frame"
                  style={{ width: `${box.width}px`, height: `${box.height}px` }}
                >
                  <iframe
                    key={activeIndex}
                    className="chat-slide-preview-iframe"
                    sandbox="allow-same-origin"
                    srcDoc={buildPptxSlideSrcDoc(activeSlide, activeIndex)}
                    title={extractPptxSlideTitle(activeSlide) || `Folie ${activeIndex + 1}`}
                    style={{
                      width: `${PPTX_SLIDE_NATIVE_WIDTH}px`,
                      height: `${PPTX_SLIDE_NATIVE_HEIGHT}px`,
                      transform: `scale(${scale})`,
                    }}
                  />
                </div>
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

          {editHistory.length > 0 ? (
            <aside className="chat-slide-preview-history" aria-label="Änderungsverlauf">
              {editHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`chat-slide-preview-history-bubble chat-slide-preview-history-bubble--${entry.role}`}
                >
                  {entry.content}
                </div>
              ))}
              <div ref={historyEndRef} />
            </aside>
          ) : null}
        </div>

        {onSubmitEdit ? (
          <div className="chat-slide-preview-edit">
            {editHint ? <p className="chat-slide-preview-edit-hint">{editHint}</p> : null}
            <div className="chat-slide-preview-edit-chips">
              {(isTextOnly ? PPTX_TEXT_ONLY_EDIT_QUICK_SUGGESTIONS : PPTX_EDIT_QUICK_SUGGESTIONS).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chat-slide-preview-edit-chip"
                  onClick={() => setEditDraft(suggestion)}
                  disabled={editBusy}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form className="chat-slide-preview-edit-form" onSubmit={handleEditSubmit}>
              <input
                type="text"
                className="chat-slide-preview-edit-input"
                placeholder={isTextOnly ? 'Welcher Text soll geändert werden?' : 'Was soll an der Präsentation geändert werden?'}
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                disabled={editBusy}
              />
              <button
                type="submit"
                className="chat-slide-preview-edit-send"
                disabled={editBusy || !editDraft.trim()}
                aria-label="Änderung anwenden"
              >
                {editBusy ? '…' : '➤'}
              </button>
            </form>
          </div>
        ) : null}

        <footer className="chat-slide-preview-footer">
          {isTextOnly && onChangeDesign ? (
            <button type="button" className="chat-slide-preview-secondary-btn" onClick={onChangeDesign}>
              Design ändern
            </button>
          ) : null}
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
                ? 'Als PowerPoint herunterladen'
                : 'PowerPoint generieren & herunterladen'}
          </button>
        </footer>
      </div>
    </div>
  )
}
