import { useMemo, useState } from 'react'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { LearnFlashcard } from '../../chat/services/chat.service'

export type LearnFlashcardsModalProps = {
  isMounted: boolean
  isVisible: boolean
  cards: LearnFlashcard[]
  isLoading: boolean
  error: string | null
  onClose: () => void
}

export function LearnFlashcardsModal(props: LearnFlashcardsModalProps) {
  const { isMounted, isVisible, cards, isLoading, error, onClose } = props
  const cardsKey = useMemo(
    () => cards.map((card) => `${card.question}::${card.answer}`).join('||'),
    [cards],
  )
  const [state, setState] = useState<{ index: number; isFlipped: boolean; cardsKey: string }>({
    index: 0,
    isFlipped: false,
    cardsKey,
  })

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
            </>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
