import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import aiIcon from '../assets/icons/ai.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { useAuth } from '../features/auth/context/useAuth'
import { evaluateQuizAnswerWithAi, sendMessage } from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  parseInteractiveContent,
  type InteractiveQuizPayload,
  type InteractiveQuizQuestion,
} from '../features/chat/utils/interactiveQuiz'

type UploadedMaterial = {
  id: string
  name: string
  size: number
  excerpt: string
}

type QuestionCheckState = {
  value: string
  status: 'idle' | 'correct' | 'incorrect'
  feedback: string
  isChecking: boolean
}

type LearnProgressEntry = {
  id: string
  topic: string
  totalQuestions: number
  correctAnswers: number
  scorePercent: number
  createdAt: string
}

function getProgressStorageKey(userId: string) {
  return `straton-learn-progress:${userId}`
}

function loadProgress(userId: string): LearnProgressEntry[] {
  const raw = window.localStorage.getItem(getProgressStorageKey(userId))
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((entry): entry is LearnProgressEntry => {
        if (!entry || typeof entry !== 'object') {
          return false
        }
        const candidate = entry as Record<string, unknown>
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.topic === 'string' &&
          typeof candidate.totalQuestions === 'number' &&
          typeof candidate.correctAnswers === 'number' &&
          typeof candidate.scorePercent === 'number' &&
          typeof candidate.createdAt === 'string'
        )
      })
      .slice(0, 30)
  } catch {
    return []
  }
}

function saveProgress(userId: string, nextEntries: LearnProgressEntry[]) {
  window.localStorage.setItem(getProgressStorageKey(userId), JSON.stringify(nextEntries.slice(0, 30)))
}

