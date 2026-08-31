/**
 * Die Lernsitzung als Vollbild (UI-Spezifikation Kapitel 4).
 *
 * „Ein einziger Vollbildwechsel" (Entscheidung 37): die Sitzung ist der einzige Ort, an dem der
 * Lernpfad-Bereich verlassen wird. Alles andere — Panel, Einsichten, Ziel — bleibt im Fluss.
 *
 * Was hier bewusst FEHLT, ist so wichtig wie das, was da ist:
 *  - Keine Werte, keine Ringe, keine Prozentzahlen (Kapitel 4.8). Sie kommen erst in der Bilanz.
 *  - Kein zweiter Versuch nach einer falschen Antwort (Kapitel 4.7).
 *  - Keine Formatwahl. Der Typ steht fest, bevor der Bildschirm aufgeht (Kapitel 6.6).
 */

import { useState } from 'react'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import { renderLearnStepContent } from '../../utils/renderLearnStepContent'
// Primitiv aus dem alten Lernmotor, hier weiterverwendet (dokumentation/README.md: „die alte
// Engine ... wird vom Gehirn als Primitiv-Bibliothek weiterverwendet"). Ihre Props sind generische
// Zeichenketten-Arrays ohne jede Bindung an die alte Engine — dieselbe Grenze wie bei BKT-Mathematik
// und Verfallskurve, nur fuer eine Interaktionsform statt einer Berechnung.
import { LearnEntryQuizMatch } from '../../components/LearnEntryQuizMatch'
import type { BrainSessionState } from '../hooks/useBrainSession'
import type { SessionView } from '../ui/sessionView'
import {
  composeMatchingAnswer,
  continueLabel,
  matchingAssignmentComplete,
  sessionProgress,
  DONT_KNOW_ACKNOWLEDGEMENT,
  answerProvenanceNote,
  MATCHING_INTERACTIVE_PROMPT,
} from '../ui/sessionView'

export type BrainSessionProps = {
  state: BrainSessionState
  view: SessionView
  onAnswer: (answer: string, options?: { wasDontKnow?: boolean }) => void
  onNext: () => void
  onAbort: () => void
}

