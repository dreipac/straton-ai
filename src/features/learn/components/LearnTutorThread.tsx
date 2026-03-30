import checkIcon from '../../../assets/icons/check.svg'
import fileIcon from '../../../assets/icons/file.svg'
import type { EntryQuizResult, TutorChatEntry } from '../services/learn.persistence'

export type LearnTutorThreadProps = {
  messages: TutorChatEntry[]
  entryQuizResult: EntryQuizResult | null
  entryTestDurationLabel: string
  onOpenEntryQuizModal: () => void
}

export function LearnTutorThread(props: LearnTutorThreadProps) {
  const { messages, entryQuizResult, entryTestDurationLabel, onOpenEntryQuizModal } = props

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
                  ? 'Anhand deiner Testergebnisse wurden Lernkapitel generiert.'
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
                  {entryQuizResult ? 'Ergebnisdatei oeffnen' : 'Datei oeffnen'}
                </span>
              </span>
            </button>
          ) : null}
        </article>
      ))}
    </>
  )
}
