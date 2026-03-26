import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import checkIcon from '../assets/icons/check.svg'
import deleteIcon from '../assets/icons/delete.svg'
import fileIcon from '../assets/icons/file.svg'
import setupPng from '../assets/png/setup.png'
import settingsIcon from '../assets/icons/settings.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import starIcon from '../assets/icons/star.svg'
import statusIcon from '../assets/icons/status.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { useAuth } from '../features/auth/context/useAuth'
import { evaluateQuizAnswerWithAi } from '../features/chat/services/chat.service'
import { sendMessage } from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  createLearningPathByUserId,
  type ChapterBlueprint,
  type ChapterSession,
  type ChapterStep,
  listLearningPathsByUserId,
  type EntryQuizResult,
  type LearningPathRecord,
  type LearningPathSummary,
  type TutorChatEntry,
  type UploadedMaterial,
} from '../features/learn/services/learn.persistence'
import { useLearningPathActions } from '../features/learn/hooks/useLearningPathActions'
import { useLearnSetupFlow } from '../features/learn/hooks/useLearnSetupFlow'
import { useEntryQuizUiFlow } from '../features/learn/hooks/useEntryQuizUiFlow'
import { useEntryQuizSubmissionFlow } from '../features/learn/hooks/useEntryQuizSubmissionFlow'
import {
  useLearningPathPersistence,
  type EditableLearningPathSnapshot,
} from '../features/learn/hooks/useLearningPathPersistence'
import {
  evaluateInteractiveAnswer,
  parseInteractiveContentWithFallback,
  type InteractiveQuizPayload,
} from '../features/chat/utils/interactiveQuiz'
import { extractLearningMaterialText } from '../features/learn/utils/documentParser'
import {
  ADAPTIVE_CHAPTER_GENERATED_ID,
  CHAPTER_GENERATION_TIMEOUT_MS,
  DEFAULT_CHAPTER_SESSION,
  ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS,
  ENTRY_TEST_PREP_STEPS,
  LEARN_TUTOR_SYSTEM_PROMPT,
  POST_ENTRY_PREP_STEPS,
  buildAdaptiveChallengeFallback,
  buildAdaptiveChapterPlaceholder,
  collectWeakQuestionSteps,
  ensureMinimumChapterDepth,
  getDisplayPathTitle,
  getMaterialTypeBadge,
  parseChapterBlueprintsFromText,
  validateGeneratedEntryQuiz,
} from '../features/learn/utils/learnPageHelpers'
import { formatRelevantMaterialContext } from '../features/learn/utils/ragLite'
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
  const [adaptiveChapterBlueprint, setAdaptiveChapterBlueprint] = useState<ChapterBlueprint | null>(null)
  const [isGeneratingAdaptiveChapter, setIsGeneratingAdaptiveChapter] = useState(false)
  const [isChapterModalMounted, setIsChapterModalMounted] = useState(false)
  const [isChapterModalVisible, setIsChapterModalVisible] = useState(false)
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
  const settingsCloseTimerRef = useRef<number | null>(null)
  const suppressAutosaveRef = useRef(false)
  const adaptiveChapterGenerationRef = useRef(false)
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
  const wrongQuestionSteps = collectWeakQuestionSteps(chapterBlueprints, chapterSession)
  const completedBaseChapterCount = new Set(
    chapterSession.completedChapterIndexes.filter((index) => index >= 0 && index < chapterBlueprints.length),
  ).size
  const areBaseChaptersCompleted = chapterBlueprints.length > 0 && completedBaseChapterCount >= chapterBlueprints.length

  const generateAdaptiveWeaknessChapter = useCallback(async () => {
    if (adaptiveChapterGenerationRef.current) {
      return
    }

    const weakQuestions = collectWeakQuestionSteps(chapterBlueprints, chapterSession)
    adaptiveChapterGenerationRef.current = true
    setIsGeneratingAdaptiveChapter(true)

    try {
      const weaknessSummary =
        weakQuestions.length > 0
          ? weakQuestions
              .slice(0, 12)
              .map((step, index) => `${index + 1}. ${step.prompt}`)
              .join('\n')
          : 'Keine explizit falschen Antworten vorhanden. Erzeuge adaptive Fragen auf Basis typischer Stolpersteine im Thema.'

      const adaptiveMaterialContext = formatRelevantMaterialContext(
        `${effectiveTopic || getDisplayPathTitle(activePath?.title ?? '')} ${selectedTopic} Schwachstellen Training`,
        materials,
        { maxChunks: 6, maxChars: 3200 },
      )

      const request: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: [
          'Erstelle genau EIN Abschlusskapitel fuer Schwachstellen als JSON-Array mit genau 1 Kapitelobjekt.',
          'Nur JSON ohne Erklaerung.',
          'Das Kapitel muss 1 kurze Einfuehrung, dann 6-10 Fragen und am Ende 1 Recap enthalten.',
          'Fokussiere auf erkannte Schwachstellen aus den falsch beantworteten Fragen.',
          'Nutze vorhandene Unterlagen als primaere Quelle.',
          `Thema: ${selectedTopic || effectiveTopic || 'Informatik Grundlagen'}`,
          `Schwachstellen aus bisherigem Lernverlauf:\n${weaknessSummary}`,
          adaptiveMaterialContext ? `Materialauszuege:\n${adaptiveMaterialContext}` : 'Materialauszuege: keine',
          'Schema pro Kapitel: {"id":"adaptive-1","title":"...","description":"...","steps":[{"id":"...","type":"explanation","title":"...","content":"...","bullets":["..."]},{"id":"...","type":"question","questionType":"mcq","prompt":"...","options":["..."],"expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"exact","hint":"...","explanation":"..."},{"id":"...","type":"question","questionType":"text","prompt":"...","expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"contains","hint":"...","explanation":"..."},{"id":"...","type":"recap","title":"...","content":"...","bullets":["..."]}]}',
        ].join('\n\n'),
        createdAt: new Date().toISOString(),
      }

      const response = await Promise.race([
        sendMessage([request], {
          systemPrompt: LEARN_TUTOR_SYSTEM_PROMPT,
        }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Adaptive Kapitelgenerierung dauert zu lange.')), CHAPTER_GENERATION_TIMEOUT_MS)
        }),
      ])

      const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
      const parsedContent = parsed.cleanText || response.assistantMessage.content
      const parsedBlueprints = ensureMinimumChapterDepth(parseChapterBlueprintsFromText(parsedContent))
      const generatedAdaptive = parsedBlueprints[0] ?? null

      if (generatedAdaptive) {
        setAdaptiveChapterBlueprint({
          ...generatedAdaptive,
          id: ADAPTIVE_CHAPTER_GENERATED_ID,
          title: generatedAdaptive.title.trim() || 'Schwachstellen-Fokus',
        })
      } else {
        setAdaptiveChapterBlueprint(buildAdaptiveChallengeFallback(weakQuestions))
      }
    } catch (err) {
      console.error('Lernbereich: Adaptives Schwachstellen-Kapitel konnte nicht generiert werden', err)
      setAdaptiveChapterBlueprint(buildAdaptiveChallengeFallback(weakQuestions))
    } finally {
      setIsGeneratingAdaptiveChapter(false)
      adaptiveChapterGenerationRef.current = false
    }
  }, [activePath?.title, chapterBlueprints, chapterSession, effectiveTopic, materials, selectedTopic])

  useEffect(() => {
    if (!areBaseChaptersCompleted || adaptiveChapterBlueprint || isGeneratingAdaptiveChapter) {
      return
    }
    void generateAdaptiveWeaknessChapter()
  }, [adaptiveChapterBlueprint, areBaseChaptersCompleted, generateAdaptiveWeaknessChapter, isGeneratingAdaptiveChapter])

  useEffect(() => {
    setAdaptiveChapterBlueprint(null)
    setIsGeneratingAdaptiveChapter(false)
    adaptiveChapterGenerationRef.current = false
  }, [activePathId, chapterBlueprints])

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
      learningChapters: string[]
      chapterBlueprints: ChapterBlueprint[]
      chapterSession: ChapterSession
    }) => {
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
          ((effectiveTopic || getDisplayPathTitle(activePathTitle)) + ' ' + selectedTopic).trim(),
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
              materialContext ? 'Dateien:\n' + materialContext : 'Dateien: keine hochgeladen.',
              'Aufgabe: Erstelle jetzt einen Einstiegstest zum Start in das Thema.',
              'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
              'Die ERSTE Frage MUSS Multiple-Choice sein.',
              'Insgesamt muessen mindestens 2 Multiple-Choice-Fragen enthalten sein.',
              'Jede Multiple-Choice-Frage MUSS 3-5 Optionen enthalten.',
              'Nutze ein Mischformat aus Multiple-Choice und Freitext-Fragen.',
              'Fuer Multiple-Choice-Fragen setze questionType auf "mcq" und gib 3-5 Optionen im Feld "options" an.',
              'Fuer Freitext-Fragen setze questionType auf "text".',
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

  async function handleEvaluateCurrentChapterQuestion() {
    const activeChapter =
      effectiveChapterBlueprints[Math.max(0, Math.min(chapterSession.chapterIndex, effectiveChapterBlueprints.length - 1))]
    const activeStep = activeChapter?.steps[Math.max(0, Math.min(chapterSession.stepIndex, (activeChapter?.steps.length ?? 1) - 1))]
    if (!activeChapter || !activeStep || activeStep.type !== 'question' || isEvaluatingChapterStep) {
      return
    }
    const answer = (chapterSession.answersByStepId[activeStep.id] ?? '').trim()
    if (!answer) {
      return
    }

    setIsEvaluatingChapterStep(true)
    try {
      const cachedAnswer = chapterSession.evaluatedAnswersByStepId[activeStep.id]
      const cachedFeedback = chapterSession.feedbackByStepId[activeStep.id]
      const cachedCorrect = chapterSession.correctnessByStepId[activeStep.id]
      if (cachedAnswer === answer && typeof cachedFeedback === 'string' && typeof cachedCorrect === 'boolean') {
        return
      }

      let result: { isCorrect: boolean; feedback: string }
      if (activeStep.questionType === 'mcq') {
        result = evaluateInteractiveAnswer(answer, {
          id: activeStep.id,
          prompt: activeStep.prompt,
          expectedAnswer: activeStep.expectedAnswer,
          acceptableAnswers: activeStep.acceptableAnswers ?? [],
          evaluation: activeStep.evaluation === 'contains' ? 'contains' : 'exact',
          hint: activeStep.hint,
          explanation: activeStep.explanation,
        })
      } else {
        result = await evaluateQuizAnswerWithAi({
          question: {
            id: activeStep.id,
            prompt: activeStep.prompt,
            expectedAnswer: activeStep.expectedAnswer,
            acceptableAnswers: activeStep.acceptableAnswers ?? [],
            evaluation: activeStep.evaluation === 'contains' ? 'contains' : 'exact',
            hint: activeStep.hint,
            explanation: activeStep.explanation,
          },
          userAnswer: answer,
        })
      }

      setChapterSession((prev) => ({
        ...prev,
        feedbackByStepId: {
          ...prev.feedbackByStepId,
          [activeStep.id]: result.feedback,
        },
        correctnessByStepId: {
          ...prev.correctnessByStepId,
          [activeStep.id]: result.isCorrect,
        },
        evaluatedAnswersByStepId: {
          ...prev.evaluatedAnswersByStepId,
          [activeStep.id]: answer,
        },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Frage konnte nicht ausgewertet werden.')
    } finally {
      setIsEvaluatingChapterStep(false)
    }
  }

  function handleNextChapterStep() {
    const activeChapter =
      effectiveChapterBlueprints[Math.max(0, Math.min(chapterSession.chapterIndex, effectiveChapterBlueprints.length - 1))]
    const activeStep = activeChapter?.steps[Math.max(0, Math.min(chapterSession.stepIndex, (activeChapter?.steps.length ?? 1) - 1))]
    if (!activeChapter || !activeStep) {
      return
    }

    if (activeStep.type === 'question' && !chapterSession.feedbackByStepId[activeStep.id]) {
      return
    }

    setChapterSession((prev) => {
      const chapter =
        effectiveChapterBlueprints[Math.max(0, Math.min(prev.chapterIndex, effectiveChapterBlueprints.length - 1))]
      if (!chapter) {
        return prev
      }
      if (prev.stepIndex < chapter.steps.length - 1) {
        return {
          ...prev,
          stepIndex: prev.stepIndex + 1,
        }
      }
      const nextChapterIndex = Math.min(effectiveChapterBlueprints.length - 1, prev.chapterIndex + 1)
      const isCompleted = prev.completedChapterIndexes.includes(prev.chapterIndex)
      return {
        ...prev,
        chapterIndex: nextChapterIndex,
        stepIndex: 0,
        completedChapterIndexes: isCompleted ? prev.completedChapterIndexes : [...prev.completedChapterIndexes, prev.chapterIndex],
      }
    })
  }

  function handlePreviousChapterStep() {
    setChapterSession((prev) => {
      if (prev.stepIndex > 0) {
        return {
          ...prev,
          stepIndex: prev.stepIndex - 1,
        }
      }
      if (prev.chapterIndex > 0) {
        const previousChapter = effectiveChapterBlueprints[prev.chapterIndex - 1]
        return {
          ...prev,
          chapterIndex: prev.chapterIndex - 1,
          stepIndex: Math.max(0, (previousChapter?.steps.length ?? 1) - 1),
        }
      }
      return prev
    })
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
  const adaptiveTailChapter = adaptiveChapterBlueprint ?? buildAdaptiveChapterPlaceholder(wrongQuestionSteps.length)
  const effectiveChapterBlueprints = chapterBlueprints.length > 0 ? [...chapterBlueprints, adaptiveTailChapter] : chapterBlueprints
  const safeChapterIndex = Math.max(
    0,
    Math.min(chapterSession.chapterIndex, Math.max(0, effectiveChapterBlueprints.length - 1)),
  )
  const activeChapterBlueprint = effectiveChapterBlueprints[safeChapterIndex] ?? null
  const safeChapterStepIndex = Math.max(
    0,
    Math.min(chapterSession.stepIndex, Math.max(0, (activeChapterBlueprint?.steps.length ?? 1) - 1)),
  )
  const activeChapterStep = activeChapterBlueprint?.steps[safeChapterStepIndex] ?? null
  const chapterProgressPercent =
    activeChapterBlueprint && activeChapterBlueprint.steps.length > 0
      ? ((safeChapterStepIndex + 1) / activeChapterBlueprint.steps.length) * 100
      : 0
  const currentChapterAnswer =
    activeChapterStep?.type === 'question' ? (chapterSession.answersByStepId[activeChapterStep.id] ?? '') : ''
  const currentChapterFeedback =
    activeChapterStep?.type === 'question' ? (chapterSession.feedbackByStepId[activeChapterStep.id] ?? '') : ''
  const currentChapterIsCorrect =
    activeChapterStep?.type === 'question' ? chapterSession.correctnessByStepId[activeChapterStep.id] : undefined
  const hasCurrentChapterEvaluation = typeof currentChapterIsCorrect === 'boolean'
  const totalAnsweredChapterQuestions = Object.keys(chapterSession.correctnessByStepId).length
  const totalCorrectChapterQuestions = Object.values(chapterSession.correctnessByStepId).filter(Boolean).length
  const totalWrongChapterQuestions = Math.max(0, totalAnsweredChapterQuestions - totalCorrectChapterQuestions)
  const chapterAccuracyPercent =
    totalAnsweredChapterQuestions > 0
      ? Math.round((totalCorrectChapterQuestions / totalAnsweredChapterQuestions) * 100)
      : 0
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.first_name ||
    user?.email ||
    'Nutzer'
  const avatarFallback = (profile?.first_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()
  const previewBlueprint = effectiveChapterBlueprints[0]
  const previewChapterTitle = previewBlueprint?.title ?? learningChapters[0] ?? `Grundlagen zu ${effectiveTopic || 'deinem Thema'}`
  const previewExplanationStep =
    previewBlueprint?.steps.find(
      (step): step is Extract<ChapterStep, { type: 'explanation' }> => step.type === 'explanation',
    ) ?? null
  const previewStepCount = previewBlueprint?.steps.length ?? 0
  const previewQuestionCount = previewBlueprint?.steps.filter((step) => step.type === 'question').length ?? 0
  const previewCompleted = chapterSession.completedChapterIndexes.includes(safeChapterIndex)
  const previewStatusLabel = previewCompleted
    ? 'Abgeschlossen'
    : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
      ? 'In Bearbeitung'
      : 'Bereit'
  const previewStatusText = previewCompleted
    ? 'Du hast dieses Kapitel bereits abgeschlossen.'
    : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
      ? `Du bist gerade in Schritt ${safeChapterStepIndex + 1}.`
      : 'Dieses Kapitel ist bereit zum Start.'
  const previewRecommendation =
    totalWrongChapterQuestions > 0
      ? `Fokus: ${totalWrongChapterQuestions} offene Schwachpunkte zuerst stabilisieren.`
      : totalAnsweredChapterQuestions > 0
        ? 'Stark! Weiter so, du kannst das Tempo leicht erhoehen.'
        : 'Startklar: Beginne mit den Kernkonzepten und teste direkt dein Verstaendnis.'
  const currentChapterStepProgressPercent = previewStepCount > 0 ? ((safeChapterStepIndex + 1) / previewStepCount) * 100 : 0
  const isAllChaptersCompleted =
    effectiveChapterBlueprints.length > 0 && chapterSession.completedChapterIndexes.length >= effectiveChapterBlueprints.length
  const previewGreetingText = isAllChaptersCompleted
    ? 'Stark gemacht. Alle Lernbloecke abgeschlossen - bis bald und weiter so.'
    : previewCompleted
      ? 'Sehr gut, dieser Lernblock ist abgeschlossen. Du kannst direkt den naechsten starten.'
      : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
        ? `Willkommen zurueck. Du bist bei Schritt ${safeChapterStepIndex + 1} und machst guten Fortschritt.`
        : 'Willkommen. Dein Lernblock ist bereit - starte mit dem ersten Schritt.'
  const hasStartedFirstChapter =
    chapterSession.chapterIndex > 0 ||
    chapterSession.stepIndex > 0 ||
    chapterSession.completedChapterIndexes.length > 0 ||
    totalAnsweredChapterQuestions > 0
  const showChapterPreview = learningChapters.length > 0 || isChapterPreviewVisible
  const previewEstimatedMinutes = Math.max(5, Math.round(previewStepCount * 1.2))
  const previewChapterBullets =
    previewExplanationStep?.bullets && previewExplanationStep.bullets.length > 0
      ? previewExplanationStep.bullets
      : [`${previewChapterTitle} sicher verstehen`, 'Wichtige Kernkonzepte strukturiert aufbauen', 'Typische Fehlerquellen in der Praxis vermeiden']
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
            <span className="learn-new-path-icon chat-sidebar-top-button-icon" aria-hidden="true" />
            {!isSidebarCollapsed ? <span className="learn-new-path-label">Neuer Lernpfad</span> : null}
          </button>
          <button
            type="button"
            onClick={openSettingsModal}
            aria-label={isSidebarCollapsed ? 'Einstellungen' : undefined}
          >
            <img className="ui-icon chat-sidebar-top-button-icon" src={settingsIcon} alt="" aria-hidden="true" />
            {!isSidebarCollapsed ? 'Einstellungen' : null}
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
          <div className="learn-sidebar-account-combined">
            <button
              type="button"
              className="learn-mode-switch-button"
              onClick={() => navigate('/chat')}
              aria-label={isSidebarCollapsed ? 'Zum Standardmodus wechseln' : undefined}
            >
              <img className="ui-icon chat-sidebar-top-button-icon" src={statusIcon} alt="" aria-hidden="true" />
              {!isSidebarCollapsed ? (
                <span className="learn-mode-switch-copy">
                  <span className="learn-mode-switch-title">Standardmodus</span>
                  <span className="learn-mode-switch-subtitle">Bereich wechseln</span>
                </span>
              ) : null}
            </button>
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
              <section className="learn-setup-standalone">
                <div className={`learn-setup-flow ${setupStep === 1 ? 'is-topic-step' : ''}`}>
                  <div className="learn-setup-heading">
                    <h3>Einrichtung</h3>
                  </div>
                  {setupStep === 1 ? (
                    <div className="learn-setup-step">
                      {isAnalyzingSetupTopic ? (
                        <section className="learn-setup-analysis" aria-live="polite" aria-label="Dateianalyse">
                          <div className="learn-setup-analysis-ring">
                            <svg
                              className="learn-setup-analysis-ring-svg"
                              width="104"
                              height="104"
                              viewBox="0 0 104 104"
                              aria-hidden="true"
                            >
                              <g transform="rotate(-130 52 52)">
                                <circle
                                  className="learn-setup-analysis-ring-track"
                                  cx="52"
                                  cy="52"
                                  r={setupAnalysisArcRadius}
                                  fill="none"
                                  strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                                />
                                <circle
                                  className="learn-setup-analysis-ring-progress"
                                  cx="52"
                                  cy="52"
                                  r={setupAnalysisArcRadius}
                                  fill="none"
                                  strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                                  strokeDashoffset={setupAnalysisArcOffset}
                                />
                              </g>
                            </svg>
                            <span className="learn-setup-analysis-percent">{setupAnalysisPercentClamped}%</span>
                          </div>
                          <div className="learn-topic-suggestions-loader" role="status">
                            <span className="learn-topic-loader-orbit" aria-hidden="true">
                              <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                              <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                              <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                            </span>
                            <span className="learn-topic-loader-text">Dateien werden analysiert...</span>
                          </div>
                        </section>
                      ) : (
                        <>
                          <p className="learn-setup-info">
                            Lade zuerst deine Unterlagen hoch. Danach analysiert die KI die Inhalte und erkennt automatisch das Thema.
                          </p>
                          <div className="learn-file-upload-block">
                            <input
                              id="learn-files-input"
                              type="file"
                              multiple
                              className="learn-file-upload-input-sr"
                              onChange={(event) => {
                                void handleUploadMaterials(event.target.files)
                                event.currentTarget.value = ''
                              }}
                            />
                            {materials.length === 0 ? (
                              <label htmlFor="learn-files-input" className="learn-file-upload-zone">
                                <span className="learn-file-upload-zone-inner">
                                  <strong className="learn-file-upload-title">Dateien hochladen</strong>
                                  <span className="learn-file-upload-hint">Klicke in das Feld oder w\u00E4hle Dateien aus</span>
                                </span>
                              </label>
                            ) : (
                              <div className="learn-file-upload-after-list">
                                <div className="learn-materials-list">
                                  {materials.map((material) => {
                                    const typeBadge = getMaterialTypeBadge(material.name)
                                    return (
                                    <div key={material.id} className="learn-material-item">
                                      <div className="learn-material-main">
                                        <img className="ui-icon learn-material-file-icon" src={fileIcon} alt="" aria-hidden="true" />
                                        <div className="learn-material-copy">
                                          <div className="learn-material-title-row">
                                            <p className="learn-material-name">{material.name}</p>
                                            <span
                                              className={`learn-material-type-badge learn-material-type-badge--${typeBadge.variant}`}
                                            >
                                              {typeBadge.label}
                                            </span>
                                          </div>
                                          <p className="learn-muted learn-material-meta">{Math.round(material.size / 1024)} KB</p>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        className="learn-material-remove-button"
                                        onClick={() => setMaterials((prev) => prev.filter((entry) => entry.id !== material.id))}
                                        aria-label={`${material.name} entfernen`}
                                      >
                                        <img className="ui-icon learn-material-remove-icon" src={deleteIcon} alt="" aria-hidden="true" />
                                      </button>
                                    </div>
                                    )
                                  })}
                                </div>
                                <label htmlFor="learn-files-input" className="learn-file-upload-add-more">
                                  <span className="learn-file-upload-add-more-icon" aria-hidden="true" />
                                  <span className="learn-file-upload-add-more-label">Weitere Dateien hinzuf\u00FCgen</span>
                                </label>
                              </div>
                            )}
                          </div>
                          {isUploading ? <p className="learn-muted">Dateien werden verarbeitet...</p> : null}
                          <div className="learn-setup-actions">
                            <PrimaryButton
                              type="button"
                              onClick={handleContinueSetupStepOne}
                              disabled={isUploading || materials.length === 0}
                            >
                              Dateien analysieren
                            </PrimaryButton>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {setupStep === 2 ? (
                    <div className="learn-setup-step">
                      <label>Thema aus Datei erkannt</label>
                      <p className="learn-setup-info">
                        Die KI hat aus deinen Unterlagen folgendes Hauptthema erkannt. Im naechsten Schritt waehlst du dein Niveau.
                      </p>
                      <div className="learn-topic-suggestions-panel">
                        <p className="learn-topic-selection-info">
                          Erkanntes Thema: <strong>{effectiveTopic || '-'}</strong>
                        </p>
                      </div>
                      <div className="learn-setup-actions">
                        <SecondaryButton type="button" onClick={() => setSetupStep(1)}>
                          Zur\u00FCck
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
                          Zur\u00FCck
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
                  {setupStep === 1 ? (
                    <div className="learn-setup-step-hint" aria-label="Aktueller Schritt: Datei hochladen">
                      <p className="learn-setup-step-hint-label">Datei hochladen</p>
                      <img className="ui-icon learn-setup-step-hint-icon" src={setupPng} alt="" aria-hidden="true" />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <>
                <section className="learn-conversation">
                  {showChapterPreview && learningChapters.length > 0 ? (
                    <section className="learn-chapter-preview" aria-label="Kapitelvorschau">
                      <div className="learn-chapter-preview-section">
                        <p className="learn-chapter-preview-greeting">{previewGreetingText}</p>
                        <p className="learn-chapter-preview-title">
                          Kapitel {safeChapterIndex + 1}: {previewChapterTitle}
                        </p>
                        <div className="learn-chapter-preview-meta">
                          <span>Status: {previewStatusLabel}</span>
                          <span>
                            Fortschritt: Schritt {safeChapterStepIndex + 1} / {Math.max(1, previewStepCount)}
                          </span>
                        </div>
                        <div
                          className="learn-chapter-preview-progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(currentChapterStepProgressPercent)}
                        >
                          <span style={{ width: `${Math.max(0, Math.min(100, currentChapterStepProgressPercent))}%` }} />
                        </div>
                        <p className="learn-chapter-preview-status-text">{previewStatusText}</p>
                        <div className="learn-chapter-preview-kpis">
                          <span>Richtig: {totalCorrectChapterQuestions}</span>
                          <span>Falsch: {totalWrongChapterQuestions}</span>
                          <span>Quote: {chapterAccuracyPercent}%</span>
                        </div>
                      </div>
                      {!hasStartedFirstChapter ? (
                        <>
                          <div className="learn-chapter-preview-section">
                            <p className="learn-chapter-preview-label">Beschreibung</p>
                            <div className="learn-chapter-preview-box">
                              <p>In diesem Kapitel lernst du:</p>
                              <ul>
                                {previewChapterBullets.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          <div className="learn-chapter-preview-section">
                            <p className="learn-chapter-preview-label">Zusatz (optional aber stark)</p>
                            <div className="learn-chapter-preview-box">
                              <p>Dauer: ca. {previewEstimatedMinutes} Minuten</p>
                              <p>
                                {Math.max(1, previewStepCount - previewQuestionCount)} Lernbl\u00F6cke \u00B7 {previewQuestionCount}{' '}
                                Interaktive Fragen
                              </p>
                              <p>{previewRecommendation}</p>
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div className="learn-chapter-preview-section">
                        <p className="learn-chapter-preview-label">Hauptbutton</p>
                        <button
                          type="button"
                          className="learn-chapter-preview-button"
                          disabled={effectiveChapterBlueprints.length === 0}
                          onClick={openChapterModal}
                        >
                          Kapitel starten
                        </button>
                      </div>
                    </section>
                  ) : isPostEntryPrepLoading ? (
                    <section className="learn-entry-prep" aria-live="polite" aria-label="Ladevorgang Kapitelgenerierung">
                      <div className="learn-entry-prep-progress">
                        <div className="learn-setup-analysis-ring">
                          <svg className="learn-setup-analysis-ring-svg" width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                            <g transform="rotate(-130 52 52)">
                              <circle
                                className="learn-setup-analysis-ring-track"
                                cx="52"
                                cy="52"
                                r={setupAnalysisArcRadius}
                                fill="none"
                                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                              />
                              <circle
                                className="learn-setup-analysis-ring-progress"
                                cx="52"
                                cy="52"
                                r={setupAnalysisArcRadius}
                                fill="none"
                                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                                strokeDashoffset={postEntryPrepArcOffset}
                              />
                            </g>
                          </svg>
                          <span className="learn-setup-analysis-percent">{postEntryPrepOverallPercent}%</span>
                        </div>
                        <div className="learn-topic-suggestions-loader" role="status">
                          <span className="learn-topic-loader-orbit" aria-hidden="true">
                            <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                            <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                            <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                          </span>
                          <span className="learn-topic-loader-text">Dein Lernpfad wird vorbereitet...</span>
                        </div>
                      </div>
                      <div className="learn-entry-prep-steps">
                        {POST_ENTRY_PREP_STEPS.slice(0, postEntryPrepStepIndex + 1).map((label, index) => (
                          <div
                            key={label}
                            className={`learn-entry-prep-step ${
                              index < postEntryPrepStepIndex
                                ? 'is-complete'
                                : index === postEntryPrepStepIndex
                                  ? 'is-active'
                                  : ''
                            }`}
                          >
                            <span>{label}</span>
                            <strong>{Math.max(0, Math.min(100, Math.round(postEntryPrepPercents[index] ?? 0)))}%</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : tutorMessages.length === 0 ? (
                    isEntryQuizLoading || isEntryPrepClosing ? (
                    <section
                      className={`learn-entry-prep ${isEntryPrepClosing ? 'is-exiting' : ''}`}
                      aria-live="polite"
                      aria-label="Ladevorgang Einstiegstest"
                    >
                      <div className="learn-entry-prep-progress">
                        <div className="learn-setup-analysis-ring">
                          <svg className="learn-setup-analysis-ring-svg" width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                            <g transform="rotate(-130 52 52)">
                              <circle
                                className="learn-setup-analysis-ring-track"
                                cx="52"
                                cy="52"
                                r={setupAnalysisArcRadius}
                                fill="none"
                                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                              />
                              <circle
                                className="learn-setup-analysis-ring-progress"
                                cx="52"
                                cy="52"
                                r={setupAnalysisArcRadius}
                                fill="none"
                                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                                strokeDashoffset={entryPrepArcOffset}
                              />
                            </g>
                          </svg>
                          <span className="learn-setup-analysis-percent">{entryPrepOverallPercent}%</span>
                        </div>
                        <div className="learn-topic-suggestions-loader" role="status">
                          <span className="learn-topic-loader-orbit" aria-hidden="true">
                            <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
                            <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
                            <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
                          </span>
                          <span className="learn-topic-loader-text">Dein Lernpfad wird vorbereitet...</span>
                        </div>
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
                              <span>{entryQuizResult ? 'Einstiegstest ausgewertet' : 'Einstiegstest bereit'}</span>
                            </p>
                            <p className="learn-entry-test-ready-description">
                              {entryQuizResult
                                ? 'Anhand deiner Testergebnisse wurden Lernkapitel generiert.'
                                : 'Dieser Test hilft dir, dein Wissen zu analysieren und deinen Lernpfad anzupassen.'}
                            </p>
                            <p className="learn-entry-test-ready-duration">
                              {entryQuizResult ? `Ergebnis: ${entryQuizResult.score}/${entryQuizResult.total}` : `Dauer: ${entryTestDurationLabel}`}
                            </p>
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
                    ))
                  )}
                </section>
              </>
            )}

          </article>

          <article className="learn-card learn-overview-card">
            <header className="learn-overview-header">
              <h2>{'\u00DCbersicht'}</h2>
            </header>
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
              <section className="learn-overview-compact" aria-label={'Kompakte Lern\u00FCbersicht'}>
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
                {learningChapters.length > 0 ? (
                  <div className="learn-overview-chapters" aria-label="Generierte Lernkapitel">
                    <p className="learn-overview-chapters-title">Lernkapitel</p>
                    <div className="learn-overview-chapters-list" role="list">
                      {learningChapters.slice(0, 6).map((chapter, index) => (
                        <article key={`${chapter}-${index}`} className="learn-overview-chapter-card" role="listitem">
                          <span className="learn-overview-chapter-badge">Kapitel {index + 1}</span>
                          <p className="learn-overview-chapter-name">{chapter}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
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
              aria-label={'Breite zwischen Arbeitsbereich und \u00DCbersicht anpassen'}
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
                        onChange={(event) => handleEntryQuizAnswerChange(activeEntryQuestion.id, event.target.value)}
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
                  onClick={handlePreviousEntryQuestion}
                  disabled={isSubmittingEntryQuiz || !activeEntryQuestion || entryQuizQuestionIndex === 0}
                >
                  Zur\u00FCck
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
                    onClick={handleNextEntryQuestion}
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
      {isChapterModalMounted ? (
        <ModalShell isOpen={isChapterModalVisible} className="learn-chapter-modal-overlay">
          <section className="learn-chapter-modal" role="dialog" aria-modal="true" aria-label="Lernkapitel">
            <header className="learn-chapter-modal-header">
              <div className="learn-chapter-modal-header-copy">
                <h2>{activeChapterBlueprint?.title || 'Lernkapitel'}</h2>
                <p>
                  Kapitel {safeChapterIndex + 1} von {Math.max(1, effectiveChapterBlueprints.length)}
                </p>
              </div>
              <button
                type="button"
                className="settings-close-button"
                onClick={closeChapterModal}
                aria-label="Lernkapitel schliessen"
              >
                <span className="ui-icon settings-close-icon" aria-hidden="true" />
              </button>
            </header>
            <div className="learn-chapter-modal-progress">
              <p>
                Schritt {safeChapterStepIndex + 1} von {Math.max(1, activeChapterBlueprint?.steps.length ?? 1)}
              </p>
              <div className="learn-entry-test-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(chapterProgressPercent)}>
                <span style={{ width: `${chapterProgressPercent}%` }} />
              </div>
            </div>
            <div className="learn-chapter-modal-body">
              {!activeChapterStep ? (
                <p className="learn-muted">Keine Schritte verfuegbar.</p>
              ) : activeChapterStep.type === 'question' ? (
                <article className="learn-chapter-step-card">
                  <p className="learn-chapter-step-label">
                    {activeChapterStep.questionType === 'mcq' ? 'Interaktive Multiple-Choice Frage' : 'Interaktive Freitext Frage'}
                  </p>
                  <h3>{activeChapterStep.prompt}</h3>
                  {activeChapterStep.questionType === 'mcq' && (activeChapterStep.options?.length ?? 0) > 0 ? (
                    <div className="learn-entry-test-options" role="radiogroup" aria-label="Antwortoptionen Kapitel">
                      {activeChapterStep.options?.map((option) => {
                        const isSelected = currentChapterAnswer.trim() === option
                        const normalizedOption = option.trim().toLowerCase()
                        const normalizedExpected = activeChapterStep.expectedAnswer.trim().toLowerCase()
                        const normalizedAcceptable = (activeChapterStep.acceptableAnswers ?? []).map((entry) =>
                          entry.trim().toLowerCase(),
                        )
                        const isCorrectOption =
                          normalizedOption === normalizedExpected || normalizedAcceptable.includes(normalizedOption)
                        const isWrongSelection = hasCurrentChapterEvaluation && currentChapterIsCorrect === false && isSelected
                        const showCorrectOption = hasCurrentChapterEvaluation && isCorrectOption
                        return (
                          <button
                            key={option}
                            type="button"
                            className={`learn-entry-test-option ${isSelected ? 'is-selected' : ''} ${
                              isWrongSelection ? 'is-wrong' : ''
                            } ${showCorrectOption ? 'is-correct' : ''}`}
                            onClick={() =>
                              setChapterSession((prev) => {
                                const nextFeedbackByStepId = { ...prev.feedbackByStepId }
                                const nextCorrectnessByStepId = { ...prev.correctnessByStepId }
                                const nextEvaluatedAnswersByStepId = { ...prev.evaluatedAnswersByStepId }
                                delete nextFeedbackByStepId[activeChapterStep.id]
                                delete nextCorrectnessByStepId[activeChapterStep.id]
                                delete nextEvaluatedAnswersByStepId[activeChapterStep.id]
                                return {
                                  ...prev,
                                  answersByStepId: {
                                    ...prev.answersByStepId,
                                    [activeChapterStep.id]: option,
                                  },
                                  feedbackByStepId: nextFeedbackByStepId,
                                  correctnessByStepId: nextCorrectnessByStepId,
                                  evaluatedAnswersByStepId: nextEvaluatedAnswersByStepId,
                                }
                              })
                            }
                            disabled={isEvaluatingChapterStep}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={currentChapterAnswer}
                      onChange={(event) =>
                        setChapterSession((prev) => {
                          const nextFeedbackByStepId = { ...prev.feedbackByStepId }
                          const nextCorrectnessByStepId = { ...prev.correctnessByStepId }
                          const nextEvaluatedAnswersByStepId = { ...prev.evaluatedAnswersByStepId }
                          delete nextFeedbackByStepId[activeChapterStep.id]
                          delete nextCorrectnessByStepId[activeChapterStep.id]
                          delete nextEvaluatedAnswersByStepId[activeChapterStep.id]
                          return {
                            ...prev,
                            answersByStepId: {
                              ...prev.answersByStepId,
                              [activeChapterStep.id]: event.target.value,
                            },
                            feedbackByStepId: nextFeedbackByStepId,
                            correctnessByStepId: nextCorrectnessByStepId,
                            evaluatedAnswersByStepId: nextEvaluatedAnswersByStepId,
                          }
                        })
                      }
                      placeholder="Deine Antwort..."
                      disabled={isEvaluatingChapterStep}
                    />
                  )}
                  {currentChapterFeedback ? (
                    <p
                      className={`learn-entry-test-feedback ${
                        hasCurrentChapterEvaluation && currentChapterIsCorrect === false ? 'is-error' : 'is-success'
                      }`}
                    >
                      {currentChapterFeedback}
                    </p>
                  ) : null}
                </article>
              ) : (
                <article className="learn-chapter-step-card">
                  <p className="learn-chapter-step-label">{activeChapterStep.type === 'recap' ? 'Zusammenfassung' : 'Erklaerung'}</p>
                  <h3>{activeChapterStep.title}</h3>
                  <p>{activeChapterStep.content}</p>
                  {activeChapterStep.bullets && activeChapterStep.bullets.length > 0 ? (
                    <ul className="learn-chapter-step-bullets">
                      {activeChapterStep.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              )}
            </div>
            <footer className="learn-chapter-modal-footer">
              <SecondaryButton
                type="button"
                onClick={handlePreviousChapterStep}
                disabled={safeChapterIndex === 0 && safeChapterStepIndex === 0}
              >
                Zur\u00FCck
              </SecondaryButton>
              {activeChapterStep?.type === 'question' ? (
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    void handleEvaluateCurrentChapterQuestion()
                  }}
                  disabled={!currentChapterAnswer.trim() || isEvaluatingChapterStep}
                >
                  {isEvaluatingChapterStep ? 'Wird bewertet...' : 'Antwort pruefen'}
                </PrimaryButton>
              ) : null}
              <PrimaryButton
                type="button"
                onClick={handleNextChapterStep}
                disabled={activeChapterStep?.type === 'question' && !currentChapterFeedback}
              >
                Weiter
              </PrimaryButton>
            </footer>
          </section>
        </ModalShell>
      ) : null}
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




















