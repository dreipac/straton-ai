/**
 * Ziel-Chip des aktiven Lernpfads (UI-Spezifikation 3.1).
 *
 * Der Chip ist ausdruecklich funktional und kein Etikett: „Ohne ihn kann der Nutzer die
 * Ziel-Uebersteuerung aus Architekturkapitel 6.3 gar nicht ausloesen." Deshalb ist er ein Knopf,
 * auch wenn kein Ziel gesetzt ist.
 *
 * Steht oben rechts im Inhaltsbereich statt in einer eigenen Kopfzeile im Pfad-Tab — das Ziel
 * betrifft den ganzen Pfad, nicht nur die Pfad-Ansicht.
 */

import type { GoalChipView } from '../ui/pathView'

export type BrainGoalChipProps = {
  chip: GoalChipView
  onOpenGoal: () => void
  className?: string
}

export function BrainGoalChip({ chip, onOpenGoal, className }: BrainGoalChipProps) {
  return (
    <button
      type="button"
      className={`brain-goal-chip brain-goal-chip--${chip.state === 'set' ? chip.feasibility : 'unset'}${
        className ? ` ${className}` : ''
      }`}
      onClick={onOpenGoal}
      /*
       * Die Machbarkeitsaussage steht als Titel dahinter, nicht nur das Wort im Chip: „wird
       * knapp" allein waere wieder ein Motivationsspruch, und Kapitel 6.3 nennt genau die
       * Ehrlichkeit der Rueckrechnung ein Alleinstellungsmerkmal.
       */
      title={chip.state === 'set' ? chip.detail : 'Termin, Umfang und verfügbare Zeit festlegen'}
    >
      {chip.label}
    </button>
  )
}
