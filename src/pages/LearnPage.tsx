import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import deleteIcon from '../assets/icons/delete.svg'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import { generateLearnFlashcards, sendMessage } from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  createLearningPathByUserId,
  type ChapterBlueprint,
  type ChapterSession,
  listLearningPathsByUserId,
  type EntryQuizResult,
  type LearnFlashcard,
  type LearningPathRecord,
  type LearningPathSummary,
  type TutorChatEntry,
  type UploadedMaterial,
  updateLearningPathById,
} from '../features/learn/services/learn.persistence'
import { useAdaptiveChapterGeneration } from '../features/learn/hooks/useAdaptiveChapterGeneration'
import { useLearnWorkspaceDerived } from '../features/learn/hooks/useLearnWorkspaceDerived'
import { useLearningPathActions } from '../features/learn/hooks/useLearningPathActions'
import { useLearnSetupFlow } from '../features/learn/hooks/useLearnSetupFlow'
import { useEntryQuizUiFlow } from '../features/learn/hooks/useEntryQuizUiFlow'
import { useEntryQuizSubmissionFlow } from '../features/learn/hooks/useEntryQuizSubmissionFlow'
import { useChapterSessionFlow } from '../features/learn/hooks/useChapterSessionFlow'
import {
  useLearningPathPersistence,
  type EditableLearningPathSnapshot,
} from '../features/learn/hooks/useLearningPathPersistence'
import { parseInteractiveContentWithFallback, type InteractiveQuizPayload } from '../features/chat/utils/interactiveQuiz'
import { extractLearningMaterialText } from '../features/learn/utils/documentParser'
import {
  DEFAULT_CHAPTER_SESSION,
  ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS,
  ENTRY_TEST_PREP_STEPS,
  LEARN_TUTOR_SYSTEM_PROMPT,
  WORKSHEET_EXERCISE_FIDELITY_RULES,
  POST_ENTRY_PREP_STEPS,
  getDisplayPathTitle,
  validateGeneratedEntryQuiz,
} from '../features/learn/utils/learnPageHelpers'
import { formatRelevantMaterialContext } from '../features/learn/utils/ragLite'
import { buildFlashcardSourceFromBlueprints } from '../features/learn/utils/flashcardSourceFromBlueprints'
import { LearnChapterModal } from '../features/learn/components/LearnChapterModal'
import { LearnFlashcardsModal } from '../features/learn/components/LearnFlashcardsModal'
import { LearnConversationSection } from '../features/learn/components/LearnConversationSection'
import { LearnEntryQuizModal } from '../features/learn/components/LearnEntryQuizModal'
import { LearnOverviewPanel } from '../features/learn/components/LearnOverviewPanel'
import { LearnPageSidebar } from '../features/learn/components/LearnPageSidebar'
import { LearnSetupPanel } from '../features/learn/components/LearnSetupPanel'
import { SettingsModal } from './SettingsPage'

