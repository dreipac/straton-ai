import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import sendIcon from '../../../assets/icons/send.svg'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import type { ChatMessage } from '../types'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'

type ChatWindowProps = {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  greetingName: string
  onSendMessage: (content: string) => Promise<void>
}

type QuizAnswerStatus = 'idle' | 'correct' | 'incorrect'

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
  onSendMessage,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const isEmptyState = messages.length === 0
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [caretLeft, setCaretLeft] = useState(0)
  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({})
  const [quizChecksInProgress, setQuizChecksInProgress] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement | null>(null)
  const measurerRef = useRef<HTMLSpanElement | null>(null)
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

  const updateSmoothCaret = useCallback(() => {
    const inputElement = inputRef.current
    const measurerElement = measurerRef.current
    if (!inputElement || !measurerElement) {
      return
    }

    const cursorIndex = inputElement.selectionStart ?? inputElement.value.length
    const textBeforeCursor = inputElement.value.slice(0, cursorIndex).replace(/ /g, '\u00a0')
    measurerElement.textContent = textBeforeCursor || '\u200b'

    const computed = window.getComputedStyle(inputElement)
    const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0
    const paddingRight = Number.parseFloat(computed.paddingRight) || 0
    const measuredWidth = measurerElement.getBoundingClientRect().width
    const nextLeft = paddingLeft + measuredWidth - inputElement.scrollLeft
    const maxLeft = inputElement.clientWidth - paddingRight - 2
    setCaretLeft(Math.min(Math.max(nextLeft, paddingLeft), Math.max(maxLeft, paddingLeft)))
  }, [])

  useLayoutEffect(() => {
    updateSmoothCaret()
  }, [draft, updateSmoothCaret])

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.trim() || isSending) {
      return
    }

    const content = draft
    setDraft('')
    await onSendMessage(content)
  }

  if (isEmptyState) {
    return (
      <section className="chat-panel is-empty">
        <div className="chat-empty-compose">
          <h2 className="chat-empty-title">Wie kann ich dir heute helfen, {greetingName}?</h2>
          {error ? <p className="error-text">{error}</p> : null}
          <form className="chat-input-row is-centered" onSubmit={handleSubmit}>
            <div className="chat-input-field">
              <input
                ref={inputRef}
                className="chat-input has-smooth-caret"
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyUp={updateSmoothCaret}
                onClick={updateSmoothCaret}
                onSelect={updateSmoothCaret}
                onScroll={updateSmoothCaret}
                onFocus={() => {
                  setIsInputFocused(true)
                  updateSmoothCaret()
                }}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Nachricht eingeben..."
                disabled={isSending}
              />
              <span ref={measurerRef} className="chat-caret-measurer" aria-hidden="true" />
              {isInputFocused ? <span className="chat-smooth-caret" style={{ left: `${caretLeft}px` }} /> : null}
            </div>
            <button type="submit" disabled={isSending || !draft.trim()}>
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
    <section className="chat-panel">
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

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <div className="chat-input-field">
          <input
            ref={inputRef}
            className="chat-input has-smooth-caret"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyUp={updateSmoothCaret}
            onClick={updateSmoothCaret}
            onSelect={updateSmoothCaret}
            onScroll={updateSmoothCaret}
            onFocus={() => {
              setIsInputFocused(true)
              updateSmoothCaret()
            }}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Nachricht eingeben..."
            disabled={isSending}
          />
          <span ref={measurerRef} className="chat-caret-measurer" aria-hidden="true" />
          {isInputFocused ? <span className="chat-smooth-caret" style={{ left: `${caretLeft}px` }} /> : null}
        </div>
        <button type="submit" disabled={isSending || !draft.trim()}>
          <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
