import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import aiIcon from '../assets/icons/ai.svg'
import deleteIcon from '../assets/icons/delete.svg'
import fileIcon from '../assets/icons/file.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import sendIcon from '../assets/icons/send.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import { evaluateQuizAnswerWithAi } from '../features/chat/services/chat.service'
import { sendMessage } from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  createLearningPathByUserId,
  deleteLearningPathById,
  getLearningPathById,
  listLearningPathsByUserId,
  updateLearningPathById,
  type EntryQuizResult,
  type LearningPathRecord,
  type LearningPathSummary,
  type TutorChatEntry,
  type UploadedMaterial,
} from '../features/learn/services/learn.persistence'
import {
  parseInteractiveContent,
  type InteractiveQuizPayload,
} from '../features/chat/utils/interactiveQuiz'

function getDisplayPathTitle(title: string) {
  const trimmed = title.trim()
  return trimmed ? trimmed : 'Neuer Lernpfad'
}

export function LearnPage() {
  const MODAL_ANIMATION_MS = 220
  const { user, profile, isLoading } = useAuth()
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [topic, setTopic] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [activePathId, setActivePathId] = useState<string>('')
  const [tutorMessages, setTutorMessages] = useState<TutorChatEntry[]>([])
  const [tutorDraft, setTutorDraft] = useState('')
  const [isTutorSending, setIsTutorSending] = useState(false)
  const [isLayoutCustomizeMode, setIsLayoutCustomizeMode] = useState(false)
  const [mainSplitPercent, setMainSplitPercent] = useState(72)
  const [dragTarget, setDragTarget] = useState<'main' | null>(null)
  const [setupStep, setSetupStep] = useState<1 | 2>(1)
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [entryQuiz, setEntryQuiz] = useState<InteractiveQuizPayload | null>(null)
  const [isEntryQuizLoading, setIsEntryQuizLoading] = useState(false)
  const [isEntryQuizMounted, setIsEntryQuizMounted] = useState(false)
  const [isEntryQuizVisible, setIsEntryQuizVisible] = useState(false)
  const [entryQuizAnswers, setEntryQuizAnswers] = useState<Record<string, string>>({})
  const [entryQuizResult, setEntryQuizResult] = useState<EntryQuizResult | null>(null)
  const [isSubmittingEntryQuiz, setIsSubmittingEntryQuiz] = useState(false)
  const [openPathMenuId, setOpenPathMenuId] = useState<string | null>(null)
  const [pathMenuPosition, setPathMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const learnPageGridRef = useRef<HTMLDivElement | null>(null)
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const entryQuizCloseTimerRef = useRef<number | null>(null)
  const suppressAutosaveRef = useRef(false)
  const activePathIdRef = useRef('')
  const pathCacheRef = useRef<Record<string, LearningPathRecord>>({})

  const activePath = learningPaths.find((entry) => entry.id === activePathId) ?? null

  const captureEditableState = useCallback(
    () => ({
      topic,
      setupStep,
      isSetupComplete,
      materials,
      tutorMessages,
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
    }),
    [
      topic,
      setupStep,
      isSetupComplete,
      materials,
      tutorMessages,
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
    ],
  )

  const applyPathToState = useCallback(
    (record: {
      topic: string
      setupStep: 1 | 2
      isSetupComplete: boolean
      materials: UploadedMaterial[]
      tutorMessages: TutorChatEntry[]
      entryQuiz: InteractiveQuizPayload | null
      entryQuizAnswers: Record<string, string>
      entryQuizResult: EntryQuizResult | null
    }) => {
      suppressAutosaveRef.current = true
      setTopic(record.topic)
      setSetupStep(record.setupStep)
      setIsSetupComplete(record.isSetupComplete)
      setMaterials(record.materials)
      setTutorMessages(record.tutorMessages)
      setTutorDraft('')
      setEntryQuiz(record.entryQuiz)
      setEntryQuizAnswers(record.entryQuizAnswers)
      setEntryQuizResult(record.entryQuizResult)
      if (entryQuizCloseTimerRef.current) {
        window.clearTimeout(entryQuizCloseTimerRef.current)
        entryQuizCloseTimerRef.current = null
      }
      setIsEntryQuizVisible(false)
      setIsEntryQuizMounted(false)
    },
    [],
  )

  const persistActivePath = useCallback(async () => {
    const pathId = activePathIdRef.current
    if (!pathId) {
      return
    }
    const currentSummary = learningPaths.find((entry) => entry.id === pathId)
    if (!currentSummary) {
      return
    }

    const updated = await updateLearningPathById(pathId, {
      title: getDisplayPathTitle(currentSummary.title),
      topic,
      setupStep,
      isSetupComplete,
      materials,
      tutorMessages,
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
    })

    pathCacheRef.current[pathId] = updated
  }, [
    learningPaths,
    topic,
    setupStep,
    isSetupComplete,
    materials,
    tutorMessages,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
  ])

  const persistPathInBackground = useCallback(
    (
      pathId: string,
      title: string,
      snapshot: {
        topic: string
        setupStep: 1 | 2
        isSetupComplete: boolean
        materials: UploadedMaterial[]
        tutorMessages: TutorChatEntry[]
        entryQuiz: InteractiveQuizPayload | null
        entryQuizAnswers: Record<string, string>
        entryQuizResult: EntryQuizResult | null
      },
    ) => {
      void updateLearningPathById(pathId, {
        title: getDisplayPathTitle(title),
        ...snapshot,
      })
        .then((updated) => {
          pathCacheRef.current[pathId] = updated
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht gespeichert werden.')
        })
    },
    [],
  )

  useEffect(() => {
    activePathIdRef.current = activePathId
  }, [activePathId])

  useEffect(() => {
    if (!user) {
      setLearningPaths([])
      setActivePathId('')
      activePathIdRef.current = ''
      setTopic('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setTutorDraft('')
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)
      pathCacheRef.current = {}
      return
    }
    const userId = user.id

    let isMounted = true

    async function loadLearningPaths() {
      setError(null)

      try {
        const loaded = await listLearningPathsByUserId(userId)
        const records =
          loaded.length > 0
            ? loaded
            : [await createLearningPathByUserId(userId, 'Neuer Lernpfad')]

        if (!isMounted) {
          return
        }

        setLearningPaths(
          records.map((record) => ({
            id: record.id,
            userId: record.userId,
            title: record.title,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          })),
        )
        pathCacheRef.current = records.reduce<Record<string, LearningPathRecord>>((acc, record) => {
          acc[record.id] = record
          return acc
        }, {})

        const first = records[0]
        setActivePathId(first.id)
        activePathIdRef.current = first.id
        applyPathToState(first)
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Lernpfade konnten nicht geladen werden.')
        }
      }
    }

    void loadLearningPaths()

    return () => {
      isMounted = false
    }
  }, [user, applyPathToState])

  useEffect(() => {
    if (!user || !activePath) {
      return
    }

    if (suppressAutosaveRef.current) {
      suppressAutosaveRef.current = false
      return
    }

    const timerId = window.setTimeout(() => {
      void persistActivePath().catch((err) => {
        setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht gespeichert werden.')
      })
    }, 450)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    user,
    activePath,
    persistActivePath,
    topic,
    setupStep,
    isSetupComplete,
    materials,
    tutorMessages,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
  ])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openPathMenuId) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      const isInsideMenu = pathMenuRef.current?.contains(target) ?? false
      if (!isInsideMenu) {
        setOpenPathMenuId(null)
        setPathMenuPosition(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [openPathMenuId])

  useEffect(() => {
    return () => {
      if (entryQuizCloseTimerRef.current) {
        window.clearTimeout(entryQuizCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!dragTarget) {
      return
    }

    function handleMouseMove(event: MouseEvent) {
      if (dragTarget === 'main') {
        const rect = learnPageGridRef.current?.getBoundingClientRect()
        if (!rect || rect.width <= 0) {
          return
        }
        const next = ((event.clientX - rect.left) / rect.width) * 100
        const clamped = Math.min(Math.max(next, 55), 82)
        setMainSplitPercent(clamped)
        return
      }
    }

    function handleMouseUp() {
      setDragTarget(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragTarget])

  useEffect(() => {
    if (!isSetupComplete || !activePath || isEntryQuizLoading || entryQuiz) {
      return
    }
    const activePathTitle = activePath.title

    async function generateEntryQuiz() {
      setIsEntryQuizLoading(true)
      setError(null)

      try {
        const materialContext = materials
          .map((material, index) => `Material ${index + 1} (${material.name}): ${material.excerpt}`)
          .join('\n')

        const quizRequestMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: [
            `Lernpfad Name: ${getDisplayPathTitle(activePathTitle)}`,
            `Thema: ${topic.trim() || getDisplayPathTitle(activePathTitle)}`,
            materialContext ? `Dateien:\n${materialContext}` : 'Dateien: keine hochgeladen.',
            'Aufgabe: Erstelle jetzt einen Einstiegstest zum Start in das Thema.',
            'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
            'Antworte zuerst mit 1-2 kurzen Einleitungssaetzen und dann direkt mit dem Quiz-Block.',
          ].join('\n\n'),
          createdAt: new Date().toISOString(),
        }

        const result = await sendMessage([quizRequestMessage])
        const parsed = parseInteractiveContent(result.assistantMessage.content)
        if (!parsed.quiz) {
          throw new Error('Kein gueltiger Einstiegstest von der KI erhalten.')
        }

        const initialAnswers = parsed.quiz.questions.reduce<Record<string, string>>((acc, question) => {
          acc[question.id] = ''
          return acc
        }, {})

        setEntryQuiz(parsed.quiz)
        setEntryQuizAnswers(initialAnswers)
        setEntryQuizResult(null)
        setTutorMessages([
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              (parsed.cleanText || 'Dein Einstiegstest ist bereit.') +
              '\n\nHier ist dein Test: Einstiegstest starten',
            action: 'open-entry-test',
          },
        ])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht erstellt werden.')
      } finally {
        setIsEntryQuizLoading(false)
      }
    }

    void generateEntryQuiz()
  }, [isSetupComplete, activePath, materials, topic, isEntryQuizLoading, entryQuiz])

  if (isLoading) {
    return <main className="learn-loading">Lade Lernbereich...</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  async function handleCreateLearningPath() {
    if (!user) {
      return
    }

    setError(null)

    try {
      await persistActivePath()
      const created = await createLearningPathByUserId(user.id, 'Neuer Lernpfad')
      setLearningPaths((prev) => [
        {
          id: created.id,
          userId: created.userId,
          title: created.title,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...prev,
      ])
      setActivePathId(created.id)
      activePathIdRef.current = created.id
      applyPathToState(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neuer Lernpfad konnte nicht erstellt werden.')
    }
  }

  async function handleSelectLearningPath(pathId: string) {
    if (pathId === activePathIdRef.current) {
      return
    }

    setError(null)
    const previousPathId = activePathIdRef.current
    const previousSummary = learningPaths.find((path) => path.id === previousPathId)
    const previousSnapshot = captureEditableState()

    if (previousPathId && previousSummary) {
      persistPathInBackground(previousPathId, previousSummary.title, previousSnapshot)
    }

    setActivePathId(pathId)
    activePathIdRef.current = pathId

    const cached = pathCacheRef.current[pathId]
    if (cached) {
      applyPathToState(cached)
      return
    }

    suppressAutosaveRef.current = true
    setTopic('')
    setSetupStep(1)
    setIsSetupComplete(false)
    setMaterials([])
    setTutorMessages([])
    setTutorDraft('')
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)

    try {
      const next = await getLearningPathById(pathId)
      if (!next) {
        return
      }
      pathCacheRef.current[pathId] = next
      if (activePathIdRef.current !== pathId) {
        return
      }
      applyPathToState(next)
    } catch (err) {
      if (activePathIdRef.current === pathId) {
        setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht geladen werden.')
      }
    }
  }

  function openLearningPathContextMenu(event: ReactMouseEvent, pathId: string) {
    event.preventDefault()
    event.stopPropagation()
    setOpenPathMenuId(pathId)
    setPathMenuPosition({
      x: event.clientX,
      y: event.clientY,
    })
  }

  async function handleDeleteLearningPath(pathId: string) {
    if (!user) {
      return
    }

    setOpenPathMenuId(null)
    setPathMenuPosition(null)
    setError(null)

    const currentActivePathId = activePathIdRef.current
    const remainingPaths = learningPaths.filter((path) => path.id !== pathId)

    try {
      await deleteLearningPathById(pathId)
      delete pathCacheRef.current[pathId]
      setLearningPaths(remainingPaths)

      if (pathId !== currentActivePathId) {
        return
      }

      const nextSummary = remainingPaths[0]
      if (!nextSummary) {
        const created = await createLearningPathByUserId(user.id, 'Neuer Lernpfad')
        pathCacheRef.current[created.id] = created
        setLearningPaths([
          {
            id: created.id,
            userId: created.userId,
            title: created.title,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          },
        ])
        setActivePathId(created.id)
        activePathIdRef.current = created.id
        applyPathToState(created)
        return
      }

      setActivePathId(nextSummary.id)
      activePathIdRef.current = nextSummary.id

      const cached = pathCacheRef.current[nextSummary.id]
      if (cached) {
        applyPathToState(cached)
        return
      }

      suppressAutosaveRef.current = true
      setTopic('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setTutorDraft('')
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)

      const next = await getLearningPathById(nextSummary.id)
      if (!next) {
        return
      }
      pathCacheRef.current[nextSummary.id] = next
      if (activePathIdRef.current !== nextSummary.id) {
        return
      }
      applyPathToState(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lernpfad konnte nicht geloescht werden.')
    }
  }

  function openEntryQuizModal() {
    if (entryQuizCloseTimerRef.current) {
      window.clearTimeout(entryQuizCloseTimerRef.current)
      entryQuizCloseTimerRef.current = null
    }
    setIsEntryQuizMounted(true)
    window.requestAnimationFrame(() => {
      setIsEntryQuizVisible(true)
    })
  }

  function closeEntryQuizModal() {
    setIsEntryQuizVisible(false)
    entryQuizCloseTimerRef.current = window.setTimeout(() => {
      setIsEntryQuizMounted(false)
      entryQuizCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function handleActivePathNameChange(value: string) {
    setLearningPaths((prev) =>
      prev.map((path) => (path.id === activePathId ? { ...path, title: value } : path)),
    )
  }

  function handleContinueSetupStepOne() {
    if (!topic.trim()) {
      setError('Bitte gib zuerst ein Thema ein.')
      return
    }

    setError(null)
    setSetupStep(2)
  }

  function handleFinishSetup() {
    setError(null)
    setIsSetupComplete(true)
    setTutorMessages([])
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)
  }

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

  async function handleTutorChatSubmit() {
    const prompt = tutorDraft.trim()
    if (!prompt || isTutorSending) {
      return
    }

    setError(null)
    setIsTutorSending(true)

    const nextUserMessage: TutorChatEntry = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
    }

    const nextHistory = [...tutorMessages, nextUserMessage]
    setTutorMessages(nextHistory)
    setTutorDraft('')

    try {
      const materialContext = materials
        .map((material, index) => `Material ${index + 1} (${material.name}): ${material.excerpt}`)
        .join('\n')

      const tutorContext: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: [
          `Lernpfad: ${activePath?.title ?? 'Neuer Lernpfad'}`,
          `Thema: ${topic.trim() || activePath?.title || 'ohne Thema'}`,
          materialContext ? `Materialien:\n${materialContext}` : 'Materialien: keine hochgeladen.',
          'Antworte als KI-Lehrer. Wenn sinnvoll, darfst du interaktive Quizfragen liefern.',
        ].join('\n\n'),
        createdAt: new Date().toISOString(),
      }

      const chatMessages: ChatMessage[] = [
        tutorContext,
        ...nextHistory.map((entry) => ({
          id: entry.id,
          role: entry.role,
          content: entry.content,
          createdAt: new Date().toISOString(),
        })),
      ]

      const result = await sendMessage(chatMessages)
      const parsed = parseInteractiveContent(result.assistantMessage.content)

      const assistantMessage: TutorChatEntry = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: parsed.cleanText || result.assistantMessage.content,
      }

      setTutorMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tutor-Chat derzeit nicht verfuegbar.')
    } finally {
      setIsTutorSending(false)
    }
  }

  async function handleSubmitEntryQuiz() {
    if (!entryQuiz || isSubmittingEntryQuiz) {
      return
    }

    setError(null)
    setIsSubmittingEntryQuiz(true)

    try {
      const evaluations = await Promise.all(
        entryQuiz.questions.map(async (question) => {
          const answer = (entryQuizAnswers[question.id] ?? '').trim()
          const result = await evaluateQuizAnswerWithAi({
            question,
            userAnswer: answer,
          })
          return {
            questionId: question.id,
            isCorrect: result.isCorrect,
            feedback: result.feedback,
          }
        }),
      )

      const score = evaluations.filter((entry) => entry.isCorrect).length
      const feedbackByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.feedback
        return acc
      }, {})

      setEntryQuizResult({
        score,
        total: entryQuiz.questions.length,
        feedbackByQuestionId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht abgegeben werden.')
    } finally {
      setIsSubmittingEntryQuiz(false)
    }
  }

  const hasSetupPhase = !isSetupComplete

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
          <button
            type="button"
            className="learn-primary-sidebar-button"
            onClick={handleCreateLearningPath}
            aria-label={isSidebarCollapsed ? 'Neuer Lernpfad' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={newMessageIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Neuer Lernpfad' : null}
          </button>
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
            <p className="thread-list-info">Lernpfade</p>
            {learningPaths.map((path) => (
              <button
                key={path.id}
                type="button"
                className={`chat-thread-item ${path.id === activePathId ? 'is-active' : ''}`}
                onClick={() => {
                  void handleSelectLearningPath(path.id)
                  setOpenPathMenuId(null)
                  setPathMenuPosition(null)
                }}
                onContextMenu={(event) => openLearningPathContextMenu(event, path.id)}
              >
                <span className="chat-thread-title">{getDisplayPathTitle(path.title)}</span>
              </button>
            ))}
            <p className="thread-list-info">Nutzer: {profile?.first_name || user.email}</p>
          </div>
        ) : null}
      </aside>

      <section className="chat-main learn-main">
        <div
          ref={learnPageGridRef}
          className={`learn-page-grid ${isLayoutCustomizeMode ? 'is-layout-editing' : ''}`}
          style={{ '--learn-main-col': `${mainSplitPercent}%` } as CSSProperties}
        >
          <article className="learn-card learn-workspace-card">
            <header className="learn-workspace-header">
              <input
                id="learn-path-name-input"
                type="text"
                className="learn-path-title-input"
                value={activePath?.title ?? ''}
                onChange={(event) => handleActivePathNameChange(event.target.value)}
                placeholder="Name deines Lernpfads..."
                aria-label="Name Lernpfad"
              />
              <button
                type="button"
                className={`learn-layout-edit-button ${isLayoutCustomizeMode ? 'is-active' : ''}`}
                disabled={hasSetupPhase}
                onClick={() => {
                  setIsLayoutCustomizeMode((prev) => !prev)
                  setDragTarget(null)
                }}
              >
                {isLayoutCustomizeMode ? 'Fertig' : 'Anpassen'}
              </button>
            </header>
            {error ? <p className="error-text">{error}</p> : null}

            {!isSetupComplete ? (
              <section className="learn-setup-standalone">
                <div className="learn-setup-flow">
                  <div className="learn-setup-heading">
                    <h3>Einrichtung</h3>
                  </div>
                  {setupStep === 1 ? (
                    <div className="learn-setup-step">
                      <label htmlFor="learn-topic-input">Thema</label>
                      <p className="learn-setup-info">Gib das Thema ein wo du lernen möchtest</p>
                      <input
                        id="learn-topic-input"
                        type="text"
                        placeholder="z.B. SQL Joins, Algebra, Anatomie..."
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                      />
                      <PrimaryButton type="button" onClick={handleContinueSetupStepOne} disabled={!topic.trim()}>
                        Weiter
                      </PrimaryButton>
                    </div>
                  ) : null}

                  {setupStep === 2 ? (
                    <div className="learn-setup-step">
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
                      <div className="learn-setup-actions">
                        <SecondaryButton type="button" onClick={() => setSetupStep(1)}>
                          Zurück
                        </SecondaryButton>
                        <PrimaryButton type="button" onClick={handleFinishSetup}>
                          Einrichtung abschliessen
                        </PrimaryButton>
                      </div>
                    </div>
                  ) : null}

                  <div className="learn-setup-progress">
                    <div className={`learn-setup-progress-step ${setupStep >= 1 ? 'is-active' : ''}`}>1</div>
                    <div className={`learn-setup-progress-segment ${setupStep >= 2 ? 'is-active' : ''}`} />
                    <div className={`learn-setup-progress-step ${setupStep >= 2 ? 'is-active' : ''}`}>2</div>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="learn-conversation">
                  {tutorMessages.length === 0 ? (
                    <p className="learn-muted">Die KI erstellt deinen Einstiegstest...</p>
                  ) : (
                    tutorMessages.map((message) => (
                      <article key={message.id} className={`learn-conversation-message is-${message.role}`}>
                        {message.role === 'assistant' ? <strong className="chat-message-author">Straton AI</strong> : null}
                        <p>{message.content}</p>
                        {message.action === 'open-entry-test' ? (
                          <button
                            type="button"
                            className="learn-entry-test-link"
                            onClick={openEntryQuizModal}
                          >
                            <span className="learn-entry-test-link-icon-wrap" aria-hidden="true">
                              <img className="ui-icon learn-entry-test-link-icon" src={fileIcon} alt="" />
                            </span>
                            <span className="learn-entry-test-link-content">
                              <span className="learn-entry-test-link-title">Einstiegstest</span>
                              <span className="learn-entry-test-link-meta">Zum Starten klicken</span>
                            </span>
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </section>
                <form
                  className="chat-input-row learn-shared-chat-input"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleTutorChatSubmit()
                  }}
                >
                  <div className="chat-input-field">
                    <input
                      className="chat-input"
                      type="text"
                      value={tutorDraft}
                      onChange={(event) => setTutorDraft(event.target.value)}
                      placeholder="Nachricht eingeben..."
                      disabled={isTutorSending}
                    />
                  </div>
                  <button type="submit" disabled={!tutorDraft.trim() || isTutorSending}>
                    <img className="ui-icon chat-send-icon" src={sendIcon} alt="" aria-hidden="true" />
                  </button>
                </form>
              </>
            )}

          </article>

          <article className="learn-card learn-overview-card">
            <h2>Übersicht</h2>
            <div className="learn-progress-row">
              <span>Einrichtung</span>
              <strong>{isSetupComplete ? 'Abgeschlossen' : `Schritt ${setupStep}/2`}</strong>
            </div>
            <div className="learn-progress-bar">
              <span style={{ width: `${isSetupComplete ? 100 : setupStep * 50}%` }} />
            </div>
            <div className="learn-progress-row">
              <span>Thema</span>
              <strong>{topic.trim() || '-'}</strong>
            </div>
            <div className="learn-progress-bar">
              <span style={{ width: `${topic.trim() ? 100 : 0}%` }} />
            </div>
            <div className="learn-progress-row">
              <span>Dateien</span>
              <strong>{materials.length}</strong>
            </div>
            <div className="learn-progress-row">
              <span>Einstiegstest</span>
              <strong>
                {entryQuizResult ? `Abgegeben (${entryQuizResult.score}/${entryQuizResult.total})` : 'Offen'}
              </strong>
            </div>
            <div className="learn-history">
              <p className="learn-muted">
                Nach der Einrichtung erstellt der KI-Lehrer einen Einstiegstest. Im Chat kannst du ihn per Link
                oeffnen und im Modal abgeben.
              </p>
            </div>
          </article>
          {isLayoutCustomizeMode ? (
            <div
              className="learn-resize-handle learn-resize-handle-main"
              onMouseDown={(event) => {
                event.preventDefault()
                setDragTarget('main')
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Breite zwischen Arbeitsbereich und Übersicht anpassen"
            />
          ) : null}
        </div>
      </section>
      {isEntryQuizMounted ? (
        <ModalShell isOpen={isEntryQuizVisible}>
          <section className="learn-entry-test-modal" role="dialog" aria-modal="true" aria-label="Einstiegstest">
            <ModalHeader
              title={entryQuiz?.title || 'Einstiegstest'}
              headingLevel="h2"
              className="learn-entry-test-header"
              onClose={closeEntryQuizModal}
              closeLabel="Einstiegstest schliessen"
            />
            <div className="learn-entry-test-body">
              {!entryQuiz ? <p>Kein Einstiegstest verfuegbar.</p> : null}
              {entryQuiz?.questions.map((question, index) => (
                <article key={question.id} className="learn-entry-test-question">
                  <p className="learn-entry-test-prompt">
                    {index + 1}. {question.prompt}
                  </p>
                  <textarea
                    value={entryQuizAnswers[question.id] ?? ''}
                    onChange={(event) =>
                      setEntryQuizAnswers((prev) => ({
                        ...prev,
                        [question.id]: event.target.value,
                      }))
                    }
                    placeholder="Deine Antwort..."
                    disabled={isSubmittingEntryQuiz}
                  />
                  {entryQuizResult?.feedbackByQuestionId[question.id] ? (
                    <p className="learn-entry-test-feedback">
                      {entryQuizResult.feedbackByQuestionId[question.id]}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
            <footer className="learn-entry-test-footer">
              {entryQuizResult ? (
                <p className="learn-entry-test-score">
                  Ergebnis: {entryQuizResult.score} / {entryQuizResult.total}
                </p>
              ) : null}
              <PrimaryButton
                type="button"
                onClick={() => {
                  void handleSubmitEntryQuiz()
                }}
                disabled={!entryQuiz || isSubmittingEntryQuiz}
              >
                {isSubmittingEntryQuiz ? 'Wird abgegeben...' : 'Abgeben'}
              </PrimaryButton>
            </footer>
          </section>
        </ModalShell>
      ) : null}
      {openPathMenuId && pathMenuPosition ? (
        <ContextMenu
          ref={pathMenuRef}
          className="thread-menu-context-global"
          style={{ left: pathMenuPosition.x, top: pathMenuPosition.y }}
        >
          <MenuItem
            iconSrc={deleteIcon}
            danger
            onClick={() => {
              void handleDeleteLearningPath(openPathMenuId)
            }}
          >
            Löschen
          </MenuItem>
        </ContextMenu>
      ) : null}
    </main>
  )
}
