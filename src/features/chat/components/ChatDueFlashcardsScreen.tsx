import { useMemo, useState } from 'react'
import chevronLeftIcon from '../../../assets/icons/chevron-left.svg'
import cardsFilledIcon from '../../../assets/icons/cards-filled.svg'
import { LearnFlashcardsModal } from '../../learn/components/LearnFlashcardsModal'
import type { DueFlashcardSetEntry } from '../../learn/hooks/useLearningPathsSidebar'

export type ChatDueFlashcardsScreenProps = {
  entries: DueFlashcardSetEntry[]
  onBack: () => void
  onRateCard: (pathId: string, setId: string, cardId: string, rating: 'known' | 'unknown') => void
}

/** Sammel-Übersicht: alle fälligen Lernkarten-Sets über alle Lernpfade hinweg, mit dezenter
 *  Lernpfad-/Themen-Zuordnung je Set. Die eigentliche Wiederholung läuft im bestehenden
 *  Lernkarten-Modal (Fällig-Modus), damit Kartenoptik und Selbsteinschätzung identisch bleiben. */
export function ChatDueFlashcardsScreen({ entries, onBack, onRateCard }: ChatDueFlashcardsScreenProps) {
  /** `sessionTotal` wird beim Öffnen einmalig eingefroren — die Karten selbst schrumpfen live, sobald
   *  bewertet wird (Set fällt sonst mittendrin aus `entries`, da es dann nicht mehr fällig ist). */
  const [activeSession, setActiveSession] = useState<{ setId: string; total: number } | null>(null)

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.setId === activeSession?.setId) ?? null,
    [entries, activeSession],
  )
  const totalDue = entries.reduce((sum, entry) => sum + entry.dueCards.length, 0)

  return (
    <section className="chat-due-flashcards-screen" aria-label="Fällige Lernkarten">
      <div className="chat-due-flashcards-inner">
        <header className="chat-due-flashcards-header">
          <button
            type="button"
            className="chat-due-flashcards-back-btn"
            aria-label="Zurück zur Startseite"
            onClick={onBack}
          >
            <img className="ui-icon chat-due-flashcards-back-icon" src={chevronLeftIcon} alt="" aria-hidden="true" />
          </button>
          <div className="chat-due-flashcards-title-group">
            <h2 className="chat-due-flashcards-title">Fällige Lernkarten</h2>
            <p className="chat-due-flashcards-subtitle">
              {totalDue} Karte{totalDue === 1 ? '' : 'n'} zum Wiederholen
              {entries.length > 0 ? ` · ${entries.length} Set${entries.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="chat-due-flashcards-empty">
            <img className="ui-icon chat-due-flashcards-empty-icon" src={cardsFilledIcon} alt="" aria-hidden="true" />
            <p className="chat-due-flashcards-empty-title">Alles erledigt</p>
            <p className="learn-muted">Aktuell sind keine Lernkarten fällig. Nächste Wiederholungen kommen automatisch.</p>
          </div>
        ) : (
          <ul className="chat-due-flashcards-list">
            {entries.map((entry) => (
              <li key={entry.setId}>
                <button
                  type="button"
                  className="chat-due-flashcards-set-row"
                  onClick={() => setActiveSession({ setId: entry.setId, total: entry.dueCards.length })}
                >
                  <span className="chat-due-flashcards-set-row-body">
                    <span className="chat-due-flashcards-set-row-count">
                      {entry.dueCards.length} Karte{entry.dueCards.length === 1 ? '' : 'n'} fällig
                    </span>
                    <span className="chat-due-flashcards-set-row-meta">
                      {entry.pathTitle}
                      {entry.topicLabel ? ` · ${entry.topicLabel}` : ''}
                    </span>
                  </span>
                  <span className="chat-due-flashcards-set-row-arrow" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LearnFlashcardsModal
        isMounted={activeSession !== null}
        isVisible={activeSession !== null}
        cards={activeEntry?.dueCards ?? []}
        isLoading={false}
        error={null}
        reviewMode="due"
        dueSessionTotal={activeSession?.total ?? 0}
        onClose={() => setActiveSession(null)}
        onRateCard={(cardId, rating) => {
          if (!activeEntry) {
            return
          }
          onRateCard(activeEntry.pathId, activeEntry.setId, cardId, rating)
        }}
      />
    </section>
  )
}
