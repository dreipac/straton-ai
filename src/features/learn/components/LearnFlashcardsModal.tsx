import { useEffect, useMemo, useRef, useState } from 'react'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { LearnFlashcard } from '../services/learn.persistence'
import { formatNextReviewHint } from '../utils/spacedRepetition'

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
  /** `due`: nur fällige Karten, nach Bewertung automatisch zur nächsten */
  reviewMode?: 'all' | 'due'
  dueSessionTotal?: number
}

export function LearnFlashcardsModal(props: LearnFlashcardsModalProps) {
  const {
    isMounted,
    isVisible,
    cards,
    isLoading,
    error,
    onClose,
    focusCardId,
    onRateCard,
    reviewMode = 'all',
    dueSessionTotal,
  } = props
  const cardsKey = useMemo(
    () => cards.map((card) => `${card.id}::${card.nextReviewAt ?? ''}`).join('||'),
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

  useEffect(() => {
    if (!isVisible || reviewMode !== 'due' || cards.length === 0) {
      return
    }
    setState((prev) => {
      const nextIndex = Math.min(prev.index, cards.length - 1)
      if (prev.cardsKey === cardsKey && nextIndex === prev.index) {
        return prev
      }
      return { index: nextIndex, isFlipped: false, cardsKey }
    })
  }, [cards.length, cardsKey, isVisible, reviewMode])

  if (!isMounted) {
    return null
  }

  const isSameDeck = state.cardsKey === cardsKey
  const index = isSameDeck ? state.index : 0
  const isFlipped = isSameDeck ? state.isFlipped : false
  const card = cards[index]
  const total = cards.length
  const canNavigate = total > 1
  const sessionTotal = dueSessionTotal ?? total
  const reviewedInSession = reviewMode === 'due' && sessionTotal > 0 ? Math.max(0, sessionTotal - total) : 0
  const nextReviewHint = card ? formatNextReviewHint(card.nextReviewAt) : null

  function handleRate(rating: 'known' | 'unknown') {
    if (!card || !onRateCard) {
      return
    }
    onRateCard(card.id, rating)
    setState((prev) => ({
      ...prev,
      isFlipped: false,
    }))
  }

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
          ) : reviewMode === 'due' && total === 0 && !isLoading ? (
            <div className="learn-flashcards-due-done">
              <p className="learn-flashcards-due-done-title">Heute erledigt</p>
              <p className="learn-muted">Alle fälligen Karten sind für heute durch. Nächste Wiederholungen kommen automatisch.</p>
              <PrimaryButton type="button" onClick={onClose}>
                Schließen
              </PrimaryButton>
            </div>
          ) : !card ? (
            <p className="learn-muted learn-flashcards-modal-status">Keine Karten vorhanden.</p>
          ) : (
            <>
              <p className="learn-flashcards-counter" aria-live="polite">
                {reviewMode === 'due' ? (
                  <>
                    Wiederholung {reviewedInSession + 1} von {sessionTotal}
                    {total > 1 ? ` · noch ${total} fällig` : ''}
                  </>
                ) : (
                  <>Karte {index + 1} von {total}</>
                )}
                {' '}
                — zum Drehen auf die Karte tippen
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
              {card && onRateCard && isFlipped && nextReviewHint && reviewMode === 'all' ? (
                <p className="learn-flashcard-sr-hint learn-muted">{nextReviewHint}</p>
              ) : null}
              {card && onRateCard && isFlipped ? (
                <div className="learn-flashcard-rating" role="group" aria-label="Selbsteinschätzung">
                  <SecondaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--unknown${
                      card.selfRating === 'unknown' ? ' is-active' : ''
                    }`}
                    onClick={() => handleRate('unknown')}
                  >
                    Nicht gewusst
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--known${
                      card.selfRating === 'known' ? ' is-active' : ''
                    }`}
                    onClick={() => handleRate('known')}
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
