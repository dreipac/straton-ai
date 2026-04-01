import type { EntryQuizResult } from '../services/learn.persistence'
import { sanitizeChapterTitlesForUi } from '../utils/learnPageHelpers'

export type LearnOverviewPanelProps = {
  isSetupComplete: boolean
  setupStep: 1 | 2 | 3 | 4
  effectiveTopic: string
  proficiencyLabel: string
  materialsCount: number
  entryQuizResult: EntryQuizResult | null
  learningChapters: string[]
}

export function LearnOverviewPanel(props: LearnOverviewPanelProps) {
  const {
    isSetupComplete,
    setupStep,
    effectiveTopic,
    proficiencyLabel,
    materialsCount,
    entryQuizResult,
    learningChapters,
  } = props

  if (!isSetupComplete) {
    return (
      <>
        <div className="learn-progress-row">
          <span>Einrichtung</span>
          <strong>{`Schritt ${setupStep}/4`}</strong>
        </div>
        <div className="learn-progress-bar">
          <span style={{ width: `${(setupStep / 4) * 100}%` }} />
        </div>
        <div className="learn-progress-row">
          <span>Thema</span>
          <strong>{effectiveTopic || '-'}</strong>
        </div>
        <div className="learn-progress-bar">
          <span style={{ width: `${effectiveTopic ? 100 : 0}%` }} />
        </div>
        <div className="learn-progress-row">
          <span>Niveau</span>
          <strong>{proficiencyLabel}</strong>
        </div>
        <div className="learn-progress-row">
          <span>Dateien</span>
          <strong>{materialsCount}</strong>
        </div>
        <div className="learn-progress-row">
          <span>Einstiegstest</span>
          <strong>{entryQuizResult ? 'Abgegeben' : 'Offen'}</strong>
        </div>
      </>
    )
  }

  return (
    <section className="learn-overview-compact" aria-label={'Kompakte Lern\u00FCbersicht'}>
      <div className="learn-overview-compact-line">
        <span>Status</span>
        <strong>{entryQuizResult ? 'Einstiegstest abgegeben' : 'Einstiegstest offen'}</strong>
      </div>
      <div className="learn-overview-compact-grid">
        <div className="learn-overview-compact-item">
          <span>Thema</span>
          <strong>{effectiveTopic || '-'}</strong>
        </div>
        <div className="learn-overview-compact-item">
          <span>Niveau</span>
          <strong>{proficiencyLabel}</strong>
        </div>
        <div className="learn-overview-compact-item">
          <span>Dateien</span>
          <strong>{materialsCount}</strong>
        </div>
        <div className="learn-overview-compact-item">
          <span>Testergebnis</span>
          <strong>{entryQuizResult ? `${entryQuizResult.score}/${entryQuizResult.total}` : '-'}</strong>
        </div>
      </div>
      {learningChapters.length > 0 ? (
        <div className="learn-overview-chapters" aria-label="Generierte Lernkapitel">
          <p className="learn-overview-chapters-title">Lernkapitel</p>
          <div className="learn-overview-chapters-list" role="list">
            {sanitizeChapterTitlesForUi(learningChapters.slice(0, 6), effectiveTopic).map((chapter, index) => (
              <article key={`${chapter}-${index}`} className="learn-overview-chapter-card" role="listitem">
                <span className="learn-overview-chapter-badge">Kapitel {index + 1}</span>
                <p className="learn-overview-chapter-name">{chapter}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
