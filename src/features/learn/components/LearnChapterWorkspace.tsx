import type { AnimationEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import infoIcon from '../../../assets/icons/info.svg'
import { isCategorizeAnswerComplete, isMatchAnswerComplete } from '../../chat/utils/interactiveQuiz'
import { renderInlineMarkdown } from '../../chat/utils/markdownInline'
import type { ChapterBlueprint, ChapterStep, LearnFlashcard, LearnWorksheetItem } from '../services/learn.persistence'
import { chapterQuestionToInteractiveQuestion } from '../utils/learnPageHelpers'
import { renderLearnStepContent } from '../utils/renderLearnStepContent'
import { LearnEntryQuizMatch } from './LearnEntryQuizMatch'
import { LearnCategorizeQuestion } from './LearnCategorizeQuestion'
import { LearnSubstepWorksheetPanel } from './LearnSubstepWorksheetPanel'

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
    return 'Wähle die passende Option. Wenn du unsicher bist: schließe zuerst eindeutig falsche Antworten aus.'
  }
  if (step.questionType === 'true_false') {
    return 'Entscheide dich für Wahr oder Falsch. Achte auf Formulierungen wie «immer», «nie» — oft sind sie ein Hinweis.'
  }
  if (step.questionType === 'match') {
    return 'Ordne jeden Begriff links der passenden Spalte rechts zu. Ziehe die Karten per Drag-and-Drop.'
  }
  if (step.questionType === 'categorize') {
    return 'Ziehe jeden Begriff in die passende Kategorie. Mehrere Begriffe pro Kategorie sind erlaubt.'
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
  if (step.questionType === 'categorize') {
    return 'Kategorien-Aufgabe'
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
  if (step.questionType === 'categorize' && step.categories && step.items) {
    return isCategorizeAnswerComplete(chapterQuestionToInteractiveQuestion(step), answer)
  }
  return answer.trim().length > 0
}

/** Hell- bis Dunkelgrün-Verlauf für den Fortschrittsbalken: je voller, desto dunkler das Grün. */
const PROGRESS_FILL_LIGHT_GREEN = '#86efac'
const PROGRESS_FILL_DARK_GREEN = '#15803d'

function progressFillColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const darkPercent = Math.round(clamped * 100)
  return `color-mix(in srgb, ${PROGRESS_FILL_DARK_GREEN} ${darkPercent}%, ${PROGRESS_FILL_LIGHT_GREEN} ${100 - darkPercent}%)`
}

type ChapterRailItemState = 'done' | 'current' | 'upcoming'

function chapterRailStepLabel(step: ChapterStep, questionOrdinal: number): string {
  if (step.type === 'question') {
    return `Frage ${questionOrdinal}`
  }
  if (step.type === 'recap') {
    return 'Zusammenfassung'
  }
  return step.title?.trim() || 'Erklärung'
}

/**
 * Vertikale Schritt-Schiene (Variante A): die Schritte INNERHALB des aktuellen Zwischenschritts —
 * Erklärung → Frage 1 → Frage 2 … — von oben nach unten, oben in der Schiene angesetzt. Erledigte
 * Schritte tragen ✓/✗, der aktuelle ist hervorgehoben, kommende sind gedämpft. Ein Klick auf einen
 * erledigten Schritt springt dorthin zurück. Kein Titelbereich — das Thema steht im Header.
 */
