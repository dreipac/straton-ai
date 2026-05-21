import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport'
import type { LearnFlashcard } from '../services/learn.persistence'
import { formatNextReviewHint } from '../utils/spacedRepetition'
import { useLearnFlashcardsDeck } from './useLearnFlashcardsDeck'

export type LearnFlashcardsModalProps = {
  isMounted: boolean
  isVisible: boolean
  cards: LearnFlashcard[]
  isLoading: boolean
  error: string | null
  onClose: () => void
  focusCardId?: string | null
  onRateCard?: (cardId: string, rating: 'known' | 'unknown') => void
  reviewMode?: 'all' | 'due'
  dueSessionTotal?: number
}

export function LearnFlashcardsModal(props: LearnFlashcardsModalProps) {
  const isMobile = useIsMobileViewport()
  if (isMobile) {
    return <LearnFlashcardsMobileOverlay {...props} />
  }
  return <LearnFlashcardsDesktopModal {...props} />
}

function LearnFlashcardsMobileOverlay(props: LearnFlashcardsModalProps) {
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

  const deck = useLearnFlashcardsDeck({
    isActive: isVisible,
    cards,
    focusCardId,
    reviewMode,
  })

  if (!isMounted) {
    return null
  }

  const sessionTotal = dueSessionTotal ?? deck.total
  const reviewedInSession =
    reviewMode === 'due' && sessionTotal > 0 ? Math.max(0, sessionTotal - deck.total) : 0
  const nextReviewHint = deck.card ? formatNextReviewHint(deck.card.nextReviewAt) : null
  const showRating = Boolean(deck.card && onRateCard && !isLoading && !error)
  const dueDone = reviewMode === 'due' && deck.total === 0 && !isLoading && !error

  function handleRate(rating: 'known' | 'unknown') {
    if (!deck.card || !onRateCard || !deck.isFlipped) {
      return
    }
    onRateCard(deck.card.id, rating)
    deck.resetFlipAfterRate()
  }

  return (
    <div
      className={`learn-flashcards-mobile-overlay modal-fade${isVisible ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Lernkarten"
      onClick={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }
        onClose()
      }}
    >
      <div className="learn-flashcards-mobile-deck">
          {isLoading ? (
            <p className="learn-muted learn-flashcards-mobile-status">Lernkarten werden erstellt…</p>
          ) : error ? (
            <p className="error-text learn-flashcards-mobile-status">{error}</p>
          ) : dueDone ? (
            <div className="learn-flashcards-due-done learn-flashcards-due-done--mobile">
              <p className="learn-flashcards-due-done-title">Heute erledigt</p>
              <p className="learn-muted">Tippe ausserhalb, um zu schliessen.</p>
            </div>
          ) : !deck.card ? (
            <p className="learn-muted learn-flashcards-mobile-status">Keine Karten vorhanden.</p>
          ) : (
            <>
              <p className="learn-flashcards-counter learn-flashcards-counter--mobile" aria-live="polite">
                {reviewMode === 'due' ? (
                  <>
                    {reviewedInSession + 1} / {sessionTotal}
                    {deck.total > 1 ? ` · ${deck.total} übrig` : ''}
                  </>
                ) : (
                  <>Karte {deck.index + 1} / {deck.total}</>
                )}
              </p>
              <button
                type="button"
                className={`learn-flashcard learn-flashcard--mobile ${deck.isFlipped ? 'is-flipped' : ''}`}
                onClick={deck.flipCard}
                aria-label={deck.isFlipped ? 'Zur Frage' : 'Antwort anzeigen'}
              >
                <div className="learn-flashcard-inner">
                  <div className="learn-flashcard-face learn-flashcard-front">
                    <span className="learn-flashcard-label">Frage</span>
                    <p className="learn-flashcard-text">{deck.card.question}</p>
                  </div>
                  <div className="learn-flashcard-face learn-flashcard-back">
                    <span className="learn-flashcard-label">Antwort</span>
                    <p className="learn-flashcard-text">{deck.card.answer}</p>
                  </div>
                </div>
              </button>
              {deck.isFlipped && nextReviewHint && reviewMode === 'all' ? (
                <p className="learn-flashcard-sr-hint learn-muted">{nextReviewHint}</p>
              ) : null}
            </>
          )}
      </div>

      {showRating && !dueDone ? (
        <footer className="learn-flashcards-mobile-bar">
            {deck.canNavigate ? (
              <div className="learn-flashcards-mobile-nav">
                <SecondaryButton type="button" disabled={deck.index <= 0} onClick={deck.goToPrev}>
                  Zurück
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  disabled={deck.index >= deck.total - 1}
                  onClick={deck.goToNext}
                >
                  Weiter
                </SecondaryButton>
              </div>
            ) : null}
            <div className="learn-flashcard-rating learn-flashcard-rating--mobile" role="group" aria-label="Selbsteinschätzung">
              <SecondaryButton
                type="button"
                className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--unknown${
                  deck.card?.selfRating === 'unknown' ? ' is-active' : ''
                }`}
                disabled={!deck.isFlipped}
                onClick={() => handleRate('unknown')}
              >
                Nicht gewusst
              </SecondaryButton>
              <PrimaryButton
                type="button"
                className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--known${
                  deck.card?.selfRating === 'known' ? ' is-active' : ''
                }`}
                disabled={!deck.isFlipped}
                onClick={() => handleRate('known')}
              >
                Gewusst
              </PrimaryButton>
            </div>
            {!deck.isFlipped ? (
              <p className="learn-flashcard-rating-hint learn-muted">Zum Bewerten die Karte antippen.</p>
            ) : null}
        </footer>
      ) : null}
    </div>
  )
}

function LearnFlashcardsDesktopModal(props: LearnFlashcardsModalProps) {
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

  const deck = useLearnFlashcardsDeck({
    isActive: isVisible,
    cards,
    focusCardId,
    reviewMode,
  })

  if (!isMounted) {
    return null
  }

  const sessionTotal = dueSessionTotal ?? deck.total
  const reviewedInSession =
    reviewMode === 'due' && sessionTotal > 0 ? Math.max(0, sessionTotal - deck.total) : 0
  const nextReviewHint = deck.card ? formatNextReviewHint(deck.card.nextReviewAt) : null

  function handleRate(rating: 'known' | 'unknown') {
    if (!deck.card || !onRateCard) {
      return
    }
    onRateCard(deck.card.id, rating)
    deck.resetFlipAfterRate()
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
          ) : reviewMode === 'due' && deck.total === 0 && !isLoading ? (
            <div className="learn-flashcards-due-done">
              <p className="learn-flashcards-due-done-title">Heute erledigt</p>
              <p className="learn-muted">Alle fälligen Karten sind für heute durch. Nächste Wiederholungen kommen automatisch.</p>
              <PrimaryButton type="button" onClick={onClose}>
                Schließen
              </PrimaryButton>
            </div>
          ) : !deck.card ? (
            <p className="learn-muted learn-flashcards-modal-status">Keine Karten vorhanden.</p>
          ) : (
            <>
              <p className="learn-flashcards-counter" aria-live="polite">
                {reviewMode === 'due' ? (
                  <>
                    Wiederholung {reviewedInSession + 1} von {sessionTotal}
                    {deck.total > 1 ? ` · noch ${deck.total} fällig` : ''}
                  </>
                ) : (
                  <>Karte {deck.index + 1} von {deck.total}</>
                )}
                {' '}
                — zum Drehen auf die Karte tippen
              </p>
              <button
                type="button"
                className={`learn-flashcard ${deck.isFlipped ? 'is-flipped' : ''}`}
                onClick={deck.flipCard}
                aria-label={deck.isFlipped ? 'Karte umdrehen zur Frage' : 'Karte umdrehen zur Antwort'}
              >
                <div className="learn-flashcard-inner">
                  <div className="learn-flashcard-face learn-flashcard-front">
                    <span className="learn-flashcard-label">Frage</span>
                    <p className="learn-flashcard-text">{deck.card.question}</p>
                  </div>
                  <div className="learn-flashcard-face learn-flashcard-back">
                    <span className="learn-flashcard-label">Antwort</span>
                    <p className="learn-flashcard-text">{deck.card.answer}</p>
                  </div>
                </div>
              </button>
              {deck.canNavigate ? (
                <div className="learn-flashcards-nav">
                  <SecondaryButton type="button" disabled={deck.index <= 0} onClick={deck.goToPrev}>
                    Zurück
                  </SecondaryButton>
                  <PrimaryButton type="button" disabled={deck.index >= deck.total - 1} onClick={deck.goToNext}>
                    Weiter
                  </PrimaryButton>
                </div>
              ) : null}
              {deck.card && onRateCard && deck.isFlipped && nextReviewHint && reviewMode === 'all' ? (
                <p className="learn-flashcard-sr-hint learn-muted">{nextReviewHint}</p>
              ) : null}
              {deck.card && onRateCard && deck.isFlipped ? (
                <div className="learn-flashcard-rating" role="group" aria-label="Selbsteinschätzung">
                  <SecondaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--unknown${
                      deck.card.selfRating === 'unknown' ? ' is-active' : ''
                    }`}
                    onClick={() => handleRate('unknown')}
                  >
                    Nicht gewusst
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    className={`learn-flashcard-rating-btn learn-flashcard-rating-btn--known${
                      deck.card.selfRating === 'known' ? ' is-active' : ''
                    }`}
                    onClick={() => handleRate('known')}
                  >
                    Gewusst
                  </PrimaryButton>
                </div>
              ) : null}
              {deck.card && onRateCard && !deck.isFlipped ? (
                <p className="learn-flashcard-rating-hint learn-muted">Zum Bewerten zuerst die Karte umdrehen (Antwort lesen).</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
