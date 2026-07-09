import { type ReactNode } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type {
  EntryQuizResult,
  LearnWorksheetItem,
  SyllabusEntry,
  TopicSession,
  TutorChatEntry,
} from '../services/learn.persistence'
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
  isEntryQuizLoading: boolean
  isEntryPrepClosing: boolean
  entryPrepPanel: LearnEntryPrepPanelProps
  entryQuizFallbackError: string | null
  onRetryEntryQuizGeneration: () => void
  entryQuizResult: EntryQuizResult | null
  entryTestDurationLabel: string
  onOpenEntryQuizModal: () => void
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
  onOpenMap: () => void
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
    isEntryQuizLoading,
    isEntryPrepClosing,
    entryPrepPanel,
    entryQuizFallbackError,
    onRetryEntryQuizGeneration,
    entryQuizResult,
    entryTestDurationLabel,
    onOpenEntryQuizModal,
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
    onOpenMap,
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
    body =
      isEntryQuizLoading || isEntryPrepClosing ? (
        <LearnEntryPrepPanel {...entryPrepPanel} />
      ) : (
        <div className="learn-entry-prep-fallback">
          <p className="learn-muted">Einstiegstest konnte nicht automatisch erstellt werden.</p>
          {entryQuizFallbackError ? <p className="learn-muted">{entryQuizFallbackError}</p> : null}
          <SecondaryButton
            type="button"
            onClick={() => {
              onRetryEntryQuizGeneration()
            }}
          >
            Erneut versuchen
          </SecondaryButton>
        </div>
      )
  } else {
    body = (
      <LearnTutorThread
        messages={tutorMessages}
        entryQuizResult={entryQuizResult}
        entryTestDurationLabel={entryTestDurationLabel}
        onOpenEntryQuizModal={onOpenEntryQuizModal}
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
              interactive
            />
          </div>
          <button
            type="button"
            className="learn-path-map-expand"
            onClick={onOpenMap}
            aria-label="Landkarte im Vollbild öffnen"
          >
            <span className="learn-path-map-expand-icon" aria-hidden="true" />
          </button>
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
