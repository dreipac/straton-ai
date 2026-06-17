import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import deleteIcon from '../assets/icons/delete.svg'
import editIcon from '../assets/icons/edit.svg'
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
import { RenameBottomSheet, type RenameBottomSheetHandle } from '../components/ui/bottom-sheet/RenameBottomSheet'
import { PopoverContextMenu } from '../components/ui/menu/PopoverContextMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { isMobileViewport } from '../utils/mobile'
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
  deleteEmptyLearningPathsByUserId,
  listLearningPathsByUserId,
  type EntryQuizResult,
  type LearnFlashcardSet,
  type LearnTutorState,
  type LearnWorksheetItem,
  type LearningPathRecord,
  type LearningPathSummary,
  type SyllabusEntry,
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
import { usePostEntrySyllabusGeneration } from '../features/learn/hooks/usePostEntrySyllabusGeneration'
import { useChapterSessionFlow } from '../features/learn/hooks/useChapterSessionFlow'
import {
  useLearningPathPersistence,
  type EditableLearningPathSnapshot,
} from '../features/learn/hooks/useLearningPathPersistence'
import { parseInteractiveContentWithFallback, type InteractiveQuizPayload } from '../features/chat/utils/interactiveQuiz'
import { extractLearningMaterialText, LEARN_MATERIAL_EXCERPT_MAX_CHARS } from '../features/learn/utils/documentParser'
import {
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  DEFAULT_CHAPTER_SESSION,
  ENTRY_QUIZ_MAX_GENERATION_ATTEMPTS,
  ENTRY_TEST_PREP_STEPS,
  POST_ENTRY_PREP_STEPS,
  buildChapterGenerationUserPrompt,
  buildChapterMaterialSearchQuery,
  buildEntryQuizFallbackPayload,
  buildEntryQuizInsightForChapter,
  buildLearnerStateInsight,
  ensureMinimumChapterDepth,
  getChapterMaterialRagOptions,
  getDisplayPathTitle,
  sortLearningPathsByCreatedAt,
  getWorksheetChapterProgress,
  MIXED_LEARN_MATERIAL_CHAPTER_INDEX,
  parseChapterBlueprintsFromText,
  resolveWorksheetProgressChapterKey,
  shouldUseMixedLearnMaterial,
  validateGeneratedChapter,
  validateGeneratedEntryQuiz,
  trimOutlineForWorksheetGeneration,
  WORKSHEET_EXERCISE_FIDELITY_RULES,
  worksheetChapterDisplayLabel,
} from '../features/learn/utils/learnPageHelpers'
import {
  formatRelevantMaterialContext,
  mergeOutlineWithPersonalMaterialContext,
} from '../features/learn/utils/ragLite'
import { namespaceChapterStepIds } from '../features/learn/utils/chapterStepIds'
import {
  buildLearnMaterialOutlineFromBlueprints,
  buildMixedLearnProgressOutline,
  type LearnMaterialPersonalizationMode,
} from '../features/learn/utils/flashcardSourceFromBlueprints'
import { LearnAreaAdminBanner } from '../features/learn/components/LearnAreaAdminBanner'
import { LearnErrorLogbookHintCard } from '../features/learn/components/LearnErrorLogbookHintCard'
import { LearnErrorLogbookPanel } from '../features/learn/components/LearnErrorLogbookPanel'
import {
  buildErrorLogbookEntries,
  getErrorHintDismissedCount,
  getErrorLogbookStats,
  setErrorHintDismissed,
  shouldShowErrorLogbookHint,
} from '../features/learn/utils/errorLogbook'
import {
  buildEntryQuizReadyTutorMessage,
  buildTutorCoachMessage,
} from '../features/learn/utils/learnTutorCoachMessages'
import {
  applyFlashcardReview,
  getDueFlashcardsFromSets,
  getFlashcardSrStats,
  initializeNewFlashcardSet,
  isFlashcardDue,
} from '../features/learn/utils/spacedRepetition'
import { LearnChapterModal } from '../features/learn/components/LearnChapterModal'
import { LearnFlashcardsModal } from '../features/learn/components/LearnFlashcardsModal'
import { LearnWorksheetModal } from '../features/learn/components/LearnWorksheetModal'
import { LearnConversationSection } from '../features/learn/components/LearnConversationSection'
import { LearnEntryQuizModal } from '../features/learn/components/LearnEntryQuizModal'
import { LearnOverviewPanel } from '../features/learn/components/LearnOverviewPanel'
import { ChatPendingReplyLoader } from '../features/chat/components/ChatPendingReplyLoader'
import { LearnPageSidebar } from '../features/learn/components/LearnPageSidebar'
import { useLearningPathListEnterAnimation } from '../features/learn/hooks/useLearningPathListEnterAnimation'
import { isPendingLearningPathId } from '../features/learn/utils/learnPageHelpers'
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
      folderName?: string
      chatCount?: number
      folderFileCount?: number
    } | null
    materials?: Array<{
      id: string
      name: string
      size: number
      excerpt: string
    }>
    sourceThreadId?: string | null
    sourceFolderId?: string | null
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

