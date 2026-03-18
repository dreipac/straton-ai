import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import aiIcon from '../assets/icons/ai.svg'
import checkIcon from '../assets/icons/check.svg'
import deleteIcon from '../assets/icons/delete.svg'
import fileIcon from '../assets/icons/file.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import sendIcon from '../assets/icons/send.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import starIcon from '../assets/icons/star.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import { evaluateQuizAnswerWithAi } from '../features/chat/services/chat.service'
import { generateTopicSuggestionsWithAi } from '../features/chat/services/chat.service'
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
  parseInteractiveContentWithFallback,
  type InteractiveQuizPayload,
} from '../features/chat/utils/interactiveQuiz'

function getDisplayPathTitle(title: string) {
  const trimmed = title.trim()
  return trimmed ? trimmed : 'Neuer Lernpfad'
}

const LEARN_TUTOR_SYSTEM_PROMPT = [
  'Du bist ein KI-Lerntutor fuer Informatik EFZ in der Schweiz.',
  'Erklaere fachlich korrekt, aber einfach, klar und strukturiert.',
  'Passe den Schwierigkeitsgrad an das Niveau des Nutzers an.',
  'Nutze zuerst die hochgeladenen Unterlagen und Notizen als primaere Quelle.',
  'Wenn etwas unklar ist, erklaere mit konkreten Beispielen aus der IT-Praxis.',
  'Arbeite kapitelbasiert und baue auf dem gewaehlten Schwerpunkt auf.',
  'Nach jeder Erklaerung stelle genau eine kurze Verstaendnisfrage.',
].join('\n')

const ENTRY_TEST_PREP_STEPS = [
  'Straton analysiert dein Thema',
  'Straton verarbeitet deine Inhalte',
  'Straton erstellt deinen Einstiegstest',
] as const

