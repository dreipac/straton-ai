import { useEffect, useRef, useState } from 'react'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import { isCategorizeQuestion, isMatchQuestion } from '../../chat/utils/interactiveQuiz'
import type { LearnWorksheetItem } from '../services/learn.persistence'
import {
  canSubmitWorksheetAnswer,
  worksheetItemToInteractiveQuestion,
  worksheetQuestionKindLabel,
} from '../utils/learnPageHelpers'
import { LearnEntryQuizMatch } from './LearnEntryQuizMatch'
import { LearnCategorizeQuestion } from './LearnCategorizeQuestion'

export type LearnWorksheetModalProps = {
  isMounted: boolean
  isVisible: boolean
  chapterTitle: string
  chapterLabel: string
  items: LearnWorksheetItem[]
  isLoading: boolean
  error: string | null
  onClose: () => void
  /** Persistiert Kreis-Prüfung im Lernpfad (Fortschritt / Freischaltung). */
  onItemEvaluated?: (itemId: string, payload: { correct: boolean; answer: string }) => void
  /** Speichert Antworttext (debounced), bleibt nach Schließen erhalten. */
  onSavedAnswerChange?: (itemId: string, answer: string) => void
  onSubmitWorksheet?: () => void
  submittedCount?: number
}

const ITEMS_PER_PAGE = 4

function seedAnswersFromItems(workItems: LearnWorksheetItem[]): Record<string, string> {
  const seed: Record<string, string> = {}
  for (const it of workItems) {
    if (typeof it.savedAnswer === 'string' && it.savedAnswer.length > 0) {
      seed[it.id] = it.savedAnswer
    }
  }
  return seed
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
  return (
    (item.questionType === 'mcq' || item.questionType === 'true_false') && (item.options?.length ?? 0) > 0
  )
}