export function LearnPage() {
  const MODAL_ANIMATION_MS = 220
  const { user, profile, isLoading } = useAuth()
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [topic, setTopic] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzingSetupTopic, setIsAnalyzingSetupTopic] = useState(false)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [activePathId, setActivePathId] = useState<string>('')
  const [tutorMessages, setTutorMessages] = useState<TutorChatEntry[]>([])
  const [isChapterPreviewVisible, setIsChapterPreviewVisible] = useState(false)
  const [isLayoutCustomizeMode, setIsLayoutCustomizeMode] = useState(false)
  const [mainSplitPercent, setMainSplitPercent] = useState(72)
  const [dragTarget, setDragTarget] = useState<'main' | null>(null)
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1)
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [setupAnalysisPercent, setSetupAnalysisPercent] = useState(0)
  const [proficiencyLevel, setProficiencyLevel] = useState<'' | 'low' | 'medium' | 'high'>('')
  const [entryQuiz, setEntryQuiz] = useState<InteractiveQuizPayload | null>(null)
  const [isEntryQuizLoading, setIsEntryQuizLoading] = useState(false)
  const [hasTriedEntryQuizGeneration, setHasTriedEntryQuizGeneration] = useState(false)
  const [entryPrepStepIndex, setEntryPrepStepIndex] = useState(0)
  const [entryPrepPercents, setEntryPrepPercents] = useState<number[]>([0, 0, 0])
  const [isEntryPrepClosing, setIsEntryPrepClosing] = useState(false)
  const [isEntryQuizMounted, setIsEntryQuizMounted] = useState(false)
  const [isEntryQuizVisible, setIsEntryQuizVisible] = useState(false)
  const [isSettingsMounted, setIsSettingsMounted] = useState(false)
  const [isSettingsVisible, setIsSettingsVisible] = useState(false)
  const [entryQuizAnswers, setEntryQuizAnswers] = useState<Record<string, string>>({})
  const [entryQuizResult, setEntryQuizResult] = useState<EntryQuizResult | null>(null)
  const [learningChapters, setLearningChapters] = useState<string[]>([])
  const [chapterBlueprints, setChapterBlueprints] = useState<ChapterBlueprint[]>([])
  const [chapterSession, setChapterSession] = useState<ChapterSession>(DEFAULT_CHAPTER_SESSION)
  const [isChapterModalMounted, setIsChapterModalMounted] = useState(false)
  const [isChapterModalVisible, setIsChapterModalVisible] = useState(false)
  const [isFlashcardsModalMounted, setIsFlashcardsModalMounted] = useState(false)
  const [isFlashcardsModalVisible, setIsFlashcardsModalVisible] = useState(false)
  const [learnFlashcards, setLearnFlashcards] = useState<LearnFlashcard[]>([])
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false)
  const [flashcardsError, setFlashcardsError] = useState<string | null>(null)
  const [isEvaluatingChapterStep, setIsEvaluatingChapterStep] = useState(false)
  const [entryQuizQuestionIndex, setEntryQuizQuestionIndex] = useState(0)
  const [isSubmittingEntryQuiz, setIsSubmittingEntryQuiz] = useState(false)
  const [isPostEntryPrepLoading, setIsPostEntryPrepLoading] = useState(false)
  const [postEntryPrepStepIndex, setPostEntryPrepStepIndex] = useState(0)
  const [postEntryPrepPercents, setPostEntryPrepPercents] = useState<number[]>([0, 0])
  const [openPathMenuId, setOpenPathMenuId] = useState<string | null>(null)
  const [pathMenuPosition, setPathMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const learnPageGridRef = useRef<HTMLDivElement | null>(null)
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const entryQuizCloseTimerRef = useRef<number | null>(null)
  const chapterModalCloseTimerRef = useRef<number | null>(null)
  const flashcardsModalCloseTimerRef = useRef<number | null>(null)
  const settingsCloseTimerRef = useRef<number | null>(null)
  const suppressAutosaveRef = useRef(false)
  const activePathIdRef = useRef('')
  const pathCacheRef = useRef<Record<string, LearningPathRecord>>({})

  const activePath = learningPaths.find((entry) => entry.id === activePathId) ?? null
  const effectiveTopic = selectedTopic.trim() || topic.trim()
  const setupAnalysisPercentClamped = Math.max(0, Math.min(100, Math.round(setupAnalysisPercent)))
  const entryPrepStepSafeIndex = Math.max(0, Math.min(ENTRY_TEST_PREP_STEPS.length - 1, entryPrepStepIndex))
  const entryPrepCurrentStepPercent = Math.max(0, Math.min(100, entryPrepPercents[entryPrepStepSafeIndex] ?? 0))
  const entryPrepOverallPercent =
    ENTRY_TEST_PREP_STEPS.length > 0
      ? Math.round(((entryPrepStepSafeIndex + entryPrepCurrentStepPercent / 100) / ENTRY_TEST_PREP_STEPS.length) * 100)
      : 0
  const postEntryPrepStepSafeIndex = Math.max(0, Math.min(POST_ENTRY_PREP_STEPS.length - 1, postEntryPrepStepIndex))
  const postEntryCurrentStepPercent = Math.max(0, Math.min(100, postEntryPrepPercents[postEntryPrepStepSafeIndex] ?? 0))
  const postEntryPrepOverallPercent =
    POST_ENTRY_PREP_STEPS.length > 0
      ? Math.round(((postEntryPrepStepSafeIndex + postEntryCurrentStepPercent / 100) / POST_ENTRY_PREP_STEPS.length) * 100)
      : 0
  const setupAnalysisArcRadius = 44
  const setupAnalysisCircumference = 2 * Math.PI * setupAnalysisArcRadius
  const setupAnalysisArcRatio = 0.82
  const setupAnalysisArcLength = setupAnalysisCircumference * setupAnalysisArcRatio
  const setupAnalysisArcOffset =
    setupAnalysisArcLength * (1 - Math.max(0, Math.min(100, setupAnalysisPercent)) / 100)
  const entryPrepArcOffset = setupAnalysisArcLength * (1 - Math.max(0, Math.min(100, entryPrepOverallPercent)) / 100)
  const postEntryPrepArcOffset =
    setupAnalysisArcLength * (1 - Math.max(0, Math.min(100, postEntryPrepOverallPercent)) / 100)
  const entryTestDurationLabel = entryQuiz
    ? `ca. ${Math.max(5, Math.ceil(entryQuiz.questions.length * 1.5))} Minuten`
    : 'ca. 10 Minuten'

  const { effectiveChapterBlueprints } = useAdaptiveChapterGeneration({
    activePathId,
    activePathTitle: activePath?.title,
    chapterBlueprints,
    chapterSession,
    effectiveTopic,
    selectedTopic,
    materials,
  })

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
      learningChapters,
      chapterBlueprints,
      chapterSession,
      learnFlashcards,
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
      learningChapters,
      chapterBlueprints,
      chapterSession,
      learnFlashcards,
    ],
  )

  const applyPathToState = useCallback(
    (record: LearningPathRecord) => {
      suppressAutosaveRef.current = true
      setTopic(record.topic)
      setTopicSuggestions(record.topicSuggestions)
      setSelectedTopic(record.selectedTopic)
      setProficiencyLevel(record.proficiencyLevel)
      setSetupStep(record.setupStep)
      setIsSetupComplete(record.isSetupComplete)
      setMaterials(record.materials)
      setTutorMessages(record.tutorMessages)
      setIsChapterPreviewVisible(false)
      setEntryQuiz(record.entryQuiz)
      setEntryQuizAnswers(record.entryQuizAnswers)
      setEntryQuizResult(record.entryQuizResult)
      setLearningChapters(record.learningChapters)
      setChapterBlueprints(record.chapterBlueprints)
      setChapterSession(record.chapterSession)
      setEntryQuizQuestionIndex(0)
      setIsAnalyzingSetupTopic(false)
      setHasTriedEntryQuizGeneration(Boolean(record.entryQuiz))
      setEntryPrepStepIndex(0)
      setEntryPrepPercents([0, 0, 0])
      setIsEntryPrepClosing(false)
      setIsPostEntryPrepLoading(false)
      setPostEntryPrepStepIndex(0)
      setPostEntryPrepPercents([0, 0])
      setIsChapterModalVisible(false)
      setIsChapterModalMounted(false)
      setIsEvaluatingChapterStep(false)
      setIsFlashcardsModalVisible(false)
      setIsFlashcardsModalMounted(false)
      setLearnFlashcards(record.learnFlashcards ?? [])
      setFlashcardsError(null)
      setIsGeneratingFlashcards(false)
      if (flashcardsModalCloseTimerRef.current) {
        window.clearTimeout(flashcardsModalCloseTimerRef.current)
        flashcardsModalCloseTimerRef.current = null
      }
      if (entryQuizCloseTimerRef.current) {
        window.clearTimeout(entryQuizCloseTimerRef.current)
        entryQuizCloseTimerRef.current = null
      }
      if (chapterModalCloseTimerRef.current) {
        window.clearTimeout(chapterModalCloseTimerRef.current)
        chapterModalCloseTimerRef.current = null
      }
      if (settingsCloseTimerRef.current) {
        window.clearTimeout(settingsCloseTimerRef.current)
        settingsCloseTimerRef.current = null
      }
      setIsEntryQuizVisible(false)
      setIsEntryQuizMounted(false)
      setIsSettingsVisible(false)
      setIsSettingsMounted(false)
    },
    [],
  )

  const resetPathStateForLoading = useCallback(() => {
    suppressAutosaveRef.current = true
    setTopic('')
    setTopicSuggestions([])
    setSelectedTopic('')
    setProficiencyLevel('')
    setSetupStep(1)
    setIsSetupComplete(false)
    setIsAnalyzingSetupTopic(false)
    setMaterials([])
    setTutorMessages([])
    setIsChapterPreviewVisible(false)
    setEntryQuiz(null)
    setEntryQuizAnswers({})
    setEntryQuizResult(null)
    setLearningChapters([])
    setChapterBlueprints([])
    setChapterSession(DEFAULT_CHAPTER_SESSION)
    setLearnFlashcards([])
    setEntryQuizQuestionIndex(0)
    setIsPostEntryPrepLoading(false)
    setPostEntryPrepStepIndex(0)
    setPostEntryPrepPercents([0, 0])
  }, [])

  const editableSnapshot: EditableLearningPathSnapshot = {
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
    learningChapters,
    chapterBlueprints,
    chapterSession,
    learnFlashcards,
  }

  const { persistActivePath, persistPathInBackground } = useLearningPathPersistence({
    activePathIdRef,
    learningPaths,
    pathCacheRef,
    setError,
    snapshot: editableSnapshot,
  })

  const { handleCreateLearningPath, handleSelectLearningPath, handleDeleteLearningPath } = useLearningPathActions({
    userId: user?.id,
    learningPaths,
    setLearningPaths,
    activePathIdRef,
    setActivePathId,
    pathCacheRef,
    setError,
    applyPathToState,
    resetPathStateForLoading,
    captureEditableState,
    persistActivePath,
    persistPathInBackground,
    closePathMenu: () => {
      setOpenPathMenuId(null)
      setPathMenuPosition(null)
    },
  })

  const { handleContinueSetupStepOne, handleContinueSetupStepTwo, handleFinishSetup } = useLearnSetupFlow({
    isUploading,
    isAnalyzingSetupTopic,
    materials,
    proficiencyLevel,
    setError,
    setIsAnalyzingSetupTopic,
    setSetupAnalysisPercent,
    setTopic,
    setSelectedTopic,
    setTopicSuggestions,
    setSetupStep,
    setHasTriedEntryQuizGeneration,
    setIsEntryQuizLoading,
    setIsEntryPrepClosing,
    setEntryPrepStepIndex,
    setEntryPrepPercents,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setIsSetupComplete,
    setTutorMessages,
    setEntryQuiz,
    setEntryQuizAnswers,
    setEntryQuizResult,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
    setEntryQuizQuestionIndex,
  })

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
      setSelectedTopic('')
      setProficiencyLevel('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setIsChapterPreviewVisible(false)
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)
      setLearningChapters([])
      setChapterBlueprints([])
      setChapterSession(DEFAULT_CHAPTER_SESSION)
      setEntryQuizQuestionIndex(0)
      setIsAnalyzingSetupTopic(false)
      setHasTriedEntryQuizGeneration(false)
      setEntryPrepStepIndex(0)
      setEntryPrepPercents([0, 0, 0])
      setIsEntryPrepClosing(false)
      setIsPostEntryPrepLoading(false)
      setPostEntryPrepStepIndex(0)
      setPostEntryPrepPercents([0, 0])
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
    learningChapters,
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
      if (chapterModalCloseTimerRef.current) {
        window.clearTimeout(chapterModalCloseTimerRef.current)
      }
      if (flashcardsModalCloseTimerRef.current) {
        window.clearTimeout(flashcardsModalCloseTimerRef.current)
      }
      if (settingsCloseTimerRef.current) {
        window.clearTimeout(settingsCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isAnalyzingSetupTopic) {
      setSetupAnalysisPercent(0)
      return
    }

    let isCancelled = false
    let current = 0
    const timers: number[] = []

    const tick = () => {
      if (isCancelled) {
        return
      }
      const jump = Math.floor(Math.random() * 6) + 2
      current = Math.min(96, current + jump)
      setSetupAnalysisPercent(current)
      if (current >= 96) {
        return
      }
      const timerId = window.setTimeout(tick, Math.floor(Math.random() * 120) + 90)
      timers.push(timerId)
    }

    tick()

    return () => {
      isCancelled = true
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [isAnalyzingSetupTopic])

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
        const materialContext = formatRelevantMaterialContext(
          (
            (effectiveTopic || getDisplayPathTitle(activePathTitle)) +
            ' ' +
            selectedTopic +
            ' Uebung Aufgabe Berechnung Teilaufgabe Beispiel'
          ).trim(),
          materials,
          { maxChunks: 10, maxChars: 6500 },
        )

        let parsedQuiz: InteractiveQuizPayload | null = null
        let parsedCleanText = ''
        let validationReason = ''

        for (let attempt = 1; attempt <= ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS; attempt += 1) {
          const quizRequestMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: [
              'Lernpfad Name: ' + getDisplayPathTitle(activePathTitle),
              'Thema: ' + (effectiveTopic || getDisplayPathTitle(activePathTitle)),
              selectedTopic.trim() ? 'Gewaehlter Schwerpunkt: ' + selectedTopic.trim() : 'Gewaehlter Schwerpunkt: keiner',
              proficiencyLevel
                ? 'Selbsteinschaetzung Niveau: ' +
                  (proficiencyLevel === 'low' ? 'schwach' : proficiencyLevel === 'medium' ? 'mittel' : 'gut')
                : 'Selbsteinschaetzung Niveau: unbekannt',
              materialContext
                ? 'Dateiauszuege (mind. die Haelfte der Fragen muss sich hierauf beziehen — Begriffe, Fakten, Beispiele aus den Dateien):\n' +
                  materialContext
                : 'Dateien: keine hochgeladen — nutze realistische IT-Praxisbeispiele in den Fragestellungen.',
              WORKSHEET_EXERCISE_FIDELITY_RULES,
              'Aufgabe: Erstelle jetzt einen Einstiegstest zum Start in das Thema.',
              'Formuliere die Fragen so, dass bei vorhandenen Dateien klar erkennbar ist, ob der Lernende den Auszug verstanden hat (Zuordnen, Begriffe, Kurztext, konkrete Rechen- oder Zuordnungsaufgaben wie im Blatt).',
              'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
              'Die ERSTE Frage MUSS Multiple-Choice sein.',
              'Insgesamt muessen mindestens 2 Multiple-Choice-Fragen enthalten sein.',
              'Jede Multiple-Choice-Frage MUSS 3-5 Optionen enthalten.',
              'Nutze ein Mischformat aus Multiple-Choice, Freitext und optional Zuordnung (Drag-and-Drop im UI).',
              'Fuer Multiple-Choice-Fragen setze questionType auf "mcq" und gib 3-5 Optionen im Feld "options" an.',
              'Fuer Freitext-Fragen setze questionType auf "text".',
              'Fuer Zuordnungsfragen setze questionType auf "match", gib zwei gleich lange Arrays "matchLeft" (z. B. Begriffe) und "matchRight" (Definitionen); die richtige Zuordnung ist Index i zu Index i (expectedAnswer z. B. "0,1,2" fuer drei Paare oder weglassen).',
              validationReason
                ? 'Der vorige Versuch war ungueltig: ' + validationReason + ' Halte dich strikt an alle Regeln.'
                : 'Halte dich strikt an alle Regeln.',
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
            validationReason = 'Kein gueltiger Quiz-JSON-Block erhalten.'
            continue
          }

          const validation = validateGeneratedEntryQuiz(parsed.quiz)
          if (!validation.valid) {
            validationReason = validation.reason
            continue
          }

          parsedQuiz = parsed.quiz
          parsedCleanText = parsed.cleanText
          break
        }

        if (!parsedQuiz) {
          throw new Error(
            validationReason
              ? `Einstiegstest ungueltig: ${validationReason}`
              : 'Kein gueltiger Einstiegstest von der KI erhalten.',
          )
        }

        const initialAnswers = parsedQuiz.questions.reduce<Record<string, string>>((acc, question) => {
          acc[question.id] = ''
          return acc
        }, {})

        setEntryQuiz(parsedQuiz)
        setEntryQuizAnswers(initialAnswers)
        setEntryQuizResult(null)
        setLearningChapters([])
        setChapterBlueprints([])
        setChapterSession(DEFAULT_CHAPTER_SESSION)
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
              (parsedCleanText || 'Dein Einstiegstest ist bereit.') +
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

  const {
    openEntryQuizModal,
    closeEntryQuizModal,
    handleEntryQuizAnswerChange,
    handlePreviousEntryQuestion,
    handleNextEntryQuestion,
  } = useEntryQuizUiFlow({
    entryQuizCloseTimerRef,
    modalAnimationMs: MODAL_ANIMATION_MS,
    entryQuizTotalQuestions: entryQuiz?.questions.length ?? 0,
    setIsEntryQuizMounted,
    setIsEntryQuizVisible,
    setEntryQuizQuestionIndex,
    setEntryQuizAnswers,
  })
  const { handleSubmitEntryQuiz } = useEntryQuizSubmissionFlow({
    entryQuiz,
    isSubmittingEntryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    effectiveTopic,
    activePathTitle: activePath?.title ?? '',
    selectedTopic,
    materials,
    closeEntryQuizModal,
    setError,
    setIsSubmittingEntryQuiz,
    setEntryQuizResult,
    setTutorMessages,
    setIsChapterPreviewVisible,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
  })

  const { handleEvaluateCurrentChapterQuestion, handleNextChapterStep, handlePreviousChapterStep } = useChapterSessionFlow({
    effectiveChapterBlueprints,
    chapterSession,
    isEvaluatingChapterStep,
    setChapterSession,
    setIsEvaluatingChapterStep,
    setError,
  })

  const {
    entryQuizTotalQuestions,
    activeEntryQuestion,
    hasMultipleChoiceOptions,
    activeEntryAnswer,
    isLastEntryQuestion,
    entryQuizProgressPercent,
    safeChapterIndex,
    activeChapterBlueprint,
    safeChapterStepIndex,
    activeChapterStep,
    chapterProgressPercent,
    currentChapterAnswer,
    currentChapterFeedback,
    currentChapterIsCorrect,
    hasCurrentChapterEvaluation,
    totalCorrectChapterQuestions,
    totalWrongChapterQuestions,
    chapterAccuracyPercent,
    displayName,
    avatarFallback,
    previewChapterTitle,
    previewStepCount,
    previewQuestionCount,
    previewStatusLabel,
    previewStatusText,
    previewRecommendation,
    currentChapterStepProgressPercent,
    previewGreetingText,
    hasStartedFirstChapter,
    showChapterPreview,
    previewEstimatedMinutes,
    previewChapterBullets,
    proficiencyLabel,
  } = useLearnWorkspaceDerived({
    user,
    profile,
    effectiveChapterBlueprints,
    chapterSession,
    learningChapters,
    effectiveTopic,
    isChapterPreviewVisible,
    proficiencyLevel,
    entryQuiz,
    entryQuizQuestionIndex,
    entryQuizAnswers,
  })

  const handleCreateFlashcards = useCallback(async () => {
    if (effectiveChapterBlueprints.length === 0) {
      return
    }
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    const outline = buildFlashcardSourceFromBlueprints(effectiveChapterBlueprints)
    setLearnFlashcards([])
    setFlashcardsError(null)
    setIsFlashcardsModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsFlashcardsModalVisible(true)
    })
    if (!outline.trim()) {
      setFlashcardsError('Kein Kapiteltext vorhanden.')
      return
    }
    setIsGeneratingFlashcards(true)
    try {
      const cards = await generateLearnFlashcards(outline)
      setLearnFlashcards(cards)
      const pathId = activePathIdRef.current
      if (pathId) {
        const currentSummary = learningPaths.find((e) => e.id === pathId)
        const updated = await updateLearningPathById(pathId, {
          title: getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad'),
          ...captureEditableState(),
          learnFlashcards: cards,
        })
        pathCacheRef.current[pathId] = updated
      }
    } catch (e) {
      setFlashcardsError(e instanceof Error ? e.message : 'Lernkarten fehlgeschlagen.')
    } finally {
      setIsGeneratingFlashcards(false)
    }
  }, [captureEditableState, effectiveChapterBlueprints, learningPaths])

  if (isLoading) {
    return <main className="learn-loading">Lade Lernbereich...</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
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

  function handleActivePathNameChange(value: string) {
    setLearningPaths((prev) =>
      prev.map((path) => (path.id === activePathId ? { ...path, title: value } : path)),
    )
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
        const text = await extractLearningMaterialText(file)
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          excerpt: text,
        })
      }

      setMaterials((prev) => [...uploaded, ...prev].slice(0, 8))
    } finally {
      setIsUploading(false)
    }
  }

  function openChapterModal() {
    if (chapterModalCloseTimerRef.current) {
      window.clearTimeout(chapterModalCloseTimerRef.current)
      chapterModalCloseTimerRef.current = null
    }
    setIsChapterModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsChapterModalVisible(true)
    })
  }

  function closeChapterModal() {
    setIsChapterModalVisible(false)
    chapterModalCloseTimerRef.current = window.setTimeout(() => {
      setIsChapterModalMounted(false)
      chapterModalCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function closeFlashcardsModal() {
    setIsFlashcardsModalVisible(false)
    flashcardsModalCloseTimerRef.current = window.setTimeout(() => {
      setIsFlashcardsModalMounted(false)
      flashcardsModalCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openSavedFlashcardsModal() {
    if (learnFlashcards.length === 0) {
      return
    }
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    setFlashcardsError(null)
    setIsFlashcardsModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsFlashcardsModalVisible(true)
    })
  }

  function handleChapterMcqSelect(stepId: string, option: string) {
    setChapterSession((prev) => {
      const nextFeedbackByStepId = { ...prev.feedbackByStepId }
      const nextCorrectnessByStepId = { ...prev.correctnessByStepId }
      const nextEvaluatedAnswersByStepId = { ...prev.evaluatedAnswersByStepId }
      delete nextFeedbackByStepId[stepId]
      delete nextCorrectnessByStepId[stepId]
      delete nextEvaluatedAnswersByStepId[stepId]
      return {
        ...prev,
        answersByStepId: {
          ...prev.answersByStepId,
          [stepId]: option,
        },
        feedbackByStepId: nextFeedbackByStepId,
        correctnessByStepId: nextCorrectnessByStepId,
        evaluatedAnswersByStepId: nextEvaluatedAnswersByStepId,
      }
    })
  }

  function handleChapterTextAnswerChange(stepId: string, value: string) {
    setChapterSession((prev) => {
      const nextFeedbackByStepId = { ...prev.feedbackByStepId }
      const nextCorrectnessByStepId = { ...prev.correctnessByStepId }
      const nextEvaluatedAnswersByStepId = { ...prev.evaluatedAnswersByStepId }
      delete nextFeedbackByStepId[stepId]
      delete nextCorrectnessByStepId[stepId]
      delete nextEvaluatedAnswersByStepId[stepId]
      return {
        ...prev,
        answersByStepId: {
          ...prev.answersByStepId,
          [stepId]: value,
        },
        feedbackByStepId: nextFeedbackByStepId,
        correctnessByStepId: nextCorrectnessByStepId,
        evaluatedAnswersByStepId: nextEvaluatedAnswersByStepId,
      }
    })
  }

  function openSettingsModal() {
    if (settingsCloseTimerRef.current) {
      window.clearTimeout(settingsCloseTimerRef.current)
      settingsCloseTimerRef.current = null
    }
    setIsSettingsMounted(true)
    window.requestAnimationFrame(() => {
      setIsSettingsVisible(true)
    })
  }

  function closeSettingsModal() {
    setIsSettingsVisible(false)
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setIsSettingsMounted(false)
      settingsCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  const hasSetupPhase = !isSetupComplete

  return (
    <main className={`chat-app-shell learn-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <LearnPageSidebar
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        onCreateLearningPath={handleCreateLearningPath}
        onOpenSettings={openSettingsModal}
        learningPaths={learningPaths}
        activePathId={activePathId}
        onSelectLearningPath={(pathId) => {
          void handleSelectLearningPath(pathId)
          setOpenPathMenuId(null)
          setPathMenuPosition(null)
        }}
        onLearningPathContextMenu={openLearningPathContextMenu}
        onNavigateToChat={() => navigate('/chat')}
        profile={profile}
        displayName={displayName}
        avatarFallback={avatarFallback}
      />

      <section className="chat-main learn-main">
        <div
          ref={learnPageGridRef}
          className={`learn-page-grid ${isLayoutCustomizeMode ? 'is-layout-editing' : ''}`}
          style={{ '--learn-main-col': `${mainSplitPercent}%` } as CSSProperties}
        >
          <article className="learn-card learn-workspace-card">
            <header className="learn-workspace-header">
              <span className="learn-workspace-title-icon" aria-hidden="true" />
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
              <LearnSetupPanel
                setupStep={setupStep}
                isAnalyzingSetupTopic={isAnalyzingSetupTopic}
                setupAnalysisPercentClamped={setupAnalysisPercentClamped}
                setupAnalysisArcRadius={setupAnalysisArcRadius}
                setupAnalysisArcLength={setupAnalysisArcLength}
                setupAnalysisCircumference={setupAnalysisCircumference}
                setupAnalysisArcOffset={setupAnalysisArcOffset}
                materials={materials}
                isUploading={isUploading}
                effectiveTopic={effectiveTopic}
                proficiencyLevel={proficiencyLevel}
                onFilesChange={(files) => {
                  void handleUploadMaterials(files)
                }}
                onRemoveMaterial={(materialId) => {
                  setMaterials((prev) => prev.filter((entry) => entry.id !== materialId))
                }}
                onContinueStepOne={handleContinueSetupStepOne}
                onContinueStepTwo={handleContinueSetupStepTwo}
                onFinishSetup={handleFinishSetup}
                onBackToStep1={() => setSetupStep(1)}
                onBackToStep2={() => setSetupStep(2)}
                onSelectProficiency={(level) => {
                  setProficiencyLevel(level)
                  setError(null)
                }}
              />
            ) : (
              <LearnConversationSection
                showChapterPreview={showChapterPreview}
                learningChaptersCount={learningChapters.length}
                chapterPreview={{
                  greetingText: previewGreetingText,
                  chapterOrdinal: safeChapterIndex + 1,
                  chapterTitle: previewChapterTitle,
                  statusLabel: previewStatusLabel,
                  stepOrdinal: safeChapterStepIndex + 1,
                  stepCount: previewStepCount,
                  stepProgressPercent: currentChapterStepProgressPercent,
                  statusText: previewStatusText,
                  totalCorrect: totalCorrectChapterQuestions,
                  totalWrong: totalWrongChapterQuestions,
                  accuracyPercent: chapterAccuracyPercent,
                  hasStartedFirstChapter,
                  bullets: previewChapterBullets,
                  estimatedMinutes: previewEstimatedMinutes,
                  learningBlocksCount: Math.max(1, previewStepCount - previewQuestionCount),
                  questionCount: previewQuestionCount,
                  recommendation: previewRecommendation,
                  canStartChapter: effectiveChapterBlueprints.length > 0,
                  onStartChapter: openChapterModal,
                  canCreateFlashcards: effectiveChapterBlueprints.length > 0,
                  isGeneratingFlashcards,
                  onCreateFlashcards: handleCreateFlashcards,
                  hasSavedFlashcards: learnFlashcards.length > 0,
                  onOpenSavedFlashcards: openSavedFlashcardsModal,
                }}
                isPostEntryPrepLoading={isPostEntryPrepLoading}
                postEntryPrepPanel={{
                  ariaLabel: 'Ladevorgang Kapitelgenerierung',
                  setupAnalysisArcRadius,
                  setupAnalysisArcLength,
                  setupAnalysisCircumference,
                  arcOffset: postEntryPrepArcOffset,
                  overallPercent: postEntryPrepOverallPercent,
                  stepLabels: POST_ENTRY_PREP_STEPS,
                  activeStepIndex: postEntryPrepStepIndex,
                  stepPercents: postEntryPrepPercents,
                }}
                tutorMessages={tutorMessages}
                isEntryQuizLoading={isEntryQuizLoading}
                isEntryPrepClosing={isEntryPrepClosing}
                entryPrepPanel={{
                  ariaLabel: 'Ladevorgang Einstiegstest',
                  setupAnalysisArcRadius,
                  setupAnalysisArcLength,
                  setupAnalysisCircumference,
                  arcOffset: entryPrepArcOffset,
                  overallPercent: entryPrepOverallPercent,
                  stepLabels: ENTRY_TEST_PREP_STEPS,
                  activeStepIndex: entryPrepStepIndex,
                  stepPercents: entryPrepPercents,
                  isExiting: isEntryPrepClosing,
                }}
                entryQuizFallbackError={error}
                onRetryEntryQuizGeneration={() => {
                  setHasTriedEntryQuizGeneration(false)
                  setError(null)
                }}
                entryQuizResult={entryQuizResult}
                entryTestDurationLabel={entryTestDurationLabel}
                onOpenEntryQuizModal={openEntryQuizModal}
              />
            )}

          </article>

          <article className="learn-card learn-overview-card">
            <header className="learn-overview-header">
              <h2>{'\u00DCbersicht'}</h2>
            </header>
            <LearnOverviewPanel
              isSetupComplete={isSetupComplete}
              setupStep={setupStep}
              effectiveTopic={effectiveTopic}
              proficiencyLabel={proficiencyLabel}
              materialsCount={materials.length}
              entryQuizResult={entryQuizResult}
              learningChapters={learningChapters}
            />
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
              aria-label={'Breite zwischen Arbeitsbereich und \u00DCbersicht anpassen'}
            />
          ) : null}
        </div>
      </section>
      <LearnEntryQuizModal
        isMounted={isEntryQuizMounted}
        isVisible={isEntryQuizVisible}
        effectiveTopic={effectiveTopic}
        entryQuiz={entryQuiz}
        activeEntryQuestion={activeEntryQuestion}
        hasMultipleChoiceOptions={hasMultipleChoiceOptions}
        entryQuizAnswers={entryQuizAnswers}
        entryQuizResult={entryQuizResult}
        entryQuizQuestionIndex={entryQuizQuestionIndex}
        entryQuizTotalQuestions={entryQuizTotalQuestions}
        entryQuizProgressPercent={entryQuizProgressPercent}
        activeEntryAnswer={activeEntryAnswer}
        isLastEntryQuestion={isLastEntryQuestion}
        isSubmittingEntryQuiz={isSubmittingEntryQuiz}
        onClose={closeEntryQuizModal}
        onEntryQuizAnswerChange={handleEntryQuizAnswerChange}
        onPreviousQuestion={handlePreviousEntryQuestion}
        onNextQuestion={handleNextEntryQuestion}
        onSubmit={handleSubmitEntryQuiz}
      />
      <LearnChapterModal
        isMounted={isChapterModalMounted}
        isVisible={isChapterModalVisible}
        onClose={closeChapterModal}
        activeChapterBlueprint={activeChapterBlueprint}
        safeChapterIndex={safeChapterIndex}
        effectiveChapterCount={effectiveChapterBlueprints.length}
        safeChapterStepIndex={safeChapterStepIndex}
        chapterProgressPercent={chapterProgressPercent}
        activeChapterStep={activeChapterStep}
        currentChapterAnswer={currentChapterAnswer}
        currentChapterFeedback={currentChapterFeedback}
        currentChapterIsCorrect={currentChapterIsCorrect}
        hasCurrentChapterEvaluation={hasCurrentChapterEvaluation}
        isEvaluatingChapterStep={isEvaluatingChapterStep}
        onChapterAnswerChange={handleChapterTextAnswerChange}
        onSelectMcqOption={handleChapterMcqSelect}
        onPreviousChapterStep={handlePreviousChapterStep}
        onEvaluateChapterQuestion={handleEvaluateCurrentChapterQuestion}
        onNextChapterStep={handleNextChapterStep}
      />
      <LearnFlashcardsModal
        isMounted={isFlashcardsModalMounted}
        isVisible={isFlashcardsModalVisible}
        cards={learnFlashcards}
        isLoading={isGeneratingFlashcards}
        error={flashcardsError}
        onClose={closeFlashcardsModal}
      />
      {isSettingsMounted ? (
        <ModalShell isOpen={isSettingsVisible}>
          <SettingsModal onClose={closeSettingsModal} />
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
            {'L\u00F6schen'}
          </MenuItem>
        </ContextMenu>
      ) : null}
    </main>
  )
}




















