/**
 * Der Wiederholungsstapel als Vollbild (UI-Spezifikation Kapitel 5.3 und 5.4).
 *
 * „Gleiche Bausteine wie die Sitzung, aber schneller getaktet: kein Einstieg, keine Begruendung,
 * keine aufklappbaren Erklaerungen." Deshalb ist das hier eine eigene Komponente und keine
 * Variante von `BrainSession` mit Schaltern — die Unterschiede sind Weglassungen, und
 * Weglassungen ueber Bedingungen zu steuern endet damit, dass sie nach und nach zurueckkehren.
 *
 * Zwei Dinge sind hier funktional und nicht kosmetisch:
 *  - **Fokus auf dem Eingabefeld**, sobald eine Abfrage steht.
 *  - **Enter prueft.** „Ohne das ist ein Stapel auf dem Handy zaeh."
 */

import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import { renderLearnStepContent } from '../../utils/renderLearnStepContent'
import type { BrainReviewState } from '../hooks/useBrainReview'
import { ABORT_NOTICE } from '../ui/reviewView'

export type BrainReviewStackProps = {
  state: BrainReviewState
  onAnswer: (answer: string) => void
  onNext: () => void
  onAbort: () => void
}

export function BrainReviewStack({ state, onAnswer, onNext, onAbort }: BrainReviewStackProps) {
  const [draft, setDraft] = useState('')
  const [draftIndex, setDraftIndex] = useState(state.index)
  if (draftIndex !== state.index) {
    setDraftIndex(state.index)
    setDraft('')
  }

  const inputRef = useRef<HTMLInputElement | null>(null)
  /*
   * Der Fokus ist hier ein Effekt und kein Attribut: `autoFocus` greift nur beim ersten Aufbau,
   * und der Stapel tauscht die Abfrage aus, ohne das Feld neu zu erzeugen. Ohne diesen Effekt
   * muesste die Person ab der zweiten Abfrage jedes Mal ins Feld tippen — auf dem Handy heisst
   * das: Tastatur zu, Tastatur auf, bei jeder einzelnen Abfrage.
   */
  useEffect(() => {
    if (state.phase === 'answering') {
      inputRef.current?.focus()
    }
  }, [state.phase, state.index])

  const item = state.queue[state.index] ?? null
  const total = state.queue.length

  return (
    <section className="brain-stack" aria-label="Wiederholungsstapel">
      <header className="brain-stack-head">
        <span className="brain-stack-progress">{`${Math.min(state.index + 1, total)} von ${total}`}</span>
        <button type="button" className="brain-stack-close" onClick={onAbort} aria-label="Stapel verlassen">
          ×
        </button>
      </header>

      {/* Kennzeichnung: Konzept und Faelligkeitsgrund (Kapitel 5.3). */}
      {item ? (
        <div className="brain-stack-badge">
          <span className="brain-stack-concept">{item.conceptName}</span>
          <span className="brain-stack-reason">{item.reason}</span>
        </div>
      ) : null}

      {state.phase === 'failed' ? (
        <div className="brain-stack-body">
          <p className="error-text">{state.error}</p>
          <SecondaryButton type="button" onClick={onAbort}>
            Zurück
          </SecondaryButton>
        </div>
      ) : state.phase === 'producing' || !state.task ? (
        <div className="brain-stack-body brain-stack-body--waiting" aria-busy="true">
          <p className="brain-stack-waiting">Einen Moment …</p>
        </div>
      ) : (
        <div className="brain-stack-body">
          <div className="brain-stack-prompt">{renderLearnStepContent(state.task.prompt)}</div>

          {state.task.options && state.task.options.length > 0 ? (
            <ul className="brain-stack-options">
              {state.task.options.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    className={`brain-stack-option${draft === option ? ' is-selected' : ''}`}
                    onClick={() => setDraft(option)}
                    disabled={state.phase === 'feedback'}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <input
              ref={inputRef}
              className="brain-stack-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return
                }
                event.preventDefault()
                if (state.phase === 'feedback') {
                  onNext()
                } else if (draft.trim().length > 0) {
                  onAnswer(draft)
                }
              }}
              placeholder="Antwort"
              disabled={state.phase === 'feedback'}
            />
          )}

          {state.phase === 'feedback' && state.verdict ? (
            <div className="brain-stack-feedback">
              <p className="brain-stack-verdict">{shortVerdict(state.verdict.credit)}</p>
              {/*
               * Nur die Musterloesung, kein aufklappbarer Loesungsweg: der Stapel ist Auffrischung,
               * keine Ursachensuche. Wo eine Erklaerung noetig waere, gehoert das Konzept ohnehin
               * in den Pfad (Kapitel 5.1).
               */}
              <p className="brain-stack-expected">{state.task.expectedAnswer}</p>
            </div>
          ) : null}

          <div className="brain-stack-actions">
            {state.phase === 'feedback' ? (
              <PrimaryButton type="button" onClick={onNext}>
                {state.index + 1 >= total ? 'Fertig' : 'Weiter'}
              </PrimaryButton>
            ) : (
              <PrimaryButton type="button" onClick={() => onAnswer(draft)} disabled={draft.trim().length === 0}>
                Prüfen
              </PrimaryButton>
            )}
          </div>
        </div>
      )}

      {/* Muss dastehen, nicht bloss gelten (Kapitel 5.4). */}
      <p className="brain-stack-abort-notice">{ABORT_NOTICE}</p>
    </section>
  )
}

/** Kurz und ohne Punktzahl — im Stapel interessiert richtig oder nicht, nicht wie knapp. */
function shortVerdict(credit: number): string {
  if (credit >= 0.99) {
    return 'Richtig.'
  }
  if (credit >= 0.5) {
    return 'Fast — so wäre es vollständig:'
  }
  return 'Nicht ganz — so geht es:'
}
