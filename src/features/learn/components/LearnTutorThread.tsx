import chevronLeftIcon from '../../../assets/icons/chevron-left.svg'
import starsIcon from '../../../assets/icons/stars.svg'
import kompassImage from '../../../assets/png/kompass.png'
import type { LearnWorksheetItem, TutorChatEntry } from '../services/learn.persistence'
import { stripEmbeddedSyllabusFromTutorMessage } from '../utils/learnTutorCoachMessages'
import { getWorksheetChapterProgress } from '../utils/learnPageHelpers'

export type LearnTutorThreadProps = {
  messages: TutorChatEntry[]
  onStartNextChapter: () => void
  chapterBlueprintReady: boolean
  onCreateFlashcards: () => void
  onCreateWorksheet: () => void
  learnWorksheets: LearnWorksheetItem[]
  tutorWorksheetChapterIndex: number
  stripEmbeddedSyllabus?: boolean
}

function splitTutorCoachContent(content: string): { headline: string; body: string } {
  const cleaned = content.trim()
  const parts = cleaned.split(/\n\n+/).filter(Boolean)
  if (parts.length <= 1) {
    return { headline: cleaned, body: '' }
  }
  return { headline: parts[0] ?? cleaned, body: parts.slice(1).join('\n\n') }
}

function formatCoachBody(text: string): string {
  return text.replace(/nimm dir Zeit,\s*(?=ich begleite dich)/i, 'nimm dir Zeit,\n')
}

function renderStartChapterCoachCard(
  message: TutorChatEntry,
  content: string,
  chapterBlueprintReady: boolean,
  onStartNextChapter: () => void,
) {
  const { headline, body: rawBody } = splitTutorCoachContent(content)
  const body = formatCoachBody(rawBody)

  return (
    <article key={message.id} className="learn-tutor-coach-card is-reveal">
      <div className="learn-tutor-coach-card-glow" aria-hidden="true" />
      <div className="learn-tutor-coach-card-content">
        <div className="learn-tutor-coach-card-layout">
          <div className="learn-tutor-coach-card-main">
            <span className="learn-tutor-coach-card-brand">Straton AI</span>
            <p className="learn-tutor-coach-card-headline">{headline}</p>
            {body ? (
              <>
                <span className="learn-tutor-coach-card-divider" aria-hidden="true" />
                <p className="learn-tutor-coach-card-body">{body}</p>
              </>
            ) : null}
            <button type="button" className="learn-tutor-coach-card-action" onClick={onStartNextChapter}>
              <span className="learn-tutor-coach-card-action-icon-wrap" aria-hidden="true">
                <img className="ui-icon learn-tutor-coach-card-action-icon" src={starsIcon} alt="" />
              </span>
              <span className="learn-tutor-coach-card-action-content">
                <span className="learn-tutor-coach-card-action-title">
                  {chapterBlueprintReady ? 'Kapitel öffnen' : 'Kapitel generieren'}
                </span>
                <span className="learn-tutor-coach-card-action-meta">
                  {chapterBlueprintReady ? 'Lernblock starten' : 'KI erstellt deinen Lernblock'}
                </span>
              </span>
              <span className="learn-tutor-coach-card-action-chevron-wrap" aria-hidden="true">
                <img className="ui-icon learn-tutor-coach-card-action-chevron" src={chevronLeftIcon} alt="" />
              </span>
            </button>
          </div>
          <div className="learn-tutor-coach-card-visual" aria-hidden="true">
            <img className="learn-tutor-coach-card-compass" src={kompassImage} alt="" />
          </div>
        </div>
      </div>
    </article>
  )
}

export function LearnTutorThread(props: LearnTutorThreadProps) {
  const {
    messages,
    onStartNextChapter,
    chapterBlueprintReady,
    onCreateFlashcards,
    onCreateWorksheet,
    learnWorksheets,
    tutorWorksheetChapterIndex,
    stripEmbeddedSyllabus = false,
  } = props

  const worksheetGateProgress = getWorksheetChapterProgress(learnWorksheets, tutorWorksheetChapterIndex)

  const renderMessageContent = (message: TutorChatEntry) => {
    const content =
      stripEmbeddedSyllabus && message.role === 'assistant'
        ? stripEmbeddedSyllabusFromTutorMessage(message.content)
        : message.content
    return <p>{content}</p>
  }

  return (
    <>
      {messages.map((message) => {
        if (message.action === 'start-next-chapter') {
          const content =
            stripEmbeddedSyllabus && message.role === 'assistant'
              ? stripEmbeddedSyllabusFromTutorMessage(message.content)
              : message.content
          return renderStartChapterCoachCard(message, content, chapterBlueprintReady, onStartNextChapter)
        }

        return (
        <article
          key={message.id}
          className={`learn-conversation-message is-${message.role} ${message.role === 'assistant' ? 'is-reveal' : ''}`}
        >
          {message.role === 'assistant' ? <strong className="chat-message-author">Straton AI</strong> : null}
          {renderMessageContent(message)}
          {message.action === 'create-flashcards' ? (
            <button type="button" className="learn-entry-test-link" onClick={onCreateFlashcards}>
              <span className="learn-entry-test-link-content">
                <span className="learn-entry-test-link-title">Lernkarten erstellen</span>
                <span className="learn-entry-test-link-meta">Jetzt Lernkarten generieren</span>
              </span>
            </button>
          ) : null}
          {message.action === 'create-worksheet' ? (
            <button type="button" className="learn-entry-test-link" onClick={onCreateWorksheet}>
              <span className="learn-entry-test-link-content">
                <span className="learn-entry-test-link-title">
                  {worksheetGateProgress.total === 0
                    ? 'Lernblatt erstellen'
                    : worksheetGateProgress.isComplete
                      ? 'Lernblatt ansehen'
                      : 'Lernblatt fortsetzen'}
                </span>
                <span className="learn-entry-test-link-meta">
                  {worksheetGateProgress.total === 0
                    ? 'Jetzt Lernblatt generieren'
                    : worksheetGateProgress.isComplete
                      ? 'Alle Aufgaben wurden geprüft'
                      : `${worksheetGateProgress.evaluatedCount}/${worksheetGateProgress.total} Aufgaben geprüft`}
                </span>
              </span>
            </button>
          ) : null}
        </article>
        )
      })}
    </>
  )
}
