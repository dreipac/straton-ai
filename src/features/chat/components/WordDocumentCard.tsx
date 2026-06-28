import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { WordOutlineV1 } from '../types'
import { WORD_PAGE_NATIVE_WIDTH } from '../constants/wordDocStyle'
import { paginateWordOutline, type WordPage } from '../utils/wordPaginate'
import { buildWordPageSrcDoc } from '../utils/wordPageSrcDoc'
import { ChatGenDotsLoader } from './ChatGenDotsLoader'

type Props = {
  outline: WordOutlineV1
  onOpen: (pages: WordPage[]) => void
}

/** Loader während das Word-Dokument generiert wird — Punkt-Loader im A4-Hochformat (kein Textblock). */
export function WordDocumentCardBuilding() {
  return (
    <div className="chat-gen-dots-wrap" aria-live="polite">
      <ChatGenDotsLoader shape="document" ariaLabel="Word-Dokument wird generiert" />
    </div>
  )
}

/** Skaliert die feste 794px-A4-Seite exakt auf die fluide Thumbnail-Breite. */
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
        setScale(width / WORD_PAGE_NATIVE_WIDTH)
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, scale }
}

/** Kompakte Karte im Chat — zeigt die erste A4-Seite als echte Vorschau, Klick öffnet alle Seiten im Modal. */
export function WordDocumentCard({ outline, onOpen }: Props) {
  const { ref: thumbRef, scale } = useThumbScale()
  const pages = useMemo(() => paginateWordOutline(outline), [outline])
  if (pages.length === 0) {
    return null
  }
  const coverPage = pages[0]

  return (
    <button
      type="button"
      className="word-doc-card"
      onClick={() => onOpen(pages)}
      aria-label={`Dokument ansehen — ${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'}`}
    >
      <span className="word-doc-card__thumb" ref={thumbRef}>
        {scale > 0 ? (
          <iframe
            className="word-doc-card__iframe"
            sandbox="allow-same-origin"
            srcDoc={buildWordPageSrcDoc(coverPage, 0)}
            tabIndex={-1}
            aria-hidden="true"
            title=""
            style={{ transform: `scale(${scale})` }}
          />
        ) : null}
      </span>
      <span className="word-doc-card__footer">
        <span className="word-doc-card__icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="14 2 14 8 20 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="word-doc-card__count">
          {pages.length} {pages.length === 1 ? 'Seite' : 'Seiten'}
        </span>
      </span>
    </button>
  )
}
