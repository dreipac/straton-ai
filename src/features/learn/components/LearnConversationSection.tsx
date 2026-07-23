import { type ReactNode } from 'react'
import type { LearnWorksheetItem, SyllabusEntry, TopicSession, TutorChatEntry } from '../services/learn.persistence'
import { LearnChapterPreview, type LearnChapterPreviewProps } from './LearnChapterPreview'
import { LearnEntryPrepPanel, type LearnEntryPrepPanelProps } from './LearnEntryPrepPanel'
import { LearnMapCanvas } from './LearnMapCanvas'
import { LearnTutorThread } from './LearnTutorThread'

export type LearnConversationSectionProps = {
  showChapterPreview: boolean
  learningChaptersCount: number
  chapterPreview: LearnChapterPreviewProps
  isPostEntryPrepLoading: boolean
  postEntryPrepPanel: LearnEntryPrepPanelProps
  tutorMessages: TutorChatEntry[]
  onStartNextChapter: () => void
  chapterBlueprintReady: boolean
  onCreateFlashcards: () => void
  onCreateWorksheet: () => void
  learnWorksheets: LearnWorksheetItem[]
  tutorWorksheetChapterIndex: number
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  effectiveTopic: string
  topicSessions: TopicSession[]
  targetTopicIndexForOpen: number
  onOpenTopic: (topicIndex: number) => void
  footer?: ReactNode
}

export function LearnConversationSection(props: LearnConversationSectionProps) {
  const {
    showChapterPreview,
    learningChaptersCount,
    chapterPreview,
    isPostEntryPrepLoading,
    postEntryPrepPanel,
    tutorMessages,
    onStartNextChapter,
    chapterBlueprintReady,
    onCreateFlashcards,
    onCreateWorksheet,
    learnWorksheets,
    tutorWorksheetChapterIndex,
    syllabus,
    learningChapters,
    effectiveTopic,
    topicSessions,
    targetTopicIndexForOpen,
    onOpenTopic,
    footer,
  } = props

  const showSyllabusAside = syllabus.length > 0 || learningChapters.length > 0

  const showChapterPreviewBlock = showChapterPreview && learningChaptersCount > 0

  /** Landkarte als bedienbarer Tab-Hintergrund: sobald ein Lernplan existiert und wir nicht in einem
   *  Ladezustand (Prep/Kapitel-Preview) stecken. Der Tutor-Chat wird dann zum einklappbaren Panel. */
  const useMapSurface = showSyllabusAside && !showChapterPreviewBlock && !isPostEntryPrepLoading

  let body: ReactNode
  if (showChapterPreviewBlock) {
    body = <LearnChapterPreview {...chapterPreview} />
  } else if (isPostEntryPrepLoading) {
    body = <LearnEntryPrepPanel {...postEntryPrepPanel} />
  } else if (tutorMessages.length === 0) {
    body = <LearnEntryPrepPanel {...postEntryPrepPanel} />
  } else {
    body = (
      <LearnTutorThread
        messages={tutorMessages}
        onStartNextChapter={onStartNextChapter}
        chapterBlueprintReady={chapterBlueprintReady}
        onCreateFlashcards={onCreateFlashcards}
        onCreateWorksheet={onCreateWorksheet}
        learnWorksheets={learnWorksheets}
        tutorWorksheetChapterIndex={tutorWorksheetChapterIndex}
        stripEmbeddedSyllabus={showSyllabusAside}
      />
    )
  }

  if (useMapSurface) {
    const entries: SyllabusEntry[] =
      syllabus.length > 0 ? syllabus : learningChapters.map((topic) => ({ topic, learningGoal: '' }))

    // Vollflächige Landkarte: keine Tutor-Box mehr — der Lernpfad-Tab besteht nur aus der Karte,
    // bedient wird ausschließlich die Landkarte (Kapitelstart über die Vorschaukarte oben rechts).
    return (
      <section className="learn-conversation learn-conversation--map">
        <div className="learn-path-map-surface">
          <div className="learn-path-map-surface-canvas">
            <LearnMapCanvas
              syllabus={entries}
              topicSessions={topicSessions}
              effectiveTopic={effectiveTopic}
              focusTopicIndex={targetTopicIndexForOpen}
              onOpenTopic={onOpenTopic}
            />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="learn-conversation">
      {body}
      {footer}
    </section>
  )
}
