import { useState } from 'react'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import type { SyllabusEntry } from '../services/learn.persistence'
import { sanitizeChapterTitlesForUi, splitLearningGoals } from '../utils/learnPageHelpers'

export type LearnSyllabusPanelProps = {
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  effectiveTopic: string
  currentChapterIndex?: number
  unlockedChapterCount?: number
  variant?: 'aside' | 'compact'
  maxItems?: number
}

type SyllabusItemViewProps = {
  title: string
  index: number
  isActive: boolean
  isCompleted: boolean
  isUnlocked: boolean
  showConnector: boolean
}

/** Ein Kapitel im Lernplan: gefüllter Nummernkreis (Akzentfarbe = aktueller Stand) + Titel, optional mit Verbindungslinie zum nächsten Kapitel. */
function SyllabusItemView({ title, index, isActive, isCompleted, isUnlocked, showConnector }: SyllabusItemViewProps) {
  return (
    <article
      className={`learn-path-syllabus-item${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}${!isUnlocked ? ' is-locked' : ''}`}
      role="listitem"
    >
      <div className="learn-path-syllabus-item-connector" aria-hidden="true">
        <span className="learn-path-syllabus-item-index">{index + 1}</span>
        {showConnector ? <span className="learn-path-syllabus-item-line" /> : null}
      </div>
      <div className="learn-path-syllabus-item-body">
        <p className="learn-path-syllabus-item-title">{title}</p>
      </div>
    </article>
  )
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

  const [isFullPlanOpen, setIsFullPlanOpen] = useState(false)

  const entries: SyllabusEntry[] =
    syllabus.length > 0
      ? syllabus
      : learningChapters.map((topic) => ({ topic, learningGoal: '' }))

  if (entries.length === 0) {
    return null
  }

  const isAside = variant === 'aside'

  if (!isAside) {
    const visibleEntries = entries.slice(0, maxItems)
    return (
      <section className="learn-overview-chapters" aria-label="Geplanter Lernpfad">
        <p className="learn-overview-chapters-title">Lernplan</p>
        <div className="learn-overview-chapters-list" role="list">
          {visibleEntries.map((entry, index) => {
            const title = sanitizeChapterTitlesForUi([entry.topic], effectiveTopic)[0] ?? entry.topic
            return (
              <article key={`${entry.topic}-${index}`} className="learn-overview-chapter-card">
                <span className="learn-overview-chapter-badge">Kapitel {index + 1}</span>
                <p className="learn-overview-chapter-name">{title}</p>
                {entry.learningGoal.trim() ? (
                  <p className="learn-overview-chapter-goal">
                    {splitLearningGoals(entry.learningGoal).join(' · ')}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  const windowStart = Math.min(Math.max(0, currentChapterIndex), Math.max(0, entries.length - 2))
  const previewEntries = entries.slice(windowStart, windowStart + 2)
  const hasMore = entries.length > previewEntries.length

  const buildItemProps = (entry: SyllabusEntry, index: number) => ({
    title: sanitizeChapterTitlesForUi([entry.topic], effectiveTopic)[0] ?? entry.topic,
    index,
    isActive: index === currentChapterIndex,
    isCompleted: index < currentChapterIndex,
    isUnlocked: index < unlockedChapterCount,
  })

  return (
    <section className="learn-path-syllabus-panel" aria-label="Geplanter Lernpfad">
      <div className="learn-path-syllabus-panel-head">
        <p className="learn-path-syllabus-panel-title">Dein Lernplan</p>
        <span className="learn-path-syllabus-panel-count">{entries.length} Kapitel</span>
      </div>
      <div className="learn-path-syllabus-list" role="list">
        {previewEntries.map((entry, previewIndex) => {
          const index = windowStart + previewIndex
          return (
            <SyllabusItemView
              key={`${entry.topic}-${index}`}
              {...buildItemProps(entry, index)}
              showConnector={previewIndex < previewEntries.length - 1}
            />
          )
        })}
      </div>
      {hasMore ? (
        <button type="button" className="learn-path-syllabus-more-button" onClick={() => setIsFullPlanOpen(true)}>
          Mehr anzeigen
        </button>
      ) : null}

      <ModalShell isOpen={isFullPlanOpen} onRequestClose={() => setIsFullPlanOpen(false)}>
        <div
          className="rename-modal learn-path-syllabus-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Dein Lernplan"
          onClick={(event) => event.stopPropagation()}
        >
          <ModalHeader
            title="Dein Lernplan"
            headingLevel="h3"
            closeLabel="Schließen"
            onClose={() => setIsFullPlanOpen(false)}
          />
          <div className="learn-path-syllabus-list learn-path-syllabus-list--modal" role="list">
            {entries.map((entry, index) => (
              <SyllabusItemView
                key={`${entry.topic}-${index}`}
                {...buildItemProps(entry, index)}
                showConnector={index < entries.length - 1}
              />
            ))}
          </div>
        </div>
      </ModalShell>
    </section>
  )
}
