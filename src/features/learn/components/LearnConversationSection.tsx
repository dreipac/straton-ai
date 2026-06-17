import type { ReactNode } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { EntryQuizResult, LearnWorksheetItem, SyllabusEntry, TutorChatEntry } from '../services/learn.persistence'
import { LearnChapterPreview, type LearnChapterPreviewProps } from './LearnChapterPreview'
import { LearnEntryPrepPanel, type LearnEntryPrepPanelProps } from './LearnEntryPrepPanel'
import { LearnSyllabusPanel } from './LearnSyllabusPanel'
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
  currentChapterIndex: number
  unlockedChapterCount: number
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
    currentChapterIndex,
    unlockedChapterCount,
    footer,
  } = props

  const showSyllabusAside = syllabus.length > 0 || learningChapters.length > 0

  const showChapterPreviewBlock = showChapterPreview && learningChaptersCount > 0

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

  const conversationBody =
    showSyllabusAside && tutorMessages.length > 0 && !showChapterPreviewBlock && !isPostEntryPrepLoading ? (
      <div className="learn-path-workspace">
        <div className="learn-path-workspace-main">
          <div className="learn-conversation-thread">{body}</div>
        </div>
        <aside className="learn-path-workspace-aside">
          <LearnSyllabusPanel
            syllabus={syllabus}
            learningChapters={learningChapters}
            effectiveTopic={effectiveTopic}
            currentChapterIndex={currentChapterIndex}
            unlockedChapterCount={unlockedChapterCount}
            variant="aside"
          />
        </aside>
      </div>
    ) : (
      body
    )

  return (
    <section className="learn-conversation">
      {conversationBody}
      {footer}
    </section>
  )
}
