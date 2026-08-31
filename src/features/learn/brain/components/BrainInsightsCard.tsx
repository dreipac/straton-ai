/**
 * Die Einsichten-Karte (UI-Spezifikation 3.7).
 *
 * „Unten im Pfad" und ausdruecklich kein vierter Tab: „es soll etwas sein, das einem begegnet,
 * kein Ort, den man besuchen muss."
 *
 * Invariante I7 wird nicht hier durchgesetzt, sondern in `brain/ui/insightsView.ts` — diese
 * Komponente bekommt waehrend einer Sitzung schlicht nichts zu rendern. Das ist Absicht: eine
 * Bedingung in der Komponente waere beim naechsten Layoutumbau weg.
 *
 * Beide Inhalte tragen eine Antwortmoeglichkeit, und beide Antworten sind Signale:
 * der Widerspruch zu einer Beobachtung ebenso wie das „weiss ich nicht" zu einer Kartenfrage.
 */

import type { InsightsCardView, MapQuestionResponse } from '../ui/insightsView'

export type BrainInsightsCardProps = {
  card: InsightsCardView
  onRespondObservation: (patternId: string, agreed: boolean) => void
  onRespondMapQuestion: (proposalId: string, answer: MapQuestionResponse['answer']) => void
}

export function BrainInsightsCard({ card, onRespondObservation, onRespondMapQuestion }: BrainInsightsCardProps) {
  if (card.isEmpty) {
    return null
  }

  return (
    <section className="brain-insights" aria-label="Einsichten">
      <header className="brain-insights-head">
        <h3 className="brain-insights-title">Was mir auffaellt</h3>
        <span className="brain-insights-counter">{card.counterLabel}</span>
      </header>

      {card.observations.map((observation) => (
        <article key={observation.patternId} className="brain-insight">
          {/* Beobachtung mit Beleg, kein Urteil — der Belegtext kommt aus `describePattern`. */}
          <p className="brain-insight-text">{observation.text}</p>
          <div className="brain-insight-actions">
            <button
              type="button"
              className="brain-insight-action"
              onClick={() => onRespondObservation(observation.patternId, true)}
            >
              Kommt hin
            </button>
            <button
              type="button"
              className="brain-insight-action"
              onClick={() => onRespondObservation(observation.patternId, false)}
            >
              Stimmt nicht
            </button>
          </div>
        </article>
      ))}

      {card.mapQuestions.map((question) => (
        <article key={question.proposalId} className="brain-insight brain-insight--question">
          <p className="brain-insight-text">{question.question}</p>
          {/*
           * Pflicht bei Verschmelzungen: der Fortschrittsverlust wird ANGEKUENDIGT. Ohne diesen
           * Satz sieht der Nutzer spaeter Fortschritt verschwinden und haelt es fuer einen Fehler.
           */}
          {question.valueWarning ? <p className="brain-insight-warning">{question.valueWarning}</p> : null}
          <div className="brain-insight-actions">
            {question.actions.map((label, index) => (
              <button
                key={label}
                type="button"
                className="brain-insight-action"
                onClick={() =>
                  onRespondMapQuestion(question.proposalId, index === 0 ? 'accept' : index === 1 ? 'reject' : 'unsure')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
