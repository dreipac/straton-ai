import type { SyllabusEntry } from '../services/learn.persistence'
import { sanitizeChapterTitlesForUi } from '../utils/learnPageHelpers'

export type LearnSyllabusPanelProps = {
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  effectiveTopic: string
  currentChapterIndex?: number
  unlockedChapterCount?: number
  variant?: 'aside' | 'compact'
  maxItems?: number
}

export function LearnSyllabusPanel(props: LearnSyllabusPanelProps) {
  const {
    syllabus,
    learningChapters,
    effectiveTopic,
    currentChapterIndex = 0,
    unlockedChapterCount = 1,
    variant = 'aside',
    maxItems = 6,
  } = props

  const entries: SyllabusEntry[] =
    syllabus.length > 0
      ? syllabus
      : learningChapters.map((topic) => ({ topic, learningGoal: '' }))

  if (entries.length === 0) {
    return null
  }

  const visibleEntries = entries.slice(0, maxItems)
  const isAside = variant === 'aside'

  return (
    <section
      className={isAside ? 'learn-path-syllabus-panel' : 'learn-overview-chapters'}
      aria-label="Geplanter Lernpfad"
    >
      <div className={isAside ? 'learn-path-syllabus-panel-head' : undefined}>
        <p className={isAside ? 'learn-path-syllabus-panel-title' : 'learn-overview-chapters-title'}>
          {isAside ? 'Dein Lernplan' : 'Lernplan'}
        </p>
        {isAside ? (
          <span className="learn-path-syllabus-panel-count">
            {entries.length} Kapitel
          </span>
        ) : null}
      </div>
      <div
        className={isAside ? 'learn-path-syllabus-list' : 'learn-overview-chapters-list'}
        role="list"
      >
        {visibleEntries.map((entry, index) => {
          const title = sanitizeChapterTitlesForUi([entry.topic], effectiveTopic)[0] ?? entry.topic
          const isActive = index === currentChapterIndex
          const isUnlocked = index < unlockedChapterCount
          const isCompleted = index < currentChapterIndex

          if (isAside) {
            return (
              <article
                key={`${entry.topic}-${index}`}
                className={`learn-path-syllabus-item${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}${!isUnlocked ? ' is-locked' : ''}`}
                role="listitem"
              >
                <span className="learn-path-syllabus-item-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="learn-path-syllabus-item-body">
                  <p className="learn-path-syllabus-item-title">{title}</p>
                  {entry.learningGoal.trim() ? (
                    <p className="learn-path-syllabus-item-goal">{entry.learningGoal.trim()}</p>
                  ) : null}
                </div>
              </article>
            )
          }

          return (
            <article key={`${entry.topic}-${index}`} className="learn-overview-chapter-card" role="listitem">
              <span className="learn-overview-chapter-badge">Kapitel {index + 1}</span>
              <p className="learn-overview-chapter-name">{title}</p>
              {entry.learningGoal.trim() ? (
                <p className="learn-overview-chapter-goal">{entry.learningGoal.trim()}</p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
