import { useEffect, useMemo, useRef, useState } from 'react'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { LearnFlashcard } from '../services/learn.persistence'

export type LearnFlashcardsModalProps = {
  isMounted: boolean
  isVisible: boolean
  cards: LearnFlashcard[]
  isLoading: boolean
  error: string | null
  onClose: () => void
  /** Beim Öffnen aus der Liste: zu dieser Karte springen */
  focusCardId?: string | null
  onRateCard?: (cardId: string, rating: 'known' | 'unknown') => void
}

export function LearnFlashcardsModal(props: LearnFlashcardsModalProps) {
  const { isMounted, isVisible, cards, isLoading, error, onClose, focusCardId, onRateCard } = props
  const cardsKey = useMemo(
    () => cards.map((card) => `${card.question}::${card.answer}`).join('||'),
    [cards],
  )
  const [state, setState] = useState<{ index: number; isFlipped: boolean; cardsKey: string }>({
    index: 0,
    isFlipped: false,
    cardsKey,
  })

  const prevModalVisibleRef = useRef(false)
  const prevFocusCardIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isVisible) {
      prevModalVisibleRef.current = false
      prevFocusCardIdRef.current = null
      return
    }

    const becameVisible = !prevModalVisibleRef.current
    prevModalVisibleRef.current = true

    if (!focusCardId || cards.length === 0) {
      prevFocusCardIdRef.current = focusCardId ?? null
      return
    }

    const focusChanged = focusCardId !== prevFocusCardIdRef.current
    prevFocusCardIdRef.current = focusCardId

    if (!becameVisible && !focusChanged) {
      return
    }

    const idx = cards.findIndex((c) => c.id === focusCardId)
    if (idx < 0) {
      return
    }
    setState({
      index: idx,
      isFlipped: false,
      cardsKey,
    })
  }, [isVisible, focusCardId, cards, cardsKey])

  if (!isMounted) {
    return null
  }

  const isSameDeck = state.cardsKey === cardsKey
  const index = isSameDeck ? state.index : 0
  const isFlipped = isSameDeck ? state.isFlipped : false
  const card = cards[index]
  const total = cards.length
  const canNavigate = total > 1

  return (
    <ModalShell isOpen={isVisible} className="learn-flashcards-modal-overlay" onRequestClose={onClose}>
      <section className="learn-flashcards-modal" role="dialog" aria-modal="true" aria-label="Lernkarten">
        <header className="learn-flashcards-modal-header">
          <h2>Lernkarten</h2>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Schließen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <div className="learn-flashcards-modal-body">
          {isLoading ? (
            <p className="learn-muted learn-flashcards-modal-status">Lernkarten werden erstellt…</p>
          ) : error ? (
            <p className="error-text learn-flashcards-modal-status">{error}</p>
          ) : !card ? (
            <p className="learn-muted learn-flashcards-modal-status">Keine Karten vorhanden.</p>
          ) : (
            <>
              <p className="learn-flashcards-counter" aria-live="polite">
                Karte {index + 1} von {total} — zum Drehen auf die Karte tippen
              </p>
              <button
                type="button"
                className={`learn-flashcard ${isFlipped ? 'is-flipped' : ''}`}
                onClick={() =>
                  setState((prev) => ({
                    index,
                    cardsKey,
                    isFlipped: prev.cardsKey === cardsKey ? !prev.isFlipped : true,
                  }))
                }
                aria-label={isFlipped ? 'Karte umdrehen zur Frage' : 'Karte umdrehen zur Antwort'}
              >
                <div className="learn-flashcard-inner">
                  <div className="learn-flashcard-face learn-flashcard-front">
                    <span className="learn-flashcard-label">Frage</span>
                    <p className="learn-flashcard-text">{card.question}</p>
                  </div>
                  <div className="learn-flashcard-face learn-flashcard-back">
                    <span className="learn-flashcard-label">Antwort</span>
                    <p className="learn-flashcard-text">{card.answer}</p>
                  </div>
                </div>
              </button>
              {canNavigate ? (
                <div className="learn-flashcards-nav">
                  <SecondaryButton
                    type="button"
                    disabled={index <= 0}
                    onClick={() =>
                      setState({
                        index: Math.max(0, index - 1),
                        isFlipped: false,
                        cardsKey,
                      })
                    }
                  >
                    Zurück
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    disabled={index >= total - 1}
                    onClick={() =>
                      setState({
                        index: Math.min(total - 1, index + 1),
                        isFlipped: false,
                        cardsKey,
                      })
                    }
                  >
                    Weiter
                  </PrimaryButton>
                </div>
              ) : null}
              {card && onRateCard && isFlipped ? (
                <div className="learn-flashcard-rating" role="group" aria-label="Selbsteinschätzung">
                  <SecondaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--unknown${
                      card.selfRating === 'unknown' ? ' is-active' : ''
                    }`}
                    onClick={() => onRateCard(card.id, 'unknown')}
                  >
                    Nicht gewusst
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--known${
                      card.selfRating === 'known' ? ' is-active' : ''
                    }`}
                    onClick={() => onRateCard(card.id, 'known')}
                  >
                    Gewusst
                  </PrimaryButton>
                </div>
              ) : null}
              {card && onRateCard && !isFlipped ? (
                <p className="learn-flashcard-rating-hint learn-muted">Zum Bewerten zuerst die Karte umdrehen (Antwort lesen).</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