export function BrainSession({ state, view, onAnswer, onNext, onAbort }: BrainSessionProps) {
  /*
   * Der Entwurf haengt am Aufgabenindex, damit nach einem Wechsel nicht die vorige Antwort im Feld
   * steht. Umgesetzt als Zuruecksetzen beim Rendern statt als Effekt: ein Effekt liefe erst NACH
   * dem Zeichnen, und fuer einen Bildaufbau lang stuende die alte Antwort in der neuen Aufgabe.
   */
  const [draft, setDraft] = useState('')
  // Nur fuer `format === 'matching'`: CSV-Zuweisung der Zuordnungs-Eingabe, siehe
  // `composeMatchingAnswer`/`matchingAssignmentComplete`. Eigener Zustand statt `draft`
  // wiederzuverwenden, weil die Komponente unten eine Indexkodierung braucht, waehrend `onAnswer`
  // spaeter den ausgeschriebenen Text bekommt (siehe Absende-Knopf) — zwei verschiedene
  // Repraesentationen derselben Zuweisung.
  const [matchValue, setMatchValue] = useState('')
  const [draftIndex, setDraftIndex] = useState(state.index)
  if (draftIndex !== state.index) {
    setDraftIndex(state.index)
    setDraft('')
    setMatchValue('')
  }

  const slot = view.slots[state.index] ?? null
  const progress = sessionProgress(state.index, state.taskCount)

  const matchTerms = state.task?.matchTerms ?? []
  const matchDescriptions = state.task?.matchDescriptions ?? []
  // Nur wenn beide Felder belegt sind, rendert die interaktive Zuordnung — fehlt eines (aeltere
  // Aufgabe, ein Modelldurchlauf ohne die Zusatzfelder), faellt die Oberflaeche unten auf das
  // bisherige Freitextfeld zurueck. Kein Torwaechter-Bezug: I5 prueft `prompt`/`expectedAnswer`,
  // die davon unberuehrt bleiben.
  const isInteractiveMatching =
    state.task?.format === 'matching' && matchTerms.length > 0 && matchDescriptions.length > 0

  // Zwei verschiedene Antwortformen, ein Absende-Weg: `onAnswer` bekommt in beiden Faellen einen
  // fertigen Freitext (siehe `composeMatchingAnswer`) — der Pruefer sieht keinen Unterschied
  // zwischen einer getippten und einer per Zuordnung zusammengesetzten Antwort.
  const canSubmit = isInteractiveMatching
    ? matchingAssignmentComplete(matchValue, matchTerms.length)
    : draft.trim().length > 0
  const submitAnswer = () =>
    onAnswer(isInteractiveMatching ? composeMatchingAnswer(matchTerms, matchDescriptions, matchValue) : draft)

  return (
    <section className="brain-session" aria-label="Lernsitzung">
      <header className="brain-session-head">
        <div className="brain-session-head-row">
          {/*
           * Waehrend der Sitzung zaehlt nur die Aufgabe, an der man gerade sitzt — der
           * Lernpfadtitel bleibt draussen (siehe LearnPage.tsx, `isBrainSessionOpen`). Der
           * Konzeptname wechselt mit `slot`, wenn die Sitzung mehrere Konzepte mischt.
           */}
          <h1 className="brain-session-title">{slot?.conceptName}</h1>
          {/* Derselbe Schliessen-Knopf wie in den Einstellungen (`settings-close-button` + `settings-close-icon`). */}
          <button type="button" className="settings-close-button" onClick={onAbort} aria-label="Sitzung verlassen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </div>
        {/*
         * Ein Balken je Aufgabe, ueber die volle Breite. Die Faerbung zeigt das Ergebnis, sobald es
         * feststeht (`state.events[index]` existiert erst NACH der Bewertung, siehe
         * `useBrainSession.answer` — der aktuelle, noch unbeantwortete Platz bleibt neutral).
         * Bewusst kein zweiter, gesonderter „erledigt"-Zustand mehr: eine beantwortete Aufgabe TRAEGT
         * ihr Ergebnis, sie ist nicht nur „durch".
         */}
        <div className="brain-session-segments" role="img" aria-label={progress.label}>
          {Array.from({ length: state.taskCount }, (_, index) => {
            const event = state.events[index]
            const outcomeClass = event ? (event.verdict.credit >= 0.5 ? ' is-correct' : ' is-incorrect') : ''
            return (
              <span
                key={index}
                className={`brain-session-segment${index === state.index && !event ? ' is-current' : ''}${outcomeClass}`}
              />
            )
          })}
        </div>
      </header>

      {/* Kaltstart-Ansage vorab (Kapitel 10) — erklaert springende Werte, bevor sie auffallen. */}
      {view.coldStartNotice && state.index === 0 ? (
        <p className="brain-session-cold-start">{view.coldStartNotice}</p>
      ) : null}

      {slot?.badge ? (
        <div className="brain-session-badge">
          <span className="brain-session-badge-label">{slot.badge}</span>
          {slot.badgeSubtitle ? <span className="brain-session-badge-sub">{slot.badgeSubtitle}</span> : null}
        </div>
      ) : null}

      {state.phase === 'failed' ? (
        <div className="brain-session-body">
          <p className="error-text">{state.error}</p>
          <SecondaryButton type="button" onClick={onAbort}>
            Zurueck zum Pfad
          </SecondaryButton>
        </div>
      ) : state.phase === 'producing' || !state.task ? (
        <div className="brain-session-body brain-session-body--waiting" aria-busy="true">
          <p className="brain-session-waiting">Ich baue die Aufgabe …</p>
        </div>
      ) : (
        <div className="brain-session-body">
          {/* Der Konzeptname steht bereits im Titel der Kopfzeile — hier nicht doppelt. */}
          <div className="brain-session-prompt">
            {isInteractiveMatching
              ? MATCHING_INTERACTIVE_PROMPT
              : renderLearnStepContent(state.task.prompt)}
          </div>

          {/*
            Herkunft der ANTWORT (I4 auf Aufgabenebene). Steht sie nicht im hochgeladenen Material,
            muss die Person das sehen — sonst haelt sie fuer belegt, was nur plausibel ist.
            Im Normalfall liefert `answerProvenanceNote` null und hier steht nichts.
          */}
          {answerProvenanceNote(state.task.answerProvenance) ? (
            <p className="brain-session-provenance">{answerProvenanceNote(state.task.answerProvenance)}</p>
          ) : null}

          {isInteractiveMatching ? (
            <LearnEntryQuizMatch
              questionId={`${state.task.conceptId}-${state.index}`}
              matchLeft={matchTerms}
              matchRight={matchDescriptions}
              value={matchValue}
              onChange={setMatchValue}
              disabled={state.phase === 'feedback' || state.phase === 'checking'}
              // MATCHING_INTERACTIVE_PROMPT oben sagt bereits, was zu tun ist — der zusaetzliche
              // Bedienhinweis der Komponente waere hier eine dritte Kopie derselben Anweisung.
              hideHint
              // Eigenes Layout nur fuer die Brain-Sitzung (`.brain-session-match` in learn.css) —
              // der alte Lernmotor behaelt sein bisheriges Aussehen unveraendert.
              className="brain-session-match"
            />
          ) : state.task.options && state.task.options.length > 0 ? (
            <ul className="brain-session-options">
              {state.task.options.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    className={`brain-session-option${draft === option ? ' is-selected' : ''}${
                      state.phase === 'checking' && draft === option ? ' is-checking' : ''
                    }`}
                    onClick={() => setDraft(option)}
                    disabled={state.phase === 'feedback' || state.phase === 'checking'}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <textarea
              className={`brain-session-input${state.phase === 'checking' ? ' is-checking' : ''}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Deine Antwort"
              rows={4}
              disabled={state.phase === 'feedback' || state.phase === 'checking'}
            />
          )}

          {state.phase === 'feedback' && state.feedback ? (
            <div
              className={`brain-session-feedback${
                state.feedback.verdict.credit >= 0.5 ? ' is-correct' : ' is-incorrect'
              }`}
            >
              {state.feedback.wasDontKnow ? (
                <p className="brain-session-feedback-open">{DONT_KNOW_ACKNOWLEDGEMENT}</p>
              ) : null}
              <p className="brain-session-feedback-verdict">
                {describeCredit(state.feedback.verdict.credit)}
              </p>
              {state.feedback.verdict.cause ? (
                <p className="brain-session-feedback-cause">{state.feedback.verdict.cause.rawDescription}</p>
              ) : null}
              <details className="brain-session-solution">
                <summary>Loesungsweg</summary>
                <p>{state.task.expectedAnswer}</p>
                {/* Quellenverweis (Invariante I4) — was hier steht, steht auch im Material. */}
                {state.task.sourceGrounding ? (
                  <p className="brain-session-source">{state.task.sourceGrounding}</p>
                ) : null}
              </details>
            </div>
          ) : null}

          <div className="brain-session-actions">
            {state.phase === 'feedback' ? (
              <PrimaryButton type="button" onClick={onNext}>
                {continueLabel(state.index, state.taskCount)}
              </PrimaryButton>
            ) : (
              <>
                <PrimaryButton
                  type="button"
                  onClick={submitAnswer}
                  disabled={!canSubmit || state.phase === 'checking'}
                >
                  {state.phase === 'checking' ? 'Wird geprüft …' : 'Antwort prüfen'}
                </PrimaryButton>
                {/*
                 * „Der wichtigste unscheinbare Baustein der Sitzung: ohne ihn raet der Nutzer, und
                 * Raten erzeugt verrauschte Evidenz, die das Lernerbild verschmutzt."
                 */}
                <SecondaryButton
                  type="button"
                  onClick={() => onAnswer('Weiss ich nicht.', { wasDontKnow: true })}
                  disabled={state.phase === 'checking'}
                >
                  Ich weiss es nicht
                </SecondaryButton>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Die Rueckmeldung in einem Satz.
 *
 * Teilpunkte werden benannt statt gerundet: „Rechenweg korrekt, Ergebnis falsch" ist die Aussage,
 * die dem Nutzer nuetzt — ein blosses „falsch" verschweigt die Haelfte dessen, was der Pruefer
 * gesehen hat (Architekturkapitel 5.2).
 */
function describeCredit(credit: number): string {
  if (credit >= 0.99) {
    return 'Richtig.'
  }
  if (credit >= 0.5) {
    return 'Im Kern richtig — ein Teil fehlt noch.'
  }
  if (credit > 0) {
    return 'Teilweise richtig; der entscheidende Schritt stimmt noch nicht.'
  }
  return 'Das stimmt so nicht.'
}
