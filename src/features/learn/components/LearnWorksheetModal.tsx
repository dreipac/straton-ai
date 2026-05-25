import { useEffect, useRef, useState } from 'react'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { evaluateQuizAnswerWithAi } from '../../chat/services/chat.service'
import type { LearnWorksheetItem } from '../services/learn.persistence'
import type { InteractiveQuizQuestion } from '../../chat/utils/interactiveQuiz'

export type LearnWorksheetModalProps = {
  isMounted: boolean
  isVisible: boolean
  title: string
  items: LearnWorksheetItem[]
  isLoading: boolean
  error: string | null
  onClose: () => void
  /** Persistiert Kreis-Prüfung im Lernpfad (Fortschritt / Freischaltung). */
  onItemEvaluated?: (itemId: string, payload: { correct: boolean; answer: string }) => void
  /** Speichert Antworttext (debounced), bleibt nach Schließen erhalten. */
  onSavedAnswerChange?: (itemId: string, answer: string) => void
}

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

function worksheetItemToEvalQuestion(item: LearnWorksheetItem): InteractiveQuizQuestion {
  return {
    id: item.id,
    prompt: item.prompt,
    questionType: 'text',
    expectedAnswer:
      'Die Antwort soll die Aufgabenstellung inhaltlich angemessen und fachlich plausibel bearbeiten (je nach Aufgabe: Begriffe, Beispiele, kurze Begründung oder Rechenschritte).',
    acceptableAnswers: [],
    evaluation: 'contains',
  }
}

export function LearnWorksheetModal(props: LearnWorksheetModalProps) {
  const { isMounted, isVisible, title, items, isLoading, error, onClose, onItemEvaluated, onSavedAnswerChange } =
    props
  const [answersById, setAnswersById] = useState<Record<string, string>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({})
  const [correctById, setCorrectById] = useState<Record<string, boolean>>({})
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

  async function handleCheckItem(item: LearnWorksheetItem) {
    const answer = (answersById[item.id] ?? '').trim()
    if (!answer || checkingId) {
      return
    }
    setCheckingId(item.id)
    try {
      const result = await evaluateQuizAnswerWithAi({
        question: worksheetItemToEvalQuestion(item),
        userAnswer: answer,
      })
      setCorrectById((prev) => ({ ...prev, [item.id]: result.isCorrect }))
      setFeedbackById((prev) => ({ ...prev, [item.id]: result.feedback }))
      onItemEvaluated?.(item.id, { correct: result.isCorrect, answer })
    } catch {
      setCorrectById((prev) => ({ ...prev, [item.id]: false }))
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: 'Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.',
      }))
      onItemEvaluated?.(item.id, { correct: false, answer })
    } finally {
      setCheckingId(null)
    }
  }

  if (!isMounted) {
    return null
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-flashcards-modal-overlay" onRequestClose={onClose}>
      <section className="learn-flashcards-modal" role="dialog" aria-modal="true" aria-label="Lernblatt">
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
                <h3 className="learn-worksheet-content-title">Lernblatt</h3>
                <p className="learn-worksheet-content-subtitle">{title}</p>
              </header>
              <div className="learn-worksheet-list" role="list">
                {items.map((item, index) => {
                  const n = index + 1
                  const label = `Antwort zu Aufgabe ${n}`
                  const feedback = feedbackById[item.id]
                  const isChecking = checkingId === item.id
                  const hasLiveFeedback = feedback !== undefined
                  const hasPersistedEval = item.evaluated === true
                  const showEvalState = hasLiveFeedback || hasPersistedEval
                  const isCorrect = hasLiveFeedback
                    ? correctById[item.id] === true
                    : item.lastCorrect === true || correctById[item.id] === true
                  const doneCorrect =
                    (item.evaluated === true &&
                      (item.lastCorrect === true || correctById[item.id] === true)) ||
                    (hasLiveFeedback && correctById[item.id] === true)
                  const checkDisabled =
                    isChecking ||
                    doneCorrect ||
                    (!(answersById[item.id] ?? '').trim() && !doneCorrect)
                  return (
                    <div key={item.id} className="learn-worksheet-item" role="listitem">
                      <div className="learn-worksheet-prompt-row">
                        <span className="learn-worksheet-num">{n}</span>
                        <p className="learn-worksheet-prompt">{displayPrompt(item.prompt)}</p>
                        <button
                          type="button"
                          className={`learn-worksheet-check-circle ${
                            showEvalState ? (isCorrect ? 'is-correct' : 'is-incorrect') : ''
                          } ${isChecking ? 'is-busy' : ''}`}
                          aria-label={
                            showEvalState && isCorrect
                              ? `Aufgabe ${n} als korrekt geprüft`
                              : `Antwort zu Aufgabe ${n} prüfen`
                          }
                          title={
                            showEvalState && isCorrect ? 'Aufgabe wurde korrekt geprüft' : 'Antwort prüfen'
                          }
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
                      <TextArea
                        className="learn-worksheet-answer-field"
                        rows={4}
                        placeholder="Antwort eingeben…"
                        autoComplete="off"
                        value={answersById[item.id] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setAnswersById((prev) => ({ ...prev, [item.id]: v }))
                          schedulePersistSavedAnswer(item.id, v)
                        }}
                        aria-label={label}
                      />
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
                })}
              </div>
            </article>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