function LearnChapterRail(props: {
  steps: ChapterStep[]
  currentIndex: number
  stepCorrectnessById: Record<string, boolean>
  onSelectStepIndex: (index: number) => void
}) {
  const { steps, currentIndex, stepCorrectnessById, onSelectStepIndex } = props

  const items = steps.map((step, index) => {
    const questionOrdinal =
      step.type === 'question'
        ? steps.slice(0, index + 1).filter((entry) => entry.type === 'question').length
        : 0
    const state: ChapterRailItemState =
      index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
    const correctness = step.type === 'question' ? stepCorrectnessById[step.id] : undefined
    return { step, index, state, label: chapterRailStepLabel(step, questionOrdinal), correctness }
  })

  return (
    <aside className="learn-chapter-rail" aria-label="Schritte in diesem Zwischenschritt">
      <ol className="learn-chapter-rail-track">
        {items.map(({ step, index, state, label, correctness }) => {
          const clickable = state === 'done'
          const isWrong = state === 'done' && step.type === 'question' && correctness === false
          const dotSymbol = state === 'done' ? (isWrong ? '✕' : '✓') : ''
          const inner = (
            <>
              <span
                className={`learn-chapter-rail-dot${isWrong ? ' learn-chapter-rail-dot--wrong' : ''}`}
                aria-hidden="true"
              >
                {dotSymbol}
              </span>
              <span className="learn-chapter-rail-label">{label}</span>
            </>
          )
          return (
            <li key={step.id} className={`learn-chapter-rail-item is-${state}`}>
              {clickable ? (
                <button
                  type="button"
                  className="learn-chapter-rail-node"
                  onClick={() => onSelectStepIndex(index)}
                  aria-label={`Zurück zu: ${label}`}
                >
                  {inner}
                </button>
              ) : (
                <span className="learn-chapter-rail-node" aria-current={state === 'current' ? 'step' : undefined}>
                  {inner}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

export type LearnChapterWorkspaceProps = {
  isMounted: boolean
  isVisible: boolean
  onClose: () => void
  activeChapterBlueprint: ChapterBlueprint | null
  safeChapterIndex: number
  /** Beste aktuelle Richtig-Serie über alle Kompetenzen — für das 🔥-Badge. */
  bestCorrectStreak?: number
  safeChapterStepIndex: number
  activeChapterStep: ChapterStep | null
  currentChapterAnswer: string
  currentChapterFeedback: string
  currentChapterIsCorrect: boolean | undefined
  hasCurrentChapterEvaluation: boolean
  isEvaluatingChapterStep: boolean
  /** Schiene (Variante A): Richtig/Falsch je Schritt + Sprung. «Zwischenschritt N» steht im Header. */
  stepCorrectnessById: Record<string, boolean>
  stepOrdinalLabel: string
  onSelectStepIndex: (index: number) => void
  onChapterAnswerChange: (stepId: string, value: string) => void
  onSelectMcqOption: (stepId: string, option: string) => void
  onPreviousChapterStep: () => void
  onEvaluateChapterQuestion: () => void
  onNextChapterStep: () => void
  onCompleteChapter: () => void
  /** Neues Themen-Modell: Sonderansicht statt Schiene (Landing/Analyse/Übersicht/Übungskarten/Arbeitsblatt), sonst 'flow'/undefined = normaler Ablauf. */
  topicMode?: 'landing' | 'entry_check' | 'analyzing' | 'overview' | 'flow' | 'practice' | 'worksheet'
  /** Themenname für Landing-/Übersicht-Header. */
  topicName?: string
  /** Schiene (Schritt-Liste links) ausblenden — im Themen-Flow gewünscht. */
  hideRail?: boolean
  /** Teilthemen-Liste für die Kapitel-Übersicht (Plan-Timeline). */
  substepList?: {
    index: number
    title: string
    status: 'done' | 'current' | 'upcoming'
    currentStep: number
    totalSteps: number
  }[]
  /** Klick auf ein Teilthema in der Übersicht. */
  onSelectSubstep?: (index: number) => void
  /** Mastery-Prozent (0–100) für den Header-Kreis im Landing/Flow. */
  topicMasteryPercent?: number
  onStartEntryCheck?: () => void
  /** true, während der Vollinhalt des Zwischenschritts lazy generiert wird. */
  isGeneratingContent?: boolean
  /** Übungskarten (echtes Lernkarten-Set) des aktiven Zwischenschritts — topicMode 'practice'. */
  practiceCards?: LearnFlashcard[]
  /** true, während das Übungskarten-Set für den Zwischenschritt lazy generiert wird. */
  isGeneratingPractice?: boolean
  /** Übungskarten-Bewertung (Gewusst/Nicht gewusst) — schreibt in das echte Lernkarten-Set. */
  onRatePracticeCard?: (cardId: string, known: boolean) => void
  /** Alle Übungskarten bewertet, Nutzer schließt die Übungsphase ab. */
  onFinishPractice?: () => void
  /** Abschluss-Arbeitsblatt (Pflicht) des aktiven Zwischenschritts — topicMode 'worksheet'. */
  worksheetItems?: LearnWorksheetItem[]
  /** true, während das Abschluss-Arbeitsblatt lazy generiert wird. */
  isGeneratingWorksheet?: boolean
  onWorksheetItemEvaluated?: (itemId: string, payload: { correct: boolean; answer: string }) => void
  onWorksheetSavedAnswerChange?: (itemId: string, answer: string) => void
  /** Alle Arbeitsblatt-Aufgaben geprüft, Zwischenschritt wird abgeschlossen. */
  onFinishWorksheet?: () => void
  /** Platzhalter-Modus: Antworten lokal statt per KI bewerten. */
  useLocalWorksheetEvaluation?: boolean
  /** Beschriftung des Abschluss-Buttons (z. B. „Weiter zu den Übungskarten"). */
  completeLabel?: string
}

export function LearnChapterWorkspace(props: LearnChapterWorkspaceProps) {
  const {
    isMounted,
    isVisible,
    onClose,
    activeChapterBlueprint,
    safeChapterIndex,
    bestCorrectStreak = 0,
    safeChapterStepIndex,
    activeChapterStep,
    currentChapterAnswer,
    currentChapterFeedback,
    currentChapterIsCorrect,
    hasCurrentChapterEvaluation,
    isEvaluatingChapterStep,
    stepCorrectnessById,
    stepOrdinalLabel,
    onSelectStepIndex,
    onChapterAnswerChange,
    onSelectMcqOption,
    onPreviousChapterStep,
    onEvaluateChapterQuestion,
    onNextChapterStep,
    onCompleteChapter,
    topicMode,
    topicName,
    topicMasteryPercent = 0,
    onStartEntryCheck,
    isGeneratingContent = false,
    practiceCards = [],
    isGeneratingPractice = false,
    onRatePracticeCard,
    onFinishPractice,
    worksheetItems = [],
    isGeneratingWorksheet = false,
    onWorksheetItemEvaluated,
    onWorksheetSavedAnswerChange,
    onFinishWorksheet,
    useLocalWorksheetEvaluation = false,
    completeLabel,
    hideRail = false,
    substepList = [],
    onSelectSubstep,
  } = props

  const [hintPopoverMounted, setHintPopoverMounted] = useState(false)
  const [hintPopoverClosing, setHintPopoverClosing] = useState(false)
  const [hintPopoverStepId, setHintPopoverStepId] = useState<string | null>(null)
  /** Position in der Übungskarten-Liste (topicMode 'practice'). */
  const [practiceCardIndex, setPracticeCardIndex] = useState(0)
  /** Aufgedeckte Übungskarte (Rückseite sichtbar) — je Karten-ID. */
  const [flippedPracticeCardId, setFlippedPracticeCardId] = useState<string | null>(null)
  const hintAnchorRef = useRef<HTMLDivElement>(null)
  const activeStepId = activeChapterStep?.id ?? null
  const isHintPopoverOpen = hintPopoverMounted && !hintPopoverClosing && hintPopoverStepId === activeStepId
  const chapterStepTotal = Math.max(1, activeChapterBlueprint?.steps.length ?? 1)
  const isLastStepInChapter = safeChapterStepIndex >= chapterStepTotal - 1

  /**
   * Fortschritt zählt einen Schritt erst, wenn er wirklich abgeschlossen ist: Fragen erst nach
   * Korrektur (sonst 0 %, auch auf Schritt 1), reine Erklärungsschritte sobald man weiter ist
   * (index < aktueller Schritt reicht, weil "Weiter" bei Fragen ohne Feedback gesperrt ist).
   */
  const isCurrentStepCounted =
    activeChapterStep?.type === 'question' ? hasCurrentChapterEvaluation : false
  const filledStepCount = Math.min(chapterStepTotal, safeChapterStepIndex + (isCurrentStepCounted ? 1 : 0))
  const visualProgressPercent = (filledStepCount / chapterStepTotal) * 100

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

  // „Zustand anpassen, wenn sich Props ändern" direkt im Render (vorheriger Stand in useState) —
  // ein Effekt dürfte hier kein setState synchron im Effekt-Rumpf aufrufen.
  const firstPracticeCardId = practiceCards[0]?.id
  const [prevFirstPracticeCardId, setPrevFirstPracticeCardId] = useState(firstPracticeCardId)
  if (firstPracticeCardId !== prevFirstPracticeCardId) {
    setPrevFirstPracticeCardId(firstPracticeCardId)
    setPracticeCardIndex(0)
    setFlippedPracticeCardId(null)
  }

  if (!isMounted) {
    return null
  }

  const showLanding = topicMode === 'landing'
  const showAnalyzing = topicMode === 'analyzing'
  const showOverview = topicMode === 'overview'
  const showPractice = topicMode === 'practice'
  const showWorksheet = topicMode === 'worksheet'
  const showContentLoading =
    topicMode === 'flow' &&
    isGeneratingContent &&
    (!activeChapterBlueprint || activeChapterBlueprint.steps.length === 0)
  const showTopicSpecial =
    showLanding || showAnalyzing || showOverview || showPractice || showWorksheet || showContentLoading
  const masteryPct = Math.max(0, Math.min(100, Math.round(topicMasteryPercent)))
  const masteryRingCirc = 2 * Math.PI * 20

  const practiceTotal = practiceCards.length
  const practiceSafeIndex = Math.max(0, Math.min(practiceCardIndex, Math.max(0, practiceTotal - 1)))
  const activePracticeCard = practiceCards[practiceSafeIndex] ?? null
  const activePracticeRating = activePracticeCard?.selfRating
  const isPracticeCardFlipped =
    Boolean(activePracticeCard) &&
    (flippedPracticeCardId === activePracticeCard?.id || Boolean(activePracticeRating))
  const isLastPracticeCard = practiceTotal === 0 || practiceSafeIndex >= practiceTotal - 1
  const allPracticeCardsRated = practiceTotal > 0 && practiceCards.every((card) => Boolean(card.selfRating))

  const practicePanel = (
    <div className="learn-chapter-topic-special learn-practice-panel">
      {isGeneratingPractice ? (
        <>
          <div className="learn-chapter-topic-analyzing-orb" aria-hidden="true" />
          <h2 className="learn-chapter-topic-landing-title">Übungskarten werden erstellt …</h2>
        </>
      ) : !activePracticeCard ? (
        <p className="learn-muted">Keine Übungskarten verfügbar.</p>
      ) : (
        <>
          <p className="learn-chapter-modal-footer-step">
            Karte {practiceSafeIndex + 1} von {practiceTotal}
          </p>
          <div className="learn-practice">
            <button
              type="button"
              className={`learn-flashcard learn-flashcard--practice${isPracticeCardFlipped ? ' is-flipped' : ''}`}
              onClick={() => setFlippedPracticeCardId(isPracticeCardFlipped ? null : activePracticeCard.id)}
              aria-label="Übungskarte umdrehen"
            >
              <div className="learn-flashcard-inner">
                <div className="learn-flashcard-face learn-flashcard-front">
                  <span className="learn-flashcard-label">Üben</span>
                  <p className="learn-flashcard-text">{activePracticeCard.question}</p>
                  <span className="learn-practice-flip-hint">Zum Umdrehen tippen</span>
                </div>
                <div className="learn-flashcard-face learn-flashcard-back">
                  <span className="learn-flashcard-label">Antwort</span>
                  <p className="learn-flashcard-text">{activePracticeCard.answer}</p>
                </div>
              </div>
            </button>
            {activePracticeRating ? (
              <p className={`learn-chapter-practice-result is-${activePracticeRating}`}>
                {activePracticeRating === 'known' ? '✓ Als „Gewusst" bewertet' : '✕ Als „Nicht gewusst" bewertet'}
              </p>
            ) : isPracticeCardFlipped ? (
              <div className="learn-practice-rating" role="group" aria-label="Selbsteinschätzung">
                <button
                  type="button"
                  className="learn-practice-rating-btn is-unknown"
                  onClick={() => onRatePracticeCard?.(activePracticeCard.id, false)}
                >
                  <span className="learn-practice-rating-icon" aria-hidden="true">
                    ✕
                  </span>
                  <span className="learn-practice-rating-label">Nicht gewusst</span>
                </button>
                <button
                  type="button"
                  className="learn-practice-rating-btn is-known"
                  onClick={() => onRatePracticeCard?.(activePracticeCard.id, true)}
                >
                  <span className="learn-practice-rating-icon" aria-hidden="true">
                    ✓
                  </span>
                  <span className="learn-practice-rating-label">Gewusst</span>
                </button>
              </div>
            ) : (
              <p className="learn-practice-hint learn-muted">Drehe die Karte um, dann bewerte dich.</p>
            )}
          </div>
          <div className="learn-chapter-modal-footer-actions">
            <SecondaryButton
              type="button"
              onClick={() => setPracticeCardIndex((index) => Math.max(0, index - 1))}
              disabled={practiceSafeIndex === 0}
            >
              Zurück
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                if (isLastPracticeCard) {
                  onFinishPractice?.()
                  return
                }
                setPracticeCardIndex((index) => Math.min(practiceTotal - 1, index + 1))
              }}
              disabled={!activePracticeRating || (isLastPracticeCard && !allPracticeCardsRated)}
            >
              {isLastPracticeCard ? 'Zwischenschritt abschließen' : 'Nächste Karte'}
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  )

  const topicOverviewPanel = (
    <div className="learn-chapter-topic-overview">
      <ol className="learn-chapter-plan">
        {substepList.map((substep, listIndex) => {
          const isFirst = listIndex === 0
          const isLast = listIndex === substepList.length - 1
          const isCurrent = substep.status === 'current'
          return (
            <li
              key={substep.index}
              className={`learn-chapter-plan-item is-${substep.status}${isFirst ? ' is-first' : ''}${
                isLast ? ' is-last' : ''
              }`}
            >
              <span className="learn-chapter-plan-rail" aria-hidden="true">
                <span className="learn-chapter-plan-line learn-chapter-plan-line--top" />
                <span className={`learn-chapter-plan-dot is-${substep.status}`}>
                  {substep.status === 'done' ? '✓' : ''}
                </span>
                <span className="learn-chapter-plan-line learn-chapter-plan-line--bottom" />
              </span>
              {isCurrent ? (
                <button
                  type="button"
                  className="learn-chapter-plan-current-card"
                  onClick={() => onSelectSubstep?.(substep.index)}
                  aria-label={`Teilthema starten: ${substep.title}`}
                >
                  <span className="learn-chapter-plan-current-copy">
                    <span className="learn-chapter-plan-current-title">{substep.title}</span>
                    <span className="learn-chapter-plan-current-step">
                      Schritt {Math.max(1, substep.currentStep)} von {Math.max(1, substep.totalSteps)}
                    </span>
                  </span>
                  <span className="learn-chapter-plan-current-arrow" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className="learn-chapter-plan-name"
                  onClick={() => onSelectSubstep?.(substep.index)}
                >
                  {substep.title}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )

  const topicSpecialPanel = showOverview ? (
    topicOverviewPanel
  ) : showPractice ? (
    practicePanel
  ) : showWorksheet ? (
    <LearnSubstepWorksheetPanel
      items={worksheetItems}
      isLoading={isGeneratingWorksheet}
      error={null}
      onItemEvaluated={(itemId, payload) => onWorksheetItemEvaluated?.(itemId, payload)}
      onSavedAnswerChange={(itemId, answer) => onWorksheetSavedAnswerChange?.(itemId, answer)}
      onFinish={() => onFinishWorksheet?.()}
      useLocalEvaluation={useLocalWorksheetEvaluation}
    />
  ) : (
    <div className="learn-chapter-topic-special">
      {showLanding ? (
        <>
          <div className="learn-chapter-topic-mastery-circle" aria-label={`Beherrschung ${masteryPct} Prozent`}>
            <svg viewBox="0 0 48 48" width="96" height="96" aria-hidden="true">
              <circle className="learn-chapter-topic-mastery-track" cx="24" cy="24" r="20" />
              <circle
                className="learn-chapter-topic-mastery-fill"
                cx="24"
                cy="24"
                r="20"
                strokeDasharray={masteryRingCirc}
                strokeDashoffset={masteryRingCirc * (1 - masteryPct / 100)}
                transform="rotate(-90 24 24)"
              />
            </svg>
            <span className="learn-chapter-topic-mastery-value">{masteryPct}%</span>
          </div>
          <h2 className="learn-chapter-topic-landing-title">Einstiegscheck starten</h2>
          {topicName ? <p className="learn-chapter-topic-landing-sub">{topicName}</p> : null}
          <PrimaryButton type="button" className="learn-chapter-topic-landing-cta" onClick={onStartEntryCheck}>
            <span>Starten</span>
            <span className="learn-chapter-topic-landing-arrow" aria-hidden="true" />
          </PrimaryButton>
        </>
      ) : (
        <>
          <div className="learn-chapter-topic-analyzing-orb" aria-hidden="true" />
          <h2 className="learn-chapter-topic-landing-title">
            {showAnalyzing ? 'Straton analysiert deine Antworten …' : 'Zwischenschritt wird vorbereitet …'}
          </h2>
          {showAnalyzing ? (
            <p className="learn-chapter-topic-landing-sub">
              Aus deinem Einstiegscheck werden gerade die passenden Teilthemen abgeleitet.
            </p>
          ) : null}
        </>
      )}
    </div>
  )

  return (
    <section
      className={`learn-chapter-modal learn-chapter-workspace${isVisible ? ' is-visible' : ''}`}
      role="region"
      aria-label="Lernkapitel"
    >
        <header className="learn-chapter-modal-header">
          <div className="learn-chapter-modal-header-copy">
            <h2>
              {showLanding || showAnalyzing || showOverview
                ? topicName || 'Thema'
                : activeChapterBlueprint?.title || 'Lernkapitel'}
            </h2>
            {showOverview ? (
              <p
                className="learn-chapter-header-score"
                aria-label={`Durchschnittlicher Fortschritt ${masteryPct} Prozent`}
              >
                <span className="learn-chapter-header-score-value">{masteryPct}%</span>
                <span className="learn-chapter-header-score-label">Ø Fortschritt</span>
              </p>
            ) : null}
            {bestCorrectStreak >= 2 ? (
              <p className="learn-chapter-source-row">
                <span className="learn-chapter-streak-badge" title="Deine beste Richtig-Serie">
                  {'🔥'} {bestCorrectStreak} in Folge
                </span>
              </p>
            ) : null}
            <p>{stepOrdinalLabel}</p>
          </div>
          <div className="learn-chapter-modal-header-actions">
            <button type="button" className="settings-close-button" onClick={onClose} aria-label="Schließen">
              <span className="ui-icon settings-close-icon" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="learn-chapter-modal-main">
          {showTopicSpecial ? topicSpecialPanel : (
          <>
          {!hideRail && activeChapterBlueprint && activeChapterBlueprint.steps.length > 0 ? (
            <LearnChapterRail
              steps={activeChapterBlueprint.steps}
              currentIndex={safeChapterStepIndex}
              stepCorrectnessById={stepCorrectnessById}
              onSelectStepIndex={onSelectStepIndex}
            />
          ) : null}
          <div className="learn-chapter-modal-column">
            <div className="learn-chapter-modal-body">
          {!activeChapterStep ? (
            <p className="learn-muted">Keine Schritte verfuegbar.</p>
          ) : activeChapterStep.type === 'question' ? (
            <article className="learn-chapter-step-card">
              <p className="learn-chapter-step-label learn-chapter-question-kind-label">
                {chapterQuestionKindLabel(activeChapterStep)}
              </p>
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
              ) : activeChapterStep.questionType === 'categorize' &&
                activeChapterStep.categories &&
                activeChapterStep.items ? (
                <LearnCategorizeQuestion
                  questionId={activeChapterStep.id}
                  categories={activeChapterStep.categories}
                  items={activeChapterStep.items}
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
              {activeChapterStep.keyPrinciple?.trim() ? (
                <div className="learn-chapter-principle-box">
                  <span className="learn-chapter-principle-label">Kernprinzip</span>
                  <p>{renderInlineMarkdown(activeChapterStep.keyPrinciple)}</p>
                </div>
              ) : null}
              <div className="learn-chapter-step-content">{renderLearnStepContent(activeChapterStep.content)}</div>
              {activeChapterStep.bullets && activeChapterStep.bullets.length > 0 ? (
                <ul className="learn-chapter-step-bullets">
                  {activeChapterStep.bullets.map((bullet) => (
                    <li key={bullet}>{renderInlineMarkdown(bullet)}</li>
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
                Schritt {safeChapterStepIndex + 1} von {chapterStepTotal}
              </p>
            </div>
            <div className="learn-chapter-modal-footer-progress">
              <div
                className="learn-chapter-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(visualProgressPercent)}
                aria-label="Fortschritt im Kapitel"
              >
                <span
                  className="chat-md-badge chat-md-badge--green learn-chapter-progress-badge-text"
                  aria-hidden="true"
                >
                  {Math.round(visualProgressPercent)}%
                </span>
                <div className="learn-chapter-progress-track" aria-hidden="true">
                  {Array.from({ length: chapterStepTotal }, (_, index) => {
                    const isFilled = index < filledStepCount
                    const ratio = chapterStepTotal > 1 ? index / (chapterStepTotal - 1) : 1
                    return (
                      <span
                        key={index}
                        className={`learn-chapter-progress-segment${isFilled ? ' is-filled' : ''}`}
                        style={isFilled ? { backgroundColor: progressFillColor(ratio) } : undefined}
                      />
                    )
                  })}
                </div>
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
              onClick={isLastStepInChapter ? onCompleteChapter : onNextChapterStep}
              disabled={activeChapterStep?.type === 'question' && !currentChapterFeedback}
            >
              {isLastStepInChapter ? completeLabel ?? 'Kapitel abschließen' : 'Weiter'}
            </PrimaryButton>
          </div>
            </footer>
          </div>
          </>
          )}
        </div>
    </section>
  )
}
