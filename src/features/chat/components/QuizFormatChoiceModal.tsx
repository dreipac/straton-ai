import { useEffect, useId } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import {
  QUIZ_FORMAT_CHOICE_LABELS,
  type QuizFormatChoice,
} from '../utils/quizFormatChoice'

export type QuizFormatChoiceModalProps = {
  previewText?: string
  onChoose: (format: QuizFormatChoice) => void
  onDismiss: () => void
}

export function QuizFormatChoiceModal({ previewText, onChoose, onDismiss }: QuizFormatChoiceModalProps) {
  const headingId = useId()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const options: QuizFormatChoice[] = ['markdown_mcq', 'interactive']

  return (
    <aside className="chat-quiz-format-sheet" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className="chat-quiz-format-sheet-inner">
        {previewText?.trim() ? (
          <p className="chat-quiz-format-preview">{previewText.trim()}</p>
        ) : null}
        <h2 id={headingId} className="chat-quiz-format-title">
          Welche Art von Fragen soll ich erstellen?
        </h2>
        <p className="chat-quiz-format-lead">
          Wähle ein Format — danach generiert die KI deine Anfrage.
        </p>
        <div className="chat-quiz-format-options" role="group" aria-label="Quiz-Format">
          {options.map((format) => {
            const meta = QUIZ_FORMAT_CHOICE_LABELS[format]
            return (
              <button
                key={format}
                type="button"
                className="chat-quiz-format-option"
                onClick={() => onChoose(format)}
              >
                <span className="chat-quiz-format-option-title">{meta.title}</span>
                <span className="chat-quiz-format-option-desc">{meta.description}</span>
              </button>
            )
          })}
        </div>
        <div className="chat-quiz-format-actions">
          <SecondaryButton type="button" onClick={() => onDismiss()}>
            Abbrechen
          </SecondaryButton>
        </div>
      </div>
    </aside>
  )
}
