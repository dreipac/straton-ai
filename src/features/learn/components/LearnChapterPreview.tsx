import cardsFilled from '../../../assets/icons/cards-filled.svg'
import cardsOutline from '../../../assets/icons/cards-outline.svg'
import fileIcon from '../../../assets/icons/file.svg'
import filePenOutline from '../../../assets/icons/filePen-outline.svg'

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
  canCreateWorksheet: boolean
  isGeneratingWorksheet: boolean
  onCreateWorksheet: () => void
  hasSavedWorksheets: boolean
  onOpenSavedWorksheets: () => void
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
    canCreateWorksheet,
    isGeneratingWorksheet,
    onCreateWorksheet,
    hasSavedWorksheets,
    onOpenSavedWorksheets,
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
                {learningBlocksCount} Lernblöcke · {questionCount} Interaktive Fragen
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
      <div className="learn-chapter-preview-section learn-chapter-preview-section--actions-block">
        <div className="learn-chapter-preview-actions-top">
          <p className="learn-chapter-preview-label learn-chapter-preview-label--actions">Aktionen</p>
          <div className="learn-chapter-preview-action-pills">
            <button
              type="button"
              className="learn-chapter-preview-pill learn-chapter-preview-pill--cards"
              disabled={!canCreateFlashcards || isGeneratingFlashcards || isGeneratingWorksheet}
              onClick={onCreateFlashcards}
              aria-busy={isGeneratingFlashcards}
              aria-label={isGeneratingFlashcards ? 'Lernkarten werden erstellt' : 'Lernkarten erstellen'}
            >
              <span className="learn-chapter-preview-pill-icon learn-chapter-preview-pill-icon--swap" aria-hidden="true">
                <img className="learn-chapter-preview-pill-icon-default" src={cardsOutline} alt="" />
                <img className="learn-chapter-preview-pill-icon-hover" src={cardsFilled} alt="" />
              </span>
              <span className="learn-chapter-preview-pill-label">
                {isGeneratingFlashcards ? 'Wird erstellt…' : 'Lernkarten erstellen'}
              </span>
            </button>
            <button
              type="button"
              className="learn-chapter-preview-pill learn-chapter-preview-pill--worksheet"
              disabled={!canCreateWorksheet || isGeneratingWorksheet || isGeneratingFlashcards}
              onClick={onCreateWorksheet}
              aria-busy={isGeneratingWorksheet}
              aria-label={isGeneratingWorksheet ? 'Arbeitsblatt wird erstellt' : 'Arbeitsblatt erstellen'}
            >
              <span className="learn-chapter-preview-pill-icon" aria-hidden="true">
                <img src={filePenOutline} alt="" />
              </span>
              <span className="learn-chapter-preview-pill-label">
                {isGeneratingWorksheet ? 'Wird erstellt…' : 'Arbeitsblatt erstellen'}
              </span>
            </button>
          </div>
        </div>
        {hasSavedFlashcards || hasSavedWorksheets ? (
          <div className="learn-chapter-preview-actions learn-chapter-preview-actions--saved-files">
            <div className="learn-chapter-preview-file-grid">
              {hasSavedFlashcards ? (
                <button
                  type="button"
                  className="learn-entry-test-link learn-chapter-preview-file-chip"
                  onClick={onOpenSavedFlashcards}
                  aria-label="Lernkarten öffnen"
                >
                  <span className="learn-entry-test-link-icon-wrap" aria-hidden="true">
                    <img className="ui-icon learn-entry-test-link-icon" src={fileIcon} alt="" />
                  </span>
                  <span className="learn-entry-test-link-content learn-chapter-preview-file-chip-text">
                    <span className="learn-entry-test-link-title">Lernkarten</span>
                  </span>
                </button>
              ) : null}
              {hasSavedWorksheets ? (
                <button
                  type="button"
                  className="learn-entry-test-link learn-chapter-preview-file-chip"
                  onClick={onOpenSavedWorksheets}
                  aria-label="Arbeitsblatt öffnen"
                >
                  <span className="learn-entry-test-link-icon-wrap" aria-hidden="true">
                    <img className="ui-icon learn-entry-test-link-icon" src={fileIcon} alt="" />
                  </span>
                  <span className="learn-entry-test-link-content learn-chapter-preview-file-chip-text">
                    <span className="learn-entry-test-link-title">Arbeitsblatt</span>
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
