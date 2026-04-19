import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import attachmentIcon from '../../../assets/icons/attachment.svg'
import duringIcon from '../../../assets/icons/during.svg'
import fileIcon from '../../../assets/icons/file.svg'
import greenFileIcon from '../../../assets/icons/green-file.svg'
import sendIcon from '../../../assets/icons/send.svg'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { EXCEL_EXPORT_COMMAND_MARKER } from '../constants/excelExportPrompt'
import { evaluateQuizAnswerWithAi } from '../services/chat.service'
import { stripExcelSpecBlock } from '../excel/excelSpec'
import type { ChatMessage } from '../types'
import { renderInlineMarkdown } from '../utils/markdownInline'
import { renderAssistantRichContent } from '../utils/renderAssistantRichContent'
import { parseInteractiveContentWithFallback } from '../utils/interactiveQuiz'
import { extractLearningMaterialText } from '../../learn/utils/documentParser'
import type { ChatComposerModelId } from '../constants/chatComposerModels'
import { ChatComposerModelPicker } from './ChatComposerModelPicker'

type ChatWindowProps = {
  /** Aktiver Thread — wechsel setzt Stream-Zustand zurück (sonst falsche Animation). */
  threadKey: string | null
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  greetingName: string
  tokenLimitReached?: boolean
  composerModelId: ChatComposerModelId
  onComposerModelChange: (id: ChatComposerModelId) => void
  onSendMessage: (content: string) => Promise<void>
  /** Laufender KI-Stream: Klick auf den During-Button bricht die Antwort ab. */
  onCancelSend?: () => void
}

type QuizAnswerStatus = 'idle' | 'correct' | 'incorrect'
type PendingAttachment = {
  id: string
  name: string
  content: string
  kind: 'file' | 'pasted-image'
  previewDataUrl?: string
}

type QuizAnswerState = {
  value: string
  status: QuizAnswerStatus
  feedback: string
}

