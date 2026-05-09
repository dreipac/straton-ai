import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import deleteIcon from '../assets/icons/delete.svg'
import addIcon from '../assets/icons/add.svg'
import sidebarIcon from '../assets/icons/sidebar.svg'
import learnOutlinedIcon from '../assets/icons/learn-outlined.svg'
import learnFilledIcon from '../assets/icons/learn-filled.svg'
import examOutlinedIcon from '../assets/icons/exam-outlined.svg'
import examFilledIcon from '../assets/icons/exam-filled.svg'
import cardsOutlinedIcon from '../assets/icons/cards-outline.svg'
import cardsFilledIcon from '../assets/icons/cards-filled.svg'
import paperOutlinedIcon from '../assets/icons/paper-outlined.svg'
import paperFilledIcon from '../assets/icons/paper-filled.svg'
import statisticsOutlinedIcon from '../assets/icons/statistics-outlined.svg'
import statisticsFilledIcon from '../assets/icons/statistics-filled.svg'
import { ContextMenu } from '../components/ui/menu/ContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { useAuth } from '../features/auth/context/useAuth'
import { getAppFeatureFlags } from '../features/auth/services/appFeatureFlags.service'
import { incrementMySubscriptionUsage } from '../features/auth/services/subscription.service'
import { useSystemPrompts } from '../features/systemPrompts/useSystemPrompts'
import { generateLearnFlashcards, generateLearnWorksheet, sendMessage } from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  createLearningPathByUserId,
  type ChapterBlueprint,
  type ChapterSession,
  listLearningPathsByUserId,
  type EntryQuizResult,
  type LearnFlashcardSet,
  type LearnTutorState,
  type LearnWorksheetItem,
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
  CHAPTER_LEARNING_FIDELITY_RULES,
  DEFAULT_CHAPTER_SESSION,
  ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS,
  ENTRY_TEST_PREP_STEPS,
  WORKSHEET_EXERCISE_FIDELITY_RULES,
  POST_ENTRY_PREP_STEPS,
  buildEntryQuizFallbackPayload,
  ensureMinimumChapterDepth,
  getDisplayPathTitle,
  getWorksheetChapterProgress,
  parseChapterBlueprintsFromText,
  validateGeneratedEntryQuiz,
} from '../features/learn/utils/learnPageHelpers'
import {
  formatRelevantMaterialContext,
  mergeOutlineWithPersonalMaterialContext,
} from '../features/learn/utils/ragLite'
import { namespaceChapterStepIds } from '../features/learn/utils/chapterStepIds'
import {
  buildLearnMaterialOutlineFromBlueprints,
  type LearnMaterialPersonalizationMode,
} from '../features/learn/utils/flashcardSourceFromBlueprints'
import { LearnChapterModal } from '../features/learn/components/LearnChapterModal'
import { LearnFlashcardsModal } from '../features/learn/components/LearnFlashcardsModal'
import { LearnWorksheetModal } from '../features/learn/components/LearnWorksheetModal'
import { LearnConversationSection } from '../features/learn/components/LearnConversationSection'
import { LearnEntryQuizModal } from '../features/learn/components/LearnEntryQuizModal'
import { LearnOverviewPanel } from '../features/learn/components/LearnOverviewPanel'
import { LearnPageSidebar } from '../features/learn/components/LearnPageSidebar'
import { LearnEntryPrepPanel } from '../features/learn/components/LearnEntryPrepPanel'
import { LearnSetupPanel } from '../features/learn/components/LearnSetupPanel'
import { SettingsModal } from './SettingsPage'

type LearnPageChatDraftState = {
  fromChatLearningDraft?: {
    name?: string
    proficiency?: '' | 'low' | 'medium' | 'high'
    context?: {
      fileNames?: string[]
      imageCount?: number
      topTerms?: string[]
      focusText?: string
      excerpt?: string
    } | null
  }
} | null

function isTransientAiFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fehlgeschlagen')
  )
}

