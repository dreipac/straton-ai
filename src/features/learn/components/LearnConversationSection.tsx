import type { ReactNode } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import type { EntryQuizResult, LearnWorksheetItem, TutorChatEntry } from '../services/learn.persistence'
import { LearnChapterPreview, type LearnChapterPreviewProps } from './LearnChapterPreview'
import { LearnEntryPrepPanel, type LearnEntryPrepPanelProps } from './LearnEntryPrepPanel'
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
  onCreateFlashcards: () => void
  onCreateWorksheet: () => void
  learnWorksheets: LearnWorksheetItem[]
  tutorWorksheetChapterIndex: number
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
    onCreateFlashcards,
    onCreateWorksheet,
    learnWorksheets,
    tutorWorksheetChapterIndex,
    footer,
  } = props

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
        onCreateFlashcards={onCreateFlashcards}
        onCreateWorksheet={onCreateWorksheet}
        learnWorksheets={learnWorksheets}
        tutorWorksheetChapterIndex={tutorWorksheetChapterIndex}
      />
    )
  }

  return (
    <section className="learn-conversation">
      {body}
      {footer}
    </section>
  )
}
