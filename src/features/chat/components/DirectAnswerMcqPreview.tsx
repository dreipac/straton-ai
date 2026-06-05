import type { DirectAnswerMcqOption } from '../utils/directAnswerMcq'
import { renderAssistantInline } from '../utils/markdownInline'

export type DirectAnswerMcqPreviewProps = {
  prompt: string
  options: DirectAnswerMcqOption[]
  correctLetter: string | null
  isStreaming?: boolean
}

export function DirectAnswerMcqPreview({
  prompt,
  options,
  correctLetter,
  isStreaming = false,
}: DirectAnswerMcqPreviewProps) {
  return (
    <section
      className="chat-mcq-block chat-mcq-block--direct-answer"
      aria-label="Multiple Choice — Lösung"
    >
      <p className="chat-mcq-heading">Lösung</p>
      <div className="chat-mcq-question">
        <span className="chat-mcq-number" aria-hidden="true">
          1
        </span>
        <p className="chat-mcq-prompt">{renderAssistantInline(prompt)}</p>
      </div>
      <ul className="chat-mcq-options" role="list" aria-label="Antwortmöglichkeiten">
        {options.map((option) => {
          const isCorrect = correctLetter !== null && option.letter === correctLetter
          const isPending = isStreaming && correctLetter === null
          return (
            <li key={option.letter} className="chat-mcq-option-item">
              <div
                className={[
                  'chat-mcq-option',
                  'chat-mcq-option--static',
                  isCorrect ? 'is-correct-answer is-checked' : '',
                  isPending ? 'is-pending' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isCorrect ? 'true' : undefined}
              >
                <span className="chat-mcq-checkbox" aria-hidden="true" />
                <span className="chat-mcq-option-letter">{option.letter}</span>
                <span className="chat-mcq-option-text">{renderAssistantInline(option.text)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      {correctLetter ? (
        <p className="chat-mcq-direct-answer-badge" aria-live="polite">
          Richtige Antwort: <strong>{correctLetter}</strong>
        </p>
      ) : isStreaming ? (
        <p className="chat-mcq-direct-answer-badge chat-mcq-direct-answer-badge--pending">
          Lösung wird ermittelt…
        </p>
      ) : null}
    </section>
  )
}
