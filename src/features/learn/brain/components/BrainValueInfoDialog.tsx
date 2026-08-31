/**
 * Die Werterklärung als kleines, eigenständiges Modal (UI-Spezifikation 3.6).
 *
 * Vormals stand die Erklärung aller drei Werte gesammelt unter den Balken auf der Karte — das
 * Knoten-Panel wurde dadurch schnell lang, obwohl die Erklärung nur beim ersten Mal wirklich
 * gebraucht wird. Jetzt trägt jeder Wert sein eigenes „i" daneben; das Modal zeigt genau die ein
 * bis zwei Sätze zu GENAU DIESEM Wert, nicht alle drei auf einmal.
 */

import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import { VALUE_EXPLANATION, type BrainValueTerm } from '../ui/pathView'

export type BrainValueInfoDialogProps = {
  term: BrainValueTerm | null
  onClose: () => void
}

export function BrainValueInfoDialog({ term, onClose }: BrainValueInfoDialogProps) {
  const entry = term ? VALUE_EXPLANATION.find((e) => e.term === term) : null

  return (
    <ModalShell isOpen={Boolean(entry)} className="brain-dialog-overlay" onRequestClose={onClose}>
      {entry ? (
        <section className="brain-info-dialog" role="dialog" aria-modal="true" aria-label={entry.term}>
          <header className="brain-info-dialog-head">
            <h3 className="brain-info-dialog-title">{entry.term}</h3>
            <button type="button" className="brain-info-dialog-close" onClick={onClose} aria-label="Schliessen">
              ×
            </button>
          </header>
          <p className="brain-info-dialog-text">{entry.text}</p>
        </section>
      ) : null}
    </ModalShell>
  )
}