export function ChatWindow({
  threadKey,
  messages,
  isSending,
  error,
  greetingName,
  tokenLimitReached = false,
  composerModelId,
  onComposerModelChange,
  onSendMessage,
  onCancelSend,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [excelCommandSelected, setExcelCommandSelected] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [sentPastedImagePreviews, setSentPastedImagePreviews] = useState<Record<string, string>>({})
  const isEmptyState = messages.length === 0
  const showAssistantPendingLoader =
    isSending &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === 'user'
  const [animatedAssistantContent, setAnimatedAssistantContent] = useState<Record<string, string>>({})
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswerState>>({})
  const [quizChecksInProgress, setQuizChecksInProgress] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
  const [excelDownloadBusyId, setExcelDownloadBusyId] = useState<string | null>(null)
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set())
  const animationTimersRef = useRef<number[]>([])
  /** Zuletzt bekannte Listenlänge (für „genau eine neue Nachricht“ = Stream). */
  const prevMessageCountRef = useRef(0)
  /** Laufende Schreib-Animation: darf nicht vom „Sofort“-Zweig überschrieben werden. */
  const streamingAssistantIdsRef = useRef<Set<string>>(new Set())
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const prevThreadKeyForScrollRef = useRef<string | null>(threadKey)

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined
  const isAssistantReplyStillAnimating = (() => {
    if (!lastMessage || lastMessage.role !== 'assistant') return false
    if (lastMessage.metadata?.liveStream) return false
    const parsed = parseInteractiveContentWithFallback(lastMessage.content)
    if (parsed?.quiz) return false
    if (lastMessage.metadata?.excelExport) return false
    const animated = animatedAssistantContent[lastMessage.id] ?? lastMessage.content
    return animated.length < lastMessage.content.length
  })()
  const showDuringSendIcon = isSending || isAssistantReplyStillAnimating
  const cancelWhileSending = Boolean(isSending && onCancelSend)

  function handleComposerSendClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!cancelWhileSending) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onCancelSend?.()
  }

  const lastMessageFingerprint =
    messages.length > 0
      ? `${messages[messages.length - 1].id}:${messages[messages.length - 1].content.length}`
      : ''

  /** Sanft zum Ende der Liste scrollen (neue Nachricht, längere Antwort, Sende-Ende). */
  useEffect(() => {
    const el = messagesScrollRef.current
    const switchedThread = prevThreadKeyForScrollRef.current !== threadKey
    prevThreadKeyForScrollRef.current = threadKey
    if (!el || messages.length === 0) {
      return
    }
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: switchedThread ? 'auto' : 'smooth',
      })
    })
  }, [threadKey, lastMessageFingerprint, isSending, messages.length])

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      animationTimersRef.current = []
    }
  }, [])

  const MAX_INPUT_HEIGHT_PX = 220

  function adjustComposeHeight() {
    const el = inputRef.current
    if (!el) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`
  }

  useLayoutEffect(() => {
    adjustComposeHeight()
  }, [draft])

  /** Thread gewechselt: Historie sofort voll anzeigen, Stream-Refs zurücksetzen. */
  useLayoutEffect(() => {
    const assistantIds = new Set(messages.filter((m) => m.role === 'assistant').map((m) => m.id))
    animatedAssistantIdsRef.current = assistantIds
    streamingAssistantIdsRef.current = new Set()
    setAnimatedAssistantContent({})
    prevMessageCountRef.current = messages.length
    // messages gehören zum gleichen Render wie threadKey; bei jeder messages-Änderung würden wir fälschlich zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur Thread-Wechsel
  }, [threadKey])

  /** Kein Volltext vor dem ersten Paint bei neu angehängter Assistenten-Nachricht. */
  useLayoutEffect(() => {
    const latest = messages[messages.length - 1]
    const appendedOne = messages.length === prevMessageCountRef.current + 1
    if (
      !latest ||
      latest.role !== 'assistant' ||
      !appendedOne ||
      animatedAssistantIdsRef.current.has(latest.id)
    ) {
      return
    }
    if (latest.metadata?.liveStream) {
      return
    }
    setAnimatedAssistantContent((prev) => ({ ...prev, [latest.id]: '' }))
  }, [messages])

  useEffect(() => {
    animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    animationTimersRef.current = []

    const latestMessage = messages[messages.length - 1]
    const appendedAssistant =
      Boolean(latestMessage) &&
      latestMessage.role === 'assistant' &&
      messages.length === prevMessageCountRef.current + 1 &&
      !animatedAssistantIdsRef.current.has(latestMessage.id)

    const shouldStreamLatest = appendedAssistant

    const rafChainIds: number[] = []
    let streamingStarted = false
    let streamingIdForCleanup: string | null = null

    const cancelRafChain = () => {
      rafChainIds.forEach((id) => cancelAnimationFrame(id))
      rafChainIds.length = 0
    }

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue
      }

      if (message.metadata?.liveStream) {
        setAnimatedAssistantContent((prev) => ({
          ...prev,
          [message.id]: stripExcelSpecBlock(message.content),
        }))
        continue
      }

      if (animatedAssistantIdsRef.current.has(message.id)) {
        continue
      }

      if (streamingAssistantIdsRef.current.has(message.id)) {
        continue
      }

      if (shouldStreamLatest && latestMessage?.id === message.id) {
        /** Roh-Präfix zeigt sonst Marker/JSON, bevor END im String liegt — strip vor Animation. */
        const fullContent = stripExcelSpecBlock(message.content)
        streamingStarted = true
        streamingIdForCleanup = message.id
        streamingAssistantIdsRef.current.add(message.id)

        /** Nach API-Wartezeit: nur kurzes Einblenden — alte Werte wirkten wie zusaetzliche Ladezeit. */
        const charsPerSecond = 320
        const durationMs = Math.min(900, Math.max(120, (fullContent.length / charsPerSecond) * 1000))
        const start = performance.now()
        const targetLen = messages.length

        const tick = (now: number) => {
          const elapsed = now - start
          const t = Math.min(1, elapsed / durationMs)
          const eased = 1 - (1 - t) ** 3
          const len = Math.floor(eased * fullContent.length)
          const slice = fullContent.slice(0, len)
          setAnimatedAssistantContent((prev) => ({
            ...prev,
            [message.id]: slice,
          }))

          if (t < 1) {
            const nextId = requestAnimationFrame(tick)
            rafChainIds.push(nextId)
          } else {
            streamingAssistantIdsRef.current.delete(message.id)
            animatedAssistantIdsRef.current.add(message.id)
            prevMessageCountRef.current = targetLen
          }
        }

        const firstId = requestAnimationFrame(tick)
        rafChainIds.push(firstId)
        continue
      }

      const immediateTimerId = window.setTimeout(() => {
        setAnimatedAssistantContent((prev) => ({ ...prev, [message.id]: message.content }))
      }, 0)
      animationTimersRef.current.push(immediateTimerId)
      animatedAssistantIdsRef.current.add(message.id)
    }

    if (!streamingStarted) {
      prevMessageCountRef.current = messages.length
    }

    return () => {
      cancelRafChain()
      if (streamingIdForCleanup && streamingAssistantIdsRef.current.has(streamingIdForCleanup)) {
        streamingAssistantIdsRef.current.delete(streamingIdForCleanup)
      }
    }
  }, [messages])

  async function downloadExcelExport(message: ChatMessage) {
    const ex = message.metadata?.excelExport
    if (!ex) {
      return
    }
    setExcelDownloadBusyId(message.id)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.storage.from(ex.bucket).createSignedUrl(ex.path, 3600)
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Download-Link konnte nicht erstellt werden.')
      }
      const res = await fetch(data.signedUrl)
      if (!res.ok) {
        throw new Error('Datei konnte nicht geladen werden.')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = ex.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error(e)
    } finally {
      setExcelDownloadBusyId(null)
    }
  }

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
        item.kind === 'pasted-image'
          ? (() => {
              const dataBlock = item.previewDataUrl
                ? `[BildData:${item.id}]\n${item.previewDataUrl}\n[/BildData]`
                : ''
              const ocrBlock = item.content.trim()
                ? `[Bild:${item.id}:${item.name}]\n${item.content}\n[/Bild]`
                : `[Bild:${item.id}:${item.name}] (Kein auslesbarer Text gefunden)\n[/Bild]`
              return [dataBlock, ocrBlock].filter(Boolean).join('\n')
            })()
          : item.content.trim()
            ? `[Datei: ${item.name}]\n${item.content}\n[/Datei]`
            : `[Datei: ${item.name}] (Kein auslesbarer Text gefunden)\n[/Datei]`,
      )
      .join('\n\n')
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const out = typeof reader.result === 'string' ? reader.result : ''
        resolve(out)
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error('Bild konnte nicht gelesen werden.'))
      }
      reader.readAsDataURL(file)
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if ((!draft.trim() && pendingAttachments.length === 0) || isSending || isAttachingFiles) {
      return
    }

    const textPart = draft.trim()
    const attachmentPart = buildAttachmentMessageBlocks(pendingAttachments)
    const baseContent = [textPart, attachmentPart].filter(Boolean).join('\n\n')
    const content = excelCommandSelected
      ? `${EXCEL_EXPORT_COMMAND_MARKER}\n${baseContent}`.trim()
      : baseContent
    const pastedImageEntries = pendingAttachments.filter(
      (entry): entry is PendingAttachment & { kind: 'pasted-image'; previewDataUrl: string } =>
        entry.kind === 'pasted-image' && typeof entry.previewDataUrl === 'string' && entry.previewDataUrl.length > 0,
    )
    if (pastedImageEntries.length > 0) {
      setSentPastedImagePreviews((prev) => {
        const next = { ...prev }
        for (const item of pastedImageEntries) {
          next[item.id] = item.previewDataUrl
        }
        return next
      })
    }
    setDraft('')
    setShowSlashMenu(false)
    setExcelCommandSelected(false)
    setPendingAttachments([])
    await onSendMessage(content)
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue)
    if (excelCommandSelected) {
      setShowSlashMenu(false)
      return
    }
    const withoutTrailingSpaces = nextValue.replace(/\s+$/, '')
    const shouldShow = /(^|\s)\/$/.test(withoutTrailingSpaces)
    setShowSlashMenu(shouldShow)
  }

  function handleSelectExcelSlashCommand() {
    setExcelCommandSelected(true)
    setShowSlashMenu(false)
    setDraft((prev) => prev.replace('/', '').trimStart())
    inputRef.current?.focus()
  }

  function handleComposeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSelectExcelSlashCommand()
      return
    }
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    const form = event.currentTarget.form
    if (!form || tokenLimitReached || isSending || isAttachingFiles) {
      return
    }
    if (!draft.trim() && pendingAttachments.length === 0) {
      return
    }
    form.requestSubmit()
  }

  async function handleAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || isSending || isAttachingFiles || tokenLimitReached) {
      return
    }

    await attachFiles(Array.from(fileList))
  }

  async function attachFiles(files: File[]) {
    if (files.length === 0 || isSending || isAttachingFiles || tokenLimitReached) {
      return
    }

    setIsAttachingFiles(true)
    try {
      const nextAttachments: PendingAttachment[] = []

      for (const file of files) {
        const text = await extractLearningMaterialText(file)
        const excerpt = text.trim().slice(0, 1400)
        nextAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: excerpt,
          kind: 'file',
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

  function handleComposePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (isSending || isAttachingFiles || tokenLimitReached) {
      return
    }
    const clipboardFiles = Array.from(event.clipboardData?.files ?? [])
    const imageFiles = clipboardFiles.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      return
    }
    event.preventDefault()
    void (async () => {
      if (isSending || isAttachingFiles || tokenLimitReached) {
        return
      }
      setIsAttachingFiles(true)
      try {
        const imageAttachments: PendingAttachment[] = []
        for (const file of imageFiles) {
          const [text, previewDataUrl] = await Promise.all([extractLearningMaterialText(file), readFileAsDataUrl(file)])
          imageAttachments.push({
            id: crypto.randomUUID(),
            name: file.name || `image-${Date.now()}.png`,
            content: text.trim().slice(0, 1400),
            kind: 'pasted-image',
            previewDataUrl,
          })
        }
        setPendingAttachments((prev) => [...prev, ...imageAttachments])
      } finally {
        setIsAttachingFiles(false)
        inputRef.current?.focus()
      }
    })()
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  function extractPastedImageIdsFromContent(content: string): string[] {
    const regex = /\[(?:BildData|Bild):([^:\]]+)(?::[^\]]+)?\][\s\S]*?\[\/(?:BildData|Bild)\]/g
    const ids = new Set<string>()
    let match: RegExpExecArray | null = regex.exec(content)
    while (match) {
      const id = String(match[1] ?? '').trim()
      if (id) {
        ids.add(id)
      }
      match = regex.exec(content)
    }
    return [...ids]
  }

  function stripAttachmentBlocksForDisplay(content: string): string {
    return content
      .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
      .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
      .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
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
          <h2 className="chat-empty-title">
            Wie kann ich dir heute helfen, {greetingName}?
          </h2>
          {error ? <p className="error-text">{error}</p> : null}
          <form
            className={`chat-input-row is-centered chat-input-row--stacked${isSending ? ' is-sending' : ''}`}
            onSubmit={handleSubmit}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="chat-file-input-hidden"
              onChange={(event) => {
                void handleAttachFiles(event.target.files)
              }}
            />
            <div className="chat-left-actions">
              <button
                type="button"
                className="chat-attach-button"
                disabled={isSending || isAttachingFiles || tokenLimitReached}
                aria-label="Datei anhängen"
                onClick={() => fileInputRef.current?.click()}
              >
                <img className="ui-icon chat-send-icon" src={attachmentIcon} alt="" aria-hidden="true" />
              </button>
              <ChatComposerModelPicker
                value={composerModelId}
                onChange={onComposerModelChange}
                disabled={isSending || tokenLimitReached}
              />
              {excelCommandSelected ? (
                <button
                  type="button"
                  className="chat-excel-command-icon-badge"
                  title="Excel-Befehl aktiv (klicken zum Entfernen)"
                  aria-label="Excel-Befehl entfernen"
                  onClick={() => setExcelCommandSelected(false)}
                >
                  <img src={greenFileIcon} alt="" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="chat-input-compose">
              {pendingAttachments.length > 0 ? (
                <div className="chat-attachment-chips" aria-label="Angehängte Dateien">
                  {pendingAttachments.map((item) => (
                    item.kind === 'pasted-image' && item.previewDataUrl ? (
                      <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image">
                        <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
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
                    ) : (
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
                    )
                  ))}
                </div>
              ) : null}
              <div className="chat-input-field">
                {showSlashMenu ? (
                  <div className="chat-slash-menu thread-menu" role="menu" aria-label="Slash Befehle">
                    <button
                      type="button"
                      className="thread-menu-item"
                      role="menuitem"
                      onMouseDown={(event) => {
                        event.preventDefault()
                      }}
                      onClick={handleSelectExcelSlashCommand}
                    >
                      Excel
                    </button>
                  </div>
                ) : null}
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  rows={1}
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onKeyDown={handleComposeKeyDown}
                  onPaste={handleComposePaste}
                  placeholder={tokenLimitReached ? 'Token-Limit erreicht' : 'Nachricht eingeben...'}
                  disabled={isSending || tokenLimitReached}
                  aria-multiline="true"
                  autoComplete="off"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={
                tokenLimitReached ||
                isAttachingFiles ||
                (!cancelWhileSending && !draft.trim() && pendingAttachments.length === 0)
              }
              aria-busy={showDuringSendIcon}
              aria-label={
                tokenLimitReached
                  ? 'Token-Limit erreicht'
                  : cancelWhileSending
                    ? 'Antwort abbrechen'
                    : 'Nachricht senden'
              }
              onClick={handleComposerSendClick}
            >
              <img
                className={`ui-icon chat-send-icon${showDuringSendIcon ? ' chat-send-icon--during' : ''}`}
                src={showDuringSendIcon ? duringIcon : sendIcon}
                alt=""
                aria-hidden="true"
              />
            </button>
          </form>
          <p className="chat-input-hint">
            Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
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
      <div className="chat-messages" ref={messagesScrollRef}>
        <div className="chat-messages-inner">
        {messages.map((message) => {
          const isAssistant = message.role === 'assistant'
          const parsed = isAssistant ? parseInteractiveContentWithFallback(message.content) : null
          const hasInteractiveQuiz = Boolean(parsed?.quiz)
          const animatedContent = animatedAssistantContent[message.id] ?? message.content
          /** Nach Excel-Export: gespeicherten Text nutzen (ohne Spec), nicht den Animations-Puffer mit altem JSON. */
          const baseAssistantForDisplay = message.metadata?.liveStream
            ? stripExcelSpecBlock(message.content)
            : message.metadata?.excelExport
              ? message.content
              : animatedContent
          const rawAssistantDisplay = hasInteractiveQuiz ? parsed?.cleanText || '' : baseAssistantForDisplay
          /** JSON-Spec im Chat nie anzeigen — nur Einleitungstext vor <<<STRATON_EXCEL_SPEC_JSON>>>. */
          const displayContent = isAssistant
            ? stripExcelSpecBlock(rawAssistantDisplay)
            : stripAttachmentBlocksForDisplay(message.content)
          const pastedImageIds = message.role === 'user' ? extractPastedImageIdsFromContent(message.content) : []
          const showExcelFallbackText =
            isAssistant &&
            Boolean(message.metadata?.excelExport) &&
            !String(displayContent ?? '').trim()
          const isStreamingAssistant =
            isAssistant &&
            !hasInteractiveQuiz &&
            !message.metadata?.excelExport &&
            (Boolean(message.metadata?.liveStream) ||
              animatedContent.length < message.content.length)
          const isLatestMessage = message.id === messages[messages.length - 1]?.id

          return (
            <article
              key={message.id}
              className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}${isStreamingAssistant ? ' chat-message--streaming' : ''}${isLatestMessage ? ' chat-message--latest' : ''}`}
            >
              {isAssistant ? <strong className="chat-message-author">Straton AI</strong> : null}
              {message.role === 'user' && pastedImageIds.length > 0 ? (
                <div className="chat-user-inline-images" aria-label="Eingefügte Bilder">
                  {pastedImageIds.map((imageId) => {
                    const src = sentPastedImagePreviews[imageId]
                    if (!src) {
                      return null
                    }
                    return <img key={imageId} className="chat-user-inline-image" src={src} alt="Eingefügtes Bild" />
                  })}
                </div>
              ) : null}
              {displayContent ? (
                isAssistant ? (
                  <div className="chat-message-body chat-message-body--rich">{renderAssistantRichContent(displayContent)}</div>
                ) : (
                  <p>{renderInlineMarkdown(displayContent)}</p>
                )
              ) : null}
              {showExcelFallbackText ? (
                <p className="chat-message-body chat-excel-fallback-text">
                  Die Excel-Datei ist bereit — nutze den Download-Button unten.
                </p>
              ) : null}

              {message.metadata?.excelExport ? (
                <div className="chat-excel-download">
                  <button
                    type="button"
                    className="chat-excel-download-button"
                    disabled={excelDownloadBusyId === message.id}
                    onClick={() => {
                      void downloadExcelExport(message)
                    }}
                  >
                    {excelDownloadBusyId === message.id ? 'Wird vorbereitet…' : 'Excel herunterladen'}
                  </button>
                </div>
              ) : null}

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
          {showAssistantPendingLoader ? (
            <div
              className="chat-message is-assistant chat-message--pending"
              aria-live="polite"
              aria-busy="true"
            >
              <strong className="chat-message-author">Straton AI</strong>
              <div className="chat-pending-loader" role="status">
                <span className="chat-pending-loader-dot" />
                <span className="chat-pending-loader-dot" />
                <span className="chat-pending-loader-dot" />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form
        className={`chat-input-row chat-input-row--stacked${isSending ? ' is-sending' : ''}`}
        onSubmit={handleSubmit}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-file-input-hidden"
          onChange={(event) => {
            void handleAttachFiles(event.target.files)
          }}
        />
        <div className="chat-left-actions">
          <button
            type="button"
            className="chat-attach-button"
            disabled={isSending || isAttachingFiles || tokenLimitReached}
            aria-label="Datei anhängen"
            onClick={() => fileInputRef.current?.click()}
          >
            <img className="ui-icon chat-send-icon" src={attachmentIcon} alt="" aria-hidden="true" />
          </button>
          <ChatComposerModelPicker
            value={composerModelId}
            onChange={onComposerModelChange}
            disabled={isSending || tokenLimitReached}
          />
          {excelCommandSelected ? (
            <button
              type="button"
              className="chat-excel-command-icon-badge"
              title="Excel-Befehl aktiv (klicken zum Entfernen)"
              aria-label="Excel-Befehl entfernen"
              onClick={() => setExcelCommandSelected(false)}
            >
              <img src={greenFileIcon} alt="" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="chat-input-compose">
          {pendingAttachments.length > 0 ? (
            <div className="chat-attachment-chips" aria-label="Angehängte Dateien">
              {pendingAttachments.map((item) => (
                item.kind === 'pasted-image' && item.previewDataUrl ? (
                  <span key={item.id} className="chat-attachment-chip chat-attachment-chip--image">
                    <img className="chat-attachment-inline-preview" src={item.previewDataUrl} alt={item.name} />
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
                ) : (
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
                )
              ))}
            </div>
          ) : null}
          <div className="chat-input-field">
            {showSlashMenu ? (
              <div className="chat-slash-menu thread-menu" role="menu" aria-label="Slash Befehle">
                <button
                  type="button"
                  className="thread-menu-item"
                  role="menuitem"
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={handleSelectExcelSlashCommand}
                >
                  Excel
                </button>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={handleComposeKeyDown}
              onPaste={handleComposePaste}
              placeholder={tokenLimitReached ? 'Token-Limit erreicht' : 'Nachricht eingeben...'}
              disabled={isSending || tokenLimitReached}
              aria-multiline="true"
              autoComplete="off"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={
            tokenLimitReached ||
            isAttachingFiles ||
            (!cancelWhileSending && !draft.trim() && pendingAttachments.length === 0)
          }
          aria-busy={showDuringSendIcon}
          aria-label={
            tokenLimitReached
              ? 'Token-Limit erreicht'
              : cancelWhileSending
                ? 'Antwort abbrechen'
                : 'Nachricht senden'
          }
          onClick={handleComposerSendClick}
        >
          <img
            className={`ui-icon chat-send-icon${showDuringSendIcon ? ' chat-send-icon--during' : ''}`}
            src={showDuringSendIcon ? duringIcon : sendIcon}
            alt=""
            aria-hidden="true"
          />
        </button>
      </form>
      <p className="chat-input-hint">
        Straton ist eine KI und kann Fehler machen, überprüfe wichtige Informationen
      </p>
    </section>
  )
}
