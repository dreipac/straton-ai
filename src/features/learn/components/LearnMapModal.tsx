import type { SyllabusEntry, TopicSession } from '../services/learn.persistence'
import { LearnMapCanvas } from './LearnMapCanvas'

export type LearnMapModalProps = {
  isMounted: boolean
  isVisible: boolean
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  topicSessions: TopicSession[]
  effectiveTopic: string
  focusTopicIndex: number
  onOpenTopic: (topicIndex: number) => void
  onClose: () => void
}

/** Landkarte Phase 2: Vollbild-Kartenansicht — eigenes Overlay, kein zentriertes ModalShell-Card-Layout. */
export function LearnMapModal(props: LearnMapModalProps) {
  const { isMounted, isVisible, syllabus, learningChapters, topicSessions, effectiveTopic, focusTopicIndex, onOpenTopic, onClose } =
    props

  if (!isMounted) {
    return null
  }

  const entries: SyllabusEntry[] =
    syllabus.length > 0 ? syllabus : learningChapters.map((topic) => ({ topic, learningGoal: '' }))

  return (
    <div className={`learn-map-modal-overlay${isVisible ? ' is-visible' : ''}`} role="dialog" aria-modal="true" aria-label="Lernlandkarte">
      <div className="learn-map-modal-head">
        <p className="learn-map-modal-title">Deine Lernlandkarte</p>
        <button type="button" className="settings-close-button" onClick={onClose} aria-label="Landkarte schließen">
          <span className="ui-icon settings-close-icon" aria-hidden="true" />
        </button>
      </div>
      <div className="learn-map-modal-canvas">
        <LearnMapCanvas
          syllabus={entries}
          topicSessions={topicSessions}
          effectiveTopic={effectiveTopic}
          focusTopicIndex={focusTopicIndex}
          onOpenTopic={onOpenTopic}
          interactive
        />
      </div>
    </div>
  )
}
