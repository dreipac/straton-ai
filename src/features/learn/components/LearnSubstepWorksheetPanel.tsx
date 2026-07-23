import { useState } from 'react'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import { evaluatePlaceholderAnswer } from '../utils/learnPlaceholder'
import { isCategorizeQuestion, isMatchQuestion } from '../../chat/utils/interactiveQuiz'
import type { LearnWorksheetItem } from '../services/learn.persistence'
import { canSubmitWorksheetAnswer, worksheetItemToInteractiveQuestion, worksheetQuestionKindLabel } from '../utils/learnPageHelpers'
import { LearnEntryQuizMatch } from './LearnEntryQuizMatch'
import { LearnCategorizeQuestion } from './LearnCategorizeQuestion'

/** Abschluss-Arbeitsblatt eines Zwischenschritts, inline im Themen-Flow (kein Modal, keine Seiten) — Pflicht:
 *  erst wenn jede Aufgabe per Kreis geprüft wurde, gilt der Zwischenschritt als abgeschlossen. */
export type LearnSubstepWorksheetPanelProps = {
  items: LearnWorksheetItem[]
  isLoading: boolean
  error: string | null
  onItemEvaluated: (itemId: string, payload: { correct: boolean; answer: string }) => void
  onSavedAnswerChange: (itemId: string, answer: string) => void
  onFinish: () => void
  useLocalEvaluation?: boolean
}

/** Entfernt führende Nummerierung von der KI (z. B. «1.» oder «2)»), damit nicht «1. 1. …» entsteht. */
function displayPrompt(raw: string): string {
  let t = raw.trim()
  for (let i = 0; i < 4; i += 1) {
    const next = t.replace(/^\s*\d+[.)]\s*/, '').trim()
    if (next === t) {
      break
    }
    t = next
  }
  return t
}

function worksheetHasChoiceOptions(item: LearnWorksheetItem): boolean {
  return (item.questionType === 'mcq' || item.questionType === 'true_false') && (item.options?.length ?? 0) > 0
}

