import { useEffect, useState } from 'react'
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
  const [index, setIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  useEffect(() => {
    setIndex(0)
    setIsFlipped(false)
  }, [cards])

  useEffect(() => {
    setIsFlipped(false)
  }, [index])

  if (!isMounted) {
    return null
  }

  const card = cards[index]
  const total = cards.length
  const canNavigate = total > 1

  return (
    <ModalShell isOpen={isVisible} className="learn-flashcards-modal-overlay">
      <section className="learn-flashcards-modal" role="dialog" aria-modal="true" aria-label="Lernkarten">
        <header className="learn-flashcards-modal-header">
          <h2>Lernkarten</h2>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Schliessen">
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
                onClick={() => setIsFlipped((f) => !f)}
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
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    Zurück
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    disabled={index >= total - 1}
                    onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
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