export function LearnPage() {
  const { user, profile, isLoading } = useAuth()
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [topic, setTopic] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [introText, setIntroText] = useState('')
  const [quiz, setQuiz] = useState<InteractiveQuizPayload | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [checks, setChecks] = useState<Record<string, QuestionCheckState>>({})
  const [sessionSaved, setSessionSaved] = useState(false)

  if (isLoading) {
    return <main className="learn-loading">Lade Lernbereich...</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const userId = user.id
  const progressEntries = loadProgress(userId)
  const averageScore =
    progressEntries.length === 0
      ? 0
      : Math.round(progressEntries.reduce((sum, entry) => sum + entry.scorePercent, 0) / progressEntries.length)

  const currentScore = useMemo(() => {
    if (!quiz || quiz.questions.length === 0) {
      return 0
    }
    const correctAnswers = quiz.questions.reduce((count, question) => {
      const state = checks[question.id]
      return state?.status === 'correct' ? count + 1 : count
    }, 0)

    return Math.round((correctAnswers / quiz.questions.length) * 100)
  }, [checks, quiz])

  async function handleUploadMaterials(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return
    }

    setIsUploading(true)
    try {
      const files = Array.from(fileList)
      const uploaded: UploadedMaterial[] = []

      for (const file of files) {
        const text = await file.text()
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 2500),
        })
      }

      setMaterials((prev) => [...uploaded, ...prev].slice(0, 8))
    } finally {
      setIsUploading(false)
    }
  }

  async function generateTutorQuiz() {
    if (!topic.trim()) {
      setError('Bitte gib zuerst ein Thema ein.')
      return
    }

    setError(null)
    setIsGenerating(true)
    setSessionSaved(false)

    try {
      const materialContext = materials
        .map((material, index) => `Material ${index + 1} (${material.name}): ${material.excerpt}`)
        .join('\n')

      const tutorPrompt = [
        `Thema: ${topic.trim()}`,
        'Rolle: Du bist ein KI-Lehrer.',
        'Erstelle eine kurze Lernzusammenfassung und anschliessend eine interaktive Pruefung.',
        'Die Pruefung muss auf dem Thema basieren und moeglichst auf den Materialien aufbauen.',
        'Gib mindestens 5 Fragen aus.',
        materialContext ? `Materialien:\n${materialContext}` : 'Materialien: keine hochgeladen.',
      ].join('\n\n')

      const messages: ChatMessage[] = [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: tutorPrompt,
          createdAt: new Date().toISOString(),
        },
      ]

      const result = await sendMessage(messages)
      const parsed = parseInteractiveContent(result.assistantMessage.content)

      if (!parsed.quiz || parsed.quiz.questions.length === 0) {
        setError('Die KI hat kein interaktives Quiz geliefert. Bitte erneut versuchen.')
        return
      }

      setIntroText(parsed.cleanText)
      setQuiz(parsed.quiz)
      setChecks({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz konnte nicht erstellt werden.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function checkAnswer(question: InteractiveQuizQuestion) {
    const current = checks[question.id] ?? { value: '', status: 'idle', feedback: '', isChecking: false }
    if (!current.value.trim()) {
      return
    }

    setChecks((prev) => ({
      ...prev,
      [question.id]: { ...current, isChecking: true },
    }))

    try {
      const result = await evaluateQuizAnswerWithAi({
        question,
        userAnswer: current.value,
      })

      setChecks((prev) => ({
        ...prev,
        [question.id]: {
          value: current.value,
          status: result.isCorrect ? 'correct' : 'incorrect',
          feedback: result.feedback,
          isChecking: false,
        },
      }))
    } catch {
      setChecks((prev) => ({
        ...prev,
        [question.id]: {
          value: current.value,
          status: 'incorrect',
          feedback: 'Bewertung aktuell nicht verfuegbar. Bitte erneut pruefen.',
          isChecking: false,
        },
      }))
    }
  }

  function saveCurrentSessionProgress() {
    if (!quiz) {
      return
    }

    const totalQuestions = quiz.questions.length
    const correctAnswers = quiz.questions.reduce((count, question) => {
      const state = checks[question.id]
      return state?.status === 'correct' ? count + 1 : count
    }, 0)

    const scorePercent = totalQuestions === 0 ? 0 : Math.round((correctAnswers / totalQuestions) * 100)
    const nextEntry: LearnProgressEntry = {
      id: crypto.randomUUID(),
      topic: topic.trim() || 'Unbenanntes Thema',
      totalQuestions,
      correctAnswers,
      scorePercent,
      createdAt: new Date().toISOString(),
    }

    saveProgress(userId, [nextEntry, ...progressEntries])
    setSessionSaved(true)
  }

  return (
    <main className={`chat-app-shell learn-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <aside className={`chat-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="chat-sidebar-top">
          <div className="chat-sidebar-header-row">
            <div className="chat-brand">
              <img className="ui-icon chat-brand-logo" src={`${import.meta.env.BASE_URL}assets/logo/Straton.png`} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? <h2>Lernbereich</h2> : null}
            </div>
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-label={isSidebarCollapsed ? 'Sidebar ausfahren' : 'Sidebar einklappen'}
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            >
              <img className="ui-icon chat-sidebar-top-button-icon sidebar-toggle-icon" src={sidebarIcon} alt="" aria-hidden="true" />
            </button>
          </div>
          <button type="button" onClick={() => navigate('/chat')} aria-label={isSidebarCollapsed ? 'Zum Chat' : undefined}>
            <img className="ui-icon chat-sidebar-top-button-icon" src={newMessageIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Zum Chat' : null}
          </button>
          <button type="button" aria-label={isSidebarCollapsed ? 'KI Lehrer' : undefined}>
            <img className="ui-icon chat-sidebar-top-button-icon" src={aiIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'KI Lehrer aktiv' : null}
          </button>
        </div>

        {!isSidebarCollapsed ? (
          <div className="chat-thread-list">
            <p className="thread-list-info">Gespeicherte Sessions: {progressEntries.length}</p>
            <p className="thread-list-info">Durchschnitt: {averageScore}%</p>
            <p className="thread-list-info">Nutzer: {profile?.first_name || user.email}</p>
          </div>
        ) : null}
      </aside>

      <section className="chat-main learn-main">
        <div className="learn-page-grid">
          <article className="learn-card">
            <h1>KI Lehrer</h1>
            <p>Gib ein Thema ein, lade Unterlagen hoch und starte eine adaptive Pruefung.</p>
            <label htmlFor="learn-topic-input">Thema</label>
            <input
              id="learn-topic-input"
              type="text"
              placeholder="z.B. SQL Joins, Algebra, Anatomie..."
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
            <label htmlFor="learn-files-input">Dateien hochladen (optional)</label>
            <input
              id="learn-files-input"
              type="file"
              multiple
              onChange={(event) => {
                void handleUploadMaterials(event.target.files)
                event.currentTarget.value = ''
              }}
            />
            {isUploading ? <p className="learn-muted">Dateien werden verarbeitet...</p> : null}
            {materials.length > 0 ? (
              <div className="learn-materials-list">
                {materials.map((material) => (
                  <div key={material.id} className="learn-material-item">
                    <div>
                      <p className="learn-material-name">{material.name}</p>
                      <p className="learn-muted">{Math.round(material.size / 1024)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMaterials((prev) => prev.filter((entry) => entry.id !== material.id))}
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <PrimaryButton type="button" onClick={() => void generateTutorQuiz()} disabled={isGenerating}>
              {isGenerating ? 'Erstelle Test...' : 'Test starten'}
            </PrimaryButton>
            {error ? <p className="error-text">{error}</p> : null}
          </article>

          <article className="learn-card">
            <h2>Fortschritt</h2>
            <div className="learn-progress-row">
              <span>Aktueller Test</span>
              <strong>{currentScore}%</strong>
            </div>
            <div className="learn-progress-bar">
              <span style={{ width: `${currentScore}%` }} />
            </div>
            <div className="learn-progress-row">
              <span>Gesamtdurchschnitt</span>
              <strong>{averageScore}%</strong>
            </div>
            <div className="learn-progress-bar">
              <span style={{ width: `${averageScore}%` }} />
            </div>
            <SecondaryButton type="button" onClick={saveCurrentSessionProgress} disabled={!quiz}>
              Fortschritt speichern
            </SecondaryButton>
            {sessionSaved ? <p className="learn-success">Session wurde gespeichert.</p> : null}
            <div className="learn-history">
              {progressEntries.length === 0 ? (
                <p className="learn-muted">Noch keine gespeicherten Fortschritte.</p>
              ) : (
                progressEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="learn-history-item">
                    <p>{entry.topic}</p>
                    <p className="learn-muted">
                      {entry.correctAnswers}/{entry.totalQuestions} richtig ({entry.scorePercent}%)
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="learn-card learn-quiz-card">
            <h2>Interaktive Pruefung</h2>
            {introText ? <p className="learn-intro">{introText}</p> : null}
            {!quiz ? (
              <p className="learn-muted">Starte links einen Test, dann erscheinen hier deine Fragen.</p>
            ) : (
              <div className="learn-quiz-list">
                {quiz.questions.map((question) => {
                  const state = checks[question.id] ?? {
                    value: '',
                    status: 'idle',
                    feedback: '',
                    isChecking: false,
                  }
                  const statusClass =
                    state.status === 'correct' ? 'is-correct' : state.status === 'incorrect' ? 'is-incorrect' : ''

                  return (
                    <div key={question.id} className={`interactive-quiz-question ${statusClass}`}>
                      <p className="interactive-quiz-prompt">{question.prompt}</p>
                      <div className="interactive-quiz-answer-row">
                        <input
                          type="text"
                          value={state.value}
                          onChange={(event) =>
                            setChecks((prev) => ({
                              ...prev,
                              [question.id]: {
                                ...(prev[question.id] ?? {
                                  status: 'idle',
                                  feedback: '',
                                  isChecking: false,
                                }),
                                value: event.target.value,
                              },
                            }))
                          }
                          placeholder="Deine Antwort..."
                          disabled={state.isChecking}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void checkAnswer(question)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={`interactive-quiz-check ${statusClass}`}
                          onClick={() => {
                            void checkAnswer(question)
                          }}
                          disabled={!state.value.trim() || state.isChecking}
                        >
                          {state.isChecking ? '…' : '○'}
                        </button>
                      </div>
                      {state.feedback ? <p className={`interactive-quiz-feedback ${statusClass}`}>{state.feedback}</p> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  )
}