export function LearnPage() {
  const MODAL_ANIMATION_MS = 220
  const CHAPTER_ON_DEMAND_TIMEOUT_MS = 120_000
  const CHAPTER_ON_DEMAND_STEPS = ['Kapitel wird vorbereitet', 'Kapitelinhalt wird erstellt', 'Qualitätsprüfung läuft'] as const
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const { getPrompt } = useSystemPrompts()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [learnPathCreateEnabled, setLearnPathCreateEnabled] = useState(true)
  const [learnFeatureInfoVisible, setLearnFeatureInfoVisible] = useState(false)
  const [topic, setTopic] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzingSetupTopic, setIsAnalyzingSetupTopic] = useState(false)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [learningPaths, setLearningPaths] = useState<LearningPathSummary[]>([])
  const [activePathId, setActivePathId] = useState<string>('')
  const [tutorMessages, setTutorMessages] = useState<TutorChatEntry[]>([])
  const [isChapterPreviewVisible, setIsChapterPreviewVisible] = useState(false)
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1)
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [aiGuidance, setAiGuidance] = useState('')
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
  const [tutorState, setTutorState] = useState<LearnTutorState>('entry_quiz_pending')
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [targetChapterCount, setTargetChapterCount] = useState(1)
  const [unlockedChapterCount, setUnlockedChapterCount] = useState(1)
  const [learningChapters, setLearningChapters] = useState<string[]>([])
  const [chapterBlueprints, setChapterBlueprints] = useState<ChapterBlueprint[]>([])
  const [chapterSession, setChapterSession] = useState<ChapterSession>(DEFAULT_CHAPTER_SESSION)
  const [isChapterModalMounted, setIsChapterModalMounted] = useState(false)
  const [isChapterModalVisible, setIsChapterModalVisible] = useState(false)
  const [isFlashcardsModalMounted, setIsFlashcardsModalMounted] = useState(false)
  const [isFlashcardsModalVisible, setIsFlashcardsModalVisible] = useState(false)
  const [learnFlashcardSets, setLearnFlashcardSets] = useState<LearnFlashcardSet[]>([])
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false)
  const [flashcardsError, setFlashcardsError] = useState<string | null>(null)
  const [isWorksheetModalMounted, setIsWorksheetModalMounted] = useState(false)
  const [isWorksheetModalVisible, setIsWorksheetModalVisible] = useState(false)
  const [learnWorksheets, setLearnWorksheets] = useState<LearnWorksheetItem[]>([])
  const [isGeneratingWorksheet, setIsGeneratingWorksheet] = useState(false)
  const [worksheetError, setWorksheetError] = useState<string | null>(null)
  const [isChapterGenerationLoading, setIsChapterGenerationLoading] = useState(false)
  const [chapterGenerationPercent, setChapterGenerationPercent] = useState(0)
  const [chapterGenerationDebugRaw, setChapterGenerationDebugRaw] = useState('')
  const [worksheetRequiredChapterIndex, setWorksheetRequiredChapterIndex] = useState<number | null>(null)
  const [worksheetTabHintVisible, setWorksheetTabHintVisible] = useState(false)
  const [worksheetModalChapterFilter, setWorksheetModalChapterFilter] = useState<number | null>(null)
  const [learnMaterialChoiceTarget, setLearnMaterialChoiceTarget] = useState<null | 'flashcards' | 'worksheet'>(null)
  const [isEvaluatingChapterStep, setIsEvaluatingChapterStep] = useState(false)
  const [activeLearnTab, setActiveLearnTab] = useState<
    'path' | 'tests' | 'flashcards' | 'worksheets' | 'statistics'
  >('path')
  const [isMobileTabsTouchActive, setIsMobileTabsTouchActive] = useState(false)
  const [isMobileSidebarButtonTouchActive, setIsMobileSidebarButtonTouchActive] = useState(false)
  const [flashcardsModalFocusCardId, setFlashcardsModalFocusCardId] = useState<string | null>(null)
  const [flashcardsModalSetId, setFlashcardsModalSetId] = useState<string | null>(null)
  const [entryQuizQuestionIndex, setEntryQuizQuestionIndex] = useState(0)
  const [isSubmittingEntryQuiz, setIsSubmittingEntryQuiz] = useState(false)
  const [isPostEntryPrepLoading, setIsPostEntryPrepLoading] = useState(false)
  const [postEntryPrepStepIndex, setPostEntryPrepStepIndex] = useState(0)
  const [postEntryPrepPercents, setPostEntryPrepPercents] = useState<number[]>([0, 0])
  const [openPathMenuId, setOpenPathMenuId] = useState<string | null>(null)
  const [pathMenuPosition, setPathMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileTabsTouchStartRef = useRef<number>(0)
  const mobileTabsReleaseTimerRef = useRef<number | null>(null)
  const mobileSidebarButtonTouchStartRef = useRef<number>(0)
  const mobileSidebarButtonReleaseTimerRef = useRef<number | null>(null)
  const entryQuizCloseTimerRef = useRef<number | null>(null)
  const chapterModalCloseTimerRef = useRef<number | null>(null)
  const flashcardsModalCloseTimerRef = useRef<number | null>(null)
  const worksheetModalCloseTimerRef = useRef<number | null>(null)
  const settingsCloseTimerRef = useRef<number | null>(null)
  const MOBILE_TABS_TOUCH_MIN_MS = 220
  
  function handleMobileTabsTouchStart() {
    mobileTabsTouchStartRef.current = Date.now()
    if (mobileTabsReleaseTimerRef.current) {
      window.clearTimeout(mobileTabsReleaseTimerRef.current)
      mobileTabsReleaseTimerRef.current = null
    }
    setIsMobileTabsTouchActive(true)
  }

  function handleMobileTabsTouchEnd() {
    const elapsed = Date.now() - mobileTabsTouchStartRef.current
    const remaining = Math.max(0, MOBILE_TABS_TOUCH_MIN_MS - elapsed)
    if (mobileTabsReleaseTimerRef.current) {
      window.clearTimeout(mobileTabsReleaseTimerRef.current)
    }
    mobileTabsReleaseTimerRef.current = window.setTimeout(() => {
      setIsMobileTabsTouchActive(false)
      mobileTabsReleaseTimerRef.current = null
    }, remaining)
  }

  function handleMobileSidebarButtonTouchStart() {
    mobileSidebarButtonTouchStartRef.current = Date.now()
    if (mobileSidebarButtonReleaseTimerRef.current) {
      window.clearTimeout(mobileSidebarButtonReleaseTimerRef.current)
      mobileSidebarButtonReleaseTimerRef.current = null
    }
    setIsMobileSidebarButtonTouchActive(true)
  }

  function handleMobileSidebarButtonTouchEnd() {
    const elapsed = Date.now() - mobileSidebarButtonTouchStartRef.current
    const remaining = Math.max(0, MOBILE_TABS_TOUCH_MIN_MS - elapsed)
    if (mobileSidebarButtonReleaseTimerRef.current) {
      window.clearTimeout(mobileSidebarButtonReleaseTimerRef.current)
    }
    mobileSidebarButtonReleaseTimerRef.current = window.setTimeout(() => {
      setIsMobileSidebarButtonTouchActive(false)
      mobileSidebarButtonReleaseTimerRef.current = null
    }, remaining)
  }

  useEffect(() => {
    return () => {
      if (mobileTabsReleaseTimerRef.current) {
        window.clearTimeout(mobileTabsReleaseTimerRef.current)
      }
      if (mobileSidebarButtonReleaseTimerRef.current) {
        window.clearTimeout(mobileSidebarButtonReleaseTimerRef.current)
      }
    }
  }, [])

  const suppressAutosaveRef = useRef(false)
  const activePathIdRef = useRef('')
  const pathCacheRef = useRef<Record<string, LearningPathRecord>>({})
  const chatDraftImportDoneRef = useRef(false)

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
  const chapterGenerationArcOffset =
    setupAnalysisArcLength * (1 - Math.max(0, Math.min(100, chapterGenerationPercent)) / 100)
  const chapterGenerationStepPercents = [
    Math.min(100, Math.round(chapterGenerationPercent * 1.25)),
    Math.max(0, Math.min(100, Math.round((chapterGenerationPercent - 25) * 1.35))),
    Math.max(0, Math.min(100, Math.round((chapterGenerationPercent - 68) * 3.2))),
  ]
  const entryTestDurationLabel = entryQuiz
    ? `ca. ${Math.max(5, Math.ceil(entryQuiz.questions.length * 1.5))} Minuten`
    : 'ca. 10 Minuten'
  const hasEntryQuizProgress = Object.values(entryQuizAnswers).some((value) => value.trim().length > 0)
  const entryTestStatus: 'open' | 'in_progress' | 'completed' = entryQuizResult
    ? 'completed'
    : hasEntryQuizProgress
      ? 'in_progress'
      : 'open'
  const sequentialChapterLimit = Math.max(1, Math.min(targetChapterCount, unlockedChapterCount))
  const chapterBlueprintsForFlow = chapterBlueprints.slice(0, Math.min(chapterBlueprints.length, sequentialChapterLimit))

  const { effectiveChapterBlueprints } = useAdaptiveChapterGeneration({
    activePathId,
    activePathTitle: activePath?.title,
    chapterBlueprints: chapterBlueprintsForFlow,
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
      aiGuidance,
      proficiencyLevel,
      setupStep,
      isSetupComplete,
      materials,
      tutorMessages,
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
      tutorState,
      currentChapterIndex,
      targetChapterCount,
      unlockedChapterCount,
      learningChapters,
      chapterBlueprints,
      chapterSession,
      learnFlashcardSets,
      learnWorksheets,
    }),
    [
      topic,
      topicSuggestions,
      selectedTopic,
      aiGuidance,
      proficiencyLevel,
      setupStep,
      isSetupComplete,
      materials,
      tutorMessages,
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
      tutorState,
      currentChapterIndex,
      targetChapterCount,
      unlockedChapterCount,
      learningChapters,
      chapterBlueprints,
      chapterSession,
      learnFlashcardSets,
      learnWorksheets,
    ],
  )

  const applyPathToState = useCallback(
    (record: LearningPathRecord) => {
      suppressAutosaveRef.current = true
      setTopic(record.topic)
      setTopicSuggestions(record.topicSuggestions)
      setSelectedTopic(record.selectedTopic)
      setAiGuidance(record.aiGuidance ?? '')
      setProficiencyLevel(record.proficiencyLevel)
      setSetupStep(record.setupStep)
      setIsSetupComplete(record.isSetupComplete)
      setMaterials(record.materials)
      setTutorMessages(record.tutorMessages)
      setIsChapterPreviewVisible(false)
      setEntryQuiz(record.entryQuiz)
      setEntryQuizAnswers(record.entryQuizAnswers)
      setEntryQuizResult(record.entryQuizResult)
      setTutorState(record.tutorState)
      setCurrentChapterIndex(record.currentChapterIndex)
      setTargetChapterCount(record.targetChapterCount)
      setUnlockedChapterCount(record.unlockedChapterCount)
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
      setLearnFlashcardSets(record.learnFlashcardSets ?? [])
      setFlashcardsError(null)
      setIsGeneratingFlashcards(false)
      if (flashcardsModalCloseTimerRef.current) {
        window.clearTimeout(flashcardsModalCloseTimerRef.current)
        flashcardsModalCloseTimerRef.current = null
      }
      setIsWorksheetModalVisible(false)
      setIsWorksheetModalMounted(false)
      setLearnWorksheets(record.learnWorksheets ?? [])
      setIsChapterGenerationLoading(false)
      setChapterGenerationPercent(0)
      setWorksheetRequiredChapterIndex(null)
      setWorksheetTabHintVisible(false)
      setWorksheetError(null)
      setIsGeneratingWorksheet(false)
      if (worksheetModalCloseTimerRef.current) {
        window.clearTimeout(worksheetModalCloseTimerRef.current)
        worksheetModalCloseTimerRef.current = null
      }
      setWorksheetModalChapterFilter(null)
      setFlashcardsModalFocusCardId(null)
      setFlashcardsModalSetId(null)
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
    setAiGuidance('')
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
    setTutorState('entry_quiz_pending')
    setCurrentChapterIndex(0)
    setTargetChapterCount(1)
    setUnlockedChapterCount(1)
    setLearningChapters([])
    setChapterBlueprints([])
    setChapterSession(DEFAULT_CHAPTER_SESSION)
    setLearnFlashcardSets([])
    setLearnWorksheets([])
    setIsChapterGenerationLoading(false)
    setChapterGenerationPercent(0)
    setWorksheetRequiredChapterIndex(null)
    setWorksheetTabHintVisible(false)
    setWorksheetModalChapterFilter(null)
    setFlashcardsModalFocusCardId(null)
    setFlashcardsModalSetId(null)
    setEntryQuizQuestionIndex(0)
    setIsPostEntryPrepLoading(false)
    setPostEntryPrepStepIndex(0)
    setPostEntryPrepPercents([0, 0])
  }, [])

  const editableSnapshot: EditableLearningPathSnapshot = {
    topic,
    topicSuggestions,
    selectedTopic,
    aiGuidance,
    proficiencyLevel,
    setupStep,
    isSetupComplete,
    materials,
    tutorMessages,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    tutorState,
    currentChapterIndex,
    targetChapterCount,
    unlockedChapterCount,
    learningChapters,
    chapterBlueprints,
    chapterSession,
    learnFlashcardSets,
    learnWorksheets,
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

  const { handleContinueSetupStepOne, handleContinueSetupStepTwo, handleContinueSetupStepThree, handleFinishSetup } =
    useLearnSetupFlow({
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
    setActiveLearnTab('path')
  }, [activePathId])

  useEffect(() => {
    setCurrentChapterIndex(Math.max(0, chapterSession.chapterIndex))
  }, [chapterSession.chapterIndex])

  useEffect(() => {
    const maxPlannedCount = Math.max(1, Math.min(targetChapterCount, chapterBlueprints.length || targetChapterCount))
    const lastUnlockedIndex = Math.max(0, unlockedChapterCount - 1)
    const hasCompletedLastUnlocked = chapterSession.completedChapterIndexes.includes(lastUnlockedIndex)
    const worksheetProgress = getWorksheetChapterProgress(learnWorksheets, lastUnlockedIndex)
    const worksheetDoneForChapter = worksheetProgress.isComplete

    if (hasCompletedLastUnlocked && !worksheetDoneForChapter) {
      setWorksheetRequiredChapterIndex(lastUnlockedIndex)
      setWorksheetTabHintVisible(true)
      return
    }

    if (hasCompletedLastUnlocked && worksheetDoneForChapter && unlockedChapterCount < maxPlannedCount) {
      setUnlockedChapterCount((prev) => Math.min(maxPlannedCount, prev + 1))
      setWorksheetRequiredChapterIndex(null)
      setTutorState('chapter_learning')
    }
    if (hasCompletedLastUnlocked && worksheetDoneForChapter && unlockedChapterCount >= maxPlannedCount && maxPlannedCount > 0) {
      setWorksheetRequiredChapterIndex(null)
      setTutorState('chapter_completed')
    }
  }, [
    chapterBlueprints.length,
    chapterSession.completedChapterIndexes,
    targetChapterCount,
    unlockedChapterCount,
    learnWorksheets,
  ])

  useEffect(() => {
    if (!learnFeatureInfoVisible) {
      return
    }
    const tid = window.setTimeout(() => {
      setLearnFeatureInfoVisible(false)
    }, 2200)
    return () => window.clearTimeout(tid)
  }, [learnFeatureInfoVisible])

  useEffect(() => {
    if (!isChapterGenerationLoading) {
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const ratio = Math.min(1, elapsed / CHAPTER_ON_DEMAND_TIMEOUT_MS)
      const next = Math.round(8 + ratio * 87)
      setChapterGenerationPercent((prev) => (next > prev ? next : prev))
    }, 280)
    return () => {
      window.clearInterval(timer)
    }
  }, [CHAPTER_ON_DEMAND_TIMEOUT_MS, isChapterGenerationLoading])

  useEffect(() => {
    if (worksheetRequiredChapterIndex === null) {
      setWorksheetTabHintVisible(false)
      return
    }
    if (activeLearnTab === 'worksheets') {
      setWorksheetTabHintVisible(false)
    }
  }, [activeLearnTab, worksheetRequiredChapterIndex])

  useEffect(() => {
    if (!user) {
      setLearnPathCreateEnabled(true)
      return
    }
    let isMounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!isMounted) {
          return
        }
        setLearnPathCreateEnabled(flags.learn_path_create_enabled)
      } catch {
        if (!isMounted) {
          return
        }
        setLearnPathCreateEnabled(true)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setLearningPaths([])
      setActivePathId('')
      activePathIdRef.current = ''
      setTopic('')
      setTopicSuggestions([])
      setSelectedTopic('')
      setAiGuidance('')
      setProficiencyLevel('')
      setSetupStep(1)
      setIsSetupComplete(false)
      setMaterials([])
      setTutorMessages([])
      setIsChapterPreviewVisible(false)
      setEntryQuiz(null)
      setEntryQuizAnswers({})
      setEntryQuizResult(null)
      setTutorState('entry_quiz_pending')
      setCurrentChapterIndex(0)
      setTargetChapterCount(1)
      setUnlockedChapterCount(1)
      setLearningChapters([])
      setChapterBlueprints([])
      setChapterSession(DEFAULT_CHAPTER_SESSION)
      setLearnFlashcardSets([])
      setLearnWorksheets([])
      setIsChapterGenerationLoading(false)
      setChapterGenerationPercent(0)
      setWorksheetRequiredChapterIndex(null)
      setWorksheetTabHintVisible(false)
      setWorksheetModalChapterFilter(null)
      setFlashcardsModalFocusCardId(null)
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
    aiGuidance,
    proficiencyLevel,
    setupStep,
    isSetupComplete,
    materials,
    tutorMessages,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    learningChapters,
    tutorState,
    currentChapterIndex,
    targetChapterCount,
    unlockedChapterCount,
    chapterBlueprints,
    chapterSession,
    learnFlashcardSets,
    learnWorksheets,
  ])

  useEffect(() => {
    const state = location.state as LearnPageChatDraftState
    const draft = state?.fromChatLearningDraft
    if (!user || !draft || chatDraftImportDoneRef.current) {
      return
    }
    chatDraftImportDoneRef.current = true
    const draftName = typeof draft.name === 'string' && draft.name.trim() ? draft.name.trim() : 'Neuer Lernpfad'
    const draftLevel =
      draft.proficiency === 'low' || draft.proficiency === 'medium' || draft.proficiency === 'high'
        ? draft.proficiency
        : ''
    const context = draft.context ?? null
    const focus = typeof context?.focusText === 'string' ? context.focusText.trim() : ''
    const terms = Array.isArray(context?.topTerms)
      ? context.topTerms.filter((term): term is string => typeof term === 'string' && term.trim().length > 0)
      : []
    const derivedTopic = terms[0] ?? draftName
    const derivedSelectedTopic = terms.slice(0, 3).join(', ') || derivedTopic
    const derivedGuidance = [
      focus ? `Fokus aus Chat: ${focus}` : '',
      terms.length > 0 ? `Erkannte Themen: ${terms.join(', ')}` : '',
      typeof context?.imageCount === 'number' ? `Bilder im Chat: ${context.imageCount}` : '',
      Array.isArray(context?.fileNames) && context.fileNames.length > 0
        ? `Dateien im Chat: ${context.fileNames.slice(0, 8).join(', ')}`
        : '',
      typeof context?.excerpt === 'string' && context.excerpt.trim()
        ? `Kontextauszug:\n${context.excerpt.trim().slice(0, 900)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    void (async () => {
      try {
        const created = await createLearningPathByUserId(user.id, draftName)
        const imported = await updateLearningPathById(created.id, {
          title: draftName,
          topic: derivedTopic,
          selectedTopic: derivedSelectedTopic,
          proficiencyLevel: draftLevel,
          aiGuidance: derivedGuidance,
          setupStep: 4,
          isSetupComplete: true,
          tutorMessages: [],
          entryQuiz: null,
          entryQuizAnswers: {},
          entryQuizResult: null,
          tutorState: 'entry_quiz_pending',
          currentChapterIndex: 0,
          targetChapterCount: 1,
          unlockedChapterCount: 1,
          learningChapters: [],
          chapterBlueprints: [],
          chapterSession: DEFAULT_CHAPTER_SESSION,
        })
        setLearningPaths((prev) => {
          const next = [
            {
              id: imported.id,
              userId: imported.userId,
              title: imported.title,
              createdAt: imported.createdAt,
              updatedAt: imported.updatedAt,
            },
            ...prev.filter((p) => p.id !== imported.id),
          ]
          return next
        })
        pathCacheRef.current[imported.id] = imported
        setActivePathId(imported.id)
        activePathIdRef.current = imported.id
        applyPathToState(imported)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lernpfad aus Chat konnte nicht vorbereitet werden.')
      } finally {
        navigate('/learn', { replace: true })
      }
    })()
  }, [applyPathToState, location.state, navigate, user])

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
      if (worksheetModalCloseTimerRef.current) {
        window.clearTimeout(worksheetModalCloseTimerRef.current)
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
            ' Übung Aufgabe Berechnung Teilaufgabe Beispiel'
          ).trim(),
          materials,
          materials.length > 0
            ? {
                maxChunks: materials.length > 2 ? 14 : 11,
                maxChars: materials.length > 2 ? 10_000 : 8200,
                denseChunks: true,
                emphasizePersonalSources: true,
              }
            : { maxChunks: 10, maxChars: 6500 },
        )

        let parsedQuiz: InteractiveQuizPayload | null = null
        let parsedCleanText = ''
        let validationReason = ''
        let lastGatewayError: Error | null = null

        for (let attempt = 1; attempt <= ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS; attempt += 1) {
          const quizRequestMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: [
              'Lernpfad Name: ' + getDisplayPathTitle(activePathTitle),
              'Thema: ' + (effectiveTopic || getDisplayPathTitle(activePathTitle)),
              selectedTopic.trim() ? 'Gewählter Schwerpunkt: ' + selectedTopic.trim() : 'Gewählter Schwerpunkt: keiner',
              aiGuidance.trim() ? 'Zusatzhinweise des Lernenden: ' + aiGuidance.trim() : 'Zusatzhinweise des Lernenden: keine',
              proficiencyLevel
                ? 'Selbsteinschätzung Niveau: ' +
                  (proficiencyLevel === 'low' ? 'schwach' : proficiencyLevel === 'medium' ? 'mittel' : 'gut')
                : 'Selbsteinschätzung Niveau: unbekannt',
              materialContext
                ? 'Dateiauszüge (mind. die Hälfte der Fragen muss sich hierauf beziehen — Begriffe, Fakten, Beispiele aus den Dateien):\n' +
                  materialContext
                : 'Dateien: keine hochgeladen — nutze realistische KV-Praxisbeispiele in den Fragestellungen.',
              WORKSHEET_EXERCISE_FIDELITY_RULES,
              'Aufgabe: Erstelle jetzt einen Einstiegstest zum Start in das Thema.',
              'Formuliere die Fragen so, dass bei vorhandenen Dateien klar erkennbar ist, ob der Lernende den Auszug verstanden hat (Zuordnen, Begriffe, Kurztext, konkrete Rechen- oder Zuordnungsaufgaben wie im Blatt).',
              'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
              'Die ERSTE Frage muss Multiple-Choice (mcq) ODER Wahr/Falsch (true_false) sein — leichter Einstieg.',
              'Insgesamt mindestens 2 Multiple-Choice-Fragen (mcq), jede mit 3-5 Optionen.',
              'Mindestens 1 Freitext-Frage (questionType "text", evaluation "exact" oder "contains").',
              'Mindestens 1 Zuordnung (match) ODER 1 Wahr/Falsch (true_false) zusätzlich zu den MCQs.',
              'Wahr/Falsch: questionType "true_false", expectedAnswer exakt "Wahr" oder "Falsch" (oder synonym true/false im JSON, wird normalisiert), optional options ["Wahr","Falsch"].',
              'Jede Multiple-Choice-Frage MUSS 3-5 Optionen enthalten.',
              'Mischformat: mcq, text, match und true_false sinnvoll verteilen (nicht nur ein Typ).',
              'Für Multiple-Choice-Fragen setze questionType auf "mcq" und gib 3-5 Optionen im Feld "options" an.',
              'Für Freitext-Fragen setze questionType auf "text".',
              'Für Zuordnungsfragen setze questionType auf "match", gib zwei gleich lange Arrays "matchLeft" (z. B. Begriffe) und "matchRight" (Definitionen); die richtige Zuordnung ist Index i zu Index i (expectedAnswer z. B. "0,1,2" für drei Paare oder weglassen).',
              validationReason
                ? 'Der vorige Versuch war ungültig: ' + validationReason + ' Halte dich strikt an alle Regeln.'
                : 'Halte dich strikt an alle Regeln.',
              'Antworte zuerst mit 1-2 kurzen Einleitungssätzen und dann direkt mit dem Quiz-Block.',
            ].join('\n\n'),
            createdAt: new Date().toISOString(),
          }

          let result: Awaited<ReturnType<typeof sendMessage>>
          try {
            result = await sendMessage([quizRequestMessage], {
              interactiveQuizPrompt: getPrompt('interactive_quiz'),
              systemPrompt: getPrompt('learn_tutor'),
              useLearnPathModel: true,
              learnTelemetryMode: 'learn_entry_quiz',
            })
          } catch (error) {
            if (error instanceof Error) {
              lastGatewayError = error
            }
            if (isTransientAiFailure(error)) {
              validationReason = 'KI war temporär nicht erreichbar (Rate-Limit/Serverfehler).'
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 220 * attempt)
              })
              continue
            }
            throw error
          }
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }

          const parsed = parseInteractiveContentWithFallback(result.assistantMessage.content)
          if (!parsed.quiz) {
            validationReason = 'Kein gültiger Quiz-JSON-Block erhalten.'
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

        if (!parsedQuiz && lastGatewayError && isTransientAiFailure(lastGatewayError)) {
          parsedQuiz = buildEntryQuizFallbackPayload(effectiveTopic || getDisplayPathTitle(activePathTitle))
          parsedCleanText = 'Die KI war kurz ausgelastet. Ein stabiler Einstiegstest wurde als Fallback bereitgestellt.'
        }

        if (!parsedQuiz) {
          throw new Error(
            validationReason
              ? `Einstiegstest ungültig: ${validationReason}`
              : 'Kein gültiger Einstiegstest von der KI erhalten.',
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
    aiGuidance,
    proficiencyLevel,
    entryQuiz,
    getPrompt,
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
    closeEntryQuizModal,
    setError,
    setIsSubmittingEntryQuiz,
    setEntryQuizResult,
    setTutorState,
    setCurrentChapterIndex,
    setTargetChapterCount,
    setUnlockedChapterCount,
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
    subscriptionPlanName,
    previewChapterTitle,
    previewStepCount,
    previewQuestionCount,
    previewStatusLabel,
    previewStatusText,
    previewRecommendation,
    currentChapterStepProgressPercent,
    previewGreetingText,
    hasStartedFirstChapter,
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

  const worksheetModalItems = useMemo(() => {
    if (worksheetModalChapterFilter === null) {
      return learnWorksheets
    }
    return learnWorksheets.filter((w) => w.chapterIndex === worksheetModalChapterFilter)
  }, [learnWorksheets, worksheetModalChapterFilter])

  const worksheetModalSubtitle = useMemo(() => {
    if (worksheetModalChapterFilter === null) {
      return effectiveTopic || 'Lernpfad'
    }
    const label = learningChapters[worksheetModalChapterFilter]?.trim()
    return label || `Kapitel ${worksheetModalChapterFilter + 1}`
  }, [worksheetModalChapterFilter, effectiveTopic, learningChapters])

  const worksheetChaptersForList = useMemo(() => {
    const map = new Map<number, LearnWorksheetItem[]>()
    for (const item of learnWorksheets) {
      if (typeof item.chapterIndex !== 'number' || item.chapterIndex < 0) {
        continue
      }
      const list = map.get(item.chapterIndex) ?? []
      list.push(item)
      map.set(item.chapterIndex, list)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([chapterIndex]) => ({
        chapterIndex,
        progress: getWorksheetChapterProgress(learnWorksheets, chapterIndex),
      }))
  }, [learnWorksheets])

  const tutorWorksheetChapterIndex = Math.max(0, unlockedChapterCount - 1)

  const requiredWorksheetProgress = useMemo(() => {
    if (worksheetRequiredChapterIndex === null) {
      return null
    }
    return getWorksheetChapterProgress(learnWorksheets, worksheetRequiredChapterIndex)
  }, [worksheetRequiredChapterIndex, learnWorksheets])

  const flashcardStats = useMemo(() => {
    const all = learnFlashcardSets.flatMap((s) => s.cards)
    const known = all.filter((c) => c.selfRating === 'known').length
    const unknown = all.filter((c) => c.selfRating === 'unknown').length
    const total = all.length
    return {
      known,
      unknown,
      total,
      unrated: total - known - unknown,
    }
  }, [learnFlashcardSets])

  const flashcardsModalCards = useMemo(
    () => learnFlashcardSets.find((s) => s.id === flashcardsModalSetId)?.cards ?? [],
    [learnFlashcardSets, flashcardsModalSetId],
  )

  const runCreateFlashcards = useCallback(
    async (personalization: LearnMaterialPersonalizationMode) => {
    if (effectiveChapterBlueprints.length === 0) {
      return
    }
    if (!user) {
      return
    }
    if (worksheetModalCloseTimerRef.current) {
      window.clearTimeout(worksheetModalCloseTimerRef.current)
      worksheetModalCloseTimerRef.current = null
    }
    setIsWorksheetModalVisible(false)
    setIsWorksheetModalMounted(false)
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    setFlashcardsModalFocusCardId(null)
    setFlashcardsModalSetId(null)
    const outline = buildLearnMaterialOutlineFromBlueprints(
      personalization,
      chapterBlueprints,
      effectiveChapterBlueprints,
      chapterSession,
    )
    const outlineForApi =
      personalization === 'personalized' && materials.length > 0
        ? mergeOutlineWithPersonalMaterialContext(
            outline,
            `${effectiveTopic} ${selectedTopic} Lernkarten Originalunterlagen`,
            materials,
          )
        : outline
    setFlashcardsError(null)
    setIsFlashcardsModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsFlashcardsModalVisible(true)
    })
    if (!outlineForApi.trim()) {
      setFlashcardsError('Kein Kapiteltext vorhanden.')
      return
    }

    const maxImages = profile?.subscription_plans?.max_images ?? null
    const imageCredits = profile?.subscription_usages?.image_credit_balance ?? 0
    if (maxImages !== null && imageCredits < 1) {
      setFlashcardsError('Kein Bild-Guthaben mehr. Es lädt sich täglich auf (max. 60 angespart).')
      return
    }

    setIsGeneratingFlashcards(true)
    try {
      const cards = await generateLearnFlashcards(outlineForApi)
      const newSet: LearnFlashcardSet = { id: crypto.randomUUID(), cards }
      setFlashcardsModalSetId(newSet.id)
      setLearnFlashcardSets((prev) => {
        const merged = [...prev, newSet]
        const pathId = activePathIdRef.current
        if (pathId) {
          const currentSummary = learningPaths.find((e) => e.id === pathId)
          void updateLearningPathById(pathId, {
            title: getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad'),
            learnFlashcardSets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })

      await incrementMySubscriptionUsage({ userId: user.id, usedImagesDelta: 1 })
    } catch (e) {
      setFlashcardsError(e instanceof Error ? e.message : 'Lernkarten fehlgeschlagen.')
    } finally {
      setIsGeneratingFlashcards(false)
    }
  },
  [
    chapterBlueprints,
    chapterSession,
    effectiveChapterBlueprints,
    effectiveTopic,
    learningPaths,
    materials,
    profile?.subscription_plans?.max_images,
    profile?.subscription_usages?.image_credit_balance,
    selectedTopic,
    user,
  ],
  )

  const runCreateWorksheet = useCallback(
    async (personalization: LearnMaterialPersonalizationMode, targetChapterIndex?: number) => {
    if (effectiveChapterBlueprints.length === 0) {
      return
    }
    if (!user) {
      return
    }
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    setIsFlashcardsModalVisible(false)
    setIsFlashcardsModalMounted(false)
    if (worksheetModalCloseTimerRef.current) {
      window.clearTimeout(worksheetModalCloseTimerRef.current)
      worksheetModalCloseTimerRef.current = null
    }
    const requestedSingleChapter =
      typeof targetChapterIndex === 'number' && targetChapterIndex >= 0
        ? effectiveChapterBlueprints[targetChapterIndex] ?? null
        : null
    const sourceChapterBlueprints = requestedSingleChapter ? [requestedSingleChapter] : chapterBlueprints
    const sourceEffectiveBlueprints = requestedSingleChapter ? [requestedSingleChapter] : effectiveChapterBlueprints
    const outline = buildLearnMaterialOutlineFromBlueprints(
      personalization,
      sourceChapterBlueprints,
      sourceEffectiveBlueprints,
      chapterSession,
    )
    const outlineForApi =
      personalization === 'personalized' && materials.length > 0
        ? mergeOutlineWithPersonalMaterialContext(
            outline,
            `${effectiveTopic} ${selectedTopic} Arbeitsblatt Originalunterlagen`,
            materials,
          )
        : outline
    setWorksheetError(null)
    setIsWorksheetModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsWorksheetModalVisible(true)
    })
    if (!outlineForApi.trim()) {
      setWorksheetError('Kein Kapiteltext vorhanden.')
      return
    }

    const maxImages = profile?.subscription_plans?.max_images ?? null
    const imageCredits = profile?.subscription_usages?.image_credit_balance ?? 0
    if (maxImages !== null && imageCredits < 1) {
      setWorksheetError('Kein Bild-Guthaben mehr. Es lädt sich täglich auf (max. 60 angespart).')
      return
    }

    setIsGeneratingWorksheet(true)
    try {
      const items = await generateLearnWorksheet(outlineForApi)
      const fallbackChapterIndex = Math.max(0, chapterSession.chapterIndex)
      const chapterTag =
        typeof targetChapterIndex === 'number' ? targetChapterIndex : fallbackChapterIndex
      const taggedItems = items.map((item) => ({ ...item, chapterIndex: chapterTag }))
      const mergedWorksheets = [
        ...learnWorksheets.filter((item) => item.chapterIndex !== chapterTag),
        ...taggedItems,
      ]
      setLearnWorksheets(mergedWorksheets)
      setWorksheetModalChapterFilter(chapterTag)
      const pathId = activePathIdRef.current
      if (pathId) {
        const currentSummary = learningPaths.find((e) => e.id === pathId)
        const updated = await updateLearningPathById(pathId, {
          title: getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad'),
          ...captureEditableState(),
          learnWorksheets: mergedWorksheets,
        })
        pathCacheRef.current[pathId] = updated
      }

      await incrementMySubscriptionUsage({ userId: user.id, usedImagesDelta: 1 })
    } catch (e) {
      setWorksheetError(e instanceof Error ? e.message : 'Arbeitsblatt fehlgeschlagen.')
    } finally {
      setIsGeneratingWorksheet(false)
    }
  },
  [
    captureEditableState,
    chapterBlueprints,
    chapterSession,
    effectiveChapterBlueprints,
    effectiveTopic,
    learnWorksheets,
    learningPaths,
    materials,
    profile?.subscription_plans?.max_images,
    profile?.subscription_usages?.image_credit_balance,
    selectedTopic,
    user,
  ],
  )

  const confirmLearnMaterialChoice = useCallback(
    (personalization: LearnMaterialPersonalizationMode) => {
      const target = learnMaterialChoiceTarget
      setLearnMaterialChoiceTarget(null)
      if (target === 'flashcards') {
        void runCreateFlashcards(personalization)
      } else if (target === 'worksheet') {
        void runCreateWorksheet(personalization)
      }
    },
    [learnMaterialChoiceTarget, runCreateFlashcards, runCreateWorksheet],
  )

  const handleWorksheetSavedAnswerChange = useCallback(
    (itemId: string, answer: string) => {
      const clipped = answer.length > 16000 ? `${answer.slice(0, 16000)}…` : answer
      const pathId = activePathIdRef.current
      const currentSummary = pathId ? learningPaths.find((e) => e.id === pathId) : undefined
      const title = getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad')

      setLearnWorksheets((prev) => {
        const merged = prev.map((item) => {
          if (item.id !== itemId) {
            return item
          }
          if (clipped.length === 0) {
            const next = { ...item }
            delete next.savedAnswer
            return next
          }
          return { ...item, savedAnswer: clipped }
        })
        if (pathId) {
          void updateLearningPathById(pathId, {
            title,
            learnWorksheets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })
    },
    [learningPaths],
  )

  const handleWorksheetItemEvaluated = useCallback(
    (itemId: string, payload: { correct: boolean; answer: string }) => {
      const clippedAnswer =
        payload.answer.length > 16000 ? `${payload.answer.slice(0, 16000)}…` : payload.answer
      const pathId = activePathIdRef.current
      const currentSummary = pathId ? learningPaths.find((e) => e.id === pathId) : undefined
      const title = getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad')

      setLearnWorksheets((prev) => {
        const merged = prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                evaluated: true,
                lastCorrect: payload.correct,
                savedAnswer: clippedAnswer,
              }
            : item,
        )
        if (pathId) {
          void updateLearningPathById(pathId, {
            title,
            learnWorksheets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })
    },
    [learningPaths],
  )

  const handleFlashcardSelfRating = useCallback(
    (cardId: string, rating: 'known' | 'unknown') => {
      const pathId = activePathIdRef.current
      const currentSummary = pathId ? learningPaths.find((e) => e.id === pathId) : undefined
      const title = getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad')

      setLearnFlashcardSets((prev) => {
        const merged = prev.map((set) => ({
          ...set,
          cards: set.cards.map((c) => (c.id === cardId ? { ...c, selfRating: rating } : c)),
        }))
        if (pathId) {
          void updateLearningPathById(pathId, {
            title,
            learnFlashcardSets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })
    },
    [learningPaths],
  )

  useEffect(() => {
    if (!isSetupComplete || !entryQuizResult) {
      return
    }
    const maxPlannedCount = Math.max(1, Math.min(targetChapterCount, chapterBlueprints.length || targetChapterCount))
    const lastUnlockedIndex = Math.max(0, unlockedChapterCount - 1)
    const hasCompletedUnlockedChapter = chapterSession.completedChapterIndexes.includes(lastUnlockedIndex)
    const wsStats = getWorksheetChapterProgress(learnWorksheets, lastUnlockedIndex)
    const hasWorksheetItems = wsStats.total > 0
    const worksheetChapterComplete = wsStats.isComplete
    const nextChapterNumber = Math.min(maxPlannedCount, unlockedChapterCount + 1)
    let action: TutorChatEntry['action']
    let content = ''

    if (!hasCompletedUnlockedChapter) {
      action = 'start-next-chapter'
      content = `Einstiegstest: ${entryQuizResult.score}/${entryQuizResult.total}. Starte jetzt Kapitel ${lastUnlockedIndex + 1} und schließe es vollständig ab.`
    } else if (!hasWorksheetItems) {
      action = 'create-worksheet'
      content = `Kapitel ${lastUnlockedIndex + 1} ist abgeschlossen. Erstelle jetzt das zugehörige Arbeitsblatt, um das nächste Kapitel freizuschalten.`
    } else if (!worksheetChapterComplete) {
      action = 'create-worksheet'
      content = `Kapitel ${lastUnlockedIndex + 1}: Arbeitsblatt ${wsStats.evaluatedCount}/${wsStats.total} Aufgaben mit Kreis geprüft. Bitte alle Aufgaben prüfen lassen (Kreis), um das nächste Kapitel freizuschalten.`
    } else if (unlockedChapterCount < maxPlannedCount) {
      action = 'start-next-chapter'
      content = `Alle Aufgaben des Arbeitsblatts zu Kapitel ${lastUnlockedIndex + 1} sind geprüft. Jetzt ist Kapitel ${nextChapterNumber} der nächste sinnvolle Schritt.`
    } else {
      action = undefined
      content = 'Alle geplanten Kapitel und die zugehörigen Arbeitsblätter sind abgeschlossen. Sehr stark! 😎'
    }

    setTutorMessages((prev) => {
      const existing = prev[0]
      if (
        prev.length === 1 &&
        existing &&
        existing.role === 'assistant' &&
        existing.content === content &&
        existing.action === action
      ) {
        return prev
      }
      return [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          action,
        },
      ]
    })
  }, [
    isSetupComplete,
    entryQuizResult,
    targetChapterCount,
    chapterBlueprints.length,
    unlockedChapterCount,
    chapterSession.completedChapterIndexes,
    learnWorksheets,
  ])

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

  async function handleUploadMaterials(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return
    }
    if (!user) {
      return
    }

    setError(null)
    const maxFiles = profile?.subscription_plans?.max_files ?? null
    const usedFiles = profile?.subscription_usages?.used_files ?? 0
    if (maxFiles !== null && usedFiles + fileList.length > maxFiles) {
      setError('Du hast dein Abo-Limit für Dateien erreicht.')
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

      await incrementMySubscriptionUsage({ userId: user.id, usedFilesDelta: files.length })
      setMaterials((prev) => [...uploaded, ...prev].slice(0, 8))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dateien konnten nicht verarbeitet werden.')
    } finally {
      setIsUploading(false)
    }
  }

  async function openChapterModal() {
    if (effectiveChapterBlueprints.length === 0) {
      const chapterTopic = (selectedTopic || effectiveTopic || getDisplayPathTitle(activePath?.title ?? '')).trim()
      try {
        setError('Kapitel wird vorbereitet...')
        setChapterGenerationDebugRaw('')
        setIsChapterGenerationLoading(true)
        setChapterGenerationPercent(8)
        let sawAnyRawChapterResponse = false
        const chapterMaterialContext = formatRelevantMaterialContext(
          `${chapterTopic} Kapitel 1 Grundlagen Übung`,
          materials,
          materials.length > 0
            ? { maxChunks: materials.length > 2 ? 10 : 8, maxChars: materials.length > 2 ? 7000 : 5200, denseChunks: true, emphasizePersonalSources: true }
            : { maxChunks: 6, maxChars: 2800 },
        )
        let validationHint = ''
        let generated: ChapterBlueprint[] = []
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const chapterRequest: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: [
              `Lernpfad: ${getDisplayPathTitle(activePath?.title ?? '')}`,
              `Thema: ${chapterTopic}`,
              'Erstelle genau 1 Lernkapitel als JSON-Array mit genau einem Kapitelobjekt.',
              'Nur JSON ohne zusätzliche Erklärung.',
              'Das Kapitel braucht: 1 Erklärung, dann 4-8 Fragen, danach 1 Recap.',
              'Fragetypen mischen: mcq, text, match, true_false.',
              WORKSHEET_EXERCISE_FIDELITY_RULES,
              CHAPTER_LEARNING_FIDELITY_RULES,
              chapterMaterialContext
                ? `Materialauszüge:\n${chapterMaterialContext}`
                : 'Keine Materialauszüge vorhanden, nutze praxisnahe kaufmännische Beispiele.',
              attempt > 1
                ? 'WICHTIG: Der vorige Versuch war ungültig. Gib ausschließlich valides JSON-Array mit exakt einem Kapitelobjekt zurück.'
                : '',
              validationHint ? `Ungültigkeitsgrund im Vorversuch: ${validationHint}` : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            createdAt: new Date().toISOString(),
          }
          let chapterTimeoutId: number | null = null
          const result = await Promise.race([
            sendMessage([chapterRequest], {
              interactiveQuizPrompt: getPrompt('interactive_quiz'),
              systemPrompt: getPrompt('learn_tutor'),
              useLearnPathModel: true,
              learnTelemetryMode: 'learn_tutor',
            }),
            new Promise<never>((_, reject) => {
              chapterTimeoutId = window.setTimeout(() => {
                reject(new Error('Kapitelerstellung hat 60 Sekunden überschritten. Erneut versuchen.'))
              }, CHAPTER_ON_DEMAND_TIMEOUT_MS)
            }),
          ]).finally(() => {
            if (chapterTimeoutId !== null) {
              window.clearTimeout(chapterTimeoutId)
            }
          })
          const rawResponse = result.assistantMessage.content
          const parsed = parseInteractiveContentWithFallback(rawResponse)
          setChapterGenerationDebugRaw(rawResponse)
          sawAnyRawChapterResponse = true
          const fromRaw = parseChapterBlueprintsFromText(rawResponse)
          const fromClean = parsed.cleanText ? parseChapterBlueprintsFromText(parsed.cleanText) : []
          generated = namespaceChapterStepIds(
            ensureMinimumChapterDepth(fromRaw.length > 0 ? fromRaw : fromClean),
          )
          if (generated[0]) {
            break
          }
          validationHint = 'Kein auslesbares Kapitel-JSON erhalten'
        }
        const firstChapter = generated[0]
        if (!firstChapter) {
          if (!sawAnyRawChapterResponse) {
            setChapterGenerationDebugRaw('Kein nutzbarer Kapitel-JSON-Block in der KI-Antwort gefunden.')
          }
          setError('Kapitel konnte nicht erzeugt werden. Erneut versuchen.')
          return
        }
        setChapterGenerationPercent(100)
        setChapterBlueprints([firstChapter])
        setChapterSession((prev) => ({
          ...prev,
          chapterIndex: 0,
          stepIndex: 0,
        }))
        setTutorState('chapter_learning')
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (message.trim()) {
          setChapterGenerationDebugRaw((prev) => prev || message)
        }
        if (message.toLowerCase().includes('api key für provider "anthropic"')) {
          setError('Lernbereich ist auf Anthropic gestellt, aber der Secret ANTHROPIC_API_KEY fehlt. Bitte im Admin prüfen.')
          return
        }
        if (isTransientAiFailure(err)) {
          setError('Kapitelerstellung temporär nicht verfügbar. Erneut versuchen.')
        } else {
          setError(err instanceof Error ? `${err.message} Erneut versuchen.` : 'Kapitel konnte nicht erzeugt werden. Erneut versuchen.')
        }
        return
      } finally {
        setIsChapterGenerationLoading(false)
        setChapterGenerationPercent(0)
      }
    }
    if (chapterModalCloseTimerRef.current) {
      window.clearTimeout(chapterModalCloseTimerRef.current)
      chapterModalCloseTimerRef.current = null
    }
    setError(null)
    setIsChapterModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsChapterModalVisible(true)
    })
  }

  function openTutorFlashcardsAction() {
    setActiveLearnTab('flashcards')
    setLearnMaterialChoiceTarget('flashcards')
  }

  function openTutorWorksheetAction() {
    setActiveLearnTab('worksheets')
    if (worksheetRequiredChapterIndex !== null) {
      const ch = worksheetRequiredChapterIndex
      const prog = getWorksheetChapterProgress(learnWorksheets, ch)
      if (prog.total > 0) {
        openSavedWorksheetsModal(ch)
        return
      }
      void runCreateWorksheet('personalized', ch)
      return
    }
    setLearnMaterialChoiceTarget('worksheet')
  }

  function handleGenerateRequiredWorksheet() {
    if (worksheetRequiredChapterIndex === null) {
      return
    }
    const ch = worksheetRequiredChapterIndex
    const prog = getWorksheetChapterProgress(learnWorksheets, ch)
    if (prog.total > 0) {
      openSavedWorksheetsModal(ch)
      return
    }
    void runCreateWorksheet('personalized', ch)
  }

  function closeChapterModal() {
    setIsChapterModalVisible(false)
    chapterModalCloseTimerRef.current = window.setTimeout(() => {
      setIsChapterModalMounted(false)
      chapterModalCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function handleCompleteChapter() {
    setChapterSession((prev) => {
      const idx = prev.chapterIndex
      if (prev.completedChapterIndexes.includes(idx)) {
        return prev
      }
      return {
        ...prev,
        completedChapterIndexes: [...prev.completedChapterIndexes, idx],
      }
    })
    closeChapterModal()
    setActiveLearnTab('worksheets')
  }

  function closeFlashcardsModal() {
    setIsFlashcardsModalVisible(false)
    setFlashcardsModalFocusCardId(null)
    setFlashcardsModalSetId(null)
    flashcardsModalCloseTimerRef.current = window.setTimeout(() => {
      setIsFlashcardsModalMounted(false)
      flashcardsModalCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openSavedFlashcardsModal(setId?: string | null, focusCardId?: string | null) {
    if (!learnFlashcardSets.some((s) => s.cards.length > 0)) {
      return
    }
    const resolvedSetId =
      setId ?? learnFlashcardSets[learnFlashcardSets.length - 1]?.id ?? null
    if (!resolvedSetId) {
      return
    }
    if (worksheetModalCloseTimerRef.current) {
      window.clearTimeout(worksheetModalCloseTimerRef.current)
      worksheetModalCloseTimerRef.current = null
    }
    setIsWorksheetModalVisible(false)
    setIsWorksheetModalMounted(false)
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    setFlashcardsError(null)
    setFlashcardsModalSetId(resolvedSetId)
    setFlashcardsModalFocusCardId(focusCardId === undefined ? null : focusCardId)
    setIsFlashcardsModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsFlashcardsModalVisible(true)
    })
  }

  function closeWorksheetModal() {
    setIsWorksheetModalVisible(false)
    worksheetModalCloseTimerRef.current = window.setTimeout(() => {
      setIsWorksheetModalMounted(false)
      setWorksheetModalChapterFilter(null)
      worksheetModalCloseTimerRef.current = null
    }, MODAL_ANIMATION_MS)
  }

  function openSavedWorksheetsModal(chapterFilter?: number | null) {
    if (learnWorksheets.length === 0) {
      return
    }
    if (flashcardsModalCloseTimerRef.current) {
      window.clearTimeout(flashcardsModalCloseTimerRef.current)
      flashcardsModalCloseTimerRef.current = null
    }
    setIsFlashcardsModalVisible(false)
    setIsFlashcardsModalMounted(false)
    if (worksheetModalCloseTimerRef.current) {
      window.clearTimeout(worksheetModalCloseTimerRef.current)
      worksheetModalCloseTimerRef.current = null
    }
    setWorksheetError(null)
    setWorksheetModalChapterFilter(chapterFilter === undefined ? null : chapterFilter)
    setIsWorksheetModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsWorksheetModalVisible(true)
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
    void refreshProfile().catch(() => {
      // Falls Refresh fehlschlägt, öffnen wir trotzdem die Settings mit dem zuletzt geladenen Profil.
    })
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

  const activeLearnTabIndex =
    activeLearnTab === 'path'
      ? 0
      : activeLearnTab === 'tests'
        ? 1
        : activeLearnTab === 'flashcards'
          ? 2
          : activeLearnTab === 'worksheets'
            ? 3
            : 4

  return (
    <main
      className={`chat-app-shell learn-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
        isMobileSidebarOpen ? 'is-mobile-sidebar-open' : ''
      }`}
    >
      <LearnPageSidebar
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => {
          if (isMobileSidebarOpen) {
            setIsMobileSidebarOpen(false)
            setIsSidebarCollapsed(false)
            return
          }
          setIsSidebarCollapsed((prev) => !prev)
        }}
        onCreateLearningPath={handleCreateLearningPath}
        isCreateLearningPathDisabled={!learnPathCreateEnabled && profile?.is_superadmin !== true}
        onCreateLearningPathDisabledClick={() => setLearnFeatureInfoVisible(true)}
        onOpenSettings={openSettingsModal}
        learningPaths={learningPaths}
        activePathId={activePathId}
        onSelectLearningPath={(pathId) => {
          void handleSelectLearningPath(pathId)
          setOpenPathMenuId(null)
          setPathMenuPosition(null)
          setIsMobileSidebarOpen(false)
        }}
        onLearningPathContextMenu={openLearningPathContextMenu}
        onNavigateToChat={() => navigate('/chat')}
        profile={profile}
        displayName={displayName}
        avatarFallback={avatarFallback}
        subscriptionPlanName={subscriptionPlanName}
      />

      <section className="chat-main learn-main">
        <header className="learn-mobile-topbar" aria-label="Lernbereich Kopfzeile">
          <div className="learn-mobile-topbar-main-row">
            {!isMobileSidebarOpen ? (
              <button
                type="button"
                className={`learn-mobile-topbar-open-sidebar${
                  isMobileSidebarButtonTouchActive ? ' is-touch-active' : ''
                }`}
                aria-label="Sidebar öffnen"
                onTouchStart={handleMobileSidebarButtonTouchStart}
                onTouchEnd={handleMobileSidebarButtonTouchEnd}
                onTouchCancel={handleMobileSidebarButtonTouchEnd}
                onClick={() => {
                  setIsSidebarCollapsed(false)
                  setIsMobileSidebarOpen(true)
                }}
              >
                <img className="ui-icon" src={sidebarIcon} alt="" aria-hidden="true" />
              </button>
            ) : null}
            <div className="learn-mobile-topbar-title-wrap">
              <div className="learn-mobile-topbar-title-row">
                <span className="learn-mobile-topbar-icon" aria-hidden="true" />
                <p className="learn-mobile-topbar-title">{getDisplayPathTitle(activePath?.title ?? 'Lernbereich')}</p>
              </div>
            </div>
          </div>
        </header>
        {learnFeatureInfoVisible ? <p className="chat-learn-feature-info">Noch nicht verfügbar</p> : null}
        <div className="learn-page-grid">
          <article className="learn-card learn-workspace-card">
            <header className="learn-workspace-header">
              <span className="learn-workspace-title-icon" aria-hidden="true" />
              <h1 className="learn-page-title-text">{getDisplayPathTitle(activePath?.title ?? '')}</h1>
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
                aiGuidance={aiGuidance}
                onFilesChange={(files) => {
                  void handleUploadMaterials(files)
                }}
                onRemoveMaterial={(materialId) => {
                  setMaterials((prev) => prev.filter((entry) => entry.id !== materialId))
                }}
                onContinueStepOne={handleContinueSetupStepOne}
                onContinueStepTwo={handleContinueSetupStepTwo}
                onContinueStepThree={handleContinueSetupStepThree}
                onFinishSetup={handleFinishSetup}
                onBackToStep1={() => setSetupStep(1)}
                onBackToStep2={() => setSetupStep(2)}
                onBackToStep3={() => setSetupStep(3)}
                onAiGuidanceChange={(value) => {
                  setAiGuidance(value)
                  setError(null)
                }}
                onSelectProficiency={(level) => {
                  setProficiencyLevel(level)
                  setError(null)
                }}
              />
            ) : (
              <>
                <nav
                  className={`learn-top-tabs${isMobileTabsTouchActive ? ' is-touch-active' : ''}`}
                  aria-label="Lernbereich Tabs"
                  style={{ ['--learn-active-tab-index' as any]: activeLearnTabIndex }}
                  onTouchStart={handleMobileTabsTouchStart}
                  onTouchEnd={handleMobileTabsTouchEnd}
                  onTouchCancel={handleMobileTabsTouchEnd}
                >
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--path${activeLearnTab === 'path' ? ' is-active' : ''}`}
                    onClick={() => setActiveLearnTab('path')}
                    aria-label="Lernpfad"
                  >
                    <img
                      className="ui-icon learn-top-tab-path-icon"
                      src={activeLearnTab === 'path' ? learnFilledIcon : learnOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--tests${activeLearnTab === 'tests' ? ' is-active' : ''}`}
                    onClick={() => setActiveLearnTab('tests')}
                    aria-label="Tests"
                  >
                    <img
                      className="ui-icon learn-top-tab-tests-icon"
                      src={activeLearnTab === 'tests' ? examFilledIcon : examOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--flashcards${activeLearnTab === 'flashcards' ? ' is-active' : ''}`}
                    onClick={() => setActiveLearnTab('flashcards')}
                    aria-label="Lernkarten"
                  >
                    <img
                      className="ui-icon learn-top-tab-flashcards-icon"
                      src={activeLearnTab === 'flashcards' ? cardsFilledIcon : cardsOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--worksheets${activeLearnTab === 'worksheets' ? ' is-active' : ''}${
                      worksheetRequiredChapterIndex !== null ? ' has-attention' : ''
                    }`}
                    onClick={() => setActiveLearnTab('worksheets')}
                    aria-label="Arbeitsblätter"
                  >
                    <img
                      className="ui-icon learn-top-tab-worksheets-icon"
                      src={activeLearnTab === 'worksheets' ? paperFilledIcon : paperOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--statistics${activeLearnTab === 'statistics' ? ' is-active' : ''}`}
                    onClick={() => setActiveLearnTab('statistics')}
                    aria-label="Statistiken"
                  >
                    <img
                      className="ui-icon learn-top-tab-statistics-icon"
                      src={activeLearnTab === 'statistics' ? statisticsFilledIcon : statisticsOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                </nav>
                {worksheetTabHintVisible &&
                worksheetRequiredChapterIndex !== null &&
                requiredWorksheetProgress &&
                !requiredWorksheetProgress.isComplete ? (
                  <p className="learn-worksheet-required-hint">
                    {requiredWorksheetProgress.total === 0 ? (
                      <>
                        Kapitel {worksheetRequiredChapterIndex + 1} abgeschlossen. Bitte erstelle jetzt das Arbeitsblatt im Tab{' '}
                        <strong>Arbeitsblätter</strong>, um weiterzumachen.
                      </>
                    ) : (
                      <>
                        Pflicht-Arbeitsblatt Kapitel {worksheetRequiredChapterIndex + 1}:{' '}
                        {requiredWorksheetProgress.evaluatedCount}/{requiredWorksheetProgress.total} Aufgaben geprüft. Bitte
                        alle Aufgaben mit dem Kreis prüfen.
                      </>
                    )}
                  </p>
                ) : null}
                {profile?.is_superadmin === true && chapterGenerationDebugRaw.trim() ? (
                  <details className="learn-admin-debug-panel">
                    <summary>Admin Debug: Kapitel-Generierung</summary>
                    <pre className="learn-admin-debug-pre">{chapterGenerationDebugRaw}</pre>
                  </details>
                ) : null}
                {activeLearnTab === 'path' ? (
                  isChapterGenerationLoading ? (
                    <LearnEntryPrepPanel
                      ariaLabel="Ladevorgang Kapitel"
                      setupAnalysisArcRadius={setupAnalysisArcRadius}
                      setupAnalysisArcLength={setupAnalysisArcLength}
                      setupAnalysisCircumference={setupAnalysisCircumference}
                      arcOffset={chapterGenerationArcOffset}
                      overallPercent={chapterGenerationPercent}
                      stepLabels={CHAPTER_ON_DEMAND_STEPS}
                      activeStepIndex={Math.max(
                        0,
                        Math.min(
                          CHAPTER_ON_DEMAND_STEPS.length - 1,
                          chapterGenerationPercent < 34 ? 0 : chapterGenerationPercent < 72 ? 1 : 2,
                        ),
                      )}
                      stepPercents={chapterGenerationStepPercents}
                      loaderText="Kapitel wird generiert..."
                    />
                  ) : (
                  <LearnConversationSection
                    showChapterPreview={false}
                    learningChaptersCount={0}
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
                      canStartChapter: false,
                      onStartChapter: () => {},
                      canCreateFlashcards: false,
                      isGeneratingFlashcards,
                      onCreateFlashcards: () => setLearnMaterialChoiceTarget('flashcards'),
                      hasSavedFlashcards: learnFlashcardSets.some((s) => s.cards.length > 0),
                      onOpenSavedFlashcards: openSavedFlashcardsModal,
                      canCreateWorksheet: false,
                      isGeneratingWorksheet,
                      onCreateWorksheet: () => setLearnMaterialChoiceTarget('worksheet'),
                      hasSavedWorksheets: learnWorksheets.length > 0,
                      onOpenSavedWorksheets: () =>
                        openSavedWorksheetsModal(
                          worksheetRequiredChapterIndex !== null ? worksheetRequiredChapterIndex : undefined,
                        ),
                    }}
                    isPostEntryPrepLoading={isPostEntryPrepLoading}
                    postEntryPrepPanel={{
                      ariaLabel: 'Ladevorgang',
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
                      setError(null)
                      setHasTriedEntryQuizGeneration(false)
                    }}
                    entryQuizResult={entryQuizResult}
                    entryTestDurationLabel={entryTestDurationLabel}
                    onOpenEntryQuizModal={openEntryQuizModal}
                    onStartNextChapter={openChapterModal}
                    onCreateFlashcards={openTutorFlashcardsAction}
                    onCreateWorksheet={openTutorWorksheetAction}
                    learnWorksheets={learnWorksheets}
                    tutorWorksheetChapterIndex={tutorWorksheetChapterIndex}
                  />
                  )
                ) : null}
                {activeLearnTab === 'tests' ? (
                  <section className="learn-tab-panel">
                    <section className="learn-tests-list" aria-label="Testliste">
                      <button type="button" className="learn-tests-list-item" onClick={openEntryQuizModal}>
                        <div className="learn-tests-list-item-main">
                          <div className="learn-tests-list-item-heading">
                            <p className="learn-tests-list-item-title">Einstiegstest</p>
                            <span className={`learn-tests-status-badge is-${entryTestStatus}`}>
                              {entryTestStatus === 'completed'
                                ? 'Abgeschlossen'
                                : entryTestStatus === 'in_progress'
                                  ? 'In Bearbeitung'
                                  : 'Offen'}
                            </span>
                          </div>
                          <p className="learn-tests-list-item-meta">
                            {entryQuizResult
                              ? `Ergebnis: ${entryQuizResult.score}/${entryQuizResult.total}`
                              : `Dauer: ${entryTestDurationLabel}`}
                          </p>
                        </div>
                      </button>
                    </section>
                  </section>
                ) : null}
                {activeLearnTab === 'flashcards' ? (
                  <section className="learn-tab-panel">
                    <div className="learn-next-step-actions learn-next-step-actions--flashcards">
                      <PrimaryButton type="button" onClick={() => setLearnMaterialChoiceTarget('flashcards')}>Lernkarten</PrimaryButton>
                    </div>
                    <section className="learn-tests-list learn-flashcards-list-spaced" aria-label="Lernkarten Sets">
                      {learnFlashcardSets.length === 0 ? (
                        <p className="learn-muted">Noch keine Lernkarten vorhanden.</p>
                      ) : (
                        learnFlashcardSets.map((set, setIndex) => {
                          const total = set.cards.length
                          const known = set.cards.filter((c) => c.selfRating === 'known').length
                          const unknown = set.cards.filter((c) => c.selfRating === 'unknown').length
                          const fcStatus: 'open' | 'in_progress' | 'completed' =
                            total > 0 && known === total
                              ? 'completed'
                              : known > 0 || unknown > 0
                                ? 'in_progress'
                                : 'open'
                          const fcLabel =
                            total > 0 && known === total
                              ? 'Komplett'
                              : known > 0 || unknown > 0
                                ? 'Teilweise'
                                : 'Offen'
                          const title =
                            set.title?.trim() ||
                            `Lernkarten-Set ${setIndex + 1}`
                          return (
                            <button
                              key={set.id}
                              type="button"
                              className="learn-tests-list-item"
                              onClick={() => openSavedFlashcardsModal(set.id)}
                            >
                              <div className="learn-tests-list-item-main">
                                <div className="learn-tests-list-item-heading">
                                  <p className="learn-tests-list-item-title">{title}</p>
                                  <span className={`learn-tests-status-badge is-${fcStatus}`}>{fcLabel}</span>
                                </div>
                                <p className="learn-tests-list-item-meta">
                                  {total} Fragen · {known} gewusst · {unknown} nicht gewusst
                                </p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </section>
                    <button
                      type="button"
                      className="learn-mobile-floating-create-pill"
                      onClick={() => setLearnMaterialChoiceTarget('flashcards')}
                    >
                      <img className="ui-icon learn-mobile-floating-create-pill-icon" src={addIcon} alt="" aria-hidden="true" />
                      Lernkarten
                    </button>
                  </section>
                ) : null}
                {activeLearnTab === 'statistics' ? (
                  <section className="learn-tab-panel learn-stats-tab-panel" aria-label="Lernstatistik">
                    <div className="learn-stats-grid">
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardStats.known}</p>
                        <p className="learn-stats-card-label">Karten gewusst</p>
                      </article>
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardStats.unknown}</p>
                        <p className="learn-stats-card-label">Karten nicht gewusst</p>
                      </article>
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardStats.unrated}</p>
                        <p className="learn-stats-card-label">Noch nicht bewertet</p>
                      </article>
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardStats.total}</p>
                        <p className="learn-stats-card-label">Lernkarten gesamt</p>
                      </article>
                    </div>
                    <p className="learn-muted learn-stats-footnote">
                      Bewertungen gibst du nach dem Umdrehen einer Karte im Lernkarten-Modal ab (Gewusst / Nicht gewusst).
                    </p>
                  </section>
                ) : null}
                {activeLearnTab === 'worksheets' ? (
                  <section className="learn-tab-panel">
                    {worksheetRequiredChapterIndex !== null && requiredWorksheetProgress ? (
                      <p className="learn-next-step-hint">
                        {requiredWorksheetProgress.total === 0
                          ? `Pflichtschritt: Erstelle das Arbeitsblatt zu Kapitel ${worksheetRequiredChapterIndex + 1}.`
                          : requiredWorksheetProgress.isComplete
                            ? `Pflicht-Arbeitsblatt zu Kapitel ${worksheetRequiredChapterIndex + 1} ist vollständig geprüft.`
                            : `Pflicht-Arbeitsblatt Kapitel ${worksheetRequiredChapterIndex + 1}: ${requiredWorksheetProgress.evaluatedCount}/${requiredWorksheetProgress.total} Aufgaben geprüft.`}
                      </p>
                    ) : null}
                    <div className="learn-next-step-actions learn-next-step-actions--worksheets">
                      <PrimaryButton
                        type="button"
                        onClick={handleGenerateRequiredWorksheet}
                        disabled={worksheetRequiredChapterIndex === null || isGeneratingWorksheet}
                      >
                        {isGeneratingWorksheet
                          ? 'Arbeitsblatt wird erstellt...'
                          : worksheetRequiredChapterIndex !== null && requiredWorksheetProgress
                            ? requiredWorksheetProgress.total === 0
                              ? `Arbeitsblatt für Kapitel ${worksheetRequiredChapterIndex + 1}`
                              : requiredWorksheetProgress.isComplete
                                ? `Arbeitsblatt Kapitel ${worksheetRequiredChapterIndex + 1} ansehen`
                                : `Arbeitsblatt fortsetzen (${requiredWorksheetProgress.evaluatedCount}/${requiredWorksheetProgress.total})`
                            : 'Arbeitsblatt'}
                      </PrimaryButton>
                    </div>
                    <section className="learn-tests-list learn-worksheets-list-spaced" aria-label="Arbeitsblätter">
                      {worksheetChaptersForList.length === 0 ? (
                        <p className="learn-muted">Noch kein Arbeitsblatt vorhanden.</p>
                      ) : (
                        worksheetChaptersForList.map(({ chapterIndex, progress }) => {
                          const chapterTitle =
                            learningChapters[chapterIndex]?.trim() || `Kapitel ${chapterIndex + 1}`
                          const status: 'open' | 'in_progress' | 'completed' =
                            progress.total === 0
                              ? 'open'
                              : progress.isComplete
                                ? 'completed'
                                : 'in_progress'
                          return (
                            <button
                              key={`ws-${chapterIndex}`}
                              type="button"
                              className="learn-tests-list-item"
                              onClick={() => openSavedWorksheetsModal(chapterIndex)}
                            >
                              <div className="learn-tests-list-item-main">
                                <div className="learn-tests-list-item-heading">
                                  <p className="learn-tests-list-item-title">{chapterTitle}</p>
                                  <span className={`learn-tests-status-badge is-${status}`}>
                                    {status === 'completed'
                                      ? 'Abgeschlossen'
                                      : status === 'in_progress'
                                        ? 'In Bearbeitung'
                                        : 'Offen'}
                                  </span>
                                </div>
                                <p className="learn-tests-list-item-meta">
                                  {progress.total === 0
                                    ? 'Noch keine Aufgaben'
                                    : `${progress.evaluatedCount}/${progress.total} Aufgaben geprüft`}
                                </p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </section>
                    <button
                      type="button"
                      className="learn-mobile-floating-create-pill"
                      onClick={handleGenerateRequiredWorksheet}
                      disabled={worksheetRequiredChapterIndex === null || isGeneratingWorksheet}
                    >
                      <img className="ui-icon learn-mobile-floating-create-pill-icon" src={addIcon} alt="" aria-hidden="true" />
                      {isGeneratingWorksheet
                        ? 'Arbeitsblatt wird erstellt...'
                        : worksheetRequiredChapterIndex !== null && requiredWorksheetProgress
                          ? requiredWorksheetProgress.total === 0
                            ? `Arbeitsblatt für Kapitel ${worksheetRequiredChapterIndex + 1}`
                            : requiredWorksheetProgress.isComplete
                              ? `Arbeitsblatt Kapitel ${worksheetRequiredChapterIndex + 1} ansehen`
                              : `Arbeitsblatt fortsetzen (${requiredWorksheetProgress.evaluatedCount}/${requiredWorksheetProgress.total})`
                          : 'Arbeitsblatt'}
                    </button>
                  </section>
                ) : null}
              </>
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
        onCompleteChapter={handleCompleteChapter}
      />
      {learnMaterialChoiceTarget !== null ? (
        <ModalShell
          isOpen
          className="learn-flashcards-modal-overlay"
          onRequestClose={() => setLearnMaterialChoiceTarget(null)}
        >
          <section
            className="learn-material-choice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learn-material-choice-title"
          >
            <header className="learn-flashcards-modal-header">
              <h2 id="learn-material-choice-title">
                {learnMaterialChoiceTarget === 'worksheet' ? 'Arbeitsblatt' : 'Lernkarten'}
              </h2>
              <button
                type="button"
                className="settings-close-button"
                onClick={() => setLearnMaterialChoiceTarget(null)}
                aria-label="Schließen"
              >
                <span className="ui-icon settings-close-icon" aria-hidden="true" />
              </button>
            </header>
            <div className="learn-material-choice-body">
              <p className="learn-muted learn-material-choice-lead">
                Nur die Kapitelinhalte nutzen, oder zusätzlich deinen Lernverlauf (falsch beantwortete Fragen und
                ggf. das adaptive Schwächen-Kapitel) einbeziehen?
              </p>
              <div className="learn-material-choice-actions">
                <PrimaryButton type="button" onClick={() => confirmLearnMaterialChoice('personalized')}>
                  Personalisiert
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => confirmLearnMaterialChoice('general')}>
                  Allgemein
                </SecondaryButton>
              </div>
            </div>
          </section>
        </ModalShell>
      ) : null}
      <LearnFlashcardsModal
        isMounted={isFlashcardsModalMounted}
        isVisible={isFlashcardsModalVisible}
        cards={flashcardsModalCards}
        isLoading={isGeneratingFlashcards}
        error={flashcardsError}
        onClose={closeFlashcardsModal}
        focusCardId={flashcardsModalFocusCardId}
        onRateCard={handleFlashcardSelfRating}
      />
      <LearnWorksheetModal
        isMounted={isWorksheetModalMounted}
        isVisible={isWorksheetModalVisible}
        title={worksheetModalSubtitle}
        items={worksheetModalItems}
        isLoading={isGeneratingWorksheet}
        error={worksheetError}
        onClose={closeWorksheetModal}
        onItemEvaluated={handleWorksheetItemEvaluated}
        onSavedAnswerChange={handleWorksheetSavedAnswerChange}
      />
      {isSettingsMounted ? (
        <ModalShell isOpen={isSettingsVisible} onRequestClose={closeSettingsModal}>
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
      <div
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
        aria-hidden="true"
      />
    </main>
  )
}




















