import { extractPptxSlideTitle, type PptxSlide } from '../utils/pptxOutline'

type Props = {
  slides: PptxSlide[]
  onOpen: () => void
}

const PPTX_LAYOUT_LABEL: Record<PptxSlide['layout'], string> = {
  title: 'Titel',
  section: 'Kapitel',
  content: 'Inhalt',
  table: 'Tabelle',
}

/** Platzhalter während HTML-Folien noch streamen — kein Rohtext-Codeblock. */
export function PptxPresentationCardBuilding() {
  return (
    <div className="word-outline-paper word-outline-paper--building" role="status" aria-live="polite">
      <div className="word-outline-paper__body">
        <p className="word-outline-paper__building-hint">Präsentation wird aufgebaut …</p>
      </div>
    </div>
  )
}

/** Kompakte Karte im Chat — Klick öffnet die Folien-Vorschau (Modal). */
export function PptxPresentationCard({ slides, onOpen }: Props) {
  if (slides.length === 0) {
    return null
  }
  const previewSlides = slides.slice(0, 6)
  const remaining = slides.length - previewSlides.length

  return (
    <button
      type="button"
      className="word-outline-paper pptx-presentation-card"
      onClick={onOpen}
      aria-label={`Präsentation ansehen — ${slides.length} Folien`}
    >
      <p className="pptx-presentation-card__meta">
        <span className="pptx-presentation-card__icon" aria-hidden="true">
          📊
        </span>
        <span className="pptx-presentation-card__title">Präsentation</span>
        <span className="pptx-presentation-card__count">
          {slides.length} {slides.length === 1 ? 'Folie' : 'Folien'}
        </span>
      </p>
      <ol className="pptx-presentation-card__list">
        {previewSlides.map((slide, i) => (
          <li key={`slide-${i}`} className="pptx-presentation-card__list-item">
            <span className="pptx-presentation-card__list-layout">{PPTX_LAYOUT_LABEL[slide.layout]}</span>
            <span className="pptx-presentation-card__list-title">
              {extractPptxSlideTitle(slide) || `Folie ${i + 1}`}
            </span>
          </li>
        ))}
      </ol>
      {remaining > 0 ? (
        <p className="pptx-presentation-card__truncated">… und {remaining} weitere Folien</p>
      ) : null}
    </button>
  )
}