function toSkillIdFromText(prefix: 'chapter' | 'flashcard' | 'worksheet', raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `${prefix}:${normalized || 'unknown'}`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Konzept-Slug normalisieren (z. B. "MWSt Berechnung!" → "mwst-berechnung"). */
function normalizeConceptTag(raw: string | undefined): string {
  if (!raw) {
    return ''
  }
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Quellenübergreifender Skill-Schlüssel: Wenn ein Konzept-Tag vorliegt, teilen sich alle Quellen
 * (Kapitel, Lernkarten, Arbeitsblatt) denselben `concept:`-Bucket → echte Aggregation pro Kompetenz.
 * Ohne Tag greift das bisherige Verhalten (textbasierter Schlüssel je Quelle).
 */
function resolveConceptSkillId(skillTag: string | undefined, fallback: () => string): string {
  const slug = normalizeConceptTag(skillTag)
  return slug ? `concept:${slug}` : fallback()
}

export type LearnPageProps = {
  /** Eingebettet im Chat-Hauptbereich (ohne eigene Learn-Sidebar). */
  embedded?: boolean
  /** Vom Host gesteuerte Pfad-ID (z. B. Chat-URL). */
  controlledPathId?: string | null
  onControlledPathIdChange?: (pathId: string) => void
  onOpenHostSidebar?: () => void
  pendingCreateLearningPath?: boolean
  onPendingCreateLearningPathHandled?: () => void
  /** Chat-Sidebar: gemeinsame Pfadliste (wie `threads` bei Chats). */
  hostLearningPaths?: LearningPathSummary[]
  setHostLearningPaths?: Dispatch<SetStateAction<LearningPathSummary[]>>
}

export function LearnPage({
  embedded = false,
  controlledPathId = null,
  onControlledPathIdChange,
  onOpenHostSidebar,
  pendingCreateLearningPath = false,
  onPendingCreateLearningPathHandled,
  hostLearningPaths,
  setHostLearningPaths,
}: LearnPageProps = {}) {
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
  const [learnAreaBannerEnabled, setLearnAreaBannerEnabled] = useState(false)
  const [learnAreaBannerText, setLearnAreaBannerText] = useState('')
  const [learnFeatureInfoVisible, setLearnFeatureInfoVisible] = useState(false)
  const [topic, setTopic] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzingSetupTopic, setIsAnalyzingSetupTopic] = useState(false)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [internalLearningPaths, setInternalLearningPaths] = useState<LearningPathSummary[]>([])
  const usesHostLearningPaths = embedded && setHostLearningPaths != null
  const learningPaths = usesHostLearningPaths ? hostLearningPaths ?? [] : internalLearningPaths
  const setLearningPaths: Dispatch<SetStateAction<LearningPathSummary[]>> = usesHostLearningPaths
    ? setHostLearningPaths!
    : setInternalLearningPaths
  const skipLearnPathEnterAnimationIdsRef = useRef<Set<string>>(new Set())
  const enteringLearningPathIds = useLearningPathListEnterAnimation(
    learningPaths,
    skipLearnPathEnterAnimationIdsRef,
  )
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
  const [syllabus, setSyllabus] = useState<SyllabusEntry[]>([])
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
  const [worksheetModalChapterFilter, setWorksheetModalChapterFilter] = useState<number | null>(null)
  const [learnMaterialChoiceTarget, setLearnMaterialChoiceTarget] = useState<null | 'flashcards' | 'worksheet'>(null)
  const [isEvaluatingChapterStep, setIsEvaluatingChapterStep] = useState(false)
  const [activeLearnTab, setActiveLearnTab] = useState<
    'path' | 'tests' | 'flashcards' | 'worksheets' | 'statistics'
  >('path')
  const [isMobileTabsTouchActive, setIsMobileTabsTouchActive] = useState(false)
  const [isCompletedChaptersOpen, setIsCompletedChaptersOpen] = useState(false)
  const [isCompletedWorksheetsOpen, setIsCompletedWorksheetsOpen] = useState(false)
  const [isMobileSidebarButtonTouchActive, setIsMobileSidebarButtonTouchActive] = useState(false)
  const [flashcardsModalFocusCardId, setFlashcardsModalFocusCardId] = useState<string | null>(null)
  const [flashcardsModalSetId, setFlashcardsModalSetId] = useState<string | null>(null)
  const [flashcardsModalReviewMode, setFlashcardsModalReviewMode] = useState<'all' | 'due'>('all')
  const [flashcardsDueSessionTotal, setFlashcardsDueSessionTotal] = useState(0)
  const [entryQuizQuestionIndex, setEntryQuizQuestionIndex] = useState(0)
  const [isSubmittingEntryQuiz, setIsSubmittingEntryQuiz] = useState(false)
  const [isPostEntryPrepLoading, setIsPostEntryPrepLoading] = useState(false)
  const [postEntryPrepStepIndex, setPostEntryPrepStepIndex] = useState(0)
  const [postEntryPrepPercents, setPostEntryPrepPercents] = useState<number[]>([0, 0])
  const [openPathMenuId, setOpenPathMenuId] = useState<string | null>(null)
  const [pathMenuPosition, setPathMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const [renamingPathId, setRenamingPathId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isRenameVisible, setIsRenameVisible] = useState(false)
  const renameSheetRef = useRef<RenameBottomSheetHandle | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)
  const LEARN_RENAME_MODAL_ANIMATION_MS = 220
  const mobileTabsTouchStartRef = useRef<number>(0)
  const mobileTabsReleaseTimerRef = useRef<number | null>(null)
  const mobileSidebarButtonTouchStartRef = useRef<number>(0)
  const mobileSidebarButtonReleaseTimerRef = useRef<number | null>(null)
  const entryQuizCloseTimerRef = useRef<number | null>(null)
  const chapterModalCloseTimerRef = useRef<number | null>(null)
  const chapterGenerationInFlightRef = useRef(false)
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
  const parentDrivenPathIdRef = useRef<string | null>(null)
  const embeddedCreateInFlightRef = useRef(false)
  const [isSwitchingLearningPath, setIsSwitchingLearningPath] = useState(false)

  const handleEmbeddedPathActivated = useCallback(
    (pathId: string) => {
      if (!embedded || !onControlledPathIdChange || isPendingLearningPathId(pathId)) {
        return
      }
      onControlledPathIdChange(pathId)
    },
    [embedded, onControlledPathIdChange],
  )

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

  const completedChaptersForShowcase = useMemo(() => {
    const uniqueSortedIndexes = Array.from(
      new Set(chapterSession.completedChapterIndexes.filter((idx) => Number.isFinite(idx) && idx >= 0)),
    ).sort((a, b) => a - b)

    return uniqueSortedIndexes.map((chapterIndex) => {
      const blueprint = effectiveChapterBlueprints[chapterIndex] ?? null
      const fallbackTitle = learningChapters[chapterIndex]?.trim() || `Kapitel ${chapterIndex + 1}`
      const title = blueprint?.title?.trim() || fallbackTitle
      const questionCount =
        blueprint?.steps?.filter((step) => step.type === 'question').length ?? 0

      return {
        chapterIndex,
        title,
        questionCount,
      }
    })
  }, [chapterSession.completedChapterIndexes, effectiveChapterBlueprints, learningChapters])

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
      syllabus,
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
      syllabus,
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
      setSyllabus(record.syllabus ?? [])
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
    setSyllabus([])
    setLearningChapters([])
    setChapterBlueprints([])
    setChapterSession(DEFAULT_CHAPTER_SESSION)
    setLearnFlashcardSets([])
    setLearnWorksheets([])
    setIsChapterGenerationLoading(false)
    setChapterGenerationPercent(0)
    setWorksheetRequiredChapterIndex(null)
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
    syllabus,
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

  const autoRemoveEmptyLearningPaths = profile?.auto_remove_empty_chats ?? true

  const {
    handleCreateLearningPath,
    handleSelectLearningPath,
    handleRenameLearningPath,
    handleDeleteLearningPath,
    isLearningPathWorkspaceLoading,
  } = useLearningPathActions({
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
    autoRemoveEmptyLearningPaths,
    skipEnterPathIdsRef: skipLearnPathEnterAnimationIdsRef,
    closePathMenu: () => {
      setOpenPathMenuId(null)
      setPathMenuPosition(null)
    },
    onPathActivated: embedded ? handleEmbeddedPathActivated : undefined,
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
    if (!embedded || !controlledPathId || isPendingLearningPathId(controlledPathId)) {
      parentDrivenPathIdRef.current = null
      return
    }
    if (embeddedCreateInFlightRef.current) {
      return
    }
    if (controlledPathId === activePathId) {
      setIsSwitchingLearningPath(false)
      parentDrivenPathIdRef.current = null
      return
    }
    if (!learningPaths.some((path) => path.id === controlledPathId)) {
      return
    }
    parentDrivenPathIdRef.current = controlledPathId
    if (!pathCacheRef.current[controlledPathId]) {
      setIsSwitchingLearningPath(true)
    }
    void handleSelectLearningPath(controlledPathId).finally(() => {
      if (parentDrivenPathIdRef.current === controlledPathId) {
        setIsSwitchingLearningPath(false)
        parentDrivenPathIdRef.current = null
      }
    })
  }, [
    activePathId,
    controlledPathId,
    embedded,
    handleSelectLearningPath,
    learningPaths,
  ])

  useEffect(() => {
    if (!embedded || !onControlledPathIdChange || !activePathId || isPendingLearningPathId(activePathId)) {
      return
    }
    if (embeddedCreateInFlightRef.current) {
      return
    }
    if (parentDrivenPathIdRef.current) {
      return
    }
    if (activePathId === controlledPathId) {
      return
    }
    onControlledPathIdChange(activePathId)
  }, [activePathId, controlledPathId, embedded, onControlledPathIdChange])

  useEffect(() => {
    if (!embedded || !pendingCreateLearningPath) {
      return
    }
    if (embeddedCreateInFlightRef.current || isLearningPathWorkspaceLoading) {
      return
    }
    embeddedCreateInFlightRef.current = true
    onPendingCreateLearningPathHandled?.()
    void handleCreateLearningPath().finally(() => {
      embeddedCreateInFlightRef.current = false
    })
  }, [
    embedded,
    handleCreateLearningPath,
    isLearningPathWorkspaceLoading,
    onPendingCreateLearningPathHandled,
    pendingCreateLearningPath,
  ])

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
    const worksheetProgressKey = resolveWorksheetProgressChapterKey(
      chapterBlueprints,
      chapterSession,
      lastUnlockedIndex,
    )
    const worksheetProgress = getWorksheetChapterProgress(learnWorksheets, worksheetProgressKey)
    const worksheetDoneForChapter = worksheetProgress.isComplete

    if (hasCompletedLastUnlocked && !worksheetDoneForChapter) {
      setWorksheetRequiredChapterIndex(lastUnlockedIndex)
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
        setLearnAreaBannerEnabled(flags.learn_area_banner_enabled)
        setLearnAreaBannerText(flags.learn_area_banner_text)
      } catch {
        if (!isMounted) {
          return
        }
        setLearnPathCreateEnabled(true)
        setLearnAreaBannerEnabled(false)
        setLearnAreaBannerText('')
      }
    })()
    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      if (!usesHostLearningPaths) {
        setInternalLearningPaths([])
      }
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
      setSyllabus([])
      setLearningChapters([])
      setChapterBlueprints([])
      setChapterSession(DEFAULT_CHAPTER_SESSION)
      setLearnFlashcardSets([])
      setLearnWorksheets([])
      setIsChapterGenerationLoading(false)
      setChapterGenerationPercent(0)
      setWorksheetRequiredChapterIndex(null)
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
    const deferDefaultPathSelection =
      Boolean((location.state as LearnPageChatDraftState | null)?.fromChatLearningDraft) ||
      Boolean(embedded && (controlledPathId?.trim() || pendingCreateLearningPath))
    const preferredPathId = embedded ? controlledPathId?.trim() ?? '' : ''

    let isMounted = true

    async function loadLearningPaths() {
      setError(null)

      try {
        if (autoRemoveEmptyLearningPaths && !deferDefaultPathSelection) {
          await deleteEmptyLearningPathsByUserId(userId).catch(() => {})
        }
        const loaded = await listLearningPathsByUserId(userId)
        const records =
          loaded.length > 0
            ? loaded
            : deferDefaultPathSelection
              ? loaded
              : [await createLearningPathByUserId(userId, 'Neuer Lernpfad')]

        if (!isMounted || chatDraftImportDoneRef.current) {
          return
        }

        pathCacheRef.current = records.reduce<Record<string, LearningPathRecord>>((acc, record) => {
          acc[record.id] = record
          return acc
        }, {})

        if (embeddedCreateInFlightRef.current) {
          return
        }

        setLearningPaths((prev) => {
          if (usesHostLearningPaths && prev.length > 0) {
            return prev
          }
          if (prev.some((path) => path.isPending)) {
            return prev
          }
          return sortLearningPathsByCreatedAt(
            records.map((record) => ({
              id: record.id,
              userId: record.userId,
              title: record.title,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            })),
          )
        })

        if (preferredPathId) {
          const preferredRecord = records.find((record) => record.id === preferredPathId)
          if (preferredRecord) {
            setActivePathId(preferredRecord.id)
            activePathIdRef.current = preferredRecord.id
            applyPathToState(preferredRecord)
          }
        } else if (!deferDefaultPathSelection && records.length > 0 && !activePathIdRef.current) {
          const first = records[0]
          setActivePathId(first.id)
          activePathIdRef.current = first.id
          applyPathToState(first)
        }
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
  }, [user, applyPathToState, autoRemoveEmptyLearningPaths, location.state, embedded, controlledPathId, usesHostLearningPaths])

  useEffect(() => {
    if (!user || !activePath || isPendingLearningPathId(activePathId)) {
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
    activePathId,
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
      typeof context?.folderName === 'string' && context.folderName.trim()
        ? `Quelle: Ordner «${context.folderName.trim()}»`
        : '',
      typeof context?.chatCount === 'number' ? `Chats im Ordner: ${context.chatCount}` : '',
      typeof context?.folderFileCount === 'number' ? `Ordner-Dateien: ${context.folderFileCount}` : '',
      focus ? `Fokus aus Chat: ${focus}` : '',
      terms.length > 0 ? `Erkannte Themen: ${terms.join(', ')}` : '',
      typeof context?.imageCount === 'number' ? `Bilder im Chat: ${context.imageCount}` : '',
      Array.isArray(context?.fileNames) && context.fileNames.length > 0
        ? `Dateien im Kontext: ${context.fileNames.slice(0, 8).join(', ')}`
        : '',
      typeof context?.excerpt === 'string' && context.excerpt.trim()
        ? `Kontextauszug:\n${context.excerpt.trim().slice(0, 900)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    const draftMaterials = Array.isArray(draft.materials)
      ? draft.materials
          .filter(
            (item): item is { id: string; name: string; size: number; excerpt: string } =>
              Boolean(item) &&
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              typeof item.size === 'number' &&
              typeof item.excerpt === 'string',
          )
          .slice(0, 8)
          .map((item) => ({
            id: item.id,
            name: item.name,
            size: item.size,
            excerpt: item.excerpt.slice(0, LEARN_MATERIAL_EXCERPT_MAX_CHARS),
          }))
      : []

    void (async () => {
      try {
        const created = await createLearningPathByUserId(user.id, draftName)
        const imported = await updateLearningPathById(created.id, {
          title: draftName,
          topic: derivedTopic,
          selectedTopic: derivedSelectedTopic,
          proficiencyLevel: draftLevel,
          aiGuidance: derivedGuidance,
          materials: draftMaterials,
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
          syllabus: [],
          learningChapters: [],
          chapterBlueprints: [],
          chapterSession: DEFAULT_CHAPTER_SESSION,
        })
        const allPaths = await listLearningPathsByUserId(user.id)
        pathCacheRef.current = allPaths.reduce<Record<string, LearningPathRecord>>((acc, record) => {
          acc[record.id] = record
          return acc
        }, {})
        pathCacheRef.current[imported.id] = imported
        setLearningPaths(
          sortLearningPathsByCreatedAt(
            allPaths.map((record) => ({
              id: record.id,
              userId: record.userId,
              title: record.id === imported.id ? imported.title : record.title,
              createdAt: record.createdAt,
              updatedAt: record.id === imported.id ? imported.updatedAt : record.updatedAt,
            })),
          ),
        )
        suppressAutosaveRef.current = true
        setActivePathId(imported.id)
        activePathIdRef.current = imported.id
        applyPathToState(imported)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lernpfad aus Chat konnte nicht vorbereitet werden.')
      } finally {
        navigate('/learn', { replace: true })
      }
    })()
  }, [applyPathToState, location.state, navigate, user])

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
      if (renameCloseTimerRef.current) {
        window.clearTimeout(renameCloseTimerRef.current)
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
              'Formuliere die Fragen so, dass bei vorhandenen Dateien klar erkennbar ist, ob der Lernende den FACHINHALT verstanden hat (Zuordnen, Begriffe, Kurztext, konkrete Rechen- oder Zuordnungsaufgaben). Prüfe den Sachinhalt selbst — nicht den Aufbau, die Auftragsnummern oder den Wortlaut der Aufgabenstellungen im Material.',
              'Der Test muss als interaktiver Quiz-JSON-Block mit mindestens 5 Fragen geliefert werden.',
              'Die ERSTE Frage muss Multiple-Choice (mcq) ODER Wahr/Falsch (true_false) sein — leichter Einstieg.',
              'Insgesamt mindestens 2 Multiple-Choice-Fragen (mcq), jede mit 3-5 Optionen.',
              'Mindestens 1 Freitext-Frage (questionType "text", evaluation "exact" oder "contains").',
              'Mindestens 1 Zuordnung (match), 1 Kategorisierung (categorize) ODER 1 Wahr/Falsch (true_false) zusätzlich zu den MCQs.',
              'Für Kategorisierungen setze questionType auf "categorize" und gib "categories" (2–4 Kategorien) sowie "items" (3–8 Begriffe) an; expectedAnswer = pro Begriff der Kategorie-Index in items-Reihenfolge, komma-getrennt (z. B. "0,1,0,1"). KEINE options bei categorize.',
              'Nutze categorize statt einer mcq mit kombinierten Paar-Optionen («A – B»), wenn Begriffe Klassen/Kategorien zugeordnet werden sollen (z. B. direkte vs. indirekte Steuer) — das ist klarer als eine MC-Frage mit «in dieser Reihenfolge».',
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
        setSyllabus([])
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
            content: buildEntryQuizReadyTutorMessage(parsedCleanText || ''),
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
    setSyllabus,
    setChapterBlueprints,
    setChapterSession,
  })

  usePostEntrySyllabusGeneration({
    activePathId,
    activePathTitle: activePath?.title ?? '',
    tutorState,
    targetChapterCount,
    syllabus,
    entryQuiz,
    entryQuizResult,
    effectiveTopic,
    selectedTopic,
    aiGuidance,
    proficiencyLevel,
    materials,
    getPrompt,
    setSyllabus,
    setLearningChapters,
    setTutorMessages,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setError,
  })

  const applySkillMasterySignal = useCallback(
    (payload: {
      source: 'chapter' | 'flashcard' | 'worksheet'
      skillId: string
      label: string
      correct: boolean
      /** Untere Schranke der Lernrate (Recency-Floor 0..1); reale Lernrate = max(weight, 1/(versuche+1)). */
      weight: number
    }) => {
      setChapterSession((prev) => {
        const map = { ...prev.skillMasteryBySkillId }
        const current = map[payload.skillId]
        const baseScore = current?.score ?? 0.5
        const priorAttempts = Math.max(0, current?.attempts ?? 0)
        const outcome = payload.correct ? 1 : 0
        // Attempts-gewichtetes Mittel mit Recency-Floor: frühe Versuche bewegen den Score stark,
        // später stabilisiert er sich (1/(n+1)), bleibt aber durch `weight` reaktionsfähig.
        const learningRate = Math.max(payload.weight, 1 / (priorAttempts + 1))
        const nextScore = clamp01(baseScore + learningRate * (outcome - baseScore))
        const normalizedPrompt = payload.label.trim().replace(/\s+/g, ' ').slice(0, 220)
        const lastWrongPrompts = [...(current?.lastWrongPrompts ?? [])]
        const lastCorrectPrompts = [...(current?.lastCorrectPrompts ?? [])]
        if (payload.correct) {
          if (normalizedPrompt.length > 0) {
            lastCorrectPrompts.unshift(normalizedPrompt)
          }
        } else if (normalizedPrompt.length > 0) {
          lastWrongPrompts.unshift(normalizedPrompt)
        }
        map[payload.skillId] = {
          score: nextScore,
          attempts: Math.max(0, (current?.attempts ?? 0) + 1),
          correct: Math.max(0, (current?.correct ?? 0) + (payload.correct ? 1 : 0)),
          label: payload.label,
          source: payload.source,
          lastWrongPrompts: lastWrongPrompts.slice(0, 6),
          lastCorrectPrompts: lastCorrectPrompts.slice(0, 6),
          wrongStreak: payload.correct ? 0 : Math.max(0, (current?.wrongStreak ?? 0) + 1),
          correctStreak: payload.correct ? Math.max(0, (current?.correctStreak ?? 0) + 1) : 0,
          lastWrongAt: payload.correct ? current?.lastWrongAt : new Date().toISOString(),
          lastCorrectAt: payload.correct ? new Date().toISOString() : current?.lastCorrectAt,
          lastUpdatedAt: new Date().toISOString(),
        }
        return {
          ...prev,
          skillMasteryBySkillId: map,
        }
      })
    },
    [],
  )

  const handleChapterQuestionEvaluatedForMastery = useCallback(
    (payload: { stepId: string; prompt: string; correct: boolean; answer: string; skillTag?: string }) => {
      applySkillMasterySignal({
        source: 'chapter',
        skillId: resolveConceptSkillId(payload.skillTag, () => toSkillIdFromText('chapter', payload.prompt)),
        label: payload.prompt,
        correct: payload.correct,
        weight: 0.35,
      })
    },
    [applySkillMasterySignal],
  )

  const { handleEvaluateCurrentChapterQuestion, handleNextChapterStep, handlePreviousChapterStep } = useChapterSessionFlow({
    effectiveChapterBlueprints,
    chapterSession,
    isEvaluatingChapterStep,
    setChapterSession,
    setIsEvaluatingChapterStep,
    setError,
    onQuestionEvaluated: handleChapterQuestionEvaluatedForMastery,
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

  const worksheetModalChapterTitle = useMemo(() => {
    if (worksheetModalChapterFilter === null) {
      return 'Lernblatt'
    }
    const blueprintTitle = effectiveChapterBlueprints[worksheetModalChapterFilter]?.title?.trim()
    if (blueprintTitle) {
      return blueprintTitle
    }
    const label = learningChapters[worksheetModalChapterFilter]?.trim()
    return label || `Kapitel ${worksheetModalChapterFilter + 1}`
  }, [worksheetModalChapterFilter, effectiveChapterBlueprints, learningChapters])

  const worksheetModalChapterLabel = useMemo(() => {
    if (worksheetModalChapterFilter === null) {
      return 'Kapitel 1'
    }
    return worksheetChapterDisplayLabel(worksheetModalChapterFilter, learningChapters)
  }, [learningChapters, worksheetModalChapterFilter])

  const worksheetChaptersForList = useMemo(() => {
    const map = new Map<number, LearnWorksheetItem[]>()
    for (const item of learnWorksheets) {
      if (
        typeof item.chapterIndex !== 'number' ||
        item.chapterIndex < MIXED_LEARN_MATERIAL_CHAPTER_INDEX
      ) {
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

  const worksheetCompletedChapters = useMemo(
    () => worksheetChaptersForList.filter(({ progress }) => progress.total > 0 && progress.isComplete),
    [worksheetChaptersForList],
  )

  const worksheetOpenChapters = useMemo(
    () => worksheetChaptersForList.filter(({ progress }) => !(progress.total > 0 && progress.isComplete)),
    [worksheetChaptersForList],
  )

  const tutorWorksheetChapterIndex = useMemo(
    () =>
      resolveWorksheetProgressChapterKey(
        chapterBlueprints,
        chapterSession,
        Math.max(0, unlockedChapterCount - 1),
      ),
    [chapterBlueprints, chapterSession, unlockedChapterCount],
  )

  const targetChapterIndexForOpen = Math.max(
    0,
    Math.min(unlockedChapterCount - 1, targetChapterCount - 1),
  )

  const chapterBlueprintReady = Boolean(chapterBlueprints[targetChapterIndexForOpen]?.steps?.length)

  const requiredWorksheetProgress = useMemo(() => {
    if (worksheetRequiredChapterIndex === null) {
      return null
    }
    const progressKey = resolveWorksheetProgressChapterKey(
      chapterBlueprints,
      chapterSession,
      worksheetRequiredChapterIndex,
    )
    return getWorksheetChapterProgress(learnWorksheets, progressKey)
  }, [chapterBlueprints, chapterSession, worksheetRequiredChapterIndex, learnWorksheets])

  const useMixedLearnMaterials = useMemo(
    () => shouldUseMixedLearnMaterial(chapterBlueprints, chapterSession),
    [chapterBlueprints, chapterSession],
  )

  const showRequiredWorksheetHint = Boolean(
    worksheetRequiredChapterIndex !== null &&
      requiredWorksheetProgress &&
      !requiredWorksheetProgress.isComplete,
  )

  const requiredWorksheetHintContent = useMemo(() => {
    if (
      worksheetRequiredChapterIndex === null ||
      !requiredWorksheetProgress ||
      requiredWorksheetProgress.isComplete
    ) {
      return null
    }
    if (requiredWorksheetProgress.total === 0) {
      return useMixedLearnMaterials ? (
        <>
          Kapitel abgeschlossen. Bitte erstelle jetzt ein Lernblatt zu deinen Schwachstellen im Tab{' '}
          <strong>Lernblätter</strong>, um weiterzumachen.
        </>
      ) : (
        <>
          Kapitel {worksheetRequiredChapterIndex + 1} abgeschlossen. Bitte erstelle jetzt das Lernblatt im Tab{' '}
          <strong>Lernblätter</strong>, um weiterzumachen.
        </>
      )
    }
    return (
      <>
        {useMixedLearnMaterials
          ? 'Pflicht-Lernblatt (Lernstand)'
          : `Pflicht-Lernblatt Kapitel ${worksheetRequiredChapterIndex + 1}`}
        : {requiredWorksheetProgress.evaluatedCount}/{requiredWorksheetProgress.total} Aufgaben geprüft. Bitte alle
        Aufgaben mit dem Kreis prüfen.
      </>
    )
  }, [
    requiredWorksheetProgress,
    useMixedLearnMaterials,
    worksheetRequiredChapterIndex,
  ])

  const flashcardSrStats = useMemo(() => getFlashcardSrStats(learnFlashcardSets), [learnFlashcardSets])

  const errorLogbookEntries = useMemo(
    () =>
      buildErrorLogbookEntries({
        entryQuiz,
        entryQuizAnswers,
        entryQuizResult,
        chapterBlueprints,
        chapterSession,
        learningChapters,
        learnWorksheets,
      }),
    [
      entryQuiz,
      entryQuizAnswers,
      entryQuizResult,
      chapterBlueprints,
      chapterSession,
      learningChapters,
      learnWorksheets,
    ],
  )
  const errorLogbookStats = useMemo(() => getErrorLogbookStats(errorLogbookEntries), [errorLogbookEntries])
  const [errorHintDismissedAtCount, setErrorHintDismissedAtCount] = useState<number | null>(null)

  useEffect(() => {
    if (!activePathId) {
      setErrorHintDismissedAtCount(null)
      return
    }
    setErrorHintDismissedAtCount(getErrorHintDismissedCount(activePathId))
  }, [activePathId])

  const showErrorLogbookHint = useMemo(
    () => shouldShowErrorLogbookHint(activePathId, errorLogbookStats.total),
    [activePathId, errorLogbookStats.total, errorHintDismissedAtCount],
  )

  const handleDismissErrorLogbookHint = useCallback(() => {
    if (!activePathId) {
      return
    }
    setErrorHintDismissed(activePathId, errorLogbookStats.total)
    setErrorHintDismissedAtCount(errorLogbookStats.total)
  }, [activePathId, errorLogbookStats.total])

  const flashcardsModalCards = useMemo(() => {
    if (flashcardsModalReviewMode === 'due') {
      return getDueFlashcardsFromSets(learnFlashcardSets)
    }
    if (!flashcardsModalSetId) {
      return []
    }
    return learnFlashcardSets.find((s) => s.id === flashcardsModalSetId)?.cards ?? []
  }, [flashcardsModalReviewMode, flashcardsModalSetId, learnFlashcardSets])

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
    const useMixed = shouldUseMixedLearnMaterial(chapterBlueprints, chapterSession)
    const outline = useMixed
      ? buildMixedLearnProgressOutline(
          chapterBlueprints,
          effectiveChapterBlueprints,
          chapterSession,
          learnFlashcardSets,
          learnWorksheets,
        )
      : buildLearnMaterialOutlineFromBlueprints(
          personalization,
          chapterBlueprints,
          effectiveChapterBlueprints,
          chapterSession,
          learnFlashcardSets,
          learnWorksheets,
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
      const newSet: LearnFlashcardSet = { id: crypto.randomUUID(), cards: initializeNewFlashcardSet(cards) }
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
    const useMixed = shouldUseMixedLearnMaterial(chapterBlueprints, chapterSession)
    const requestedSingleChapter =
      !useMixed && typeof targetChapterIndex === 'number' && targetChapterIndex >= 0
        ? effectiveChapterBlueprints[targetChapterIndex] ?? null
        : null
    const sourceChapterBlueprints = requestedSingleChapter ? [requestedSingleChapter] : chapterBlueprints
    const sourceEffectiveBlueprints = requestedSingleChapter ? [requestedSingleChapter] : effectiveChapterBlueprints
    const outline = useMixed
      ? buildMixedLearnProgressOutline(
          chapterBlueprints,
          effectiveChapterBlueprints,
          chapterSession,
          learnFlashcardSets,
          learnWorksheets,
        )
      : buildLearnMaterialOutlineFromBlueprints(
          personalization,
          sourceChapterBlueprints,
          sourceEffectiveBlueprints,
          chapterSession,
          learnFlashcardSets,
          learnWorksheets,
        )
    const outlineForApi = trimOutlineForWorksheetGeneration(
      personalization === 'personalized' && materials.length > 0
        ? mergeOutlineWithPersonalMaterialContext(
            outline,
            `${effectiveTopic} ${selectedTopic} Lernblatt Originalunterlagen`,
            materials,
          )
        : outline,
    )
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
      const chapterTag = useMixed
        ? MIXED_LEARN_MATERIAL_CHAPTER_INDEX
        : typeof targetChapterIndex === 'number'
          ? targetChapterIndex
          : fallbackChapterIndex
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
      setWorksheetError(e instanceof Error ? e.message : 'Lernblatt fehlgeschlagen.')
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
      const item = learnWorksheets.find((entry) => entry.id === itemId)
      applySkillMasterySignal({
        source: 'worksheet',
        skillId: resolveConceptSkillId(item?.skillTag, () =>
          toSkillIdFromText('worksheet', item?.prompt ?? itemId),
        ),
        label: item?.prompt ?? 'Arbeitsblatt-Aufgabe',
        correct: payload.correct,
        weight: 0.3,
      })
    },
    [applySkillMasterySignal, learnWorksheets, learningPaths],
  )

  const handleSubmitWorksheet = useCallback(() => {
    const nowIso = new Date().toISOString()
    const pathId = activePathIdRef.current
    const currentSummary = pathId ? learningPaths.find((e) => e.id === pathId) : undefined
    const title = getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad')

    setLearnWorksheets((prev) => {
      const targetIds = new Set(worksheetModalItems.map((item) => item.id))
      if (targetIds.size === 0) {
        return prev
      }
      const merged = prev.map((item) => {
        if (!targetIds.has(item.id)) {
          return item
        }
        const fallbackAnswer = typeof item.savedAnswer === 'string' ? item.savedAnswer.trim() : ''
        const persistedAnswer = fallbackAnswer.length > 0 ? fallbackAnswer : 'Abgegeben ohne Antworttext'
        return {
          ...item,
          savedAnswer: persistedAnswer,
          submittedAt: nowIso,
        }
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
    worksheetModalItems.forEach((item) => {
      const correct = item.lastCorrect === true
      applySkillMasterySignal({
        source: 'worksheet',
        skillId: resolveConceptSkillId(item.skillTag, () => toSkillIdFromText('worksheet', item.prompt)),
        label: item.prompt,
        correct,
        weight: 0.15,
      })
    })
  }, [applySkillMasterySignal, learningPaths, worksheetModalItems])

  const worksheetSubmittedCount = useMemo(
    () =>
      worksheetModalItems.filter(
        (item) => typeof item.submittedAt === 'string' && item.submittedAt.trim().length > 0,
      ).length,
    [worksheetModalItems],
  )

  const handleFlashcardSelfRating = useCallback(
    (cardId: string, rating: 'known' | 'unknown') => {
      const pathId = activePathIdRef.current
      const currentSummary = pathId ? learningPaths.find((e) => e.id === pathId) : undefined
      const title = getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad')

      setLearnFlashcardSets((prev) => {
        const currentCard = prev.flatMap((set) => set.cards).find((c) => c.id === cardId)
        const merged = prev.map((set) => ({
          ...set,
          cards: set.cards.map((c) => (c.id === cardId ? applyFlashcardReview(c, rating) : c)),
        }))
        if (pathId) {
          void updateLearningPathById(pathId, {
            title,
            learnFlashcardSets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        if (currentCard) {
          applySkillMasterySignal({
            source: 'flashcard',
            skillId: resolveConceptSkillId(currentCard.skillTag, () =>
              toSkillIdFromText('flashcard', currentCard.question),
            ),
            label: currentCard.question,
            correct: rating === 'known',
            weight: 0.25,
          })
        }
        return merged
      })
    },
    [applySkillMasterySignal, learningPaths],
  )

  useEffect(() => {
    if (!isSetupComplete || !entryQuizResult) {
      return
    }
    const maxPlannedCount = Math.max(1, Math.min(targetChapterCount, chapterBlueprints.length || targetChapterCount))
    const lastUnlockedIndex = Math.max(0, unlockedChapterCount - 1)
    const hasCompletedUnlockedChapter = chapterSession.completedChapterIndexes.includes(lastUnlockedIndex)
    const wsProgressKey = resolveWorksheetProgressChapterKey(
      chapterBlueprints,
      chapterSession,
      lastUnlockedIndex,
    )
    const wsStats = getWorksheetChapterProgress(learnWorksheets, wsProgressKey)
    const hasWorksheetItems = wsStats.total > 0
    const worksheetChapterComplete = wsStats.isComplete
    const worksheetMixed = shouldUseMixedLearnMaterial(chapterBlueprints, chapterSession)
    const nextChapterNumber = Math.min(maxPlannedCount, unlockedChapterCount + 1)
    let action: TutorChatEntry['action']
    let content = ''

    if (!hasCompletedUnlockedChapter) {
      action = 'start-next-chapter'
      content = buildTutorCoachMessage({
        kind: 'start-chapter',
        chapterNumber: lastUnlockedIndex + 1,
        entryScore: entryQuizResult.score,
        entryTotal: entryQuizResult.total,
      })
    } else if (!hasWorksheetItems) {
      action = 'create-worksheet'
      content = buildTutorCoachMessage({
        kind: 'need-worksheet',
        chapterNumber: lastUnlockedIndex + 1,
        mixed: worksheetMixed,
      })
    } else if (!worksheetChapterComplete) {
      action = 'create-worksheet'
      content = buildTutorCoachMessage({
        kind: 'worksheet-progress',
        chapterNumber: lastUnlockedIndex + 1,
        evaluatedCount: wsStats.evaluatedCount,
        total: wsStats.total,
        mixed: worksheetMixed,
      })
    } else if (unlockedChapterCount < maxPlannedCount) {
      action = 'start-next-chapter'
      content = buildTutorCoachMessage({
        kind: 'next-chapter',
        completedChapterNumber: lastUnlockedIndex + 1,
        nextChapterNumber,
      })
    } else {
      action = undefined
      content = buildTutorCoachMessage({ kind: 'all-done' })
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
    chapterBlueprints,
    chapterBlueprints.length,
    chapterSession,
    unlockedChapterCount,
    chapterSession.completedChapterIndexes,
    learnWorksheets,
  ])

  if (isLoading) {
    return embedded ? (
      <div className="learn-workspace-embedded learn-loading">Lade Lernbereich...</div>
    ) : (
      <main className="learn-loading">Lade Lernbereich...</main>
    )
  }

  if (!user) {
    return embedded ? null : <Navigate to="/login" replace />
  }

  function openLearningPathContextMenu(event: ReactMouseEvent, pathId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (isPendingLearningPathId(pathId)) {
      return
    }
    setOpenPathMenuId(pathId)
    setPathMenuPosition({
      x: event.clientX,
      y: event.clientY,
    })
  }

  function openRenameLearningPathModal(pathId: string) {
    const path = learningPaths.find((item) => item.id === pathId)
    if (!path || isPendingLearningPathId(pathId)) {
      return
    }
    setOpenPathMenuId(null)
    setPathMenuPosition(null)
    if (renameCloseTimerRef.current !== null) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }
    setRenamingPathId(pathId)
    setRenameDraft(getDisplayPathTitle(path.title))
    setIsRenameVisible(false)
    window.requestAnimationFrame(() => {
      setIsRenameVisible(true)
    })
  }

  function handleRenameSheetClosed() {
    if (renameCloseTimerRef.current !== null) {
      window.clearTimeout(renameCloseTimerRef.current)
      renameCloseTimerRef.current = null
    }
    setRenamingPathId(null)
    setIsRenameVisible(false)
  }

  function closeRenameLearningPathModal() {
    if (isMobileViewport()) {
      renameSheetRef.current?.requestClose()
      return
    }
    setIsRenameVisible(false)
    renameCloseTimerRef.current = window.setTimeout(() => {
      setRenamingPathId(null)
      renameCloseTimerRef.current = null
    }, LEARN_RENAME_MODAL_ANIMATION_MS)
  }

  async function handleRenameLearningPathSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renamingPathId || !renameDraft.trim()) {
      return
    }
    try {
      await handleRenameLearningPath(renamingPathId, renameDraft)
      if (isMobileViewport()) {
        renameSheetRef.current?.requestClose()
      } else {
        closeRenameLearningPathModal()
      }
    } catch {
      /* Fehlermeldung wird im Hook gesetzt */
    }
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
    const activePathIdAtStart = activePathId
    const targetChapterIndex = targetChapterIndexForOpen
    let blueprintToOpen = chapterBlueprints[targetChapterIndex] ?? null

    if (!blueprintToOpen?.steps?.length) {
      if (chapterGenerationInFlightRef.current) {
        return
      }
      if (isPostEntryPrepLoading) {
        setError('Lernplan wird noch erstellt — bitte kurz warten.')
        return
      }
      chapterGenerationInFlightRef.current = true
      const syllabusEntry = syllabus[targetChapterIndex]
      const chapterTopic = (
        syllabusEntry?.topic?.trim() ||
        learningChapters[targetChapterIndex]?.trim() ||
        selectedTopic ||
        effectiveTopic ||
        getDisplayPathTitle(activePath?.title ?? '')
      ).trim()
      const chapterLearningGoal = syllabusEntry?.learningGoal?.trim() ?? ''
      try {
        setError('Kapitel wird vorbereitet...')
        setChapterGenerationDebugRaw('')
        setIsChapterGenerationLoading(true)
        setChapterGenerationPercent(8)
        let sawAnyRawChapterResponse = false
        const chapterMaterialContext = formatRelevantMaterialContext(
          buildChapterMaterialSearchQuery(effectiveTopic || getDisplayPathTitle(activePath?.title ?? ''), selectedTopic, chapterTopic),
          materials,
          getChapterMaterialRagOptions(materials.length),
        )
        const entryQuizInsight = buildEntryQuizInsightForChapter(entryQuiz, entryQuizResult)
        const learnerStateSummary = buildLearnerStateInsight(chapterBlueprints, chapterSession)
        let validationHint = ''
        let generated: ChapterBlueprint[] = []
        for (let attempt = 1; attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }
          const chapterRequest: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: buildChapterGenerationUserPrompt({
              pathTitle: getDisplayPathTitle(activePath?.title ?? ''),
              chapterTopic,
              learningGoal: chapterLearningGoal,
              aiGuidance,
              proficiencyLevel,
              materialContext: chapterMaterialContext,
              entryQuizInsight,
              learnerStateSummary,
              validationHint,
              attempt,
              chapterNumber: targetChapterIndex + 1,
              totalChapters: targetChapterCount,
            }),
            createdAt: new Date().toISOString(),
          }
          let chapterTimeoutId: number | null = null
          const result = await Promise.race([
            sendMessage([chapterRequest], {
              systemPrompt: getPrompt('learn_tutor'),
              useLearnPathModel: true,
              learnTelemetryMode: 'learn_tutor',
              learnPathSystemPromptMode: 'tutor_only',
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
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }
          const rawResponse = result.assistantMessage.content
          const parsed = parseInteractiveContentWithFallback(rawResponse)
          setChapterGenerationDebugRaw(rawResponse)
          sawAnyRawChapterResponse = true
          const fromRaw = parseChapterBlueprintsFromText(rawResponse)
          const fromClean = parsed.cleanText ? parseChapterBlueprintsFromText(parsed.cleanText) : []
          const parsedChapter = (fromRaw.length > 0 ? fromRaw : fromClean)[0]
          if (!parsedChapter) {
            validationHint = 'Kein auslesbares Kapitel-JSON erhalten'
            continue
          }
          const validation = validateGeneratedChapter(parsedChapter)
          if (!validation.valid) {
            validationHint = validation.reason
            continue
          }
          generated = namespaceChapterStepIds(ensureMinimumChapterDepth([parsedChapter]), {
            chapterIndexOffset: targetChapterIndex,
          })
          break
        }
        const firstChapter = generated[0]
        if (!firstChapter) {
          if (!sawAnyRawChapterResponse) {
            setChapterGenerationDebugRaw('Kein nutzbarer Kapitel-JSON-Block in der KI-Antwort gefunden.')
          }
          setError('Kapitel konnte nicht erzeugt werden. Erneut versuchen.')
          return
        }
        if (activePathIdRef.current !== activePathIdAtStart) {
          return
        }
        setChapterGenerationPercent(100)
        setChapterBlueprints((prev) => {
          const next = [...prev]
          if (next.length <= targetChapterIndex) {
            while (next.length < targetChapterIndex) {
              next.push({
                id: `chapter-slot-${next.length}`,
                title: learningChapters[next.length]?.trim() || `Kapitel ${next.length + 1}`,
                steps: [],
              })
            }
            next.push(firstChapter)
          } else {
            next[targetChapterIndex] = firstChapter
          }
          return next
        })
        setLearningChapters((prev) => {
          const next = [...prev]
          while (next.length <= targetChapterIndex) {
            next.push('')
          }
          next[targetChapterIndex] =
            syllabus[targetChapterIndex]?.topic?.trim() || firstChapter.title
          return next
        })
        setChapterSession((prev) => ({
          ...prev,
          chapterIndex: targetChapterIndex,
          stepIndex: 0,
        }))
        setTutorState('chapter_learning')
        blueprintToOpen = firstChapter
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
        chapterGenerationInFlightRef.current = false
        setIsChapterGenerationLoading(false)
        setChapterGenerationPercent(0)
      }
    }

    if (activePathIdRef.current !== activePathIdAtStart) {
      return
    }

    if (!blueprintToOpen?.steps?.length) {
      return
    }

    setChapterSession((prev) => ({
      ...prev,
      chapterIndex: targetChapterIndex,
      stepIndex: prev.chapterIndex === targetChapterIndex ? prev.stepIndex : 0,
    }))
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
      const progressKey = resolveWorksheetProgressChapterKey(chapterBlueprints, chapterSession, ch)
      const prog = getWorksheetChapterProgress(learnWorksheets, progressKey)
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
    const progressKey = resolveWorksheetProgressChapterKey(chapterBlueprints, chapterSession, ch)
    const prog = getWorksheetChapterProgress(learnWorksheets, progressKey)
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
    setFlashcardsModalReviewMode('all')
    setFlashcardsDueSessionTotal(0)
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
    setFlashcardsModalReviewMode('all')
    setFlashcardsDueSessionTotal(0)
    setFlashcardsModalSetId(resolvedSetId)
    setFlashcardsModalFocusCardId(focusCardId === undefined ? null : focusCardId)
    setIsFlashcardsModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsFlashcardsModalVisible(true)
    })
  }

  function openErrorLogbookTab() {
    setActiveLearnTab('statistics')
  }

  function openDueFlashcardsReview() {
    const due = getDueFlashcardsFromSets(learnFlashcardSets)
    if (due.length === 0) {
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
    setFlashcardsModalReviewMode('due')
    setFlashcardsDueSessionTotal(due.length)
    setFlashcardsModalSetId(null)
    setFlashcardsModalFocusCardId(null)
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
  const hasExistingLearnContent =
    chapterBlueprints.length > 0 ||
    learningChapters.length > 0 ||
    Boolean(entryQuizResult) ||
    learnFlashcardSets.length > 0 ||
    learnWorksheets.length > 0 ||
    tutorMessages.length > 0
  const showSetupFlow = !isSetupComplete && !hasExistingLearnContent
  const workspaceDisplayPath =
    embedded && isSwitchingLearningPath && controlledPathId
      ? learningPaths.find((entry) => entry.id === controlledPathId) ?? activePath
      : activePath
  const isPathWorkspaceBusy =
    isSwitchingLearningPath ||
    (isLearningPathWorkspaceLoading && !learningPaths.some((path) => path.isPending))

  const learnWorkspaceMain = (
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
                  if (embedded && onOpenHostSidebar) {
                    onOpenHostSidebar()
                    return
                  }
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
                <p className="learn-mobile-topbar-title">{getDisplayPathTitle(workspaceDisplayPath?.title ?? 'Lernbereich')}</p>
              </div>
            </div>
          </div>
        </header>
        {learnFeatureInfoVisible ? <p className="chat-learn-feature-info">Noch nicht verfügbar</p> : null}
        <div className="learn-page-grid">
          <article
            className={`learn-card learn-workspace-card${
              activeLearnTab === 'path' && showErrorLogbookHint ? ' has-error-logbook-hint' : ''
            }`}
          >
            {learnAreaBannerEnabled && learnAreaBannerText.trim() ? (
              <LearnAreaAdminBanner text={learnAreaBannerText} />
            ) : null}
            <header className="learn-workspace-header">
              <span className="learn-workspace-title-icon" aria-hidden="true" />
              <h1 className="learn-page-title-text">{getDisplayPathTitle(workspaceDisplayPath?.title ?? '')}</h1>
            </header>
            {error ? <p className="error-text">{error}</p> : null}

            {isPathWorkspaceBusy ? (
              <div className="learn-path-workspace-loader" aria-busy="true">
                <ChatPendingReplyLoader statusLabel="Lernpfad wird vorbereitet …" />
              </div>
            ) : showSetupFlow ? (
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
                    <span className="learn-top-tab-label">Lernpfad</span>
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
                    <span className="learn-top-tab-label">Tests</span>
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
                    <span className="learn-top-tab-label">Lernkarten</span>
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--worksheets${activeLearnTab === 'worksheets' ? ' is-active' : ''}${
                      worksheetRequiredChapterIndex !== null ? ' has-attention' : ''
                    }`}
                    onClick={() => setActiveLearnTab('worksheets')}
                    aria-label="Lernblätter"
                  >
                    <img
                      className="ui-icon learn-top-tab-worksheets-icon"
                      src={activeLearnTab === 'worksheets' ? paperFilledIcon : paperOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="learn-top-tab-label">Lernblätter</span>
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--statistics${activeLearnTab === 'statistics' ? ' is-active' : ''}${
                      showErrorLogbookHint ? ' has-attention' : ''
                    }`}
                    onClick={() => setActiveLearnTab('statistics')}
                    aria-label={
                      showErrorLogbookHint
                        ? `Statistiken, ${errorLogbookStats.total} Lücken`
                        : 'Statistiken'
                    }
                  >
                    <img
                      className="ui-icon learn-top-tab-statistics-icon"
                      src={activeLearnTab === 'statistics' ? statisticsFilledIcon : statisticsOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="learn-top-tab-label">Statistiken</span>
                  </button>
                </nav>
                {showRequiredWorksheetHint && activeLearnTab !== 'worksheets' && requiredWorksheetHintContent ? (
                  <p className="learn-worksheet-required-hint">{requiredWorksheetHintContent}</p>
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
                    <>
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
                        chapterBlueprintReady={chapterBlueprintReady}
                        onCreateFlashcards={openTutorFlashcardsAction}
                        onCreateWorksheet={openTutorWorksheetAction}
                        learnWorksheets={learnWorksheets}
                        tutorWorksheetChapterIndex={tutorWorksheetChapterIndex}
                        syllabus={syllabus}
                        learningChapters={learningChapters}
                        effectiveTopic={effectiveTopic}
                        currentChapterIndex={currentChapterIndex}
                        unlockedChapterCount={unlockedChapterCount}
                        footer={
                          <>
                            {completedChaptersForShowcase.length > 0 ? (
                              <section className="learn-path-completed-showcase" aria-label="Erledigte Kapitel">
                                <button
                                  type="button"
                                  className="learn-path-completed-toggle"
                                  aria-expanded={isCompletedChaptersOpen}
                                  onClick={() => setIsCompletedChaptersOpen((prev) => !prev)}
                                >
                                  <span
                                    className={`learn-path-completed-toggle-arrow${
                                      isCompletedChaptersOpen ? ' is-open' : ''
                                    }`}
                                    aria-hidden="true"
                                  >
                                    ▶
                                  </span>
                                  <span className="learn-path-completed-toggle-title">Erledigt</span>
                                  <span className="learn-path-completed-toggle-line" aria-hidden="true" />
                                </button>
                                <div
                                  className={`learn-path-completed-panel${isCompletedChaptersOpen ? ' is-open' : ''}`}
                                  aria-hidden={!isCompletedChaptersOpen}
                                >
                                  <div className="learn-path-completed-panel-inner">
                                    <div className="learn-path-completed-grid" role="list">
                                      {completedChaptersForShowcase.map((chapter) => (
                                        <article
                                          key={`completed-${chapter.chapterIndex}`}
                                          className="learn-path-completed-card"
                                          role="listitem"
                                        >
                                          <p className="learn-path-completed-badge">Kapitel {chapter.chapterIndex + 1}</p>
                                          <p className="learn-path-completed-title">{chapter.title}</p>
                                          <p className="learn-path-completed-meta">
                                            {chapter.questionCount > 0
                                              ? `${chapter.questionCount} Fragen abgeschlossen`
                                              : 'Abgeschlossen'}
                                          </p>
                                        </article>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </section>
                            ) : null}
                          </>
                        }
                      />
                    </>
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
                      <PrimaryButton
                        type="button"
                        onClick={openDueFlashcardsReview}
                        disabled={flashcardSrStats.dueNow === 0}
                      >
                        {flashcardSrStats.dueNow > 0
                          ? `Heute wiederholen (${flashcardSrStats.dueNow})`
                          : 'Heute wiederholen'}
                      </PrimaryButton>
                      <SecondaryButton type="button" onClick={() => setLearnMaterialChoiceTarget('flashcards')}>
                        Neue Lernkarten
                      </SecondaryButton>
                    </div>
                    {flashcardSrStats.dueNow > 0 ? (
                      <button type="button" className="learn-flashcards-due-cta" onClick={openDueFlashcardsReview}>
                        <span className="learn-flashcards-due-cta-title">
                          Heute wiederholen · {flashcardSrStats.dueNow} Karte
                          {flashcardSrStats.dueNow === 1 ? '' : 'n'}
                        </span>
                        <span className="learn-flashcards-due-cta-meta">Spaced Repetition — fällige Karten jetzt durchgehen</span>
                      </button>
                    ) : flashcardSrStats.total > 0 ? (
                      <p className="learn-flashcards-sr-summary learn-muted">
                        Keine Karten heute fällig
                        {flashcardSrStats.scheduledLater > 0
                          ? ` · ${flashcardSrStats.scheduledLater} später geplant`
                          : ''}
                      </p>
                    ) : null}
                    <section className="learn-tests-list learn-flashcards-list-spaced" aria-label="Lernkarten Sets">
                      {learnFlashcardSets.length === 0 ? (
                        <p className="learn-muted">Noch keine Lernkarten vorhanden.</p>
                      ) : (
                        learnFlashcardSets.map((set, setIndex) => {
                          const total = set.cards.length
                          const dueInSet = set.cards.filter((c) => isFlashcardDue(c)).length
                          const known = set.cards.filter((c) => c.selfRating === 'known').length
                          const unknown = set.cards.filter((c) => c.selfRating === 'unknown').length
                          const fcStatus: 'open' | 'in_progress' | 'completed' =
                            total > 0 && dueInSet === 0 && known + unknown === total
                              ? 'completed'
                              : known > 0 || unknown > 0 || dueInSet > 0
                                ? 'in_progress'
                                : 'open'
                          const fcLabel =
                            dueInSet > 0
                              ? `${dueInSet} fällig`
                              : total > 0 && known + unknown === total
                                ? 'Geplant'
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
                                  {total} Karten
                                  {dueInSet > 0 ? ` · ${dueInSet} heute fällig` : ''}
                                  {known > 0 ? ` · ${known} gewusst` : ''}
                                  {unknown > 0 ? ` · ${unknown} nicht gewusst` : ''}
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
                      <article
                        className={`learn-stats-card${errorLogbookStats.total > 0 ? ' learn-stats-card--highlight' : ''}`}
                      >
                        <p className="learn-stats-card-value">{errorLogbookStats.total}</p>
                        <p className="learn-stats-card-label">Offene Lücken</p>
                      </article>
                      <article className="learn-stats-card learn-stats-card--highlight">
                        <p className="learn-stats-card-value">{flashcardSrStats.dueNow}</p>
                        <p className="learn-stats-card-label">Karten heute fällig</p>
                      </article>
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardSrStats.scheduledLater}</p>
                        <p className="learn-stats-card-label">Karten geplant</p>
                      </article>
                      <article className="learn-stats-card">
                        <p className="learn-stats-card-value">{flashcardSrStats.total}</p>
                        <p className="learn-stats-card-label">Lernkarten gesamt</p>
                      </article>
                    </div>
                    <LearnErrorLogbookPanel entries={errorLogbookEntries} stats={errorLogbookStats} />
                    <p className="learn-muted learn-stats-footnote">
                      Lernkarten: Nach «Gewusst» steigen die Intervalle (1, 3, 7, 14, 30 Tage). «Nicht gewusst» → morgen
                      wieder.
                    </p>
                  </section>
                ) : null}
                {activeLearnTab === 'worksheets' ? (
                  <section className="learn-tab-panel">
                    {showRequiredWorksheetHint && requiredWorksheetHintContent ? (
                      <p className="learn-worksheet-required-hint">{requiredWorksheetHintContent}</p>
                    ) : null}
                    <div className="learn-next-step-actions learn-next-step-actions--worksheets">
                      <PrimaryButton
                        type="button"
                        onClick={handleGenerateRequiredWorksheet}
                        disabled={worksheetRequiredChapterIndex === null || isGeneratingWorksheet}
                      >
                        {isGeneratingWorksheet
                          ? 'Lernblatt wird erstellt...'
                          : worksheetRequiredChapterIndex !== null && requiredWorksheetProgress
                            ? requiredWorksheetProgress.total === 0
                              ? useMixedLearnMaterials
                                ? 'Lernblatt (Lernstand)'
                                : `Lernblatt für Kapitel ${worksheetRequiredChapterIndex + 1}`
                              : requiredWorksheetProgress.isComplete
                                ? useMixedLearnMaterials
                                  ? 'Lernblatt (Lernstand) ansehen'
                                  : `Lernblatt Kapitel ${worksheetRequiredChapterIndex + 1} ansehen`
                                : `Lernblatt fortsetzen (${requiredWorksheetProgress.evaluatedCount}/${requiredWorksheetProgress.total})`
                            : 'Lernblatt'}
                      </PrimaryButton>
                    </div>
                    <section className="learn-tests-list learn-worksheets-list-spaced" aria-label="Lernblätter">
                      {worksheetChaptersForList.length === 0 ? (
                        <p className="learn-muted">Noch kein Lernblatt vorhanden.</p>
                      ) : (
                        worksheetOpenChapters.map(({ chapterIndex, progress }) => {
                          const chapterTitle = worksheetChapterDisplayLabel(chapterIndex, learningChapters)
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
                    {worksheetCompletedChapters.length > 0 ? (
                      <section className="learn-worksheets-completed" aria-label="Erledigte Lernblätter">
                        <button
                          type="button"
                          className="learn-path-completed-toggle"
                          aria-expanded={isCompletedWorksheetsOpen}
                          onClick={() => setIsCompletedWorksheetsOpen((prev) => !prev)}
                        >
                          <span
                            className={`learn-path-completed-toggle-arrow${
                              isCompletedWorksheetsOpen ? ' is-open' : ''
                            }`}
                            aria-hidden="true"
                          >
                            ▶
                          </span>
                          <span className="learn-path-completed-toggle-title">Erledigt</span>
                          <span className="learn-path-completed-toggle-line" aria-hidden="true" />
                        </button>
                        <div
                          className={`learn-path-completed-panel${isCompletedWorksheetsOpen ? ' is-open' : ''}`}
                          aria-hidden={!isCompletedWorksheetsOpen}
                        >
                          <div className="learn-path-completed-panel-inner">
                            <section className="learn-tests-list learn-worksheets-list-spaced" aria-label="Erledigte Lernblätter Liste">
                              {worksheetCompletedChapters.map(({ chapterIndex, progress }) => {
                                const chapterTitle = worksheetChapterDisplayLabel(chapterIndex, learningChapters)
                                return (
                                  <button
                                    key={`ws-done-${chapterIndex}`}
                                    type="button"
                                    className="learn-tests-list-item"
                                    onClick={() => openSavedWorksheetsModal(chapterIndex)}
                                  >
                                    <div className="learn-tests-list-item-main">
                                      <div className="learn-tests-list-item-heading">
                                        <p className="learn-tests-list-item-title">{chapterTitle}</p>
                                        <span className="learn-tests-status-badge is-completed">Abgeschlossen</span>
                                      </div>
                                      <p className="learn-tests-list-item-meta">
                                        {progress.evaluatedCount}/{progress.total} Aufgaben geprüft
                                      </p>
                                    </div>
                                  </button>
                                )
                              })}
                            </section>
                          </div>
                        </div>
                      </section>
                    ) : null}
                    <button
                      type="button"
                      className="learn-mobile-floating-create-pill"
                      onClick={handleGenerateRequiredWorksheet}
                      disabled={worksheetRequiredChapterIndex === null || isGeneratingWorksheet}
                    >
                      <img className="ui-icon learn-mobile-floating-create-pill-icon" src={addIcon} alt="" aria-hidden="true" />
                      {isGeneratingWorksheet
                        ? 'Lernblatt wird erstellt...'
                        : worksheetRequiredChapterIndex !== null && requiredWorksheetProgress
                          ? requiredWorksheetProgress.total === 0
                            ? useMixedLearnMaterials
                              ? 'Lernblatt (Lernstand)'
                              : `Lernblatt für Kapitel ${worksheetRequiredChapterIndex + 1}`
                            : requiredWorksheetProgress.isComplete
                              ? useMixedLearnMaterials
                                ? 'Lernblatt (Lernstand) ansehen'
                                : `Lernblatt Kapitel ${worksheetRequiredChapterIndex + 1} ansehen`
                              : `Lernblatt fortsetzen (${requiredWorksheetProgress.evaluatedCount}/${requiredWorksheetProgress.total})`
                          : 'Lernblatt'}
                    </button>
                  </section>
                ) : null}
              </>
            )}

            {activeLearnTab === 'path' && showErrorLogbookHint ? (
              <LearnErrorLogbookHintCard
                count={errorLogbookStats.total}
                onOpen={openErrorLogbookTab}
                onDismiss={handleDismissErrorLogbookHint}
              />
            ) : null}

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
              syllabus={syllabus}
            />
          </article>
        </div>
      </section>
  )

  const learnWorkspaceModals = (
    <>
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
                {learnMaterialChoiceTarget === 'worksheet' ? 'Lernblatt' : 'Lernkarten'}
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
        reviewMode={flashcardsModalReviewMode}
        dueSessionTotal={flashcardsDueSessionTotal}
      />
      <LearnWorksheetModal
        isMounted={isWorksheetModalMounted}
        isVisible={isWorksheetModalVisible}
        chapterTitle={worksheetModalChapterTitle}
        chapterLabel={worksheetModalChapterLabel}
        items={worksheetModalItems}
        isLoading={isGeneratingWorksheet}
        error={worksheetError}
        onClose={closeWorksheetModal}
        onItemEvaluated={handleWorksheetItemEvaluated}
        onSavedAnswerChange={handleWorksheetSavedAnswerChange}
        onSubmitWorksheet={handleSubmitWorksheet}
        submittedCount={worksheetSubmittedCount}
      />
      {isSettingsMounted ? (
        <ModalShell isOpen={isSettingsVisible} onRequestClose={closeSettingsModal}>
          <SettingsModal onClose={closeSettingsModal} />
        </ModalShell>
      ) : null}
      {openPathMenuId && pathMenuPosition ? (
        <PopoverContextMenu
          ref={pathMenuRef}
          open
          position={pathMenuPosition}
          onClose={() => {
            setOpenPathMenuId(null)
            setPathMenuPosition(null)
          }}
          ariaLabel="Lernpfad-Aktionen"
        >
          <MenuItem
            iconSrc={editIcon}
            onClick={() => {
              openRenameLearningPathModal(openPathMenuId)
            }}
          >
            Umbenennen
          </MenuItem>
          <MenuItem
            iconSrc={deleteIcon}
            danger
            onClick={() => {
              void handleDeleteLearningPath(openPathMenuId)
            }}
          >
            {'L\u00F6schen'}
          </MenuItem>
        </PopoverContextMenu>
      ) : null}
      {renamingPathId && isMobileViewport() ? (
        <RenameBottomSheet
          ref={renameSheetRef}
          open
          onClose={handleRenameSheetClosed}
          heading="Lernpfad bearbeiten"
          inputLabel="Name"
          inputId="learn-path-title-input"
          value={renameDraft}
          onChange={setRenameDraft}
          placeholder="Neuer Lernpfadname"
          onSubmit={handleRenameLearningPathSubmit}
        />
      ) : renamingPathId ? (
        <ModalShell isOpen={isRenameVisible} onRequestClose={closeRenameLearningPathModal}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Lernpfad umbenennen">
            <ModalHeader
              title="Lernpfad bearbeiten"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={closeRenameLearningPathModal}
              closeLabel="Lernpfad bearbeiten schließen"
            />
            <form className="rename-form" onSubmit={handleRenameLearningPathSubmit}>
              <label htmlFor="learn-path-title-input">Name</label>
              <input
                id="learn-path-title-input"
                type="text"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="Neuer Lernpfadname"
                maxLength={120}
                autoFocus
              />
              <div className="rename-actions">
                <SecondaryButton type="button" onClick={closeRenameLearningPathModal}>
                  Abbrechen
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={!renameDraft.trim()}>
                  Speichern
                </PrimaryButton>
              </div>
            </form>
          </section>
        </ModalShell>
      ) : null}
      {!embedded ? (
        <div
          className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-visible' : ''}`}
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}
    </>
  )

  if (embedded) {
    return (
      <div className="learn-workspace-embedded learn-shell">
        {learnWorkspaceMain}
        {learnWorkspaceModals}
      </div>
    )
  }

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
        isCreateLearningPathDisabled={
          isLearningPathWorkspaceLoading ||
          (!learnPathCreateEnabled && profile?.is_superadmin !== true)
        }
        isCreateLearningPathBusy={isLearningPathWorkspaceLoading}
        onCreateLearningPathDisabledClick={() => setLearnFeatureInfoVisible(true)}
        onOpenSettings={openSettingsModal}
        learningPaths={learningPaths}
        enteringPathIds={enteringLearningPathIds}
        activePathId={activePathId}
        openPathMenuId={openPathMenuId}
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
      {learnWorkspaceMain}
      {learnWorkspaceModals}
    </main>
  )
}




