export function LearnSubstepWorksheetPanel(props: LearnSubstepWorksheetPanelProps) {
  const { items, isLoading, error, onItemEvaluated, onSavedAnswerChange, onFinish, useLocalEvaluation = false } = props

  const [answersById, setAnswersById] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const item of items) {
      if (typeof item.savedAnswer === 'string' && item.savedAnswer.length > 0) {
        seed[item.id] = item.savedAnswer
      }
    }
    return seed
  })
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({})
  const [correctById, setCorrectById] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {}
    for (const item of items) {
      if (item.evaluated) {
        seed[item.id] = item.lastCorrect ?? false
      }
    }
    return seed
  })

  function setAnswer(itemId: string, value: string) {
    setAnswersById((prev) => ({ ...prev, [itemId]: value }))
    onSavedAnswerChange(itemId, value)
  }

  async function handleCheckItem(item: LearnWorksheetItem) {
    const answer = answersById[item.id] ?? ''
    if (!canSubmitWorksheetAnswer(item, answer) || checkingId) {
      return
    }
    setCheckingId(item.id)
    try {
      const result = useLocalEvaluation
        ? evaluatePlaceholderAnswer(worksheetItemToInteractiveQuestion(item), answer.trim())
        : await evaluateQuizAnswerWithAi({
            question: worksheetItemToInteractiveQuestion(item),
            userAnswer: answer.trim(),
          })
      setCorrectById((prev) => ({ ...prev, [item.id]: result.isCorrect }))
      setFeedbackById((prev) => ({ ...prev, [item.id]: result.feedback }))
      onItemEvaluated(item.id, { correct: result.isCorrect, answer: answer.trim() })
    } catch {
      setCorrectById((prev) => ({ ...prev, [item.id]: false }))
      setFeedbackById((prev) => ({ ...prev, [item.id]: 'Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.' }))
      onItemEvaluated(item.id, { correct: false, answer: answer.trim() })
    } finally {
      setCheckingId(null)
    }
  }

  function renderAnswer(item: LearnWorksheetItem, n: number) {
    const label = `Antwort zu Aufgabe ${n}`
    const answer = answersById[item.id] ?? ''
    const isChecking = checkingId === item.id
    const question = worksheetItemToInteractiveQuestion(item)

    if (isMatchQuestion(question) && question.matchLeft && question.matchRight) {
      return (
        <LearnEntryQuizMatch
          questionId={item.id}
          matchLeft={question.matchLeft}
          matchRight={question.matchRight}
          value={answer}
          disabled={isChecking}
          onChange={(next) => setAnswer(item.id, next)}
        />
      )
    }

    if (isCategorizeQuestion(question) && question.categories && question.items) {
      return (
        <LearnCategorizeQuestion
          questionId={item.id}
          categories={question.categories}
          items={question.items}
          value={answer}
          disabled={isChecking}
          onChange={(next) => setAnswer(item.id, next)}
        />
      )
    }

    if (worksheetHasChoiceOptions(item)) {
      return (
        <div className="learn-entry-test-options learn-worksheet-options" role="radiogroup" aria-label={label}>
          {item.options?.map((option) => {
            const isSelected = answer.trim() === option
            return (
              <button
                key={option}
                type="button"
                className={`learn-entry-test-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setAnswer(item.id, option)}
                disabled={isChecking}
              >
                <span className="learn-entry-test-option-radio" aria-hidden="true" />
                <span className="learn-entry-test-option-text">{option}</span>
              </button>
            )
          })}
        </div>
      )
    }

    return (
      <TextArea
        className="learn-worksheet-answer-field learn-worksheet-answer-field--compact"
        rows={2}
        placeholder={item.questionType === 'text' ? 'Kurze Antwort (1–3 Sätze)…' : 'Antwort eingeben…'}
        autoComplete="off"
        value={answer}
        onChange={(e) => setAnswer(item.id, e.target.value)}
        aria-label={label}
        disabled={isChecking}
      />
    )
  }

  function renderItem(item: LearnWorksheetItem, index: number) {
    const n = index + 1
    const feedback = feedbackById[item.id]
    const isChecking = checkingId === item.id
    const hasLiveFeedback = feedback !== undefined
    const hasPersistedEval = item.evaluated === true
    const showEvalState = hasLiveFeedback || hasPersistedEval
    const isCorrect = hasLiveFeedback
      ? correctById[item.id] === true
      : item.lastCorrect === true || correctById[item.id] === true
    const doneCorrect =
      (item.evaluated === true && (item.lastCorrect === true || correctById[item.id] === true)) ||
      (hasLiveFeedback && correctById[item.id] === true)
    const answer = answersById[item.id] ?? ''
    const checkDisabled = isChecking || doneCorrect || (!canSubmitWorksheetAnswer(item, answer) && !doneCorrect)

    return (
      <div key={item.id} className="learn-worksheet-item" role="listitem">
        <div className="learn-worksheet-prompt-row">
          <span className="learn-worksheet-num">{n}</span>
          <div className="learn-worksheet-prompt-copy">
            <p className="learn-worksheet-kind">{worksheetQuestionKindLabel(item)}</p>
            <p className="learn-worksheet-prompt">{displayPrompt(item.prompt)}</p>
          </div>
          <button
            type="button"
            className={`learn-worksheet-check-circle ${showEvalState ? (isCorrect ? 'is-correct' : 'is-incorrect') : ''} ${isChecking ? 'is-busy' : ''}`}
            aria-label={showEvalState && isCorrect ? `Aufgabe ${n} als korrekt geprüft` : `Antwort zu Aufgabe ${n} prüfen`}
            title={showEvalState && isCorrect ? 'Aufgabe wurde korrekt geprüft' : 'Antwort prüfen'}
            disabled={checkDisabled}
            onClick={() => void handleCheckItem(item)}
          >
            {showEvalState && isCorrect ? (
              <span className="learn-worksheet-check-glyph" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="learn-worksheet-check-svg">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
          </button>
        </div>
        {renderAnswer(item, n)}
        {feedback ? (
          <p className={`learn-worksheet-eval-feedback ${isCorrect ? 'learn-worksheet-eval-feedback--ok' : 'learn-worksheet-eval-feedback--bad'}`}>
            {feedback}
          </p>
        ) : null}
      </div>
    )
  }

  const allEvaluated =
    items.length > 0 && items.every((item) => item.evaluated === true || correctById[item.id] !== undefined)

  return (
    <div className="learn-chapter-topic-special learn-substep-worksheet-panel">
      {isLoading ? (
        <>
          <div className="learn-chapter-topic-analyzing-orb" aria-hidden="true" />
          <h2 className="learn-chapter-topic-landing-title">Abschluss-Arbeitsblatt wird erstellt …</h2>
        </>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : items.length === 0 ? (
        <p className="learn-muted">Keine Aufgaben vorhanden.</p>
      ) : (
        <article className="learn-worksheet-content">
          <div className="learn-worksheet-list" role="list">
            {items.map((item, index) => renderItem(item, index))}
          </div>
          <div className="learn-chapter-modal-footer-actions">
            <PrimaryButton type="button" onClick={onFinish} disabled={!allEvaluated}>
              Zwischenschritt abschließen
            </PrimaryButton>
          </div>
        </article>
      )}
    </div>
  )
}
