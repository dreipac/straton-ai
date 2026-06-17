import type { EntryQuizResult, SyllabusEntry } from '../services/learn.persistence'
import { LearnSyllabusPanel } from './LearnSyllabusPanel'

export type LearnOverviewPanelProps = {
  isSetupComplete: boolean
  setupStep: 1 | 2 | 3 | 4
  effectiveTopic: string
  proficiencyLabel: string
  materialsCount: number
  entryQuizResult: EntryQuizResult | null
  learningChapters: string[]
  syllabus: SyllabusEntry[]
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
    syllabus,
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
      {(syllabus.length > 0 || learningChapters.length > 0) ? (
        <LearnSyllabusPanel
          syllabus={syllabus}
          learningChapters={learningChapters}
          effectiveTopic={effectiveTopic}
          variant="compact"
        />
      ) : null}
    </section>
  )
}
