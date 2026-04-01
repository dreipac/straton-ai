import type { AnimationEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import infoIcon from '../../../assets/icons/info.svg'
import type { ChapterBlueprint, ChapterStep } from '../services/learn.persistence'

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
    return 'Wähle die passende Option. Wenn du unsicher bist: schliesse zuerst eindeutig falsche Antworten aus.'
  }
  return 'Formuliere eine kurze, sachliche Antwort direkt zur Frage. Achte auf Fachbegriffe und — wo nötig — auf Format und Einheit (z. B. bei Adressen oder Zahlen).'
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
  const hintAnchorRef = useRef<HTMLDivElement>(null)
  const hintPopoverStateRef = useRef({ mounted: false, closing: false })
  hintPopoverStateRef.current = { mounted: hintPopoverMounted, closing: hintPopoverClosing }

  const requestCloseHintPopover = () => {
    const { mounted, closing } = hintPopoverStateRef.current
    if (!mounted || closing) {
      return
    }
    setHintPopoverClosing(true)
  }

  const handleHintPopoverAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (!hintPopoverStateRef.current.closing) {
      return
    }
    setHintPopoverClosing(false)
    setHintPopoverMounted(false)
  }

  useEffect(() => {
    setHintPopoverMounted(false)
    setHintPopoverClosing(false)
  }, [activeChapterStep?.id])

  useEffect(() => {
    if (!hintPopoverMounted || hintPopoverClosing) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const { mounted, closing } = hintPopoverStateRef.current
        if (!mounted || closing) {
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
      const { mounted, closing } = hintPopoverStateRef.current
      if (!mounted || closing) {
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
  }, [hintPopoverMounted, hintPopoverClosing])

  const questionInfoPanelText =
    activeChapterStep?.type === 'question'
      ? buildQuestionInfoPanelText(activeChapterBlueprint, activeChapterStep)
      : ''

  if (!isMounted) {
    return null
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-chapter-modal-overlay">
      <section className="learn-chapter-modal" role="dialog" aria-modal="true" aria-label="Lernkapitel">
        <header className="learn-chapter-modal-header">
          <div className="learn-chapter-modal-header-copy">
            <h2>{activeChapterBlueprint?.title || 'Lernkapitel'}</h2>
            <p>
              Kapitel {safeChapterIndex + 1} von {Math.max(1, effectiveChapterCount)}
            </p>
          </div>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Lernkapitel schliessen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <div className="learn-chapter-modal-body">
          {!activeChapterStep ? (
            <p className="learn-muted">Keine Schritte verfuegbar.</p>
          ) : activeChapterStep.type === 'question' ? (
            <article className="learn-chapter-step-card">
              <p className="learn-chapter-step-label">
                {activeChapterStep.questionType === 'mcq' ? 'Interaktive Multiple-Choice Frage' : 'Interaktive Freitext Frage'}
              </p>
              <h3>{activeChapterStep.prompt}</h3>
              {activeChapterStep.questionType === 'mcq' && (activeChapterStep.options?.length ?? 0) > 0 ? (
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
              <p className="learn-chapter-step-label">{activeChapterStep.type === 'recap' ? 'Zusammenfassung' : 'Erklaerung'}</p>
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
                    className={`learn-chapter-step-info-button ${hintPopoverMounted && !hintPopoverClosing ? 'is-open' : ''}`}
                    onClick={() => {
                      if (hintPopoverMounted && !hintPopoverClosing) {
                        requestCloseHintPopover()
                        return
                      }
                      if (!hintPopoverMounted) {
                        setHintPopoverMounted(true)
                        setHintPopoverClosing(false)
                      }
                    }}
                    aria-expanded={hintPopoverMounted && !hintPopoverClosing}
                    aria-controls="learn-chapter-step-hint-popover"
                    title="Tipp zur Frage"
                  >
                    <img src={infoIcon} alt="" className="learn-chapter-step-info-icon" width={20} height={20} aria-hidden="true" />
                  </button>
                  {hintPopoverMounted ? (
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
                disabled={!currentChapterAnswer.trim() || isEvaluatingChapterStep}
              >
                {isEvaluatingChapterStep ? 'Wird bewertet...' : 'Antwort pruefen'}
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
      </section>
    </ModalShell>
  )
}