export function LearnWorksheetModal(props: LearnWorksheetModalProps) {
  const {
    isMounted,
    isVisible,
    chapterTitle,
    chapterLabel,
    items,
    isLoading,
    error,
    onClose,
    onItemEvaluated,
    onSavedAnswerChange,
    onSubmitWorksheet,
    submittedCount = 0,
  } = props

  const [answersById, setAnswersById] = useState<Record<string, string>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({})
  const [correctById, setCorrectById] = useState<Record<string, boolean>>({})
  const [pageIndex, setPageIndex] = useState(0)
  const prevVisibleRef = useRef(false)
  const persistTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    return () => {
      Object.keys(persistTimersRef.current).forEach((key) => {
        window.clearTimeout(persistTimersRef.current[key])
      })
      persistTimersRef.current = {}
    }
  }, [])

  function schedulePersistSavedAnswer(itemId: string, text: string) {
    window.clearTimeout(persistTimersRef.current[itemId])
    persistTimersRef.current[itemId] = window.setTimeout(() => {
      onSavedAnswerChange?.(itemId, text)
      delete persistTimersRef.current[itemId]
    }, 650)
  }

  function setAnswer(itemId: string, value: string) {
    setAnswersById((prev) => ({ ...prev, [itemId]: value }))
    schedulePersistSavedAnswer(itemId, value)
  }

  useEffect(() => {
    if (!isVisible) {
      prevVisibleRef.current = false
      return
    }
    const opened = !prevVisibleRef.current
    if (opened) {
      prevVisibleRef.current = true
      setAnswersById(seedAnswersFromItems(items))
      setFeedbackById({})
      setCheckingId(null)
      setPageIndex(0)
      return
    }
    setAnswersById((prev) => {
      let changed = false
      const next = { ...prev }
      for (const it of items) {
        if (typeof it.savedAnswer === 'string' && it.savedAnswer.length > 0 && next[it.id] === undefined) {
          next[it.id] = it.savedAnswer
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [isVisible, items])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    setCorrectById(() => {
      const next: Record<string, boolean> = {}
      for (const item of items) {
        if (item.evaluated) {
          next[item.id] = item.lastCorrect ?? false
        }
      }
      return next
    })
  }, [isVisible, items])

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const pageStart = safePageIndex * ITEMS_PER_PAGE
  const pageItems = items.slice(pageStart, pageStart + ITEMS_PER_PAGE)
  const canSubmitWorksheet =
    items.length > 0 &&
    items.some((item) => canSubmitWorksheetAnswer(item, answersById[item.id] ?? item.savedAnswer ?? ''))

  useEffect(() => {
    if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex)
    }
  }, [pageIndex, safePageIndex])

  async function handleCheckItem(item: LearnWorksheetItem) {
    const answer = answersById[item.id] ?? ''
    if (!canSubmitWorksheetAnswer(item, answer) || checkingId) {
      return
    }
    setCheckingId(item.id)
    try {
      const result = await evaluateQuizAnswerWithAi({
        question: worksheetItemToInteractiveQuestion(item),
        userAnswer: answer.trim(),
      })
      setCorrectById((prev) => ({ ...prev, [item.id]: result.isCorrect }))
      setFeedbackById((prev) => ({ ...prev, [item.id]: result.feedback }))
      onItemEvaluated?.(item.id, { correct: result.isCorrect, answer: answer.trim() })
    } catch {
      setCorrectById((prev) => ({ ...prev, [item.id]: false }))
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: 'Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.',
      }))
      onItemEvaluated?.(item.id, { correct: false, answer: answer.trim() })
    } finally {
      setCheckingId(null)
    }
  }

  if (!isMounted) {
    return null
  }

  function renderWorksheetAnswer(item: LearnWorksheetItem, n: number) {
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

    const isLegacyLongText = !item.questionType
    return (
      <TextArea
        className={`learn-worksheet-answer-field${isLegacyLongText ? '' : ' learn-worksheet-answer-field--compact'}`}
        rows={isLegacyLongText ? 3 : 2}
        placeholder={item.questionType === 'text' ? 'Kurze Antwort (1–3 Sätze)…' : 'Antwort eingeben…'}
        autoComplete="off"
        value={answer}
        onChange={(e) => setAnswer(item.id, e.target.value)}
        aria-label={label}
        disabled={isChecking}
      />
    )
  }

  function renderWorksheetItem(item: LearnWorksheetItem, absoluteIndex: number) {
    const n = absoluteIndex + 1
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
    const checkDisabled =
      isChecking || doneCorrect || (!canSubmitWorksheetAnswer(item, answer) && !doneCorrect)

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
            className={`learn-worksheet-check-circle ${
              showEvalState ? (isCorrect ? 'is-correct' : 'is-incorrect') : ''
            } ${isChecking ? 'is-busy' : ''}`}
            aria-label={
              showEvalState && isCorrect ? `Aufgabe ${n} als korrekt geprüft` : `Antwort zu Aufgabe ${n} prüfen`
            }
            title={showEvalState && isCorrect ? 'Aufgabe wurde korrekt geprüft' : 'Antwort prüfen'}
            disabled={checkDisabled}
            onClick={() => void handleCheckItem(item)}
          >
            {showEvalState && isCorrect ? (
              <span className="learn-worksheet-check-glyph" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="learn-worksheet-check-svg"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
          </button>
        </div>
        {renderWorksheetAnswer(item, n)}
        {feedback ? (
          <p
            className={`learn-worksheet-eval-feedback ${
              isCorrect ? 'learn-worksheet-eval-feedback--ok' : 'learn-worksheet-eval-feedback--bad'
            }`}
          >
            {feedback}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-flashcards-modal-overlay" onRequestClose={onClose}>
      <section className="learn-flashcards-modal learn-worksheet-modal" role="dialog" aria-modal="true" aria-label="Lernblatt">
        <header className="learn-flashcards-modal-header">
          <h2>Lernblatt</h2>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Schließen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <div className="learn-flashcards-modal-body learn-worksheet-modal-body">
          {isLoading ? (
            <p className="learn-muted learn-flashcards-modal-status">Lernblatt wird erstellt…</p>
          ) : error ? (
            <p className="error-text learn-flashcards-modal-status">{error}</p>
          ) : items.length === 0 ? (
            <p className="learn-muted learn-flashcards-modal-status">Keine Aufgaben vorhanden.</p>
          ) : (
            <article className="learn-worksheet-content">
              <header className="learn-worksheet-content-header">
                <h3 className="learn-worksheet-content-title">{chapterTitle}</h3>
                <p className="learn-worksheet-content-subtitle">{chapterLabel}</p>
              </header>
              <div className="learn-worksheet-list" role="list">
                {pageItems.map((item, idx) => renderWorksheetItem(item, pageStart + idx))}
              </div>
              {totalPages > 1 ? (
                <div className="learn-worksheet-pagination">
                  <button
                    type="button"
                    className="thread-menu-item"
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={safePageIndex === 0}
                  >
                    Zurück
                  </button>
                  <span className="learn-worksheet-page-indicator">
                    Seite {safePageIndex + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="thread-menu-item"
                    onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePageIndex >= totalPages - 1}
                  >
                    Weiter
                  </button>
                </div>
              ) : null}
              <div className="learn-worksheet-submit-row">
                <p className="learn-worksheet-submit-hint">
                  {submittedCount > 0
                    ? `${submittedCount} Aufgaben abgegeben — wird für personalisierte Kapitel/Lernkarten genutzt.`
                    : 'Abgabe speichert deinen Lernstand für personalisierte Kapitel und Lernkarten.'}
                </p>
                <button
                  type="button"
                  className="thread-menu-item"
                  onClick={onSubmitWorksheet}
                  disabled={!canSubmitWorksheet}
                >
                  Arbeitsblatt abgeben
                </button>
              </div>
            </article>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
