import type { AnimationEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import infoIcon from '../../../assets/icons/info.svg'
import newMessageIcon from '../../../assets/icons/newMessage.svg'
import { sendLearnChapterHelpMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { isMatchAnswerComplete } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterStep } from '../services/learn.persistence'
import { chapterQuestionToInteractiveQuestion } from '../utils/learnPageHelpers'
import { LearnEntryQuizMatch } from './LearnEntryQuizMatch'

function getPriorExplanationContext(blueprint: ChapterBlueprint | null, currentStep: ChapterStep | null): string | null {
  if (!blueprint?.steps.length || !currentStep || currentStep.type !== 'question') {
    return null
  }
  const idx = blueprint.steps.findIndex((s) => s.id === currentStep.id)
  if (idx < 0) {
    return null
  }
  for (let i = idx - 1; i >= 0; i -= 1) {
    const step = blueprint.steps[i]
    if (step?.type === 'explanation') {
      const chunks: string[] = []
      if (step.content?.trim()) {
        chunks.push(step.content.trim())
      }
      if (step.bullets?.length) {
        chunks.push(step.bullets.map((b) => `• ${b}`).join('\n'))
      }
      const combined = chunks.join('\n\n')
      if (!combined.trim()) {
        continue
      }
      const max = 480
      const clipped = combined.length > max ? `${combined.slice(0, max).trim()}…` : combined
      return `Aus der vorherigen Erklärung in diesem Kapitel:\n\n${clipped}`
    }
  }
  return null
}

function buildLearnChapterHelpContext(
  blueprint: ChapterBlueprint | null,
  step: ChapterStep | null,
  stepIndex: number,
  totalSteps: number,
): string {
  const lines: string[] = []
  if (blueprint?.title) {
    lines.push(`Kapitel: ${blueprint.title}`)
  }
  lines.push(`Schritt ${stepIndex + 1} von ${Math.max(1, totalSteps)} in diesem Kapitel.`)
  if (!step) {
    return lines.join('\n\n')
  }
  if (step.type === 'question') {
    const kind =
      step.questionType === 'mcq'
        ? 'Multiple Choice'
        : step.questionType === 'match'
          ? 'Zuordnung'
          : step.questionType === 'true_false'
            ? 'Wahr/Falsch'
            : 'Freitext'
    lines.push(`Aktueller Schritt: Frage (${kind})`)
    lines.push(`Frage: ${step.prompt}`)
    if (step.questionType === 'mcq' && step.options && step.options.length > 0) {
      lines.push(`Optionen:\n${step.options.map((o) => `• ${o}`).join('\n')}`)
    }
    if (step.questionType === 'true_false' && step.options && step.options.length > 0) {
      lines.push(`Optionen:\n${step.options.map((o) => `• ${o}`).join('\n')}`)
    }
    if (step.questionType === 'match' && step.matchLeft?.length && step.matchRight?.length) {
      lines.push(
        `Zuordnung links:\n${step.matchLeft.map((o) => `• ${o}`).join('\n')}\nrechts:\n${step.matchRight.map((o) => `• ${o}`).join('\n')}`,
      )
    }
  } else {
    lines.push(`Aktueller Schritt: ${step.type === 'recap' ? 'Zusammenfassung' : 'Erklärung'}`)
    if (step.title) {
      lines.push(`Titel: ${step.title}`)
    }
    if (step.content?.trim()) {
      lines.push(`Inhalt:\n${step.content.trim()}`)
    }
    if (step.bullets && step.bullets.length > 0) {
      lines.push(`Stichpunkte:\n${step.bullets.map((b) => `• ${b}`).join('\n')}`)
    }
  }
  return lines.join('\n\n')
}

function buildQuestionInfoPanelText(blueprint: ChapterBlueprint | null, step: ChapterStep | null): string {
  if (!step || step.type !== 'question') {
    return ''
  }
  const direct = step.hint?.trim() || step.explanation?.trim()
  if (direct) {
    return direct
  }
  const prior = getPriorExplanationContext(blueprint, step)
  if (prior) {
    return prior
  }
  if (step.questionType === 'mcq') {
    return 'Wähle die passende Option. Wenn du unsicher bist: schließe zuerst eindeutig falsche Antworten aus.'
  }
  if (step.questionType === 'true_false') {
    return 'Entscheide dich für Wahr oder Falsch. Achte auf Formulierungen wie «immer», «nie» — oft sind sie ein Hinweis.'
  }
  if (step.questionType === 'match') {
    return 'Ordne jeden Begriff links der passenden Spalte rechts zu. Ziehe die Karten per Drag-and-Drop.'
  }
  return 'Formuliere eine kurze, sachliche Antwort direkt zur Frage. Achte auf Fachbegriffe und — wo nötig — auf Format und Einheit (z. B. bei Adressen oder Zahlen).'
}

function chapterQuestionKindLabel(step: ChapterStep): string {
  if (step.type !== 'question') {
    return ''
  }
  if (step.questionType === 'mcq') {
    return 'Interaktive Multiple-Choice Frage'
  }
  if (step.questionType === 'true_false') {
    return 'Wahr oder Falsch'
  }
  if (step.questionType === 'match') {
    return 'Zuordnungsaufgabe'
  }
  return 'Interaktive Freitext Frage'
}

function canSubmitChapterQuestionAnswer(step: ChapterStep | null, answer: string): boolean {
  if (!step || step.type !== 'question') {
    return false
  }
  if (step.questionType === 'match' && step.matchLeft && step.matchRight) {
    return isMatchAnswerComplete(chapterQuestionToInteractiveQuestion(step), answer)
  }
  return answer.trim().length > 0
}

export type LearnChapterModalProps = {
  isMounted: boolean
  isVisible: boolean
  onClose: () => void
  activeChapterBlueprint: ChapterBlueprint | null
  safeChapterIndex: number
  effectiveChapterCount: number
  safeChapterStepIndex: number
  chapterProgressPercent: number
  activeChapterStep: ChapterStep | null
  currentChapterAnswer: string
  currentChapterFeedback: string
  currentChapterIsCorrect: boolean | undefined
  hasCurrentChapterEvaluation: boolean
  isEvaluatingChapterStep: boolean
  onChapterAnswerChange: (stepId: string, value: string) => void
  onSelectMcqOption: (stepId: string, option: string) => void
  onPreviousChapterStep: () => void
  onEvaluateChapterQuestion: () => void
  onNextChapterStep: () => void
}

export function LearnChapterModal(props: LearnChapterModalProps) {
  const {
    isMounted,
    isVisible,
    onClose,
    activeChapterBlueprint,
    safeChapterIndex,
    effectiveChapterCount,
    safeChapterStepIndex,
    chapterProgressPercent,
    activeChapterStep,
    currentChapterAnswer,
    currentChapterFeedback,
    currentChapterIsCorrect,
    hasCurrentChapterEvaluation,
    isEvaluatingChapterStep,
    onChapterAnswerChange,
    onSelectMcqOption,
    onPreviousChapterStep,
    onEvaluateChapterQuestion,
    onNextChapterStep,
  } = props

  const [hintPopoverMounted, setHintPopoverMounted] = useState(false)
  const [hintPopoverClosing, setHintPopoverClosing] = useState(false)
  const [hintPopoverStepId, setHintPopoverStepId] = useState<string | null>(null)
  const hintAnchorRef = useRef<HTMLDivElement>(null)
  const activeStepId = activeChapterStep?.id ?? null
  const isHintPopoverOpen = hintPopoverMounted && !hintPopoverClosing && hintPopoverStepId === activeStepId

  const requestCloseHintPopover = () => {
    if (!isHintPopoverOpen || hintPopoverClosing) {
      return
    }
    setHintPopoverClosing(true)
  }

  const handleHintPopoverAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (!hintPopoverClosing) {
      return
    }
    setHintPopoverClosing(false)
    setHintPopoverMounted(false)
    setHintPopoverStepId(null)
  }

  useEffect(() => {
    if (!isHintPopoverOpen || hintPopoverClosing) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isHintPopoverOpen || hintPopoverClosing) {
          return
        }
        setHintPopoverClosing(true)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      const el = hintAnchorRef.current
      if (!el || el.contains(event.target as Node)) {
        return
      }
      if (!isHintPopoverOpen || hintPopoverClosing) {
        return
      }
      setHintPopoverClosing(true)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isHintPopoverOpen, hintPopoverClosing])

  const questionInfoPanelText =
    activeChapterStep?.type === 'question'
      ? buildQuestionInfoPanelText(activeChapterBlueprint, activeChapterStep)
      : ''

  const [isHelpChatOpen, setIsHelpChatOpen] = useState(false)
  const [helpMessages, setHelpMessages] = useState<ChatMessage[]>([])
  const [helpDraft, setHelpDraft] = useState('')
  const [isHelpSending, setIsHelpSending] = useState(false)
  const [helpError, setHelpError] = useState<string | null>(null)
  const helpScrollRef = useRef<HTMLDivElement>(null)

  const chapterStepTotal = Math.max(1, activeChapterBlueprint?.steps.length ?? 1)

  useEffect(() => {
    setHelpMessages([])
    setHelpDraft('')
    setHelpError(null)
    setIsHelpChatOpen(false)
  }, [activeChapterBlueprint?.id])

  useEffect(() => {
    if (!isHelpChatOpen) {
      return
    }
    const el = helpScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [helpMessages, isHelpChatOpen, isHelpSending])

  async function sendHelpMessage() {
    const trimmed = helpDraft.trim()
    if (!trimmed || isHelpSending) {
      return
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    const nextThread = [...helpMessages, userMessage]
    setHelpMessages(nextThread)
    setHelpDraft('')
    setHelpError(null)
    setIsHelpSending(true)
    try {
      const context = buildLearnChapterHelpContext(
        activeChapterBlueprint,
        activeChapterStep,
        safeChapterStepIndex,
        chapterStepTotal,
      )
      const { assistantMessage } = await sendLearnChapterHelpMessage(nextThread, context)
      setHelpMessages([...nextThread, assistantMessage])
    } catch (err) {
      setHelpError(err instanceof Error ? err.message : 'Die Anfrage ist fehlgeschlagen.')
    } finally {
      setIsHelpSending(false)
    }
  }

  if (!isMounted) {
    return null
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-chapter-modal-overlay" onRequestClose={onClose}>
      <section
        className={`learn-chapter-modal${isHelpChatOpen ? ' learn-chapter-modal--help-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Lernkapitel"
      >
        <header className="learn-chapter-modal-header">
          <div className="learn-chapter-modal-header-copy">
            <h2>{activeChapterBlueprint?.title || 'Lernkapitel'}</h2>
            <p>
              Kapitel {safeChapterIndex + 1} von {Math.max(1, effectiveChapterCount)}
            </p>
          </div>
          <div className="learn-chapter-modal-header-actions">
            <button
              type="button"
              className={`learn-chapter-help-toggle ${isHelpChatOpen ? 'is-active' : ''}`}
              onClick={() => setIsHelpChatOpen((v) => !v)}
              aria-pressed={isHelpChatOpen}
              aria-expanded={isHelpChatOpen}
              title="KI-Hilfe zum aktuellen Schritt"
            >
              <img src={newMessageIcon} alt="" width={18} height={18} aria-hidden="true" />
              <span>Fragen</span>
            </button>
            <button type="button" className="settings-close-button" onClick={onClose} aria-label="Lernkapitel schließen">
              <span className="ui-icon settings-close-icon" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="learn-chapter-modal-main">
          {isHelpChatOpen ? (
            <aside className="learn-chapter-help-chat" aria-label="Hilfe-Chat zum Kapitel">
              <div className="learn-chapter-help-chat-header">
                <p className="learn-chapter-help-chat-title">Hilfe zum Schritt</p>
                <p className="learn-chapter-help-chat-sub">
                  Modell: GPT-5.4 mini — stelle Fragen zum aktuellen Inhalt.
                </p>
              </div>
              <div ref={helpScrollRef} className="learn-chapter-help-chat-messages" role="log" aria-live="polite">
                {helpMessages.length === 0 ? (
                  <p className="learn-chapter-help-chat-empty">
                    Wenn etwas unklar ist, formuliere hier deine Frage. Die KI bezieht sich auf den aktuellen Schritt.
                  </p>
                ) : (
                  helpMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`learn-chapter-help-bubble ${m.role === 'user' ? 'learn-chapter-help-bubble--user' : 'learn-chapter-help-bubble--assistant'}`}
                    >
                      <p className="learn-chapter-help-bubble-text">{m.content}</p>
                    </div>
                  ))
                )}
                {isHelpSending ? (
                  <p className="learn-chapter-help-chat-thinking" aria-live="assertive">
                    Antwort wird erstellt…
                  </p>
                ) : null}
              </div>
              {helpError ? <p className="learn-chapter-help-chat-error">{helpError}</p> : null}
              <div className="learn-chapter-help-chat-input-row">
                <TextArea
                  value={helpDraft}
                  onChange={(e) => setHelpDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendHelpMessage()
                    }
                  }}
                  placeholder="Frage zum aktuellen Schritt…"
                  disabled={isHelpSending}
                  rows={2}
                  className="learn-chapter-help-chat-textarea"
                />
                <PrimaryButton
                  type="button"
                  className="learn-chapter-help-chat-send"
                  onClick={() => {
                    void sendHelpMessage()
                  }}
                  disabled={isHelpSending || !helpDraft.trim()}
                >
                  Senden
                </PrimaryButton>
              </div>
            </aside>
          ) : null}
          <div className="learn-chapter-modal-column">
            <div className="learn-chapter-modal-body">
          {!activeChapterStep ? (
            <p className="learn-muted">Keine Schritte verfuegbar.</p>
          ) : activeChapterStep.type === 'question' ? (
            <article className="learn-chapter-step-card">
              <p className="learn-chapter-step-label">{chapterQuestionKindLabel(activeChapterStep)}</p>
              <h3>{activeChapterStep.prompt}</h3>
              {activeChapterStep.questionType === 'match' &&
              activeChapterStep.matchLeft &&
              activeChapterStep.matchRight ? (
                <LearnEntryQuizMatch
                  questionId={activeChapterStep.id}
                  matchLeft={activeChapterStep.matchLeft}
                  matchRight={activeChapterStep.matchRight}
                  value={currentChapterAnswer}
                  disabled={isEvaluatingChapterStep}
                  onChange={(next) => onChapterAnswerChange(activeChapterStep.id, next)}
                />
              ) : (activeChapterStep.questionType === 'mcq' || activeChapterStep.questionType === 'true_false') &&
                (activeChapterStep.options?.length ?? 0) > 0 ? (
                <div className="learn-entry-test-options" role="radiogroup" aria-label="Antwortoptionen Kapitel">
                  {activeChapterStep.options?.map((option) => {
                    const isSelected = currentChapterAnswer.trim() === option
                    const normalizedOption = option.trim().toLowerCase()
                    const normalizedExpected = activeChapterStep.expectedAnswer.trim().toLowerCase()
                    const normalizedAcceptable = (activeChapterStep.acceptableAnswers ?? []).map((entry) => entry.trim().toLowerCase())
                    const isCorrectOption =
                      normalizedOption === normalizedExpected || normalizedAcceptable.includes(normalizedOption)
                    const isWrongSelection = hasCurrentChapterEvaluation && currentChapterIsCorrect === false && isSelected
                    const showCorrectOption = hasCurrentChapterEvaluation && isCorrectOption
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`learn-entry-test-option ${isSelected ? 'is-selected' : ''} ${isWrongSelection ? 'is-wrong' : ''} ${
                          showCorrectOption ? 'is-correct' : ''
                        }`}
                        onClick={() => onSelectMcqOption(activeChapterStep.id, option)}
                        disabled={isEvaluatingChapterStep}
                      >
                        <span className="learn-entry-test-option-radio" aria-hidden="true" />
                        <span className="learn-entry-test-option-text">{option}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <TextArea
                  value={currentChapterAnswer}
                  onChange={(event) => onChapterAnswerChange(activeChapterStep.id, event.target.value)}
                  placeholder="Deine Antwort..."
                  disabled={isEvaluatingChapterStep}
                />
              )}
              {currentChapterFeedback ? (
                <p
                  className={`learn-entry-test-feedback ${
                    hasCurrentChapterEvaluation && currentChapterIsCorrect === false ? 'is-error' : 'is-success'
                  }`}
                >
                  {currentChapterFeedback}
                </p>
              ) : null}
            </article>
          ) : (
            <article className="learn-chapter-step-card">
              <p className="learn-chapter-step-label">{activeChapterStep.type === 'recap' ? 'Zusammenfassung' : 'Erklärung'}</p>
              <h3>{activeChapterStep.title}</h3>
              <p>{activeChapterStep.content}</p>
              {activeChapterStep.bullets && activeChapterStep.bullets.length > 0 ? (
                <ul className="learn-chapter-step-bullets">
                  {activeChapterStep.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          )}
            </div>
            <footer className="learn-chapter-modal-footer">
          <div className="learn-chapter-modal-footer-start">
            <div className="learn-chapter-modal-footer-start-row">
              {activeChapterStep?.type === 'question' ? (
                <div ref={hintAnchorRef} className="learn-chapter-step-info-anchor">
                  <button
                    type="button"
                    className={`learn-chapter-step-info-button ${isHintPopoverOpen ? 'is-open' : ''}`}
                    onClick={() => {
                      if (isHintPopoverOpen) {
                        requestCloseHintPopover()
                        return
                      }
                      setHintPopoverStepId(activeStepId)
                      setHintPopoverMounted(true)
                      setHintPopoverClosing(false)
                    }}
                    aria-expanded={isHintPopoverOpen}
                    aria-controls="learn-chapter-step-hint-popover"
                    title="Tipp zur Frage"
                  >
                    <img src={infoIcon} alt="" className="learn-chapter-step-info-icon" width={20} height={20} aria-hidden="true" />
                  </button>
                  {hintPopoverMounted && hintPopoverStepId === activeStepId ? (
                    <div
                      id="learn-chapter-step-hint-popover"
                      className={`learn-chapter-hint-popover learn-chapter-hint-popover--above ${hintPopoverClosing ? 'is-closing' : ''}`}
                      role="dialog"
                      aria-label="Tipp zur Frage"
                      onAnimationEnd={handleHintPopoverAnimationEnd}
                    >
                      <div className="learn-chapter-hint-popover-card">
                        <div className="learn-chapter-hint-popover-body">
                          <div className="learn-chapter-hint-popover-icon-badge" aria-hidden="true">
                            <img src={infoIcon} alt="" width={18} height={18} />
                          </div>
                          <p className="learn-chapter-hint-popover-text">{questionInfoPanelText}</p>
                        </div>
                      </div>
                      <div className="learn-chapter-hint-popover-arrow" aria-hidden="true" />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="learn-chapter-modal-footer-step">
                Schritt {safeChapterStepIndex + 1} von {Math.max(1, activeChapterBlueprint?.steps.length ?? 1)}
              </p>
            </div>
            <div className="learn-chapter-modal-footer-progress">
              <div
                className="learn-entry-test-progress learn-entry-test-progress--footer"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(chapterProgressPercent)}
                aria-label="Fortschritt im Kapitel"
              >
                <span style={{ width: `${chapterProgressPercent}%` }} />
              </div>
            </div>
          </div>
          <div className="learn-chapter-modal-footer-actions">
            <SecondaryButton type="button" onClick={onPreviousChapterStep} disabled={safeChapterIndex === 0 && safeChapterStepIndex === 0}>
              Zurück
            </SecondaryButton>
            {activeChapterStep?.type === 'question' ? (
              <PrimaryButton
                type="button"
                onClick={() => {
                  void onEvaluateChapterQuestion()
                }}
                disabled={!canSubmitChapterQuestionAnswer(activeChapterStep, currentChapterAnswer) || isEvaluatingChapterStep}
              >
                {isEvaluatingChapterStep ? 'Wird bewertet...' : 'Antwort prüfen'}
              </PrimaryButton>
            ) : null}
            <PrimaryButton
              type="button"
              onClick={onNextChapterStep}
              disabled={activeChapterStep?.type === 'question' && !currentChapterFeedback}
            >
              Weiter
            </PrimaryButton>
          </div>
            </footer>
          </div>
        </div>
      </section>
    </ModalShell>
  )
}
