/**
 * Der Abschluss des Stapels (UI-Spezifikation Kapitel 5.4).
 *
 * „Abschluss zeigt NICHT eine Punktzahl als Belohnung, sondern wann das jeweilige Konzept wieder
 * dran ist." Deshalb steht hier keine Trefferquote, kein Balken, keine Serie — die Ansicht
 * bekommt aus `buildReviewCompletion` gar keine Zahl, die sich dafuer missbrauchen liesse.
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import type { ReviewCompletionView } from '../ui/reviewView'

export type BrainReviewCompletionProps = {
  completion: ReviewCompletionView
  /** Wurde vorzeitig verlassen? Dann ist der Hinweis, dass nichts verworfen wurde, das Wichtigste. */
  aborted: boolean
  onDone: () => void
}

export function BrainReviewCompletion({ completion, aborted, onDone }: BrainReviewCompletionProps) {
  return (
    <section className="brain-review-done" aria-label="Stapel abgeschlossen">
      <h2 className="brain-review-done-title">{completion.headline}</h2>

      {aborted ? <p className="brain-review-done-abort">{completion.abortNotice}</p> : null}

      {completion.nextDates.length === 0 ? (
        <p className="brain-review-done-empty">Diesmal ist nichts verbucht worden.</p>
      ) : (
        <ul className="brain-review-done-list">
          {completion.nextDates.map((entry) => (
            <li key={entry.conceptId} className="brain-review-done-item">
              <span className="brain-review-done-name">{entry.conceptName}</span>
              <span className="brain-review-done-when">{entry.label}</span>
            </li>
          ))}
        </ul>
      )}

      <PrimaryButton type="button" onClick={onDone}>
        Fertig
      </PrimaryButton>
    </section>
  )
}
