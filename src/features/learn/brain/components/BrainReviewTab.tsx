/**
 * Die Uebersicht des Wiederholen-Bereichs (UI-Spezifikation Kapitel 5.2).
 *
 * Zwei Einstiege, eine Liste, ein erklaerender Satz — mehr nicht. Insbesondere gibt es hier
 * nichts zu verwalten: kein „Karte erstellen", keine Kartenliste, keinen Bearbeitungsmodus
 * (Kapitel 5.5). Was fehlt, ist Absicht; der Grund steht als Text in der Ansicht, damit die
 * Absenz nicht als Luecke gelesen wird.
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { ReviewOverviewView } from '../ui/reviewView'
import { NO_SELF_MADE_CARDS_REASON, SHORT_SESSION_ITEMS } from '../ui/reviewView'

export type BrainReviewTabProps = {
  overview: ReviewOverviewView
  onStartFull: () => void
  onStartShort: () => void
  isBusy?: boolean
}

export function BrainReviewTab({ overview, onStartFull, onStartShort, isBusy = false }: BrainReviewTabProps) {
  if (overview.isEmpty) {
    return (
      <section className="brain-review" aria-label="Wiederholen">
        <div className="brain-review-empty">
          {/* Leerzustand mit Angabe (Kapitel 8): ein Endzustand waere kein Grund wiederzukommen. */}
          <p className="brain-review-empty-text">{overview.emptyForecast}</p>
          <p className="brain-review-note">{NO_SELF_MADE_CARDS_REASON}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="brain-review" aria-label="Wiederholen">
      <header className="brain-review-head">
        <h2 className="brain-review-title">Faellig</h2>
        {/* Stabile Formulierung statt einer Kartenzahl (Kapitel 5.7). */}
        <span className="brain-review-counter">{overview.counterLabel}</span>
      </header>

      <div className="brain-review-actions">
        <PrimaryButton type="button" onClick={onStartFull} disabled={isBusy || !overview.canStartFull}>
          Stapel starten
        </PrimaryButton>
        {/*
         * „Der wichtigste Knopf fuer die Abschlussquote. Niemand startet acht Abfragen, wenn er
         * zwei Minuten hat — und was nicht gestartet wird, liefert gar keine Evidenz."
         */}
        <SecondaryButton type="button" onClick={onStartShort} disabled={isBusy || !overview.canStartShort}>
          {`Nur 3 Minuten (${Math.min(SHORT_SESSION_ITEMS, overview.dueConceptCount)})`}
        </SecondaryButton>
      </div>

      <p className="brain-review-explainer">{overview.explainer}</p>

      <ul className="brain-review-list">
        {overview.items.map((item) => (
          <li key={item.conceptId} className="brain-review-item">
            <span className="brain-review-item-name">{item.conceptName}</span>
            {/* Der Grund gehoert dazu — ohne ihn ist „faellig" eine Behauptung (Kapitel 5.2). */}
            <span className="brain-review-item-reason">{item.reason}</span>
          </li>
        ))}
      </ul>

      <p className="brain-review-note">{NO_SELF_MADE_CARDS_REASON}</p>
    </section>
  )
}