export function LearnPage() {
  const MODAL_ANIMATION_MS = 220
  const { user, profile, isLoading } = useAuth()
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [topic, setTopic] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingTopicSuggestions, setIsLoadingTopicSuggestions] = useState(false)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [activePathId, setActivePathId] = useState<string>('')
  const [tutorMessages, setTutorMessages] = useState<TutorChatEntry[]>([])
  const [tutorDraft, setTutorDraft] = useState('')
  const [isTutorSending, setIsTutorSending] = useState(false)
  const [isLayoutCustomizeMode, setIsLayoutCustomizeMode] = useState(false)
  const [mainSplitPercent, setMainSplitPercent] = useState(72)
  const [dragTarget, setDragTarget] = useState<'main' | null>(null)
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1)
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([])
  const [visibleTopicSuggestionCount, setVisibleTopicSuggestionCount] = useState(0)
  const [selectedTopic, setSelectedTopic] = useState('')
  const [proficiencyLevel, setProficiencyLevel] = useState<'' | 'low' | 'medium' | 'high'>('')
  const [entryQuiz, setEntryQuiz] = useState<InteractiveQuizPayload | null>(null)
  const [isEntryQuizLoading, setIsEntryQuizLoading] = useState(false)
  const [hasTriedEntryQuizGeneration, setHasTriedEntryQuizGeneration] = useState(false)
  const [entryPrepStepIndex, setEntryPrepStepIndex] = useState(0)
  const [entryPrepPercents, setEntryPrepPercents] = useState<number[]>([0, 0, 0])
  const [isEntryPrepClosing, setIsEntryPrepClosing] = useState(false)
  const [isEntryQuizMounted, setIsEntryQuizMounted] = useState(false)
  const [isEntryQuizVisible, setIsEntryQuizVisible] = useState(false)
  const [entryQuizAnswers, setEntryQuizAnswers] = useState<Record<string, string>>({})
  const [entryQuizResult, setEntryQuizResult] = useState<EntryQuizResult | null>(null)
  const [entryQuizQuestionIndex, setEntryQuizQuestionIndex] = useState(0)
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
  const effectiveTopic = selectedTopic.trim() || topic.trim()
  const entryTestDurationLabel = entryQuiz
    ? `ca. ${Math.max(5, Math.ceil(entryQuiz.questions.length * 1.5))} Minuten`
    : 'ca. 10 Minuten'

  const captureEditableState = useCallback(
    () => ({
      topic,
      topicSuggestions,
      selectedTopic,
      proficiencyLevel,
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
      topicSuggestions,
      selectedTopic,
      proficiencyLevel,
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
      topicSuggestions: string[]
      selectedTopic: string
      proficiencyLevel: '' | 'low' | 'medium' | 'high'
      setupStep: 1 | 2 | 3
      isSetupComplete: boolean
      materials: UploadedMaterial[]
      tutorMessages: TutorChatEntry[]
      entryQuiz: InteractiveQuizPayload | null
      entryQuizAnswers: Record<string, string>
      entryQuizResult: EntryQuizResult | null
    }) => {
      suppressAutosaveRef.current = true
      setTopic(record.topic)
      setTopicSuggestions(record.topicSuggestions)
      setVisibleTopicSuggestionCount(record.topicSuggestions.length)
      setSelectedTopic(record.selectedTopic)
      setProficiencyLevel(record.proficiencyLevel)
      setSetupStep(record.setupStep)
      setIsSetupComplete(record.isSetupComplete)
      setMaterials(record.materials)
      setTutorMessages(record.tutorMessages)
      setTutorDraft('')
      setEntryQuiz(record.entryQuiz)
      setEntryQuizAnswers(record.entryQuizAnswers)
      setEntryQuizResult(record.entryQuizResult)
      setEntryQuizQuestionIndex(0)
      setIsLoadingTopicSuggestions(false)
      setHasTriedEntryQuizGeneration(Boolean(record.entryQuiz))
      setEntryPrepStepIndex(0)
      setEntryPrepPercents([0, 0, 0])
      setIsEntryPrepClosing(false)
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
      topicSuggestions,
      selectedTopic,
      proficiencyLevel,
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
    topicSuggestions,
    selectedTopic,
    proficiencyLevel,
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
        topicSuggestions: string[]
        selectedTopic: string
        proficiencyLevel: '' | 'low' | 'medium' | 'high'
        setupStep: 1 | 2 | 3
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
      setTopicSuggestions([])
      setVisibleTopicSuggestionCount(0)
      setSelectedTopic('')
      setProficiencyLevel('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setTutorDraft('')
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)
      setEntryQuizQuestionIndex(0)
      setIsLoadingTopicSuggestions(false)
      setHasTriedEntryQuizGeneration(false)
      setEntryPrepStepIndex(0)
      setEntryPrepPercents([0, 0, 0])
      setIsEntryPrepClosing(false)
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
    topicSuggestions,
    selectedTopic,
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
    if (isSetupComplete || setupStep !== 1) {
      return
    }

    const normalizedTopic = topic.trim()
    if (!normalizedTopic) {
      setTopicSuggestions([])
      setVisibleTopicSuggestionCount(0)
      setSelectedTopic('')
      setProficiencyLevel('')
      setIsLoadingTopicSuggestions(false)
      return
    }

    let isCancelled = false
    const timerId = window.setTimeout(async () => {
      try {
        setIsLoadingTopicSuggestions(true)
        const { suggestions } = await generateTopicSuggestionsWithAi(normalizedTopic)
        if (isCancelled) {
          return
        }
        setTopicSuggestions(suggestions)
        setVisibleTopicSuggestionCount(0)
        setSelectedTopic((current) => (current && suggestions.includes(current) ? current : ''))
      } catch {
        if (!isCancelled) {
          setTopicSuggestions([])
          setVisibleTopicSuggestionCount(0)
          setSelectedTopic('')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTopicSuggestions(false)
        }
      }
    }, 380)

    return () => {
      isCancelled = true
      window.clearTimeout(timerId)
    }
  }, [isSetupComplete, setupStep, topic])

  useEffect(() => {
    if (!(isEntryQuizLoading && tutorMessages.length === 0)) {
      return
    }

    let isCancelled = false
    const timers: number[] = []

    setEntryPrepStepIndex(0)
    setEntryPrepPercents([0, 0, 0])

    function runStep(stepIndex: number) {
      if (isCancelled) {
        return
      }

      setEntryPrepStepIndex(stepIndex)
      let percent = 0

      const tick = () => {
        if (isCancelled) {
          return
        }

        const jump = Math.floor(Math.random() * 8) + 4
        percent = Math.min(100, percent + jump)

        setEntryPrepPercents((prev) => {
          const next = [...prev]
          next[stepIndex] = percent
          return next
        })

        if (percent >= 100) {
          if (stepIndex < ENTRY_TEST_PREP_STEPS.length - 1) {
            const nextTimer = window.setTimeout(() => {
              runStep(stepIndex + 1)
            }, 220)
            timers.push(nextTimer)
          }
          return
        }

        const timerId = window.setTimeout(tick, 95)
        timers.push(timerId)
      }

      tick()
    }

    runStep(0)

    return () => {
      isCancelled = true
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [isEntryQuizLoading, tutorMessages.length])

  useEffect(() => {
    if (topicSuggestions.length === 0) {
      setVisibleTopicSuggestionCount(0)
      return
    }

    let isCancelled = false
    let nextCount = 0
    setVisibleTopicSuggestionCount(0)

    const intervalId = window.setInterval(() => {
      if (isCancelled) {
        return
      }
      nextCount += 1
      setVisibleTopicSuggestionCount(nextCount)
      if (nextCount >= topicSuggestions.length) {
        window.clearInterval(intervalId)
      }
    }, 110)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [topicSuggestions])

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
    if (
      !isSetupComplete ||
      !activePath ||
      isEntryQuizLoading ||
      entryQuiz ||
      hasTriedEntryQuizGeneration
    ) {
      return
    }
    const activePathIdAtStart = activePath.id
    const activePathTitle = activePath.title

    async function generateEntryQuiz() {
      setHasTriedEntryQuizGeneration(true)
      setIsEntryQuizLoading(true)
      setIsEntryPrepClosing(false)
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
            `Thema: ${effectiveTopic || getDisplayPathTitle(activePathTitle)}`,
            selectedTopic.trim() ? `Gewaehlter Schwerpunkt: ${selectedTopic.trim()}` : 'Gewaehlter Schwerpunkt: keiner',
            proficiencyLevel
              ? `Selbsteinschaetzung Niveau: ${
                  proficiencyLevel === 'low'
                    ? 'schwach'
                    : proficiencyLevel === 'medium'
                      ? 'mittel'
                      : 'gut'
                }`
              : 'Selbsteinschaetzung Niveau: unbekannt',
            materialContext ? `Dateien:\n${materialContext}` : 'Dateien: keine hochgeladen.',
            'Aufgabe: Erstelle jetzt einen Einstiegstest zum Start in das Thema.',
            'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
            'Nutze ein Mischformat aus Multiple-Choice und Freitext-Fragen.',
            'Fuer Multiple-Choice-Fragen setze questionType auf "mcq" und gib 3-5 Optionen im Feld "options" an.',
            'Fuer Freitext-Fragen setze questionType auf "text".',
            'Antworte zuerst mit 1-2 kurzen Einleitungssaetzen und dann direkt mit dem Quiz-Block.',
          ].join('\n\n'),
          createdAt: new Date().toISOString(),
        }

        const result = await sendMessage([quizRequestMessage], {
          systemPrompt: LEARN_TUTOR_SYSTEM_PROMPT,
        })
        if (activePathIdRef.current !== activePathIdAtStart) {
          return
        }
        const parsed = parseInteractiveContentWithFallback(result.assistantMessage.content)
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
        setEntryQuizQuestionIndex(0)
        setEntryPrepStepIndex(ENTRY_TEST_PREP_STEPS.length - 1)
        setEntryPrepPercents([100, 100, 100])
        setIsEntryQuizLoading(false)
        setIsEntryPrepClosing(true)
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 320)
        })
        if (activePathIdRef.current !== activePathIdAtStart) {
          return
        }
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
        setIsEntryPrepClosing(false)
      } catch (err) {
        if (activePathIdRef.current === activePathIdAtStart) {
          setIsEntryPrepClosing(false)
          setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht erstellt werden.')
        }
      } finally {
        if (activePathIdRef.current === activePathIdAtStart) {
          setIsEntryQuizLoading(false)
        }
      }
    }

    void generateEntryQuiz()
  }, [
    isSetupComplete,
    activePath,
    materials,
    effectiveTopic,
    selectedTopic,
    proficiencyLevel,
    entryQuiz,
    hasTriedEntryQuizGeneration,
    isEntryQuizLoading,
  ])

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
    setTopicSuggestions([])
    setVisibleTopicSuggestionCount(0)
    setSelectedTopic('')
    setProficiencyLevel('')
    setSetupStep(1)
    setIsSetupComplete(false)
    setMaterials([])
    setTutorMessages([])
    setTutorDraft('')
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)
    setEntryQuizQuestionIndex(0)

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
      setTopicSuggestions([])
      setVisibleTopicSuggestionCount(0)
      setSelectedTopic('')
      setProficiencyLevel('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setTutorDraft('')
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)
      setEntryQuizQuestionIndex(0)

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
    setEntryQuizQuestionIndex(0)
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
    if (topicSuggestions.length > 0 && !selectedTopic.trim()) {
      setError('Bitte waehle ein vorgeschlagenes Unterthema aus.')
      return
    }

    setError(null)
    setSetupStep(2)
  }

  function handleContinueSetupStepTwo() {
    setError(null)
    setSetupStep(3)
  }

  function handleFinishSetup() {
    if (!proficiencyLevel) {
      setError('Bitte waehle deine Selbsteinschaetzung aus.')
      return
    }
    setError(null)
    setHasTriedEntryQuizGeneration(false)
    setIsEntryQuizLoading(false)
    setIsEntryPrepClosing(false)
    setEntryPrepStepIndex(0)
    setEntryPrepPercents([0, 0, 0])
    setIsSetupComplete(true)
    setTutorMessages([])
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)
    setEntryQuizQuestionIndex(0)
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
          `Thema: ${effectiveTopic || activePath?.title || 'ohne Thema'}`,
          selectedTopic.trim() ? `Gewaehlter Schwerpunkt: ${selectedTopic.trim()}` : 'Gewaehlter Schwerpunkt: keiner',
          proficiencyLevel
            ? `Selbsteinschaetzung Niveau: ${
                proficiencyLevel === 'low'
                  ? 'schwach'
                  : proficiencyLevel === 'medium'
                    ? 'mittel'
                    : 'gut'
              }`
            : 'Selbsteinschaetzung Niveau: unbekannt',
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

      const result = await sendMessage(chatMessages, {
        systemPrompt: LEARN_TUTOR_SYSTEM_PROMPT,
      })
      const parsed = parseInteractiveContentWithFallback(result.assistantMessage.content)

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
      const cachedFeedback = entryQuizResult?.feedbackByQuestionId ?? {}
      const cachedCorrectness = entryQuizResult?.correctnessByQuestionId ?? {}
      const cachedAnswers = entryQuizResult?.evaluatedAnswersByQuestionId ?? {}

      const evaluations = await Promise.all(
        entryQuiz.questions.map(async (question) => {
          const answer = (entryQuizAnswers[question.id] ?? '').trim()
          const canReuseCachedEvaluation =
            cachedAnswers[question.id] === answer &&
            typeof cachedFeedback[question.id] === 'string' &&
            typeof cachedCorrectness[question.id] === 'boolean'

          if (canReuseCachedEvaluation) {
            return {
              questionId: question.id,
              answer,
              isCorrect: cachedCorrectness[question.id],
              feedback: cachedFeedback[question.id],
            }
          }

          const result = await evaluateQuizAnswerWithAi({
            question,
            userAnswer: answer,
          })
          return {
            questionId: question.id,
            answer,
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
      const correctnessByQuestionId = evaluations.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.questionId] = entry.isCorrect
        return acc
      }, {})
      const evaluatedAnswersByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.answer
        return acc
      }, {})

      setEntryQuizResult({
        score,
        total: entryQuiz.questions.length,
        feedbackByQuestionId,
        correctnessByQuestionId,
        evaluatedAnswersByQuestionId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht abgegeben werden.')
    } finally {
      setIsSubmittingEntryQuiz(false)
    }
  }

  const hasSetupPhase = !isSetupComplete
  const entryQuizTotalQuestions = entryQuiz?.questions.length ?? 0
  const activeEntryQuestion =
    entryQuiz && entryQuizTotalQuestions > 0
      ? entryQuiz.questions[Math.min(entryQuizQuestionIndex, entryQuizTotalQuestions - 1)]
      : null
  const hasMultipleChoiceOptions =
    activeEntryQuestion?.questionType === 'mcq' && (activeEntryQuestion.options?.length ?? 0) >= 2
  const activeEntryAnswer = activeEntryQuestion ? (entryQuizAnswers[activeEntryQuestion.id] ?? '') : ''
  const isLastEntryQuestion = entryQuizTotalQuestions > 0 && entryQuizQuestionIndex >= entryQuizTotalQuestions - 1
  const entryQuizProgressPercent =
    entryQuizTotalQuestions > 0
      ? (Math.min(entryQuizQuestionIndex + 1, entryQuizTotalQuestions) / entryQuizTotalQuestions) * 100
      : 0
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.first_name ||
    user?.email ||
    'Nutzer'
  const avatarFallback = (profile?.first_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()
  const proficiencyLabel =
    proficiencyLevel === 'low'
      ? 'Schlecht'
      : proficiencyLevel === 'medium'
        ? 'Mittel'
        : proficiencyLevel === 'high'
          ? 'Gut'
          : '-'

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
          </div>
        ) : null}
        <div className="chat-sidebar-bottom">
          <div className="account-profile-row">
            <div className="account-profile chat-sidebar-profile-card">
              {profile?.avatar_url ? (
                <img className="account-avatar" src={profile.avatar_url} alt="Profilbild" />
              ) : (
                <div className="account-avatar-fallback">{avatarFallback}</div>
              )}
              {!isSidebarCollapsed ? (
                <div className="account-meta">
                  <div className="account-name-row">
                    <p className="account-value">{displayName}</p>
                    {profile?.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
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
                <div className={`learn-setup-flow ${setupStep === 1 ? 'is-topic-step' : ''}`}>
                  <div className="learn-setup-heading">
                    <h3>Einrichtung</h3>
                  </div>
                  {setupStep === 1 ? (
                    <div className="learn-setup-step learn-setup-step-topic">
                      <label htmlFor="learn-topic-input">Thema</label>
                      <p className="learn-setup-info">Gib das Thema ein, dann waehle ein passendes Unterthema.</p>
                      <input
                        id="learn-topic-input"
                        type="text"
                        placeholder="z.B. SQL Joins, Algebra, Anatomie..."
                        value={topic}
                        onChange={(event) => {
                          setTopic(event.target.value)
                          setSelectedTopic('')
                        }}
                      />

                      {topic.trim() || isLoadingTopicSuggestions || topicSuggestions.length > 0 ? (
                        <div className="learn-topic-suggestions-panel">
                          <p className="learn-topic-suggestions-label">Vorschlaege von der KI:</p>
                          {isLoadingTopicSuggestions ? (
                            <div className="learn-topic-suggestions-loader" role="status" aria-live="polite">
                              <span className="learn-topic-loader-orbit" aria-hidden="true">
                                <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                                <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                                <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                              </span>
                              <span className="learn-topic-loader-text">Vorschlaege werden generiert...</span>
                            </div>
                          ) : topicSuggestions.length === 0 ? (
                            <p className="learn-muted">Noch keine Vorschlaege vorhanden.</p>
                          ) : (
                            <div className="learn-topic-suggestions-list" role="list" aria-label="Unterthemen">
                              {topicSuggestions.slice(0, visibleTopicSuggestionCount).map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  className={`learn-topic-suggestion-chip ${
                                    selectedTopic === suggestion ? 'is-active' : ''
                                  }`}
                                  onClick={() => {
                                    setSelectedTopic(suggestion)
                                    setError(null)
                                  }}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                          {selectedTopic ? (
                            <p className="learn-topic-selection-info">
                              Ausgewaehlt: <strong>{selectedTopic}</strong>
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="learn-setup-actions learn-setup-actions-topic">
                        <PrimaryButton
                          type="button"
                          onClick={handleContinueSetupStepOne}
                          disabled={!topic.trim() || (topicSuggestions.length > 0 && !selectedTopic.trim())}
                        >
                          Weiter
                        </PrimaryButton>
                      </div>
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
                        <PrimaryButton type="button" onClick={handleContinueSetupStepTwo}>
                          Weiter
                        </PrimaryButton>
                      </div>
                    </div>
                  ) : null}

                  {setupStep === 3 ? (
                    <div className="learn-setup-step">
                      <label>Selbsteinschaetzung</label>
                      <p className="learn-setup-info">Wie gut bist du in diesem Thema?</p>
                      <div className="learn-proficiency-options" role="radiogroup" aria-label="Niveauauswahl">
                        <button
                          type="button"
                          className={`learn-proficiency-option ${proficiencyLevel === 'low' ? 'is-active' : ''}`}
                          onClick={() => {
                            setProficiencyLevel('low')
                            setError(null)
                          }}
                        >
                          Schlecht
                        </button>
                        <button
                          type="button"
                          className={`learn-proficiency-option ${proficiencyLevel === 'medium' ? 'is-active' : ''}`}
                          onClick={() => {
                            setProficiencyLevel('medium')
                            setError(null)
                          }}
                        >
                          Mittel
                        </button>
                        <button
                          type="button"
                          className={`learn-proficiency-option ${proficiencyLevel === 'high' ? 'is-active' : ''}`}
                          onClick={() => {
                            setProficiencyLevel('high')
                            setError(null)
                          }}
                        >
                          Gut
                        </button>
                      </div>
                      <div className="learn-setup-actions">
                        <SecondaryButton type="button" onClick={() => setSetupStep(2)}>
                          Zurück
                        </SecondaryButton>
                        <PrimaryButton type="button" onClick={handleFinishSetup} disabled={!proficiencyLevel}>
                          Einrichtung abschliessen
                        </PrimaryButton>
                      </div>
                    </div>
                  ) : null}

                  <div className="learn-setup-progress">
                    <div className={`learn-setup-progress-step ${setupStep >= 1 ? 'is-active' : ''}`}>1</div>
                    <div className={`learn-setup-progress-segment ${setupStep >= 2 ? 'is-active' : ''}`} />
                    <div className={`learn-setup-progress-step ${setupStep >= 2 ? 'is-active' : ''}`}>2</div>
                    <div className={`learn-setup-progress-segment ${setupStep >= 3 ? 'is-active' : ''}`} />
                    <div className={`learn-setup-progress-step ${setupStep >= 3 ? 'is-active' : ''}`}>3</div>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="learn-conversation">
                  {tutorMessages.length === 0 ? (
                    isEntryQuizLoading || isEntryPrepClosing ? (
                    <section
                      className={`learn-entry-prep ${isEntryPrepClosing ? 'is-exiting' : ''}`}
                      aria-live="polite"
                      aria-label="Ladevorgang Einstiegstest"
                    >
                      <div className="learn-entry-prep-header">
                        <span className="learn-topic-loader-orbit" aria-hidden="true">
                          <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                          <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                          <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                        </span>
                        <p className="learn-entry-prep-title">Dein Lernpfad wird vorbereitet...</p>
                      </div>
                      <div className="learn-entry-prep-steps">
                        {ENTRY_TEST_PREP_STEPS.slice(0, entryPrepStepIndex + 1).map((label, index) => (
                          <div
                            key={label}
                            className={`learn-entry-prep-step ${
                              index < entryPrepStepIndex
                                ? 'is-complete'
                                : index === entryPrepStepIndex
                                  ? 'is-active'
                                  : ''
                            }`}
                          >
                            <span>{label}</span>
                            <strong>{Math.max(0, Math.min(100, Math.round(entryPrepPercents[index] ?? 0)))}%</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                    ) : (
                      <div className="learn-entry-prep-fallback">
                        <p className="learn-muted">Einstiegstest konnte nicht automatisch erstellt werden.</p>
                        {error ? <p className="learn-muted">{error}</p> : null}
                        <SecondaryButton
                          type="button"
                          onClick={() => {
                            setHasTriedEntryQuizGeneration(false)
                            setError(null)
                          }}
                        >
                          Erneut versuchen
                        </SecondaryButton>
                      </div>
                    )
                  ) : (
                    tutorMessages.map((message) => (
                      <article
                        key={message.id}
                        className={`learn-conversation-message is-${message.role} ${
                          message.role === 'assistant' ? 'is-reveal' : ''
                        }`}
                      >
                        {message.role === 'assistant' && message.action !== 'open-entry-test' ? (
                          <strong className="chat-message-author">Straton AI</strong>
                        ) : null}
                        {message.action === 'open-entry-test' ? (
                          <div className="learn-entry-test-ready">
                            <p className="learn-entry-test-ready-title">
                              <img className="ui-icon learn-entry-test-ready-check" src={checkIcon} alt="" aria-hidden="true" />
                              <span>Einstiegstest bereit</span>
                            </p>
                            <p className="learn-entry-test-ready-description">
                              Dieser Test hilft dir, dein Wissen zu analysieren und deinen Lernpfad anzupassen.
                            </p>
                            <p className="learn-entry-test-ready-duration">Dauer: {entryTestDurationLabel}</p>
                          </div>
                        ) : (
                          <p>{message.content}</p>
                        )}
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
                              <span className="learn-entry-test-link-meta">Datei oeffnen</span>
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
            {!isSetupComplete ? (
              <>
                <div className="learn-progress-row">
                  <span>Einrichtung</span>
                  <strong>{`Schritt ${setupStep}/3`}</strong>
                </div>
                <div className="learn-progress-bar">
                  <span style={{ width: `${(setupStep / 3) * 100}%` }} />
                </div>
                <div className="learn-progress-row">
                  <span>Thema</span>
                  <strong>{effectiveTopic || '-'}</strong>
                </div>
                <div className="learn-progress-bar">
                  <span style={{ width: `${effectiveTopic ? 100 : 0}%` }} />
                </div>
                <div className="learn-progress-row">
                  <span>Niveau</span>
                  <strong>{proficiencyLabel}</strong>
                </div>
                <div className="learn-progress-row">
                  <span>Dateien</span>
                  <strong>{materials.length}</strong>
                </div>
                <div className="learn-progress-row">
                  <span>Einstiegstest</span>
                  <strong>{entryQuizResult ? 'Abgegeben' : 'Offen'}</strong>
                </div>
              </>
            ) : (
              <section className="learn-overview-compact" aria-label="Kompakte Lernübersicht">
                <div className="learn-overview-compact-line">
                  <span>Status</span>
                  <strong>{entryQuizResult ? 'Einstiegstest abgegeben' : 'Einstiegstest offen'}</strong>
                </div>
                <div className="learn-overview-compact-grid">
                  <div className="learn-overview-compact-item">
                    <span>Thema</span>
                    <strong>{effectiveTopic || '-'}</strong>
                  </div>
                  <div className="learn-overview-compact-item">
                    <span>Niveau</span>
                    <strong>{proficiencyLabel}</strong>
                  </div>
                  <div className="learn-overview-compact-item">
                    <span>Dateien</span>
                    <strong>{materials.length}</strong>
                  </div>
                  <div className="learn-overview-compact-item">
                    <span>Testergebnis</span>
                    <strong>{entryQuizResult ? `${entryQuizResult.score}/${entryQuizResult.total}` : '-'}</strong>
                  </div>
                </div>
              </section>
            )}
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
        <ModalShell isOpen={isEntryQuizVisible} className="learn-entry-test-overlay">
          <section className="learn-entry-test-modal" role="dialog" aria-modal="true" aria-label="Einstiegstest">
            <header className="learn-entry-test-header">
              <div className="learn-entry-test-header-copy">
                <h2>{effectiveTopic || entryQuiz?.title || 'Thema'}</h2>
                <p>Einstiegstest</p>
              </div>
              <button
                type="button"
                className="settings-close-button"
                onClick={closeEntryQuizModal}
                aria-label="Einstiegstest schliessen"
              >
                <span className="ui-icon settings-close-icon" aria-hidden="true" />
              </button>
            </header>
            <div className="learn-entry-test-body">
              {!entryQuiz ? <p>Kein Einstiegstest verfuegbar.</p> : null}
              {activeEntryQuestion ? (
                <>
                  <article key={activeEntryQuestion.id} className="learn-entry-test-question">
                    <p className="learn-entry-test-prompt">{activeEntryQuestion.prompt}</p>
                    {hasMultipleChoiceOptions ? (
                      <div className="learn-entry-test-options" role="radiogroup" aria-label="Antwortoptionen">
                        {activeEntryQuestion.options?.map((option) => {
                          const isSelected = (entryQuizAnswers[activeEntryQuestion.id] ?? '').trim() === option
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`learn-entry-test-option ${isSelected ? 'is-selected' : ''}`}
                              onClick={() =>
                                setEntryQuizAnswers((prev) => ({
                                  ...prev,
                                  [activeEntryQuestion.id]: option,
                                }))
                              }
                              disabled={isSubmittingEntryQuiz}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={entryQuizAnswers[activeEntryQuestion.id] ?? ''}
                        onChange={(event) =>
                          setEntryQuizAnswers((prev) => ({
                            ...prev,
                            [activeEntryQuestion.id]: event.target.value,
                          }))
                        }
                        placeholder="Deine Antwort..."
                        disabled={isSubmittingEntryQuiz}
                      />
                    )}
                    {entryQuizResult?.feedbackByQuestionId[activeEntryQuestion.id] ? (
                      <p className="learn-entry-test-feedback">
                        {entryQuizResult.feedbackByQuestionId[activeEntryQuestion.id]}
                      </p>
                    ) : null}
                  </article>
                </>
              ) : null}
            </div>
            <footer className="learn-entry-test-footer">
              <div className="learn-entry-test-footer-meta">
                <div className="learn-entry-test-counter">
                  Frage {Math.min(entryQuizQuestionIndex + 1, entryQuizTotalQuestions)} von {entryQuizTotalQuestions}
                </div>
                <div
                  className="learn-entry-test-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(entryQuizProgressPercent)}
                >
                  <span style={{ width: `${entryQuizProgressPercent}%` }} />
                </div>
                {entryQuizResult ? (
                  <p className="learn-entry-test-score">
                    Ergebnis: {entryQuizResult.score} / {entryQuizResult.total}
                  </p>
                ) : null}
              </div>
              <div className="learn-entry-test-footer-actions">
                <SecondaryButton
                  type="button"
                  onClick={() => setEntryQuizQuestionIndex((prev) => Math.max(0, prev - 1))}
                  disabled={isSubmittingEntryQuiz || !activeEntryQuestion || entryQuizQuestionIndex === 0}
                >
                  Zurueck
                </SecondaryButton>
                {isLastEntryQuestion ? (
                  <PrimaryButton
                    type="button"
                    onClick={() => {
                      void handleSubmitEntryQuiz()
                    }}
                    disabled={!entryQuiz || isSubmittingEntryQuiz || !activeEntryAnswer.trim()}
                  >
                    {isSubmittingEntryQuiz ? 'Wird abgegeben...' : 'Abgeben'}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    type="button"
                    onClick={() =>
                      setEntryQuizQuestionIndex((prev) => Math.min(entryQuizTotalQuestions - 1, prev + 1))
                    }
                    disabled={isSubmittingEntryQuiz || !activeEntryQuestion || !activeEntryAnswer.trim()}
                  >
                    Naechste Frage
                  </PrimaryButton>
                )}
              </div>
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
