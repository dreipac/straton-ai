import fileIcon from '../../../assets/icons/file.svg'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'

export type LearnChapterPreviewProps = {
  greetingText: string
  chapterOrdinal: number
  chapterTitle: string
  statusLabel: string
  stepOrdinal: number
  stepCount: number
  stepProgressPercent: number
  statusText: string
  totalCorrect: number
  totalWrong: number
  accuracyPercent: number
  hasStartedFirstChapter: boolean
  bullets: string[]
  estimatedMinutes: number
  learningBlocksCount: number
  questionCount: number
  recommendation: string
  canStartChapter: boolean
  onStartChapter: () => void
  canCreateFlashcards: boolean
  isGeneratingFlashcards: boolean
  onCreateFlashcards: () => void
  hasSavedFlashcards: boolean
  onOpenSavedFlashcards: () => void
}

export function LearnChapterPreview(props: LearnChapterPreviewProps) {
  const {
    greetingText,
    chapterOrdinal,
    chapterTitle,
    statusLabel,
    stepOrdinal,
    stepCount,
    stepProgressPercent,
    statusText,
    totalCorrect,
    totalWrong,
    accuracyPercent,
    hasStartedFirstChapter,
    bullets,
    estimatedMinutes,
    learningBlocksCount,
    questionCount,
    recommendation,
    canStartChapter,
    onStartChapter,
    canCreateFlashcards,
    isGeneratingFlashcards,
    onCreateFlashcards,
    hasSavedFlashcards,
    onOpenSavedFlashcards,
  } = props

  const barWidth = Math.max(0, Math.min(100, stepProgressPercent))

  return (
    <section className="learn-chapter-preview" aria-label="Kapitelvorschau">
      <div className="learn-chapter-preview-section">
        <p className="learn-chapter-preview-greeting">{greetingText}</p>
        <p className="learn-chapter-preview-title">
          Kapitel {chapterOrdinal}: {chapterTitle}
        </p>
        <div className="learn-chapter-preview-meta">
          <span>Status: {statusLabel}</span>
          <span>
            Fortschritt: Schritt {stepOrdinal} / {Math.max(1, stepCount)}
          </span>
        </div>
        <div
          className="learn-chapter-preview-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(stepProgressPercent)}
        >
          <span style={{ width: `${barWidth}%` }} />
        </div>
        <p className="learn-chapter-preview-status-text">{statusText}</p>
        <div className="learn-chapter-preview-kpis">
          <span>Richtig: {totalCorrect}</span>
          <span>Falsch: {totalWrong}</span>
          <span>Quote: {accuracyPercent}%</span>
        </div>
      </div>
      {!hasStartedFirstChapter ? (
        <>
          <div className="learn-chapter-preview-section">
            <p className="learn-chapter-preview-label">Beschreibung</p>
            <div className="learn-chapter-preview-box">
              <p>In diesem Kapitel lernst du:</p>
              <ul>
                {bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="learn-chapter-preview-section">
            <p className="learn-chapter-preview-label">Zusatz (optional aber stark)</p>
            <div className="learn-chapter-preview-box">
              <p>Dauer: ca. {estimatedMinutes} Minuten</p>
              <p>
                {learningBlocksCount} Lernbl\u00F6cke \u00B7 {questionCount} Interaktive Fragen
              </p>
              <p>{recommendation}</p>
            </div>
          </div>
        </>
      ) : null}
      <div className="learn-chapter-preview-section learn-chapter-preview-section--cta">
        <button type="button" className="learn-chapter-preview-button" disabled={!canStartChapter} onClick={onStartChapter}>
          {hasStartedFirstChapter ? 'Weitermachen' : 'Kapitel starten'}
        </button>
      </div>
      <div className="learn-chapter-preview-section">
        <p className="learn-chapter-preview-label">Aktionen</p>
        <div className="learn-chapter-preview-actions">
          {hasSavedFlashcards ? (
            <button type="button" className="learn-entry-test-link learn-chapter-preview-flashcards-link" onClick={onOpenSavedFlashcards}>
              <span className="learn-entry-test-link-icon-wrap" aria-hidden="true">
                <img className="ui-icon learn-entry-test-link-icon" src={fileIcon} alt="" />
              </span>
              <span className="learn-entry-test-link-content">
                <span className="learn-entry-test-link-title">Lernkarten</span>
                <span className="learn-entry-test-link-meta">Datei öffnen</span>
              </span>
            </button>
          ) : null}
          <SecondaryButton
            type="button"
            disabled={!canCreateFlashcards || isGeneratingFlashcards}
            onClick={onCreateFlashcards}
          >
            {isGeneratingFlashcards ? 'Lernkarten werden erstellt…' : 'Lernkarten erstellen'}
          </SecondaryButton>
        </div>
      </div>
    </section>
  )
}
