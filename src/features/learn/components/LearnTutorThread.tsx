import checkIcon from '../../../assets/icons/check.svg'
import fileIcon from '../../../assets/icons/file.svg'
import type { EntryQuizResult, LearnWorksheetItem, TutorChatEntry } from '../services/learn.persistence'
import { getWorksheetChapterProgress } from '../utils/learnPageHelpers'

export type LearnTutorThreadProps = {
  messages: TutorChatEntry[]
  entryQuizResult: EntryQuizResult | null
  entryTestDurationLabel: string
  onOpenEntryQuizModal: () => void
  onStartNextChapter: () => void
  chapterBlueprintReady: boolean
  onCreateFlashcards: () => void
  onCreateWorksheet: () => void
  learnWorksheets: LearnWorksheetItem[]
  tutorWorksheetChapterIndex: number
}

export function LearnTutorThread(props: LearnTutorThreadProps) {
  const {
    messages,
    entryQuizResult,
    entryTestDurationLabel,
    onOpenEntryQuizModal,
    onStartNextChapter,
    chapterBlueprintReady,
    onCreateFlashcards,
    onCreateWorksheet,
    learnWorksheets,
    tutorWorksheetChapterIndex,
  } = props

  const worksheetGateProgress = getWorksheetChapterProgress(learnWorksheets, tutorWorksheetChapterIndex)

  return (
    <>
      {messages.map((message) => (
        <article
          key={message.id}
          className={`learn-conversation-message is-${message.role} ${message.role === 'assistant' ? 'is-reveal' : ''}`}
        >
          {message.role === 'assistant' && message.action !== 'open-entry-test' ? (
            <strong className="chat-message-author">Straton AI</strong>
          ) : null}
          {message.action === 'open-entry-test' ? (
            <div className="learn-entry-test-ready">
              <p className="learn-entry-test-ready-title">
                <img className="ui-icon learn-entry-test-ready-check" src={checkIcon} alt="" aria-hidden="true" />
                <span>{entryQuizResult ? 'Einstiegstest ausgewertet' : 'Einstiegstest bereit'}</span>
              </p>
              <p className="learn-entry-test-ready-description">
                {entryQuizResult
                  ? 'Dein Einstiegstest wurde ausgewertet. Als Nächstes bekommst du eine passende Empfehlung vom Tutor.'
                  : 'Dieser Test hilft dir, dein Wissen zu analysieren und deinen Lernpfad anzupassen.'}
              </p>
              <p className="learn-entry-test-ready-duration">
                {entryQuizResult
                  ? `Ergebnis: ${entryQuizResult.score}/${entryQuizResult.total}`
                  : `Dauer: ${entryTestDurationLabel}`}
              </p>
            </div>
          ) : (
            <p>{message.content}</p>
          )}
          {message.action === 'open-entry-test' ? (
            <button type="button" className="learn-entry-test-link" onClick={onOpenEntryQuizModal}>
              <span className="learn-entry-test-link-icon-wrap" aria-hidden="true">
                <img className="ui-icon learn-entry-test-link-icon" src={fileIcon} alt="" />
              </span>
              <span className="learn-entry-test-link-content">
                <span className="learn-entry-test-link-title">
                  {entryQuizResult ? 'Einstiegstest Ergebnisse' : 'Einstiegstest'}
                </span>
                <span className="learn-entry-test-link-meta">
                  {entryQuizResult ? 'Ergebnisdatei öffnen' : 'Datei öffnen'}
                </span>
              </span>
            </button>
          ) : null}
          {message.action === 'start-next-chapter' ? (
            <button type="button" className="learn-entry-test-link" onClick={onStartNextChapter}>
              <span className="learn-entry-test-link-content">
                <span className="learn-entry-test-link-title">
                  {chapterBlueprintReady ? 'Kapitel öffnen' : 'Kapitel generieren'}
                </span>
                <span className="learn-entry-test-link-meta">
                  {chapterBlueprintReady ? 'Lernblock starten' : 'KI erstellt deinen Lernblock'}
                </span>
              </span>
            </button>
          ) : null}
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
      ))}
    </>
  )
}
