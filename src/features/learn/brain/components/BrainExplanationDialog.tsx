/**
 * Der Erklaertext am Knoten (UI-Spezifikation 3.6, Architekturkapitel 7.3).
 *
 * Kurz, quellengebunden, mit sichtbarer Stellenangabe. Die Stellenangabe ist kein Beiwerk: sie
 * ist der Unterschied zwischen Straton und einem Chatbot — was hier steht, steht auch im Material
 * der Person, und sie kann es nachschlagen.
 *
 * Wo mehr Erklaerung noetig ist, fuehrt der Weg in den Chat. „Der Chat ist der Erklaermotor, die
 * Sitzung ist es nicht" — deshalb steht der Uebergang hier als Knopf und nicht als weiterer
 * Absatz.
 */

import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { BrainExplanationState } from '../hooks/useBrainExplanation'

export type BrainExplanationDialogProps = {
  state: BrainExplanationState
  onAskInChat: (conceptId: string) => void
  onClose: () => void
}

export function BrainExplanationDialog({ state, onAskInChat, onClose }: BrainExplanationDialogProps) {
  if (state.phase === 'idle' || !state.conceptId) {
    return null
  }

  return (
    <ModalShell isOpen className="brain-dialog-overlay" onRequestClose={onClose}>
      <section className="brain-dialog" role="dialog" aria-modal="true" aria-label={`Erklärung ${state.conceptName}`}>
        <ModalHeader title={state.conceptName} onClose={onClose} closeLabel="Schliessen" />

        <div className="brain-dialog-body">
          {state.phase === 'loading' ? (
            <p className="brain-explanation-waiting" aria-busy="true">
              Ich suche die Stelle in deinem Material …
            </p>
          ) : null}

          {state.phase === 'failed' ? (
            <>
              <p className="error-text">{state.error}</p>
              {/*
               * Kein zweiter Versuch mit demselben Auszug: was der Kontrolleur einmal nicht
               * verankern konnte, verankert er beim zweiten Mal auch nicht. Der Chat kann die
               * Frage dagegen ohne Quellenbindung beantworten — dort ist sie richtig aufgehoben.
               */}
              <SecondaryButton type="button" onClick={() => onAskInChat(state.conceptId ?? '')}>
                Im Chat dazu fragen
              </SecondaryButton>
            </>
          ) : null}

          {state.phase === 'ready' && state.explanation ? (
            <>
              <p className="brain-explanation-text">{state.explanation.text}</p>

              {state.explanation.solutionPath ? (
                <details className="brain-explanation-path">
                  <summary>Lösungsweg</summary>
                  <p>{state.explanation.solutionPath}</p>
                </details>
              ) : null}

              {/* Herkunftsangabe (I4) — ohne sie waere der Text nicht ueberpruefbar. */}
              <p className="brain-explanation-source">{state.explanation.sourceGrounding}</p>

              <SecondaryButton type="button" onClick={() => onAskInChat(state.conceptId ?? '')}>
                Im Chat weiterfragen
              </SecondaryButton>
            </>
          ) : null}
        </div>
      </section>
    </ModalShell>
  )
}
