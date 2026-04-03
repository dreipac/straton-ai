import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import fileIcon from '../../../assets/icons/file.svg'
import sendIcon from '../../../assets/icons/send.svg'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import type { ChatMessage } from '../types'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'
import { extractLearningMaterialText } from '../../learn/utils/documentParser'

type ChatWindowProps = {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  greetingName: string
  tokenLimitReached?: boolean
  onSendMessage: (content: string) => Promise<void>
}

type QuizAnswerStatus = 'idle' | 'correct' | 'incorrect'
type PendingAttachment = {
  id: string
  name: string
  content: string
}

type QuizAnswerState = {
  value: string
  status: QuizAnswerStatus
  feedback: string
}

export function ChatWindow({
  messages,
  isSending,
  error,
  greetingName,
  tokenLimitReached = false,
  onSendMessage,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const isEmptyState = messages.length === 0
  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({})
  const [quizChecksInProgress, setQuizChecksInProgress] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set())
  const animationTimersRef = useRef<number[]>([])
  const wasSendingRef = useRef(isSending)

  function renderInlineMarkdown(content: string): ReactNode[] {
    const fragments: ReactNode[] = []
    let cursor = 0
    let keyIndex = 0

    while (cursor < content.length) {
      const start = content.indexOf('**', cursor)
      if (start === -1) {
        fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor)}</span>)
        break
      }

      const end = content.indexOf('**', start + 2)
      if (end === -1) {
        fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor)}</span>)
        break
      }

      if (start > cursor) {
        fragments.push(<span key={`plain-${keyIndex++}`}>{content.slice(cursor, start)}</span>)
      }

      const boldText = content.slice(start + 2, end)
      if (boldText) {
        fragments.push(<strong key={`bold-${keyIndex++}`}>{boldText}</strong>)
      } else {
        fragments.push(<span key={`plain-${keyIndex++}`}>****</span>)
      }

      cursor = end + 2
    }

    return fragments
  }

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      animationTimersRef.current = []
    }
  }, [])

  useEffect(() => {
    const latestMessage = messages[messages.length - 1]
    const shouldAnimateLatestAssistant =
      wasSendingRef.current &&
      !isSending &&
      latestMessage?.role === 'assistant' &&
      !animatedAssistantIdsRef.current.has(latestMessage.id)

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue
      }

      const alreadyHandled = animatedAssistantIdsRef.current.has(message.id)
      if (alreadyHandled) {
        continue
      }

      if (shouldAnimateLatestAssistant && latestMessage?.id === message.id) {
        const fullContent = message.content
        const stepSize = Math.max(1, Math.ceil(fullContent.length / 90))
        let cursor = 0

        const run = () => {
          cursor = Math.min(cursor + stepSize, fullContent.length)
          setAnimatedAssistantContent((prev) => ({
            ...prev,
            [message.id]: fullContent.slice(0, cursor),
          }))

          if (cursor < fullContent.length) {
            const timerId = window.setTimeout(run, 18)
            animationTimersRef.current.push(timerId)
            return
          }

          animatedAssistantIdsRef.current.add(message.id)
        }

        const startTimerId = window.setTimeout(run, 0)
        animationTimersRef.current.push(startTimerId)
        continue
      }

      const immediateTimerId = window.setTimeout(() => {
        setAnimatedAssistantContent((prev) => ({ ...prev, [message.id]: message.content }))
      }, 0)
      animationTimersRef.current.push(immediateTimerId)
      animatedAssistantIdsRef.current.add(message.id)
    }

    wasSendingRef.current = isSending
  }, [isSending, messages])

  function getQuizAnswerKey(messageId: string, questionId: string) {
    return `${messageId}::${questionId}`
  }

  function getQuizAnswerState(messageId: string, questionId: string): QuizAnswerState {
    const key = getQuizAnswerKey(messageId, questionId)
    return quizAnswers[key] ?? { value: '', status: 'idle', feedback: '' }
  }

  function updateQuizAnswerValue(messageId: string, questionId: string, value: string) {
    const key = getQuizAnswerKey(messageId, questionId)
    setQuizAnswers((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { status: 'idle', feedback: '' }),
        value,
      },
    }))
  }

  async function checkQuizAnswer(message: ChatMessage, questionId: string) {
    const parsed = parseInteractiveContentWithFallback(message.content)
    if (!parsed.quiz) {
      return
    }

    const question = parsed.quiz.questions.find((entry) => entry.id === questionId)
    if (!question) {
      return
    }

    const key = getQuizAnswerKey(message.id, questionId)
    const current = quizAnswers[key] ?? { value: '', status: 'idle', feedback: '' }
    setQuizChecksInProgress((prev) => ({ ...prev, [key]: true }))

    try {
      const result = await evaluateQuizAnswerWithAi({
        question,
        userAnswer: current.value,
      })

      setQuizAnswers((prev) => ({
        ...prev,
        [key]: {
          value: current.value,
          status: result.isCorrect ? 'correct' : 'incorrect',
          feedback: result.feedback,
        },
      }))
    } catch {
      setQuizAnswers((prev) => ({
        ...prev,
        [key]: {
          value: current.value,
          status: 'incorrect',
          feedback: 'KI Bewertung momentan nicht erreichbar. Bitte erneut pruefen.',
        },
      }))
    } finally {
      setQuizChecksInProgress((prev) => ({ ...prev, [key]: false }))
    }
  }

  function buildAttachmentMessageBlocks(items: PendingAttachment[]): string {
    return items
      .map((item) =>
        item.content.trim()
          ? `[Datei: ${item.name}]\n${item.content}\n[/Datei]`
          : `[Datei: ${item.name}] (Kein auslesbarer Text gefunden)\n[/Datei]`,
      )
      .join('\n\n')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if ((!draft.trim() && pendingAttachments.length === 0) || isSending || isAttachingFiles) {
      return
    }

    const textPart = draft.trim()
    const attachmentPart = buildAttachmentMessageBlocks(pendingAttachments)
    const content = [textPart, attachmentPart].filter(Boolean).join('\n\n')
    setDraft('')
    setPendingAttachments([])
    await onSendMessage(content)
  }

  async function handleAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || isSending || isAttachingFiles || tokenLimitReached) {
      return
    }

    setIsAttachingFiles(true)
    try {
      const files = Array.from(fileList)
      const nextAttachments: PendingAttachment[] = []

      for (const file of files) {
        const text = await extractLearningMaterialText(file)
        const excerpt = text.trim().slice(0, 1400)
        nextAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: excerpt,
        })
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments])
    } finally {
      setIsAttachingFiles(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      inputRef.current?.focus()
    }
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  if (isEmptyState) {
    return (
      <section className={`chat-panel is-empty${tokenLimitReached ? ' has-limit-banner' : ''}`}>
        {tokenLimitReached ? (
          <p className="chat-limit-banner" role="alert">
            Dein Token-Limit fuer heute ist erreicht. Du kannst morgen wieder schreiben.
          </p>
        ) : null}
        <div className="chat-empty-compose">
          <h2 className="chat-empty-title">Wie kann ich dir heute helfen, {greetingName}?</h2>
          {error ? <p className="error-text">{error}</p> : null}
          <form className="chat-input-row is-centered chat-input-row--stacked" onSubmit={handleSubmit}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="chat-file-input-hidden"
              onChange={(event) => {
                void handleAttachFiles(event.target.files)
              }}
            />
            <button
              type="button"
              className="chat-attach-button"
              disabled={isSending || isAttachingFiles || tokenLimitReached}
              aria-label="Datei anhängen"
              onClick={() => fileInputRef.current?.click()}
            >
              <img className="ui-icon chat-send-icon" src={fileIcon} alt="" aria-hidden="true" />
            </button>
            <div className="chat-input-compose">
              {pendingAttachments.length > 0 ? (
                <div className="chat-attachment-chips" aria-label="Angehängte Dateien">
                  {pendingAttachments.map((item) => (
                    <span key={item.id} className="chat-attachment-chip">
                      <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" aria-hidden="true" />
                      <span className="chat-attachment-chip-name">{item.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="chat-attachment-chip-remove"
                        aria-label={`${item.name} entfernen`}
                        onClick={() => removeAttachment(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            removeAttachment(item.id)
                          }
                        }}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="chat-input-field">
                <input
                  ref={inputRef}
                  className="chat-input"
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={tokenLimitReached ? 'Token-Limit erreicht' : 'Nachricht eingeben...'}
                  disabled={isSending || isAttachingFiles || tokenLimitReached}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={
                tokenLimitReached || isSending || isAttachingFiles || (!draft.trim() && pendingAttachments.length === 0)
              }
            >
              <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
            </button>
          </form>
          <p className="chat-input-hint">
            Straton kann Fehler machen, überprüfe wichtige Informationen
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className={`chat-panel${tokenLimitReached ? ' has-limit-banner' : ''}`}>
      {tokenLimitReached ? (
        <p className="chat-limit-banner" role="alert">
          Dein Token-Limit fuer heute ist erreicht. Du kannst morgen wieder schreiben.
        </p>
      ) : null}
      <div className="chat-messages">
        {messages.map((message) => {
          const isAssistant = message.role === 'assistant'
          const parsed = isAssistant ? parseInteractiveContentWithFallback(message.content) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = animatedAssistantContent[message.id] ?? message.content
          const displayContent = hasInteractiveQuiz
            ? parsed?.cleanText || ''
            : isAssistant
              ? animatedContent
              : message.content

          return (
            <article
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
            >
              {isAssistant ? <strong className="chat-message-author">Straton AI</strong> : null}
              {displayContent ? <p>{renderInlineMarkdown(displayContent)}</p> : null}

              {hasInteractiveQuiz ? (
                <section className="interactive-quiz-block" aria-label="Interaktive Pruefungsfragen">
                  {parsed?.quiz?.title ? <h4 className="interactive-quiz-title">{parsed.quiz.title}</h4> : null}

                  {parsed?.quiz?.questions.map((question) => {
                    const current = getQuizAnswerState(message.id, question.id)
                    const key = getQuizAnswerKey(message.id, question.id)
                    const isChecking = quizChecksInProgress[key] === true
                    const statusClass =
                      current.status === 'correct'
                        ? 'is-correct'
                        : current.status === 'incorrect'
                          ? 'is-incorrect'
                          : ''

                    return (
                      <div key={question.id} className={`interactive-quiz-question ${statusClass}`}>
                        <p className="interactive-quiz-prompt">{question.prompt}</p>
                        <div className="interactive-quiz-answer-row">
                          <input
                            className="interactive-quiz-answer-input"
                            type="text"
                            value={current.value}
                            onChange={(event) =>
                              updateQuizAnswerValue(message.id, question.id, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void checkQuizAnswer(message, question.id)
                              }
                            }}
                            placeholder="Deine Antwort..."
                            disabled={isChecking}
                          />
                          <button
                            type="button"
                            className={`interactive-quiz-check ${statusClass}`}
                            aria-label="Antwort pruefen"
                            onClick={() => {
                              void checkQuizAnswer(message, question.id)
                            }}
                            disabled={!current.value.trim() || isChecking}
                          >
                            {isChecking ? '…' : '○'}
                          </button>
                        </div>
                        {current.feedback ? (
                          <p className={`interactive-quiz-feedback ${statusClass}`}>{current.feedback}</p>
                        ) : null}
                      </div>
                    )
                  })}
                </section>
              ) : null}
            </article>
          )
        })}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-input-row chat-input-row--stacked" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-file-input-hidden"
          onChange={(event) => {
            void handleAttachFiles(event.target.files)
          }}
        />
        <button
          type="button"
          className="chat-attach-button"
          disabled={isSending || isAttachingFiles || tokenLimitReached}
          aria-label="Datei anhängen"
          onClick={() => fileInputRef.current?.click()}
        >
          <img className="ui-icon chat-send-icon" src={fileIcon} alt="" aria-hidden="true" />
        </button>
        <div className="chat-input-compose">
          {pendingAttachments.length > 0 ? (
            <div className="chat-attachment-chips" aria-label="Angehängte Dateien">
              {pendingAttachments.map((item) => (
                <span key={item.id} className="chat-attachment-chip">
                  <img className="ui-icon chat-attachment-chip-icon" src={fileIcon} alt="" aria-hidden="true" />
                  <span className="chat-attachment-chip-name">{item.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="chat-attachment-chip-remove"
                    aria-label={`${item.name} entfernen`}
                    onClick={() => removeAttachment(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        removeAttachment(item.id)
                      }
                    }}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="chat-input-field">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={tokenLimitReached ? 'Token-Limit erreicht' : 'Nachricht eingeben...'}
              disabled={isSending || isAttachingFiles || tokenLimitReached}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={tokenLimitReached || isSending || isAttachingFiles || (!draft.trim() && pendingAttachments.length === 0)}
        >
          <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
        </button>
      </form>
      <p className="chat-input-hint">
        Straton kann Fehler machen, überprüfe wichtige Informationen
      </p>
    </section>
  )
}
