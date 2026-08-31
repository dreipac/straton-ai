/**
 * Die Jetzt-Karte (UI-Spezifikation 3.3).
 *
 * „Der einzige primaere Handlungsweg des ganzen Bereichs." Deshalb genau ein Hauptknopf und genau
 * ein Nebenknopf — jede weitere Aktion hier wuerde die Karte zu einer Auswahl machen, und eine
 * Auswahl ist genau das, was der Planer dem Nutzer abnimmt.
 *
 * `Spaeter` ist Pflicht, nicht Hoeflichkeit: „Ein System ohne Widerspruchsmoeglichkeit wird als
 * bevormundend erlebt. Die Ablehnung ist zudem selbst ein Signal."
 */

import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { NowCardView } from '../ui/pathView'

export type BrainNowCardProps = {
  card: NowCardView
  onStart: () => void
  onDefer: () => void
  isBusy?: boolean
}

export function BrainNowCard({ card, onStart, onDefer, isBusy = false }: BrainNowCardProps) {
  return (
    <section className={`brain-now-card brain-now-card--${card.trigger}`} aria-label="Nächster Schritt">
      <h2 className="brain-now-card-title">{card.conceptName}</h2>

      {/* Invariante I8: die Begründung ist Pflichtbestandteil, nicht Beiwerk. */}
      <p className="brain-now-card-reason">{card.reason}</p>

      <div className="brain-now-card-meta">
        <span className="brain-now-card-duration">{`rund ${card.estimatedMinutes} Min`}</span>
      </div>

      <div className="brain-now-card-actions">
        <PrimaryButton type="button" onClick={onStart} disabled={isBusy}>
          Weiterlernen
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onDefer} disabled={isBusy}>
          Später
        </SecondaryButton>
      </div>
    </section>
  )
}

/**
 * Der leere Zustand der Jetzt-Karte.
 *
 * Eigene Komponente statt eines `null`-Rueckgabewerts: eine verschwundene Hauptkarte laesst den
 * Bereich kaputt wirken. Es gibt immer etwas zu sagen — auch „nichts faellig" ist eine Auskunft.
 */
export function BrainNowCardEmpty({ hasConcepts }: { hasConcepts: boolean }) {
  return (
    <section className="brain-now-card brain-now-card--empty" aria-label="Nächster Schritt">
      <span className="brain-now-card-kind">Nichts offen</span>
      <p className="brain-now-card-reason">
        {hasConcepts
          ? 'Gerade ist nichts fällig und nichts offen. Ich melde mich, sobald etwas zu verblassen beginnt.'
          : 'Für diesen Pfad steht noch keine Konzeptkarte bereit. Sobald dein Material eingelesen ist, geht es hier weiter.'}
      </p>
    </section>
  )
}
