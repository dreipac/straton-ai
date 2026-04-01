import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import type { EntryQuizResult } from '../services/learn.persistence'
import type { InteractiveQuizPayload, InteractiveQuizQuestion } from '../../chat/utils/interactiveQuiz'
import { isMatchAnswerComplete, isMatchQuestion } from '../../chat/utils/interactiveQuiz'
import { LearnEntryQuizMatch } from './LearnEntryQuizMatch'

function canProceedEntryAnswer(question: InteractiveQuizQuestion, answer: string): boolean {
  if (isMatchQuestion(question)) {
    return isMatchAnswerComplete(question, answer)
  }
  return answer.trim().length > 0
}

export type LearnEntryQuizModalProps = {
  isMounted: boolean
  isVisible: boolean
  effectiveTopic: string
  entryQuiz: InteractiveQuizPayload | null
  activeEntryQuestion: InteractiveQuizQuestion | null
  hasMultipleChoiceOptions: boolean
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  entryQuizQuestionIndex: number
  entryQuizTotalQuestions: number
  entryQuizProgressPercent: number
  activeEntryAnswer: string
  isLastEntryQuestion: boolean
  isSubmittingEntryQuiz: boolean
  onClose: () => void
  onEntryQuizAnswerChange: (questionId: string, value: string) => void
  onPreviousQuestion: () => void
  onNextQuestion: () => void
  onSubmit: () => void
}

export function LearnEntryQuizModal(props: LearnEntryQuizModalProps) {
  const {
    isMounted,
    isVisible,
    effectiveTopic,
    entryQuiz,
    activeEntryQuestion,
    hasMultipleChoiceOptions,
    entryQuizAnswers,
    entryQuizResult,
    entryQuizQuestionIndex,
    entryQuizTotalQuestions,
    entryQuizProgressPercent,
    activeEntryAnswer,
    isLastEntryQuestion,
    isSubmittingEntryQuiz,
    onClose,
    onEntryQuizAnswerChange,
    onPreviousQuestion,
    onNextQuestion,
    onSubmit,
  } = props

  if (!isMounted) {
    return null
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-entry-test-overlay">
      <section className="learn-entry-test-modal" role="dialog" aria-modal="true" aria-label="Einstiegstest">
        <header className="learn-entry-test-header">
          <div className="learn-entry-test-header-copy">
            <h2>{effectiveTopic || entryQuiz?.title || 'Thema'}</h2>
            <p>Einstiegstest</p>
          </div>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Einstiegstest schliessen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <div className="learn-entry-test-body">
          {!entryQuiz ? <p>Kein Einstiegstest verfuegbar.</p> : null}
          {activeEntryQuestion ? (
            <>
              <article key={activeEntryQuestion.id} className="learn-entry-test-question">
                <p className="learn-entry-test-prompt">{activeEntryQuestion.prompt}</p>
                {isMatchQuestion(activeEntryQuestion) && activeEntryQuestion.matchLeft && activeEntryQuestion.matchRight ? (
                  <LearnEntryQuizMatch
                    questionId={activeEntryQuestion.id}
                    matchLeft={activeEntryQuestion.matchLeft}
                    matchRight={activeEntryQuestion.matchRight}
                    value={entryQuizAnswers[activeEntryQuestion.id] ?? ''}
                    disabled={isSubmittingEntryQuiz}
                    onChange={(next) => onEntryQuizAnswerChange(activeEntryQuestion.id, next)}
                  />
                ) : hasMultipleChoiceOptions ? (
                  <div className="learn-entry-test-options" role="radiogroup" aria-label="Antwortoptionen">
                    {activeEntryQuestion.options?.map((option) => {
                      const isSelected = (entryQuizAnswers[activeEntryQuestion.id] ?? '').trim() === option
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`learn-entry-test-option ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => onEntryQuizAnswerChange(activeEntryQuestion.id, option)}
                          disabled={isSubmittingEntryQuiz}
                        >
                          <span className="learn-entry-test-option-radio" aria-hidden="true" />
                          <span className="learn-entry-test-option-text">{option}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <TextArea
                    value={entryQuizAnswers[activeEntryQuestion.id] ?? ''}
                    onChange={(event) => onEntryQuizAnswerChange(activeEntryQuestion.id, event.target.value)}
                    placeholder="Deine Antwort..."
                    disabled={isSubmittingEntryQuiz}
                  />
                )}
                {entryQuizResult?.feedbackByQuestionId[activeEntryQuestion.id] ? (
                  <p className="learn-entry-test-feedback">{entryQuizResult.feedbackByQuestionId[activeEntryQuestion.id]}</p>
                ) : null}
              </article>
            </>
          ) : null}
        </div>
        <footer className="learn-entry-test-footer">
          <div className="learn-entry-test-footer-meta">
            <div className="learn-entry-test-counter">
              Frage {Math.min(entryQuizQuestionIndex + 1, entryQuizTotalQuestions)} von {entryQuizTotalQuestions}
            </div>
            <div
              className="learn-entry-test-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(entryQuizProgressPercent)}
            >
              <span style={{ width: `${entryQuizProgressPercent}%` }} />
            </div>
            {entryQuizResult ? (
              <p className="learn-entry-test-score">
                Ergebnis: {entryQuizResult.score} / {entryQuizResult.total}
              </p>
            ) : null}
          </div>
          <div className="learn-entry-test-footer-actions">
            <SecondaryButton
              type="button"
              onClick={onPreviousQuestion}
              disabled={isSubmittingEntryQuiz || !activeEntryQuestion || entryQuizQuestionIndex === 0}
            >
              Zurück
            </SecondaryButton>
            {isLastEntryQuestion ? (
              <PrimaryButton
                type="button"
                onClick={() => {
                  void onSubmit()
                }}
                disabled={
                  !entryQuiz ||
                  isSubmittingEntryQuiz ||
                  !activeEntryQuestion ||
                  !canProceedEntryAnswer(activeEntryQuestion, activeEntryAnswer)
                }
              >
                {isSubmittingEntryQuiz ? 'Wird abgegeben...' : 'Abgeben'}
              </PrimaryButton>
            ) : (
              <PrimaryButton
                type="button"
                onClick={onNextQuestion}
                disabled={
                  isSubmittingEntryQuiz ||
                  !activeEntryQuestion ||
                  !canProceedEntryAnswer(activeEntryQuestion, activeEntryAnswer)
                }
              >
                Nächste Frage
              </PrimaryButton>
            )}
          </div>
        </footer>
      </section>
    </ModalShell>
  )
}
