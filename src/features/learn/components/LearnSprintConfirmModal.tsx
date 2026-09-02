/**
 * Der Sprint-Hinweis als Bestaetigung VOR der Erzeugung (Einrichtung, Schritt 3 → 4).
 *
 * Der Hinweistext in Schritt 3 (`sprintWarning` in `LearnSetupPanel`) steht schon waehrend der
 * Termin eingetippt wird — er ist Feedback, keine Entscheidung, und leicht zu ueberlesen. Dieses
 * Modal macht denselben Hinweis zur Bestaetigung: wer „Einrichtung abschließen" drueckt und der
 * Termin faellt in den Sprint-Bereich, muss ihn einmal aktiv wegklicken, bevor der Lernpfad
 * tatsaechlich entsteht. Derselbe Text wie im Sprint-Band eines bestehenden Pfads (Kapitel 6.3) —
 * nur eben `describeSprintDeadline` statt `describeSprintScope`/`describeRetention`, weil vor der
 * Erzeugung noch kein Konzept-Netz existiert, an dem sich ein Umfang berechnen liesse.
 */

import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'

export type LearnSprintConfirmModalProps = {
  isOpen: boolean
  warning: string
  /** Termin/Zeit noch einmal anpassen — schliesst nur das Modal, Schritt 3 bleibt offen. */
  onAdjust: () => void
  /** Trotz des Hinweises erzeugen. */
  onConfirm: () => void
}

export function LearnSprintConfirmModal({ isOpen, warning, onAdjust, onConfirm }: LearnSprintConfirmModalProps) {
  return (
    <ModalShell isOpen={isOpen} onRequestClose={onAdjust}>
      <section
        className="ui-dialog-card rename-modal learn-sprint-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Knapper Termin"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader title="Knapper Termin" headingLevel="h3" closeLabel="Schließen" onClose={onAdjust} />
        <p className="learn-sprint-confirm-text">{warning}</p>
        <div className="rename-actions">
          <SecondaryButton type="button" onClick={onAdjust}>
            Anpassen
          </SecondaryButton>
          <PrimaryButton type="button" onClick={onConfirm}>
            Lernpfad trotzdem starten
          </PrimaryButton>
        </div>
      </section>
    </ModalShell>
  )
}
