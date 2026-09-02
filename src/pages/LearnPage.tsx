import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import cardsOutlinedIcon from '../assets/icons/cards-outline.svg'
import cardsFilledIcon from '../assets/icons/cards-filled.svg'
import paperOutlinedIcon from '../assets/icons/paper-outlined.svg'
import paperFilledIcon from '../assets/icons/paper-filled.svg'
import statisticsOutlinedIcon from '../assets/icons/statistics-outlined.svg'
import statisticsFilledIcon from '../assets/icons/statistics-filled.svg'
import { RenameBottomSheet, type RenameBottomSheetHandle } from '../components/ui/bottom-sheet/RenameBottomSheet'
import { PopoverMenu } from '../components/ui/menu/PopoverMenu'
import { MenuItem } from '../components/ui/menu/MenuItem'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { MaskIcon } from '../components/ui/MaskIcon'
import { isMobileViewport } from '../utils/mobile'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { useAuth } from '../features/auth/context/useAuth'
import { getAppFeatureFlags } from '../features/auth/services/appFeatureFlags.service'
import { incrementMySubscriptionUsage } from '../features/auth/services/subscription.service'
import { useSystemPrompts } from '../features/systemPrompts/useSystemPrompts'
import {
  generateChatImageFromPrompt,
  generateLearnFlashcards,
  generateLearnWorksheet,
  sendMessage,
} from '../features/chat/services/chat.service'
import type { ChatMessage } from '../features/chat/types'
import {
  createLearningPathByUserId,
  type ChapterBlueprint,
  type ChapterSession,
  deleteEmptyLearningPathsByUserId,
  listLearningPathsByUserId,
  type EntryQuizResult,
  type LearnFlashcard,
  type LearnFlashcardSet,
  type LearnGenerationMode,
  type LearnTutorState,
  type LearnWorksheetItem,
  type LearningPathRecord,
  type LearningPathSummary,
  type SkillMasteryBySkillId,
  type SyllabusEntry,
  type TopicSession,
  type TutorChatEntry,
  type UploadedMaterial,
  updateLearningPathById,
} from '../features/learn/services/learn.persistence'
import { useAdaptiveChapterGeneration } from '../features/learn/hooks/useAdaptiveChapterGeneration'
import { useTopicSubstepOutline } from '../features/learn/hooks/useTopicStepGeneration'
import { useLearnWorkspaceDerived } from '../features/learn/hooks/useLearnWorkspaceDerived'
import { useLearningPathActions } from '../features/learn/hooks/useLearningPathActions'
import { useLearnSetupFlow } from '../features/learn/hooks/useLearnSetupFlow'
import { usePostEntrySyllabusGeneration } from '../features/learn/hooks/usePostEntrySyllabusGeneration'
import { useConceptIngestion, type ConceptGraphSnapshot } from '../features/learn/hooks/useConceptIngestion'
import { useCurriculumGeneration, type IngestionStatus } from '../features/learn/hooks/useCurriculumGeneration'
import { useConceptLearnerModel } from '../features/learn/hooks/useConceptLearnerModel'
import { useBrainPath } from '../features/learn/brain/hooks/useBrainPath'
import { BrainPathTab } from '../features/learn/brain/components/BrainPathTab'
import { BrainProgressRing } from '../features/learn/brain/components/BrainProgressRing'
import { BrainGoalChip } from '../features/learn/brain/components/BrainGoalChip'
import { BrainSession } from '../features/learn/brain/components/BrainSession'
import { BrainSessionSummary } from '../features/learn/brain/components/BrainSessionSummary'
import { useBrainSession } from '../features/learn/brain/hooks/useBrainSession'
import { useBrainReview } from '../features/learn/brain/hooks/useBrainReview'
import { useBrainExplanation } from '../features/learn/brain/hooks/useBrainExplanation'
import { BrainReviewTab } from '../features/learn/brain/components/BrainReviewTab'
import { BrainReviewStack } from '../features/learn/brain/components/BrainReviewStack'
import { BrainReviewCompletion } from '../features/learn/brain/components/BrainReviewCompletion'
import { BrainGoalDialog } from '../features/learn/brain/components/BrainGoalDialog'
import { buildSprintCard } from '../features/learn/brain/ui/sprintView'
import { BrainNodeEditor } from '../features/learn/brain/components/BrainNodeEditor'
import { BrainExplanationDialog } from '../features/learn/brain/components/BrainExplanationDialog'
import { BrainValueInfoDialog } from '../features/learn/brain/components/BrainValueInfoDialog'
import { BrainSourcesSection } from '../features/learn/brain/components/BrainSourcesSection'
import { BrainDerivedMaterialPanel } from '../features/learn/brain/components/BrainDerivedMaterialPanel'
import { useMaterialPreparation } from '../features/learn/brain/hooks/useMaterialPreparation'
import type { WorkbookItem } from '../features/learn/brain/agents/contracts'
import { buildSessionSummary, buildSessionView } from '../features/learn/brain/ui/sessionView'
import { buildPathHeader, type BrainValueTerm } from '../features/learn/brain/ui/pathView'
import { buildReviewCompletion, buildReviewOverview } from '../features/learn/brain/ui/reviewView'
import { buildMaterialSources } from '../features/learn/brain/ui/materialView'
import { statusForAnswer, type MapQuestionResponse } from '../features/learn/brain/ui/insightsView'
import { emptyImage } from '../features/learn/brain/memory/learnerImage'
import { dependentsOf, prerequisitesOf } from '../features/learn/brain/memory/knowledgeGraph'
import {
  acknowledgePattern,
  decideProposal,
  disputePattern,
} from '../features/learn/brain/services/brainConsolidation.persistence'
import { closeGoal, setGoal, updateGoalScope } from '../features/learn/brain/services/brainGoals.persistence'
import {
  applyAddPrerequisite,
  applyConceptMerge,
  applyRemovePrerequisite,
  renameConcept,
} from '../features/learn/brain/services/brainStructureOps'
import { stageChatPrefill } from '../features/chat/services/chatPrefill'
import { useAdaptiveEngine } from '../features/learn/hooks/useAdaptiveEngine'
import { useLearnCardStore } from '../features/learn/hooks/useLearnCardStore'
import { useConceptDirectives } from '../features/learn/hooks/useConceptDirectives'
import { normalizeConceptTag } from '../features/learn/utils/conceptTag'
import { isTransientAiFailure, aiBackoffDelayMs, sleep } from '../features/learn/utils/aiRetry'
import {
  prependConceptDirective,
  buildStepPlanDirective,
} from '../features/learn/utils/conceptConditioning'
import { useSessionCursorPersistence } from '../features/learn/hooks/useSessionCursorPersistence'
import {
  allTopicsMastered,
  masteredCount as masteredTopicCount,
} from '../features/learn/engine/sessionMachine'
import { adaptiveDeckOrder } from '../features/learn/engine/adaptiveDifficulty'
import type { PersistedCurriculum } from '../features/learn/services/learnCurriculum.persistence'
import {
  buildPlaceholderFlashcards,
  buildPlaceholderWorksheetItems,
  placeholderDelay,
} from '../features/learn/utils/learnPlaceholder'
import { useChapterSessionFlow } from '../features/learn/hooks/useChapterSessionFlow'
import {
  useLearningPathPersistence,
  type EditableLearningPathSnapshot,
} from '../features/learn/hooks/useLearningPathPersistence'
import { parseInteractiveContentWithFallback, type InteractiveQuizPayload } from '../features/chat/utils/interactiveQuiz'
import {
  extractLearningMaterialText,
  isChatVisionImageFile,
  LEARN_MATERIAL_EXCERPT_MAX_CHARS,
} from '../features/learn/utils/documentParser'
import { transcribeImageWithVision } from '../features/learn/services/visionTranscription'
import {
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  DEFAULT_CHAPTER_SESSION,
  buildChapterMaterialSearchQuery,
  buildSubstepContentFallback,
  buildSubstepContentPrompt,
  collectTopicWeakQuestionSteps,
  getChapterMaterialRagOptions,
  getDisplayPathTitle,
  sortLearningPathsByCreatedAt,
  getWorksheetChapterProgress,
  MIXED_LEARN_MATERIAL_CHAPTER_INDEX,
  parseChapterBlueprintsFromText,
  resolveWorksheetProgressChapterKey,
  shouldUseMixedLearnMaterial,
  topicMasteryScore,
  validateGeneratedSubstep,
  trimOutlineForWorksheetGeneration,
  worksheetChapterDisplayLabel,
} from '../features/learn/utils/learnPageHelpers'
import {
  formatRelevantMaterialContext,
  mergeOutlineWithPersonalMaterialContext,
} from '../features/learn/utils/ragLite'
import { fetchTavilySearchContext } from '../features/chat/services/tavilySearch.service'
import { namespaceChapterStepIds } from '../features/learn/utils/chapterStepIds'
import {
  buildFlashcardSourceFromBlueprints,
  buildLearnMaterialOutlineFromBlueprints,
  buildMixedLearnProgressOutline,
  buildSubstepCompletionWorksheetOutline,
  type LearnMaterialPersonalizationMode,
} from '../features/learn/utils/flashcardSourceFromBlueprints'
import { useLearnGamification } from '../features/learn/hooks/useLearnGamification'
import {
  XP_PER_CHAPTER_COMPLETED,
  XP_PER_CORRECT_ANSWER,
  XP_PER_FLASHCARD_REVIEW,
  XP_PER_MASTERED_TOPIC,
  type GamificationBadgeContext,
} from '../features/learn/utils/gamification'
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
import { buildTutorCoachMessage } from '../features/learn/utils/learnTutorCoachMessages'
import {
  applyFlashcardReview,
  getDueFlashcardsFromSets,
  getFlashcardSrStats,
  initializeNewFlashcardSet,
} from '../features/learn/utils/spacedRepetition'
import { LearnChapterWorkspace } from '../features/learn/components/LearnChapterWorkspace'
import { LearnPathOnboarding } from '../features/learn/components/LearnPathOnboarding'
import { LearnFlashcardsModal } from '../features/learn/components/LearnFlashcardsModal'
import { LearnWorksheetModal } from '../features/learn/components/LearnWorksheetModal'
import { LearnOverviewPanel } from '../features/learn/components/LearnOverviewPanel'
import { LearnSkillMasteryPanel } from '../features/learn/components/LearnSkillMasteryPanel'
import { ChatPendingReplyLoader } from '../features/chat/components/ChatPendingReplyLoader'
import { LearnPageSidebar } from '../features/learn/components/LearnPageSidebar'
import { useLearningPathListEnterAnimation } from '../features/learn/hooks/useLearningPathListEnterAnimation'
import { isPendingLearningPathId } from '../features/learn/utils/learnPageHelpers'
import { migrateLegacyChapterProgressToTopicSessions } from '../features/learn/utils/legacyProgressMigration'
import { buildTopicCorpora } from '../features/learn/utils/topicSessionCorpora'
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
/**
 * Quellenübergreifender Skill-Schlüssel: Wenn ein Konzept-Tag vorliegt, teilen sich alle Quellen
 * (Kapitel, Lernkarten, Arbeitsblatt) denselben `concept:`-Bucket → echte Aggregation pro Kompetenz.
 * Ohne Tag greift das bisherige Verhalten (textbasierter Schlüssel je Quelle).
 */
function resolveConceptSkillId(skillTag: string | undefined, fallback: () => string): string {
  const slug = normalizeConceptTag(skillTag)
  return slug ? `concept:${slug}` : fallback()
}

/**
 * Modul-weiter Cache für bereits geladene Lernpfad-Datensätze. `LearnPage` wird im eingebetteten
 * Chat-Modus bei jedem Schließen/Öffnen des Lernbereichs komplett neu gemountet (siehe ChatPage.tsx,
 * `{isLearnWorkspaceOpen ? <LearnPage .../> : null}`). Läge dieser Cache in einem komponentenlokalen
 * `useRef`, ginge er bei jedem Remount verloren — dadurch hielt die App bereits fertig generierte
 * Lernpfade beim erneuten Öffnen fälschlich für "neu" und zeigte kurz den "wird vorbereitet"-Backdrop.
 * Als Modul-Variable übersteht der Cache den Remount und wird nur bei echtem Logout geleert.
 */
const learningPathCacheStore: { current: Record<string, LearningPathRecord> } = { current: {} }

export type LearnPageProps = {
  /** Eingebettet im Chat-Hauptbereich (ohne eigene Learn-Sidebar). */
  embedded?: boolean
  /** Vom Host gesteuerte Pfad-ID (z. B. Chat-URL). */
  controlledPathId?: string | null
  onControlledPathIdChange?: (pathId: string) => void
  onOpenHostSidebar?: () => void
  pendingCreateLearningPath?: boolean
  /** Erstellmodus für den ausstehenden Create (Superadmin-Popover in der Chat-Sidebar). */
  pendingCreateLearningPathMode?: LearnGenerationMode
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
  pendingCreateLearningPathMode = 'ai',
  onPendingCreateLearningPathHandled,
  hostLearningPaths,
  setHostLearningPaths,
}: LearnPageProps = {}) {
  const MODAL_ANIMATION_MS = 220
  const CHAPTER_ON_DEMAND_TIMEOUT_MS = 480_000
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const gamification = useLearnGamification(user?.id)
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
  /*
   * Ziel-Schritt der Einrichtung (Schritt 3) — bewusst nur Termin und Zeit pro Tag, kein
   * Umfang: zum Zeitpunkt der Einrichtung existiert noch kein Konzept-Netz, aus dem sich ein
   * Umfang auswaehlen liesse. Der Umfang ist deshalb implizit „alles" — dasselbe, was ein frisch
   * angelegter Pfad ohnehin zeigen wuerde. `goalDueAt` leer heisst: kein Ziel gewuenscht.
   */
  const [pendingGoalDueAt, setPendingGoalDueAt] = useState('')
  const [pendingGoalMinutesPerDay, setPendingGoalMinutesPerDay] = useState(30)
  /*
   * Haelt die Einrichtung ueber das Ende von Schritt 3 hinaus „aktiv", bis das Konzept-Netz steht
   * (und das eingegebene Ziel, falls vorhanden, gesetzt ist). Ohne diese Bruecke wuerden direkt
   * nach „Einrichtung abschliessen" die alten Tabs samt drei leeren Bereichen erscheinen, obwohl
   * Ingestion und Curriculum-Generierung noch laufen.
   */
  const [isFreshSetupPending, setIsFreshSetupPending] = useState(false)
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [aiGuidance, setAiGuidance] = useState('')
  const [setupAnalysisPercent, setSetupAnalysisPercent] = useState(0)
  const [proficiencyLevel, setProficiencyLevel] = useState<'' | 'low' | 'medium' | 'high'>('')
  /** Legacy: Alt-Pfade, die den früheren path-weiten Einstiegstest noch absolviert haben. Wird nicht mehr
   *  generiert/angezeigt — nur noch für Rückwärtskompatibilität persistiert (siehe Konsolidierungs-Plan). */
  const [entryQuiz, setEntryQuiz] = useState<InteractiveQuizPayload | null>(null)
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
  /** Pfad-global: Kapitel-Modus, Landkarte-Modus und Arbeitsblätter schreiben gemeinsam hierher. */
  const [skillMasteryBySkillId, setSkillMasteryBySkillId] = useState<SkillMasteryBySkillId>({})
  /** Landkarte Phase 1: pro-Thema-Fortschritt (Diagnosetest + dynamische Zwischenschritte). Additiv zum Kapitel-Modell. */
  const [topicSessions, setTopicSessions] = useState<TopicSession[]>([])
  /** Neue Architektur (Schicht 1): das persistierte Konzept-Netz des aktiven Pfads (Ingestion). */
  const [conceptGraph, setConceptGraph] = useState<ConceptGraphSnapshot>({ concepts: [], edges: [] })
  /** Koordination Ingestion → Curriculum vs. Legacy-Fallback: 'running' (default) → 'ready' | 'absent'. */
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus>('running')
  /** Neue Architektur (Schicht 2): das persistierte Curriculum (Themen/Schritte). Speist den adaptiven Motor. */
  const [curriculum, setCurriculum] = useState<PersistedCurriculum>({ topics: [] })
  /** != null während ein Thema (Einstiegscheck/Analyse/Zwischenschritt) im Arbeitsbereich aktiv ist. */
  const [activeTopicFlowIndex, setActiveTopicFlowIndex] = useState<number | null>(null)
  /** Aktiver Zwischenschritt innerhalb des Themas; null = Einstiegscheck/Landing/Analyse (kein Substep gewählt). */
  const [activeSubstepIndex, setActiveSubstepIndex] = useState<number | null>(null)
  /** true nach Klick auf „Einstiegscheck starten" — schaltet vom Landing zur ersten Frage (transient, pro Thema). */
  const [entryCheckStarted, setEntryCheckStarted] = useState(false)
  /** Läuft, während der Vollinhalt eines Zwischenschritts lazy generiert wird. */
  const [isGeneratingSubstepContent, setIsGeneratingSubstepContent] = useState(false)
  /** Technischer Grund des letzten Zwischenschritt-Inhalt-Fehlschlags (für die sichtbare Fehlermeldung). */
  const [substepContentErrorReason, setSubstepContentErrorReason] = useState<string | null>(null)
  /** true, sobald der feste Flow eines Zwischenschritts durchlaufen ist — schaltet auf die Übungskarten-Phase. */
  const [isSubstepPracticePhase, setIsSubstepPracticePhase] = useState(false)
  /** Läuft, während das Übungskarten-Set eines Zwischenschritts lazy generiert wird. */
  const [isGeneratingSubstepPractice, setIsGeneratingSubstepPractice] = useState(false)
  /** true, sobald alle Übungskarten bewertet sind — schaltet auf das Abschluss-Arbeitsblatt (Pflicht). */
  const [isSubstepWorksheetPhase, setIsSubstepWorksheetPhase] = useState(false)
  /** Läuft, während das Abschluss-Arbeitsblatt eines Zwischenschritts lazy generiert wird. */
  const [isGeneratingSubstepWorksheet, setIsGeneratingSubstepWorksheet] = useState(false)
  const [isChapterModalMounted, setIsChapterModalMounted] = useState(false)
  const [isChapterModalVisible, setIsChapterModalVisible] = useState(false)
  /** Landkarte Phase 2: Vollbild-Kartenansicht, separates Overlay-Modal (kein Kapitel-Inhalt). */
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
  /* Nur noch der Setter wird gebraucht (Fortschrittsanzeige der alten Ansicht ist entfernt) — die
     Generierungslogik selbst schreibt weiter hierher, siehe die `setChapterGenerationPercent`-Aufrufe. */
  const [, setChapterGenerationPercent] = useState(0)
  const [worksheetRequiredChapterIndex, setWorksheetRequiredChapterIndex] = useState<number | null>(null)
  const [worksheetModalChapterFilter, setWorksheetModalChapterFilter] = useState<number | null>(null)
  /** Alternativer Filter für Abschluss-Arbeitsblätter eines Zwischenschritts (Landkarte-Modell) — schließt
   *  sich mit `worksheetModalChapterFilter` gegenseitig aus. */
  const [worksheetModalSubstepFilter, setWorksheetModalSubstepFilter] = useState<
    { topicIndex: number; substepIndex: number } | null
  >(null)
  const [learnMaterialChoiceTarget, setLearnMaterialChoiceTarget] = useState<null | 'flashcards' | 'worksheet'>(null)
  const [isEvaluatingChapterStep, setIsEvaluatingChapterStep] = useState(false)
  const [activeLearnTab, setActiveLearnTab] = useState<
    'path' | 'flashcards' | 'worksheets' | 'statistics'
  >('path')
  const activeLearnTabIndex =
    activeLearnTab === 'path'
      ? 0
      : activeLearnTab === 'flashcards'
        ? 1
        : activeLearnTab === 'worksheets'
          ? 2
          : 3
  /*
   * Richtung des zuletzt gewechselten Tabs — steuert, welche Kante der Akzentlinie schnell
   * „vorauseilt" und welche langsam nachzieht (siehe CSS: `[data-tab-direction]`). Ueber einen
   * Effekt statt an jeder einzelnen `setActiveLearnTab`-Stelle ermittelt, weil der Tab an vielen
   * Stellen im Code wechselt (Klick, Sprung aus einem Hinweis, Deep-Link) — ein Effekt erfasst
   * jede davon gleich.
   */
  const previousLearnTabIndexRef = useRef(activeLearnTabIndex)
  const [learnTabDirection, setLearnTabDirection] = useState<'forward' | 'backward'>('forward')
  useEffect(() => {
    const previous = previousLearnTabIndexRef.current
    if (activeLearnTabIndex !== previous) {
      setLearnTabDirection(activeLearnTabIndex > previous ? 'forward' : 'backward')
      previousLearnTabIndexRef.current = activeLearnTabIndex
    }
  }, [activeLearnTabIndex])
  const [isMobileTabsTouchActive, setIsMobileTabsTouchActive] = useState(false)
  const [isCompletedWorksheetsOpen, setIsCompletedWorksheetsOpen] = useState(false)
  const [isMobileSidebarButtonTouchActive, setIsMobileSidebarButtonTouchActive] = useState(false)
  const [flashcardsModalFocusCardId, setFlashcardsModalFocusCardId] = useState<string | null>(null)
  const [flashcardsModalSetId, setFlashcardsModalSetId] = useState<string | null>(null)
  const [flashcardsModalReviewMode, setFlashcardsModalReviewMode] = useState<'all' | 'due'>('all')
  const [flashcardsDueSessionTotal, setFlashcardsDueSessionTotal] = useState(0)
  /* Nur noch der Setter wird gebraucht (die alte Ladeanzeige, die diesen Wert las, ist entfernt) —
     `useLearnSetupFlow` und der Pfadwechsel schreiben weiter hierher, als Sperre fuer den
     Kapitel-Modal-Flow. */
  const [, setIsPostEntryPrepLoading] = useState(false)
  /* Nur noch die Setter werden gebraucht (Fortschrittsanzeige der alten Ansicht ist entfernt) —
     `useLearnSetupFlow` schreibt waehrend der Einrichtung weiter hierher. */
  const [, setPostEntryPrepStepIndex] = useState(0)
  const [, setPostEntryPrepPercents] = useState<number[]>([0, 0])
  const [showPathOnboarding, setShowPathOnboarding] = useState(false)
  const [openPathMenuId, setOpenPathMenuId] = useState<string | null>(null)
  const [pathMenuPosition, setPathMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const pathMenuRef = useRef<HTMLDivElement | null>(null)
  const [renamingPathId, setRenamingPathId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isRenameVisible, setIsRenameVisible] = useState(false)
  const renameSheetRef = useRef<RenameBottomSheetHandle | null>(null)
  const renameCloseTimerRef = useRef<number | null>(null)
  const LEARN_RENAME_MODAL_ANIMATION_MS = 220
  /*
   * Inline-Umbenennen im Seitentitel — bewusst getrennt vom Umbenennen-Menue in der Sidebar
   * (`renamingPathId` oben): dort oeffnet ein Klick ein Sheet/Modal, hier wird der Titel selbst
   * zum Eingabefeld. Zwei Wege zum selben Ziel, kein gemeinsamer Zustand.
   */
  const [isPathTitleEditing, setIsPathTitleEditing] = useState(false)
  const [pathTitleDraft, setPathTitleDraft] = useState('')
  const mobileTabsTouchStartRef = useRef<number>(0)
  const mobileTabsReleaseTimerRef = useRef<number | null>(null)
  const mobileSidebarButtonTouchStartRef = useRef<number>(0)
  const mobileSidebarButtonReleaseTimerRef = useRef<number | null>(null)
  const chapterModalCloseTimerRef = useRef<number | null>(null)
  const substepContentInFlightRef = useRef(false)
  const substepPracticeInFlightRef = useRef(false)
  const substepIllustrationInFlightRef = useRef(false)
  const substepWorksheetInFlightRef = useRef(false)
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
  const pathCacheRef = learningPathCacheStore
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

  /** Platzhalter-Modus (Admin-Test ohne API-Kosten): am Pfad fixiert; alle KI-Aufrufe im Lern-Flow
   *  werden clientseitig durch Mock-Daten ersetzt. */
  const generationMode: LearnGenerationMode =
    activePath?.generationMode ??
    (activePathId ? pathCacheRef.current[activePathId]?.generationMode : undefined) ??
    'ai'
  const effectiveTopic = selectedTopic.trim() || topic.trim()
  const setupAnalysisPercentClamped = Math.max(0, Math.min(100, Math.round(setupAnalysisPercent)))
  const setupAnalysisArcRadius = 44
  const setupAnalysisCircumference = 2 * Math.PI * setupAnalysisArcRadius
  const setupAnalysisArcRatio = 0.82
  const setupAnalysisArcLength = setupAnalysisCircumference * setupAnalysisArcRatio
  const setupAnalysisArcOffset =
    setupAnalysisArcLength * (1 - Math.max(0, Math.min(100, setupAnalysisPercent)) / 100)
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
    generationMode,
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
      syllabus,
      learningChapters,
      chapterBlueprints,
      chapterSession,
      topicSessions,
      skillMasteryBySkillId,
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
      topicSessions,
      skillMasteryBySkillId,
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
      setSkillMasteryBySkillId(record.skillMasteryBySkillId ?? {})
      setTopicSessions(record.topicSessions ?? [])
      setActiveTopicFlowIndex(null)
      setActiveSubstepIndex(null)
      setEntryCheckStarted(false)
      setIsAnalyzingSetupTopic(false)
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
      if (chapterModalCloseTimerRef.current) {
        window.clearTimeout(chapterModalCloseTimerRef.current)
        chapterModalCloseTimerRef.current = null
      }
      if (settingsCloseTimerRef.current) {
        window.clearTimeout(settingsCloseTimerRef.current)
        settingsCloseTimerRef.current = null
      }
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
    setPendingGoalDueAt('')
    setPendingGoalMinutesPerDay(30)
    setIsFreshSetupPending(false)
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
    setSkillMasteryBySkillId({})
    setTopicSessions([])
    setActiveTopicFlowIndex(null)
    setActiveSubstepIndex(null)
    setEntryCheckStarted(false)
    setLearnFlashcardSets([])
    setLearnWorksheets([])
    setIsChapterGenerationLoading(false)
    setChapterGenerationPercent(0)
    setWorksheetRequiredChapterIndex(null)
    setWorksheetModalChapterFilter(null)
    setFlashcardsModalFocusCardId(null)
    setFlashcardsModalSetId(null)
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
    topicSessions,
    skillMasteryBySkillId,
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

  const autoRemoveEmptyLearningPaths = profile?.auto_remove_empty_learning_paths ?? true

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

  const { handleContinueSetupStepOne, handleFinishSetup: startPostSetupGeneration } = useLearnSetupFlow({
    isUploading,
    isAnalyzingSetupTopic,
    materials,
    generationMode,
    setError,
    setIsAnalyzingSetupTopic,
    setSetupAnalysisPercent,
    setTopic,
    setSelectedTopic,
    setTopicSuggestions,
    setSetupStep,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setIsSetupComplete,
    setTargetChapterCount,
    setTutorState,
    setTutorMessages,
    setSyllabus,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
    setTopicSessions,
    setActiveTopicFlowIndex,
    setSkillMasteryBySkillId,
    })

  /** Schritt 2 (Thema) → Schritt 3 (Ziel). Schliesst die Einrichtung noch nicht ab. */
  const handleContinueSetupStepTwo = useCallback(() => {
    setSetupStep(3)
  }, [])

  const handleBackToStep2 = useCallback(() => {
    setSetupStep(2)
  }, [])

  /*
   * Schritt 3 (Ziel) abschliessen: haelt die Oberflaeche in Schritt 4 („wird vorbereitet"),
   * solange kein Tab etwas zum Zeigen haette, und stoesst danach die eigentliche Ingestion an.
   * `goalAppliedForPathRef` sorgt dafuer, dass das weiter unten stehende Anwenden des Ziels genau
   * einmal je frisch eingerichtetem Pfad laeuft.
   */
  const handleFinishSetup = useCallback(() => {
    goalAppliedForPathRef.current = null
    setIsFreshSetupPending(true)
    setSetupStep(4)
    startPostSetupGeneration()
  }, [startPostSetupGeneration])

  useEffect(() => {
    activePathIdRef.current = activePathId
  }, [activePathId])

  // Pfadwechsel: Ingestion-Status zuruecksetzen ('running'), bis die Ingestion ihn erneut setzt.
  // Verhindert, dass der Legacy-Fallback fuer einen neuen Pfad verfrueht auf 'absent' laeuft.
  useEffect(() => {
    setIngestionStatus('running')
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
    void handleCreateLearningPath(pendingCreateLearningPathMode).finally(() => {
      embeddedCreateInFlightRef.current = false
    })
  }, [
    embedded,
    handleCreateLearningPath,
    isLearningPathWorkspaceLoading,
    onPendingCreateLearningPathHandled,
    pendingCreateLearningPath,
    pendingCreateLearningPathMode,
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
    const worksheetProgressKey = resolveWorksheetProgressChapterKey(topicSessions, lastUnlockedIndex)
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
    topicSessions,
  ])

  /** Landkarte Phase 1: topicSessions 1:1 mit syllabus initialisieren, sobald der Lernplan feststeht. Alle Themen starten 'locked'.
   *  Direkt im Anschluss: alte, linear generierte Kapitel (chapterBlueprints/chapterSession) einmalig migrieren,
   *  sonst würde ein Pfad mit echtem klassischen Fortschritt auf der Karte fälschlich "alles gesperrt" zeigen
   *  (siehe legacyProgressMigration.ts). Migration ist idempotent, läuft also gefahrlos bei jedem Resize mit. */
  useEffect(() => {
    if (syllabus.length === 0) {
      return
    }
    setTopicSessions((prev) => {
      const resized =
        prev.length === syllabus.length
          ? prev
          : syllabus.map(
              (_, index): TopicSession =>
                prev[index] ?? {
                  topicIndex: index,
                  status: 'locked',
                  entryCheckBlueprint: null,
                  entryCheckSession: null,
                  substeps: [],
                },
            )
      const migrated = migrateLegacyChapterProgressToTopicSessions(chapterBlueprints, chapterSession, resized)
      if (migrated !== resized) {
        // Nur bei echter Legacy-Migration explizit persistieren — ein reiner Resize läuft über den
        // normalen Autosave-Pfad (topicSessions ist Teil von editableSnapshot).
        const pathId = activePathIdRef.current
        if (pathId && !isPendingLearningPathId(pathId)) {
          void updateLearningPathById(pathId, { topicSessions: migrated })
            .then((updated) => {
              pathCacheRef.current[pathId] = updated
            })
            .catch(() => {
              // Migration greift beim nächsten Laden erneut — kein Nutzerfluss-Blocker.
            })
        }
      }
      return migrated
    })
  }, [syllabus, chapterBlueprints, chapterSession])

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
      setPendingGoalDueAt('')
      setPendingGoalMinutesPerDay(30)
      setIsFreshSetupPending(false)
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
      setTopicSessions([])
      setActiveTopicFlowIndex(null)
      setLearnFlashcardSets([])
      setLearnWorksheets([])
      setIsChapterGenerationLoading(false)
      setChapterGenerationPercent(0)
      setWorksheetRequiredChapterIndex(null)
      setWorksheetModalChapterFilter(null)
      setFlashcardsModalFocusCardId(null)
      setIsAnalyzingSetupTopic(false)
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
        const records = await listLearningPathsByUserId(userId)

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

  // Referenzstabil, sonst startet der Generierungs-Effekt bei jedem Render neu (siehe Hook-Doku).
  const handlePathGenerationComplete = useCallback(() => {
    setShowPathOnboarding(true)
  }, [])

  const handleClosePathOnboarding = useCallback(() => {
    setShowPathOnboarding(false)
  }, [])

  usePostEntrySyllabusGeneration({
    activePathId,
    activePathTitle: activePath?.title ?? '',
    generationMode,
    tutorState,
    // Legacy-Syllabus-Generierung nur als Fallback: greift erst, wenn die Konzept-Ingestion
    // KEIN Netz liefern konnte ('absent'). Bei einem vorhandenen Netz uebernimmt useCurriculumGeneration.
    enabled: ingestionStatus === 'absent',
    targetChapterCount,
    syllabus,
    effectiveTopic,
    selectedTopic,
    materials,
    getPrompt,
    setSyllabus,
    setLearningChapters,
    setTutorMessages,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setError,
    onGenerationComplete: handlePathGenerationComplete,
  })

  // Neue Architektur — Schicht 1: Konzept-Netz aus dem Material generieren + persistieren (bzw. laden,
  // wenn bereits vorhanden). Additiv; beeinflusst den bestehenden Syllabus-/Themen-Flow (noch) nicht.
  useConceptIngestion({
    userId: user?.id ?? null,
    activePathId: activePathId || null,
    isSetupComplete,
    generationMode,
    materials,
    effectiveTopic,
    selectedTopic,
    getPrompt,
    hasExistingContent: syllabus.length > 0 || topicSessions.length > 0,
    onGraphReady: setConceptGraph,
    onStatus: setIngestionStatus,
  })

  // Neue Architektur — Schicht 2: sobald das Konzept-Netz bereit ist ('ready'), daraus ein
  // topologisch geordnetes, konzept-geclustertes Curriculum generieren + persistieren und die
  // bestehende Syllabus-/Landkarten-Anzeige daraus ableiten. Ersetzt bei vorhandenem Netz die
  // Legacy-Syllabus-Generierung (die dann via `enabled: false` schlaeft).
  useCurriculumGeneration({
    userId: user?.id ?? null,
    activePathId: activePathId || null,
    ingestionStatus,
    conceptGraph,
    topicHint: selectedTopic.trim() || effectiveTopic.trim(),
    generationMode,
    getPrompt,
    setSyllabus,
    setLearningChapters,
    setTargetChapterCount,
    setTutorMessages,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setError,
    onCurriculumReady: setCurriculum,
    onGenerationComplete: handlePathGenerationComplete,
  })

  // Neue Architektur — Schicht 3: BKT-Lerner-Modell. Laedt die persistierten Konzept-Zustaende (mit
  // Verfall) und liefert `applyConceptSignalByTag`, das jede ausgewertete Antwort als echtes BKT-Update
  // auf das getroffene Konzept anwendet + atomar persistiert. Graph-gated: greift nur bei vorhandenem Netz.
  const conceptLearnerModel = useConceptLearnerModel({
    userId: user?.id ?? null,
    activePathId: activePathId || null,
    conceptGraph,
  })
  const applyConceptSignalByTag = conceptLearnerModel.applyConceptSignalByTag

  /*
   * Gehirn-Architektur (straton-gehirn-architektur.md) — Datenhaushalt fuer den Pfad-Bereich.
   *
   * Laeuft parallel zum bestehenden Lernbereich, waehrend die Oberflaeche schrittweise umgebaut
   * wird: liegt fuer den Pfad noch kein Wissensgraph mit Lernerbild vor, bleibt `isAvailable`
   * falsch und die bisherige Ansicht steht unveraendert. Kein Bereich verschwindet, bevor sein
   * Nachfolger traegt.
   */
  const brainPath = useBrainPath({
    userId: user?.id ?? null,
    pathId: activePathId || null,
    /*
     * Geladen wird, sobald ein Pfad aktiv ist — nicht erst im Pfad-Tab.
     *
     * Das Gehirn speist inzwischen drei der vier Bereiche: Pfad, Wiederholen und die Quellenliste
     * im Material. Waere der Datenhaushalt an einen Tab gebunden, wechselte die Beschriftung
     * „Wiederholen" beim Hinsehen zurueck auf „Lernkarten", weil beim Tabwechsel kurz nichts
     * geladen ist. Ein Bereich, dessen Name springt, wirkt kaputt.
     */
    enabled: Boolean(activePathId),
  })

  const brainPathReload = brainPath.reload

  /*
   * Nach der Konzept-Ingestion einmal neu laden.
   *
   * `useBrainPath` laedt beim Aktivieren des Pfads — zu diesem Zeitpunkt existieren fuer einen
   * frisch eingerichteten Pfad noch keine Konzepte. Ohne diesen Anstoss bliebe `brainPath.data`
   * leer, obwohl die Ingestion laengst fertig ist und Zeilen in der Datenbank stehen.
   */
  const brainReloadedForPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activePathId || ingestionStatus === 'running') {
      return
    }
    if (brainReloadedForPathRef.current === activePathId) {
      return
    }
    brainReloadedForPathRef.current = activePathId
    brainPathReload()
  }, [activePathId, ingestionStatus, brainPathReload])

  /*
   * Schritt 3 der Einrichtung („Ziel") anwenden, sobald es etwas anzuwenden gibt.
   *
   * Der Ziel-Schritt fragt nur Termin und Zeit pro Tag ab — der Umfang (Kapitel 7: Termin,
   * Umfang, Zeit) existiert zu diesem Zeitpunkt noch nicht, weil das Konzept-Netz erst waehrend
   * Schritt 4 entsteht. Sobald es steht, wird der Umfang implizit auf „alles" gesetzt (dieselbe
   * Erwartung wie bei jedem frisch angelegten Pfad) und `isFreshSetupPending` faellt — genau
   * dieser Moment schaltet die Tabs frei (siehe `showSetupFlow` unten).
   */
  const goalAppliedForPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isFreshSetupPending || !activePathId) {
      return
    }
    const hasConcepts = brainPath.data.concepts.length > 0
    /*
     * Ausweichroute: schlaegt die Ingestion fehl oder findet nichts Auswertbares, meldet sie
     * `ingestionStatus === 'absent'` und spaetere Schichten laufen auf dem Legacy-Pfad (eigene,
     * bereits bestehende Ladeanzeige in den Tabs). Ohne diesen Fall bliebe die Einrichtung auf
     * Schritt 4 haengen, weil niemals Konzepte entstehen, auf die gewartet werden koennte.
     */
    const ingestionGaveUp = ingestionStatus === 'absent'
    if (!hasConcepts && !ingestionGaveUp) {
      return
    }
    if (goalAppliedForPathRef.current === activePathId) {
      return
    }
    goalAppliedForPathRef.current = activePathId

    const userId = user?.id
    const conceptIds = brainPath.data.concepts.map((concept) => concept.id)

    const release = () => {
      setPendingGoalDueAt('')
      setIsFreshSetupPending(false)
    }

    if (userId && pendingGoalDueAt && hasConcepts) {
      void setGoal({
        userId,
        pathId: activePathId,
        title: getDisplayPathTitle(effectiveTopic) || 'Lernziel',
        dueAt: new Date(`${pendingGoalDueAt}T23:59:59`).toISOString(),
        conceptIds,
        minutesPerDay: pendingGoalMinutesPerDay,
      })
        .then(() => brainPathReload())
        .catch(() => {
          // Das Ziel liess sich nicht setzen — die Einrichtung darf trotzdem nicht haengen bleiben.
          // Der Ziel-Chip zeigt danach „Ziel setzen"; die Person kann es von dort erneut versuchen.
        })
        .finally(release)
    } else {
      // Kein Ziel eingegeben, ODER die Ingestion gab auf: nichts, woran ein Ziel haengen koennte.
      release()
    }
  }, [
    isFreshSetupPending,
    activePathId,
    brainPath.data.concepts,
    ingestionStatus,
    user?.id,
    pendingGoalDueAt,
    pendingGoalMinutesPerDay,
    effectiveTopic,
    brainPathReload,
  ])

  /*
   * Die Lernsitzung des Gehirns (UI-Spezifikation Kapitel 4).
   *
   * Der Quellenauszug kommt aus dem Konzept selbst: `sourceQuote` traegt den woertlichen Beleg aus
   * dem Material (Invariante I4), die Beschreibung ergaenzt den Zusammenhang. Damit hat der
   * Kontrolleur etwas zum Abgleichen, ohne dass die Sitzung das gesamte Material nachladen muss —
   * und was kein Konzept belegen kann, kommt nach I5 ohnehin nicht durch das Tor.
   *
   * Zusaetzlich zum eigenen Beleg werden die Belege direkt verbundener Konzepte angehaengt
   * (Voraussetzungsgraph, Kapitel 4.1): eine Definition kann beim Kartieren bei einem
   * Nachbarkonzept gelandet sein, obwohl eine Aufgabe zu DIESEM Konzept sie voraussetzt — z. B.
   * definiert "Steuerbares Einkommen" den Begriff, den eine Zuordnungsaufgabe zu "Abzuege"
   * braucht. Ohne die Nachbarn scheitert der Quellenabgleich (I5) an einer Grenze, die nur beim
   * Kartieren gezogen wurde, nicht im Material selbst existiert. Bleibt ausschliesslich Material
   * aus dem eigenen Dokument — nur ueber die Konzeptgrenze hinweg, kein Allgemeinwissen von
   * aussen. `prerequisitesOf`/`dependentsOf` sind reine, bereits getestete Graph-Abfragen aus dem
   * Gehirn selbst (`memory/knowledgeGraph.ts`) — hier nur aufgerufen, nicht neu gebaut.
   */
  const brainSourceExcerptFor = useCallback(
    (conceptId: string) => {
      const concept = brainPath.data.concepts.find((entry) => entry.id === conceptId)
      if (!concept) {
        return ''
      }
      const own = [concept.sourceQuote, concept.description].filter((part) => part.trim().length > 0).join('\n\n')

      const neighborIds = new Set([
        ...prerequisitesOf(brainPath.data.edges, conceptId),
        ...dependentsOf(brainPath.data.edges, conceptId),
      ])
      const neighborExcerpts = [...neighborIds].flatMap((neighborId) => {
        const neighbor = brainPath.data.concepts.find((entry) => entry.id === neighborId)
        if (!neighbor) {
          return []
        }
        const text = [neighbor.sourceQuote, neighbor.description].filter((part) => part.trim().length > 0).join('\n\n')
        return text.length > 0 ? [`Verwandtes Konzept „${neighbor.name}":\n${text}`] : []
      })

      /*
       * Der eigentliche Materialauszug — die Stelle im hochgeladenen Dokument selbst, nicht nur
       * ihre Zusammenfassung in der Konzeptkarte.
       *
       * Ohne ihn bestand das „Quellmaterial" fuer Kontrolleur und Generator aus `sourceQuote`
       * (ein einzelnes Zitat) und `description` — zusammen wenige Saetze. Das reicht, um EINE
       * Aussage zu belegen, aber nicht, um eine Aufgabe zu beurteilen: Der Kontrolleur konnte
       * Ablenker einer Auswahlfrage weder bestaetigen noch widerlegen und lehnte fachlich
       * einwandfreie Aufgaben ab; der Generator wich bei Zuordnungen auf Beschreibungen ueber den
       * TEXT aus („im Text genannte Beispiele fuer …") statt ueber die Sache, weil er zu den
       * Begriffen keine Definitionen vorfand.
       *
       * Das widerspricht I5 nicht, es erfuellt sie erst: Kapitel 3 nennt „das hochgeladene
       * Material" als Anker, und genau das steht hier jetzt. Bisher wurde gegen eine Rekonstruktion
       * geprueft, jetzt gegen die Quelle. Der eigene Beleg bleibt zuerst und bleibt als solcher
       * benannt — er ist die Verankerung nach I4, der Rest ist Kontext zu ihrer Beurteilung.
       *
       * `formatRelevantMaterialContext` ist derselbe Abruf, den der Lernmotor an sechs anderen
       * Stellen nutzt; hier nur mit dem Konzept als Suchanfrage.
       */
      const materialContext = formatRelevantMaterialContext(
        [concept.name, concept.description].filter((part) => part.trim().length > 0).join(' '),
        materials,
        /*
         * `grounding`: Gegen diesen Auszug prueft der Kontrolleur (I5). Ohne diese Angabe fuellt
         * die Suche freie Plaetze mit den ersten Absaetzen unbeteiligter Dateien auf und gewichtet
         * den Dateinamen — beides gemessen schaedlich, sobald mehr als eine Datei im Pfad liegt.
         */
        { maxChunks: 6, maxChars: 4000, denseChunks: true, purpose: 'grounding' },
      )

      return [
        own,
        ...neighborExcerpts,
        materialContext.trim().length > 0 ? `Weiterer Materialkontext:\n${materialContext}` : '',
      ]
        .filter((part) => part.trim().length > 0)
        .join('\n\n')
    },
    [brainPath.data.concepts, brainPath.data.edges, materials],
  )

  /*
   * Websuche fuer das Gehirn (`GenerateTaskArgs.searchWeb`).
   *
   * Wird ausschliesslich dann aufgerufen, wenn der Kontrolleur festgestellt hat, dass das Material
   * die Frage stellt, ohne sie zu beantworten — also bei einem Dossier oder Arbeitsheft. Im
   * Normalfall laeuft sie nie: dort ist das Material die Wahrheitsquelle, und eine Suche waere
   * sowohl fachlich falsch als auch eine Verschwendung des Websuche-Guthabens.
   *
   * Zwei Sparmassnahmen, weil jede Suche Guthaben kostet:
   *  - Ergebnisse werden je Suchanfrage fuer die Lebensdauer der Seite gemerkt. Ein Konzept, das in
   *    mehreren Aufgaben derselben Sitzung vorkommt, sucht nur einmal.
   *  - Ein Fehlschlag (auch aufgebrauchtes Guthaben) wird als leeres Ergebnis gemerkt und nicht
   *    erneut versucht. Die Erzeugung faellt dann auf das Fachwissen des Modells zurueck, statt die
   *    Sitzung mit einer Fehlermeldung anzuhalten.
   */
  const brainWebSearchCacheRef = useRef(new Map<string, Promise<string>>())
  const brainSearchWeb = useCallback(async (query: string) => {
    const key = query.trim().slice(0, 500)
    if (!key) {
      return ''
    }
    const cached = brainWebSearchCacheRef.current.get(key)
    if (cached) {
      return cached
    }
    const pending = fetchTavilySearchContext(key)
      .then((result) => result.contextText)
      .catch(() => '')
    brainWebSearchCacheRef.current.set(key, pending)
    return pending
  }, [])

  const brainSubject = getDisplayPathTitle(activePath?.title ?? '') || 'Allgemein'

  /*
   * Fortschrittsring und Ziel-Chip im Seitentitel (UI-Spezifikation 3.1) — gelten fuer den ganzen
   * Pfad, nicht nur fuer den Pfad-Tab, deshalb hier statt in `BrainPathTab` berechnet.
   */
  const brainPathHeaderNowIso = useMemo(
    () => new Date().toISOString(),
    [brainPath.data.concepts, brainPath.data.images],
  )
  const brainPathHeader = useMemo(
    () =>
      buildPathHeader({
        concepts: brainPath.data.concepts,
        images: brainPath.data.images,
        goal: brainPath.data.goal,
        nowIso: brainPathHeaderNowIso,
      }),
    [brainPath.data.concepts, brainPath.data.images, brainPath.data.goal, brainPathHeaderNowIso],
  )

  const brainSession = useBrainSession({
    userId: user?.id ?? null,
    pathId: activePathId || null,
    concepts: brainPath.data.concepts,
    edges: brainPath.data.edges,
    images: brainPath.data.images,
    sourceExcerptFor: brainSourceExcerptFor,
    searchWeb: brainSearchWeb,
    subject: brainSubject,
    generationMode,
  })

  /*
   * Aufbereitung (Schicht 0): aus jedem hochgeladenen Arbeitsheft wird einmal Lehrstoff.
   *
   * Laeuft VOR der Konzeptbildung und vor jeder Aufgabe — siehe den Kopf von
   * `brain/preparation/derive.ts`. Die erkannten Punkte werden im Zustand gehalten, damit die
   * Anzeige die Herkunft je Antwort zeigen kann; der Lehrtext selbst haengt am Material.
   */
  const [derivedItems, setDerivedItems] = useState<Record<string, WorkbookItem[]>>({})

  const materialPreparation = useMaterialPreparation({
    pathId: activePathId || null,
    isSetupComplete,
    materials,
    searchWeb: brainSearchWeb,
    onItems: useCallback((materialId: string, items: WorkbookItem[]) => {
      setDerivedItems((current) => ({ ...current, [materialId]: items }))
    }, []),
    onMaterialsChanged: useCallback((next: UploadedMaterial[]) => {
      setMaterials(next)
    }, []),
  })

  const derivedMaterials = useMemo(
    () => materials.filter((material) => material.origin === 'derived' && material.excerpt.trim()),
    [materials],
  )

  /**
   * Eine Korrektur am abgeleiteten Lehrstoff speichern.
   *
   * Geht denselben Weg wie jede andere Materialaenderung: der Text steht im Material, und alles
   * Weitere — Materialsuche, Kontrolleur, Generator — liest ihn von dort. Es gibt bewusst keinen
   * zweiten Speicherort fuer „korrigierte" Fassungen; eine Korrektur IST der Lehrstoff.
   */
  const saveDerivedMaterial = useCallback(
    async (materialId: string, text: string) => {
      if (!activePathId) {
        return
      }
      const next = materials.map((material) =>
        material.id === materialId ? { ...material, excerpt: text, size: text.length } : material,
      )
      await updateLearningPathById(activePathId, { materials: next })
      setMaterials(next)
    },
    [activePathId, materials],
  )

  const brainSessionView = useMemo(
    () =>
      buildSessionView({
        tasks: brainPath.plan?.tasks ?? [],
        concepts: brainPath.data.concepts,
        images: brainPath.data.images,
        dueReasons: brainPath.dueReasons,
        // Kaltstart, solange zu keinem Konzept des Pfads direkte Evidenz vorliegt (Kapitel 10).
        inColdStart: [...brainPath.data.images.values()].every((image) => image.directEvidenceCount === 0),
      }),
    [brainPath.plan, brainPath.data.concepts, brainPath.data.images, brainPath.dueReasons],
  )

  const brainSessionSummary = useMemo(() => {
    const startedAt = brainSession.state.startedAt
    const minutes = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 60_000 : 0
    return buildSessionSummary({
      before: brainSession.state.imagesBefore,
      after: brainSession.state.imagesAfter,
      concepts: brainPath.data.concepts,
      events: brainSession.state.events,
      // Der naechste Schritt traegt bereits seine Begruendung (I8) — hier wird nichts neu erfunden.
      nextStep: brainPath.plan?.tasks[0]?.reason ?? '',
      minutes,
      nowIso: new Date().toISOString(),
    })
  }, [brainSession.state, brainPath.data.concepts, brainPath.plan])

  const isBrainSessionOpen =
    brainSession.state.phase !== 'idle' && brainSession.state.phase !== 'finished'
  const isBrainSummaryOpen = brainSession.state.phase === 'finished'

  /*
   * Der Wiederholungsstapel (UI-Spezifikation Kapitel 5).
   *
   * Eigener Hook neben der Sitzung, weil die beiden verschiedene Zustaendigkeiten bedienen
   * (Kapitel 5.1): der Pfad arbeitet an Fehlern und Luecken, der Stapel gegen den Verfall. Ein
   * gemeinsamer Zustand haette die Grenze zu einer Einstellung gemacht, die man versehentlich
   * anders setzt.
   */
  const brainReview = useBrainReview({
    userId: user?.id ?? null,
    pathId: activePathId || null,
    concepts: brainPath.data.concepts,
    edges: brainPath.data.edges,
    images: brainPath.data.images,
    sourceExcerptFor: brainSourceExcerptFor,
    searchWeb: brainSearchWeb,
    subject: brainSubject,
    generationMode,
  })

  const brainExplanation = useBrainExplanation({ sourceExcerptFor: brainSourceExcerptFor })

  /*
   * Der Sprint-Hinweis (Kapitel 6.3). Gezeigt wird er am Fuss der Jetzt-Karte (`BrainPathTab`) —
   * er sagt, WORAUS diese Karte gerade schoepft. Berechnet wird er hier, weil das „Nicht jetzt"
   * unten einen Tabwechsel ueberleben soll und der Pfad-Tab dabei abgeraeumt wird.
   *
   * „Nicht jetzt" beim Rueckhol-Angebot.
   *
   * Bewusst nur fuer diese Ansicht gemerkt und nicht persistiert: das Angebot ist kein Vorschlag
   * mit Frist, sondern eine Beobachtung ueber den aktuellen Stand. Wer morgen wieder vorne liegt,
   * soll es wieder angeboten bekommen — ein dauerhaftes Nein waere hier ein Nachteil ohne Nutzen.
   */
  const [isSprintOfferDismissed, setIsSprintOfferDismissed] = useState(false)

  const brainSprintNotice = useMemo(() => {
    const card = buildSprintCard({
      concepts: brainPath.data.concepts,
      edges: brainPath.data.edges,
      images: brainPath.data.images,
      goal: brainPath.data.goal,
      nowIso: new Date().toISOString(),
    })
    return isSprintOfferDismissed && card.kind === 'headroom' ? { kind: 'none' as const } : card
  }, [
    brainPath.data.concepts,
    brainPath.data.edges,
    brainPath.data.images,
    brainPath.data.goal,
    isSprintOfferDismissed,
  ])

  const brainReviewOverview = useMemo(
    () =>
      buildReviewOverview({
        images: brainPath.data.images.values(),
        concepts: brainPath.data.concepts,
        goal: brainPath.data.goal,
        nowIso: new Date().toISOString(),
      }),
    [brainPath.data.images, brainPath.data.concepts, brainPath.data.goal],
  )

  const brainReviewCompletion = useMemo(
    () =>
      buildReviewCompletion({
        images: brainReview.state.touched,
        concepts: brainPath.data.concepts,
        nowIso: new Date().toISOString(),
      }),
    [brainReview.state.touched, brainPath.data.concepts],
  )

  const brainSources = useMemo(
    () => buildMaterialSources(brainPath.data.concepts),
    [brainPath.data.concepts],
  )

  const isBrainStackOpen = brainReview.state.phase !== 'idle' && brainReview.state.phase !== 'finished'
  const isBrainStackDone = brainReview.state.phase === 'finished'

  const [isBrainGoalOpen, setIsBrainGoalOpen] = useState(false)
  const [brainEditorConceptId, setBrainEditorConceptId] = useState<string | null>(null)
  /** Werterklaerung im Knoten-Panel (Kapitel 3.6) — welcher der drei Werte gerade erklaert wird. */
  const [brainValueInfoTerm, setBrainValueInfoTerm] = useState<BrainValueTerm | null>(null)
  const [brainActionError, setBrainActionError] = useState<string | null>(null)
  const [isBrainActionBusy, setIsBrainActionBusy] = useState(false)

  /*
   * Ein Weg fuer alle schreibenden Handkorrekturen.
   *
   * Jede von ihnen aendert Struktur oder Ziel und macht damit den geladenen Stand veraltet — ein
   * Neuladen ist deshalb Teil der Handlung und keine Nachbereitung. Ohne das stuende nach einer
   * Verschmelzung noch beides in der Liste, und der naechste Klick liefe auf ein geloeschtes
   * Konzept.
   */
  const runBrainAction = useCallback(
    async (action: () => Promise<void>) => {
      setIsBrainActionBusy(true)
      setBrainActionError(null)
      try {
        await action()
        brainPath.reload()
      } catch (cause) {
        setBrainActionError(cause instanceof Error ? cause.message : 'Das hat gerade nicht geklappt.')
      } finally {
        setIsBrainActionBusy(false)
      }
    },
    [brainPath],
  )

  const brainImageFor = useCallback(
    (conceptId: string) => {
      const concept = brainPath.data.concepts.find((entry) => entry.id === conceptId)
      return (
        brainPath.data.images.get(conceptId) ?? emptyImage(conceptId, concept?.difficulty ?? 0.5)
      )
    },
    [brainPath.data.concepts, brainPath.data.images],
  )

  /*
   * Sprint (Kapitel 6.3): der Nutzer beantwortet den Umfangsvorschlag.
   *
   * Beide Antworten setzen die Zieltiefe auf `recognize` — auch „alles behalten". Das ist Stufe 2
   * der Leiter des Verzichts („erst flacher, dann weniger") und gilt unabhaengig davon, ob jemand
   * ein Konzept hergeben will. Es ist zugleich die Merkung, DASS geantwortet wurde: solange dort
   * noch `apply` steht, zeigt `buildSprintCard` den Vorschlag erneut.
   */
  const handleSprintScope = useCallback(
    (conceptIds: string[]) => {
      const goalId = brainPath.data.goal?.id
      if (!goalId || conceptIds.length === 0) {
        return
      }
      void runBrainAction(() => updateGoalScope({ goalId, conceptIds, targetDepth: 'recognize' }))
    },
    [brainPath.data.goal?.id, runBrainAction],
  )

  const handleKeepFullScope = useCallback(() => {
    const goalId = brainPath.data.goal?.id
    if (!goalId) {
      return
    }
    void runBrainAction(() =>
      updateGoalScope({
        goalId,
        conceptIds: brainPath.data.concepts.map((concept) => concept.id),
        targetDepth: 'recognize',
      }),
    )
  }, [brainPath.data.goal?.id, brainPath.data.concepts, runBrainAction])

  /** „Im Chat dazu fragen" (Kapitel 3.6) — der Chat ist der Erklaermotor, nicht die Sitzung. */
  const handleBrainAskInChat = useCallback(
    (conceptId: string) => {
      const concept = brainPath.data.concepts.find((entry) => entry.id === conceptId)
      if (!concept) {
        return
      }
      stageChatPrefill(
        `Erklär mir „${concept.name}" aus meinem Lernpfad „${brainSubject}".` +
          (concept.description.trim() ? ` Es geht um: ${concept.description.trim()}` : ''),
      )
      navigate('/chat')
    },
    [brainPath.data.concepts, brainSubject, navigate],
  )

  /**
   * Antwort auf eine Beobachtung (Kapitel 3.7).
   *
   * Beides fliesst zurueck, und beides bedeutet etwas anderes: „Kommt hin" bestaetigt die
   * Diagnose und legt sie zu den Akten, „Stimmt nicht" ist eine Aussage der Person ueber sich
   * selbst und bleibt als Widerspruch stehen. Das Muster wird in keinem der beiden Faelle
   * geloescht — geloescht waere die Information weg.
   */
  const handleBrainRespondObservation = useCallback(
    (patternId: string, agreed: boolean) => {
      void runBrainAction(() => (agreed ? acknowledgePattern(patternId) : disputePattern(patternId)))
    },
    [runBrainAction],
  )

  /**
   * Antwort auf eine Kartenfrage (Kapitel 3.7).
   *
   * „Weiss ich nicht" ist ausdruecklich kein Nein: der Vorschlag bleibt offen und verfaellt ueber
   * seine Frist. Bei einer Zusage wird der Umbau hier auch wirklich ausgefuehrt — ein
   * angenommener Vorschlag, der nur den Status wechselt, waere eine Zustimmung ohne Wirkung.
   */
  const handleBrainRespondMapQuestion = useCallback(
    (proposalId: string, answer: MapQuestionResponse['answer']) => {
      const status = statusForAnswer(answer)
      // Nur die beiden entschiedenen Faelle werden geschrieben; „weiss ich nicht" laesst den
      // Vorschlag offen, bis er ueber seine Frist verfaellt (Kapitel 3.7).
      if (status !== 'accepted' && status !== 'rejected') {
        return
      }
      const proposal = brainPath.data.proposals.find((entry) => entry.id === proposalId)
      const userId = user?.id
      if (!proposal || !userId || !activePathId) {
        return
      }

      void runBrainAction(async () => {
        await decideProposal({ proposalId, status })
        if (status !== 'accepted') {
          return
        }

        const payload = proposal.payload as Record<string, unknown>
        if (proposal.operation === 'mergeConcepts') {
          const keptId = String(payload.keepConceptId ?? '')
          const mergedId = String(payload.mergeConceptId ?? '')
          const kept = brainPath.data.concepts.find((entry) => entry.id === keptId)
          const merged = brainPath.data.concepts.find((entry) => entry.id === mergedId)
          if (!kept || !merged) {
            return
          }
          await applyConceptMerge({
            userId,
            pathId: activePathId,
            keptConcept: kept,
            mergedConcept: merged,
            keptImage: brainImageFor(kept.id),
            mergedImage: brainImageFor(merged.id),
            edges: brainPath.data.edges,
            proposalId,
          })
          return
        }

        if (proposal.operation === 'addEdge') {
          await applyAddPrerequisite({
            userId,
            pathId: activePathId,
            fromConceptId: String(payload.fromConceptId ?? ''),
            toConceptId: String(payload.toConceptId ?? ''),
          })
          return
        }

        if (proposal.operation === 'removeEdge') {
          await applyRemovePrerequisite({
            userId,
            pathId: activePathId,
            fromConceptId: String(payload.fromConceptId ?? ''),
            toConceptId: String(payload.toConceptId ?? ''),
          })
        }
      })
    },
    [activePathId, brainImageFor, brainPath.data, runBrainAction, user?.id],
  )

  const brainEditorConcept = useMemo(
    () => brainPath.data.concepts.find((entry) => entry.id === brainEditorConceptId) ?? null,
    [brainPath.data.concepts, brainEditorConceptId],
  )

  // Neue Architektur — Schicht 4: adaptiver Motor. Leitet aus Curriculum + BKT-Zustaenden die
  // konzept-basierten Entscheidungen (Einstiegscheck, Skip, Remediation, gewichtete Pruefung) + das
  // Themen-/Pfad-Scoring ab. `hasConceptScoring=false` (kein Netz/Curriculum) → Legacy-Anzeige greift.
  const adaptiveEngine = useAdaptiveEngine({
    curriculum,
    conceptGraph,
    conceptStatesById: conceptLearnerModel.conceptStatesById,
  })

  // Neue Architektur — Entscheidung 5 (Schicht 4/6): persistenter Karten-SR-Store. Spiegelt die
  // generierten Karten konzept-getaggt nach learn_cards und schreibt bei jeder Selbstbewertung einen
  // SM-2-artigen SR-Zustand (learner_card_states). Graph-gated über hasConceptScoring → sonst inaktiv.
  const allFlashcards = useMemo(
    () =>
      learnFlashcardSets.flatMap((set) =>
        set.cards.map((c) => ({ question: c.question, answer: c.answer, skillTag: c.skillTag })),
      ),
    [learnFlashcardSets],
  )
  const conceptDecayById = useMemo(() => {
    const m = new Map<string, number>()
    for (const [id, state] of conceptLearnerModel.conceptStatesById) {
      m.set(id, state.decayRate)
    }
    return m
  }, [conceptLearnerModel.conceptStatesById])
  const learnCardStore = useLearnCardStore({
    pathId: activePathId || null,
    userId: user?.id ?? null,
    conceptGraph,
    flashcards: allFlashcards,
    conceptDecayById,
    enabled: adaptiveEngine.hasConceptScoring,
  })
  const reviewCardByQuestion = learnCardStore.reviewByQuestion

  // Neue Architektur — Schicht 5 + Entscheidungen 1–3/6: konzept-/lerner-konditionierte Direktiven-
  // Ableitung (Slugs + verfall-bereinigter Lernstand + Quelle + gewichtete Prüfung). Aus dem Orchestrator
  // extrahiert (useConceptDirectives); ohne Netz liefern alle Direktiven leere Strings → Legacy-Verhalten.
  const conceptMasteryForSlug = conceptLearnerModel.masteryForSlug
  const { conceptBySlug, conceptDirective, topicConceptItems, topicConceptDirective, topicExamDirective } =
    useConceptDirectives({
      conceptGraph,
      curriculum,
      hasConceptScoring: adaptiveEngine.hasConceptScoring,
      planForTopic: adaptiveEngine.planForTopic,
      masteryForSlug: conceptMasteryForSlug,
    })

  // Neue Architektur — Schicht 7: Session-Cursor persistieren + wiederherstellen ("dort fortsetzen").
  // Speichert das aktive Thema/den aktiven Zwischenschritt je (User x Pfad) und stellt beim Oeffnen einen
  // Zwischenschritt-Cursor ueber die bestehende openSubstep-Navigation wieder her (konservativ, kein
  // Auto-Generieren auf Themen-Ebene).
  useSessionCursorPersistence({
    userId: user?.id ?? null,
    activePathId: activePathId || null,
    activeTopicOrdinal: activeTopicFlowIndex,
    activeStepOrdinal: activeSubstepIndex,
    phase: activeSubstepIndex !== null ? 'substep' : activeTopicFlowIndex !== null ? 'topic' : 'landing',
    isReady: topicSessions.length > 0,
    hasNavigated: activeTopicFlowIndex !== null,
    onRestore: (topicOrdinal, stepOrdinal) => openSubstep(topicOrdinal, stepOrdinal),
  })

  // Legacy-EWMA (Skalar-Mastery je Skill-ID): bleibt bewusst als FALLBACK erhalten für Pfade OHNE
  // Konzept-Netz (z. B. Ingestion ohne verwertbaren Graph). Wo ein Netz existiert, ist das BKT-Modell
  // autoritativ (Landkarten-Ring/Fortschritt lesen adaptiveEngine); dort läuft EWMA nur als Beiwerk mit.
  const applySkillMasterySignal = useCallback(
    (payload: {
      source: 'chapter' | 'flashcard' | 'worksheet'
      skillId: string
      label: string
      correct: boolean
      /** Untere Schranke der Lernrate (Recency-Floor 0..1); reale Lernrate = max(weight, 1/(versuche+1)). */
      weight: number
    }) => {
      setSkillMasteryBySkillId((prev) => {
        const map = { ...prev }
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
        return map
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
      // Neue Architektur (Schicht 3): dasselbe Signal als echtes BKT-Update auf das getroffene Konzept.
      void applyConceptSignalByTag(payload.skillTag, { correct: payload.correct })
      if (payload.correct && activePathId) {
        gamification.recordEvent({
          dedupeKey: `${activePathId}:chapter-step:${payload.stepId}`,
          eventType: 'chapter_question_correct',
          xpAmount: XP_PER_CORRECT_ANSWER,
          sourcePathId: activePathId,
        })
      }
    },
    [applySkillMasterySignal, applyConceptSignalByTag, activePathId, gamification.recordEvent],
  )

  const { handleEvaluateCurrentChapterQuestion, handleNextChapterStep, handlePreviousChapterStep } = useChapterSessionFlow({
    effectiveChapterBlueprints,
    chapterSession,
    isEvaluatingChapterStep,
    generationMode,
    setChapterSession,
    setIsEvaluatingChapterStep,
    setError,
    onQuestionEvaluated: handleChapterQuestionEvaluatedForMastery,
  })

  const activeTopicSession = activeTopicFlowIndex !== null ? topicSessions[activeTopicFlowIndex] : undefined
  const isTopicFlowActive = activeTopicFlowIndex !== null && Boolean(activeTopicSession)
  const activeSubstep =
    activeTopicSession && activeSubstepIndex !== null ? activeTopicSession.substeps[activeSubstepIndex] : undefined

  /** Übungskarten-Rating aktualisiert den Mastery-Score EINES Zwischenschritts (Anteil „Gewusst", live).
   *  Erreichen alle Zwischenschritte die Schwelle, gilt das Thema als gemeistert. */
  const applySubstepMastery = useCallback((topicIndex: number, substepIndex: number, known: boolean) => {
    setTopicSessions((prev) =>
      prev.map((session, index) => {
        if (index !== topicIndex) {
          return session
        }
        const substeps = session.substeps.map((substep, i) => {
          if (i !== substepIndex) {
            return substep
          }
          const attempts = substep.masteryAttempts + 1
          const nextScore = (substep.masteryScore * substep.masteryAttempts + (known ? 1 : 0)) / attempts
          return { ...substep, masteryScore: nextScore, masteryAttempts: attempts }
        })
        // Mastery ist ein reiner Leistungs-Score; die Themen-/Plan-Progression läuft über `completed`.
        return { ...session, substeps, masteryUpdatedAt: new Date().toISOString() }
      }),
    )
  }, [])

  /** Flow-Fragen (Einstiegscheck + Verständnis-/Erklärfragen) speisen NUR den Lern-Ledger + XP —
   *  NICHT den Mastery-Score (der kommt ausschließlich aus den Übungskarten). */
  const handleTopicFlowQuestionEvaluated = useCallback(
    (payload: { stepId: string; prompt: string; correct: boolean; answer: string; skillTag?: string }) => {
      applySkillMasterySignal({
        source: 'chapter',
        skillId: resolveConceptSkillId(payload.skillTag, () => toSkillIdFromText('chapter', payload.prompt)),
        label: payload.prompt,
        correct: payload.correct,
        weight: 0.35,
      })
      // Neue Architektur (Schicht 3): BKT-Update auf das getroffene Konzept.
      void applyConceptSignalByTag(payload.skillTag, { correct: payload.correct })
      if (payload.correct && activePathId) {
        gamification.recordEvent({
          dedupeKey: `${activePathId}:topic-step:${payload.stepId}`,
          eventType: 'topic_question_correct',
          xpAmount: XP_PER_CORRECT_ANSWER,
          sourcePathId: activePathId,
        })
      }
    },
    [applySkillMasterySignal, applyConceptSignalByTag, activePathId, gamification.recordEvent],
  )


  /** Outline fertig: die Teilthemen als Zwischenschritte anlegen (contentReady:false), Thema → learning. */
  const handleSubstepOutlineReady = useCallback((topicIndex: number, substepTitles: string[]) => {
    setTopicSessions((prev) =>
      prev.map((session, index) => {
        if (index !== topicIndex || session.substeps.length > 0) {
          return session
        }
        const substeps = substepTitles.map((title, i) => ({
          blueprint: { id: `topic-${topicIndex}-substep-${i}`, title, steps: [] },
          session: { ...DEFAULT_CHAPTER_SESSION },
          masteryScore: 0,
          masteryAttempts: 0,
          contentReady: false,
          completed: false,
          practiceFlashcardSetId: null,
        }))
        return { ...session, status: 'learning' as const, substeps }
      }),
    )
  }, [])

  const { isGeneratingOutline } = useTopicSubstepOutline({
    activePathId,
    activePathTitle: activePath?.title,
    generationMode,
    topicIndex: activeTopicFlowIndex ?? -1,
    topicTopic: (syllabus[activeTopicFlowIndex ?? -1]?.topic || learningChapters[activeTopicFlowIndex ?? -1] || '').trim(),
    topicLearningGoal: syllabus[activeTopicFlowIndex ?? -1]?.learningGoal ?? '',
    topicSession: activeTopicSession,
    effectiveTopic,
    selectedTopic,
    materials,
    // Entscheidung 2 (adaptiver Motor): beherrschte Konzepte des Themas nicht neu unterrichten → kürzerer Plan.
    stepPlanDirective: activeTopicFlowIndex !== null ? buildStepPlanDirective(topicConceptItems(activeTopicFlowIndex)) : '',
    onOutlineReady: handleSubstepOutlineReady,
  })

  // --- Leaf-Abstraktion: welcher Blueprint/Session ist gerade im Arbeitsbereich aktiv (Einstiegscheck vs. Zwischenschritt)? ---
  const topicFlowLeafKind: 'entry_check' | 'substep' = activeSubstepIndex !== null ? 'substep' : 'entry_check'

  const topicFlowBlueprints: ChapterBlueprint[] = useMemo(() => {
    if (!activeTopicSession) {
      return []
    }
    if (topicFlowLeafKind === 'substep') {
      return activeSubstep?.blueprint ? [activeSubstep.blueprint] : []
    }
    return activeTopicSession.entryCheckBlueprint ? [activeTopicSession.entryCheckBlueprint] : []
  }, [activeTopicSession, topicFlowLeafKind, activeSubstep])

  const topicFlowChapterSession: ChapterSession =
    topicFlowLeafKind === 'substep'
      ? activeSubstep?.session ?? DEFAULT_CHAPTER_SESSION
      : activeTopicSession?.entryCheckSession ?? DEFAULT_CHAPTER_SESSION

  const setTopicFlowChapterSession: Dispatch<SetStateAction<ChapterSession>> = useCallback(
    (updater) => {
      if (activeTopicFlowIndex === null) {
        return
      }
      setTopicSessions((prev) =>
        prev.map((session, index) => {
          if (index !== activeTopicFlowIndex) {
            return session
          }
          if (activeSubstepIndex !== null) {
            const substeps = session.substeps.map((substep, i) => {
              if (i !== activeSubstepIndex) {
                return substep
              }
              const base = substep.session ?? DEFAULT_CHAPTER_SESSION
              const next =
                typeof updater === 'function' ? (updater as (prev: ChapterSession) => ChapterSession)(base) : updater
              return { ...substep, session: next }
            })
            return { ...session, substeps }
          }
          const base = session.entryCheckSession ?? DEFAULT_CHAPTER_SESSION
          const next =
            typeof updater === 'function' ? (updater as (prev: ChapterSession) => ChapterSession)(base) : updater
          return { ...session, entryCheckSession: next }
        }),
      )
    },
    [activeTopicFlowIndex, activeSubstepIndex],
  )

  const {
    handleEvaluateCurrentChapterQuestion: handleEvaluateTopicFlowQuestion,
    handleNextChapterStep: handleNextTopicFlowStep,
    handlePreviousChapterStep: handlePreviousTopicFlowStep,
  } = useChapterSessionFlow({
    effectiveChapterBlueprints: topicFlowBlueprints,
    chapterSession: topicFlowChapterSession,
    isEvaluatingChapterStep,
    generationMode,
    setChapterSession: setTopicFlowChapterSession,
    setIsEvaluatingChapterStep,
    setError,
    onQuestionEvaluated: handleTopicFlowQuestionEvaluated,
  })

  const {
    safeChapterIndex,
    activeChapterBlueprint,
    safeChapterStepIndex,
    activeChapterStep,
    currentChapterAnswer,
    currentChapterFeedback,
    currentChapterIsCorrect,
    hasCurrentChapterEvaluation,
    displayName,
    avatarFallback,
    subscriptionPlanName,
  } = useLearnWorkspaceDerived({
    user,
    profile,
    effectiveChapterBlueprints,
    chapterSession,
    learningChapters,
    effectiveTopic,
    isChapterPreviewVisible,
  })

  const worksheetModalItems = useMemo(() => {
    if (worksheetModalSubstepFilter) {
      return learnWorksheets.filter(
        (w) =>
          w.topicIndex === worksheetModalSubstepFilter.topicIndex &&
          w.substepIndex === worksheetModalSubstepFilter.substepIndex,
      )
    }
    if (worksheetModalChapterFilter === null) {
      return learnWorksheets
    }
    return learnWorksheets.filter((w) => w.chapterIndex === worksheetModalChapterFilter)
  }, [learnWorksheets, worksheetModalChapterFilter, worksheetModalSubstepFilter])

  const worksheetModalChapterTitle = useMemo(() => {
    if (worksheetModalSubstepFilter) {
      const topicTitle = (
        syllabus[worksheetModalSubstepFilter.topicIndex]?.topic ||
        learningChapters[worksheetModalSubstepFilter.topicIndex] ||
        'Thema'
      ).trim()
      return `${topicTitle} · Teil ${worksheetModalSubstepFilter.substepIndex + 1}`
    }
    if (worksheetModalChapterFilter === null) {
      return 'Lernblatt'
    }
    const blueprintTitle = effectiveChapterBlueprints[worksheetModalChapterFilter]?.title?.trim()
    if (blueprintTitle) {
      return blueprintTitle
    }
    const label = learningChapters[worksheetModalChapterFilter]?.trim()
    return label || `Kapitel ${worksheetModalChapterFilter + 1}`
  }, [worksheetModalChapterFilter, worksheetModalSubstepFilter, effectiveChapterBlueprints, learningChapters, syllabus])

  const worksheetModalChapterLabel = useMemo(() => {
    if (worksheetModalSubstepFilter) {
      return `Teilthema ${worksheetModalSubstepFilter.substepIndex + 1}`
    }
    if (worksheetModalChapterFilter === null) {
      return 'Kapitel 1'
    }
    return worksheetChapterDisplayLabel(worksheetModalChapterFilter, learningChapters)
  }, [learningChapters, worksheetModalChapterFilter, worksheetModalSubstepFilter])

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
    const chapterEntries = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([chapterIndex]) => ({
        kind: 'chapter' as const,
        key: `ws-chapter-${chapterIndex}`,
        chapterIndex,
        substepFilter: null as { topicIndex: number; substepIndex: number } | null,
        title: worksheetChapterDisplayLabel(chapterIndex, learningChapters),
        progress: getWorksheetChapterProgress(learnWorksheets, chapterIndex),
      }))

    const substepMap = new Map<string, { topicIndex: number; substepIndex: number; items: LearnWorksheetItem[] }>()
    for (const item of learnWorksheets) {
      if (typeof item.topicIndex !== 'number' || typeof item.substepIndex !== 'number') {
        continue
      }
      const key = `${item.topicIndex}-${item.substepIndex}`
      const existing = substepMap.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        substepMap.set(key, { topicIndex: item.topicIndex, substepIndex: item.substepIndex, items: [item] })
      }
    }
    const substepEntries = Array.from(substepMap.values())
      .sort((a, b) => a.topicIndex - b.topicIndex || a.substepIndex - b.substepIndex)
      .map(({ topicIndex, substepIndex, items }) => {
        const evaluatedCount = items.filter((item) => item.evaluated === true).length
        const topicTitle = (syllabus[topicIndex]?.topic || learningChapters[topicIndex] || 'Thema').trim()
        return {
          kind: 'substep' as const,
          key: `ws-topic${topicIndex}-substep${substepIndex}`,
          chapterIndex: null as number | null,
          substepFilter: { topicIndex, substepIndex },
          title: `${topicTitle} · Teil ${substepIndex + 1}`,
          progress: {
            total: items.length,
            evaluatedCount,
            isComplete: items.length > 0 && evaluatedCount === items.length,
          },
        }
      })

    return [...chapterEntries, ...substepEntries]
  }, [learnWorksheets, learningChapters, syllabus])

  const worksheetCompletedChapters = useMemo(
    () => worksheetChaptersForList.filter(({ progress }) => progress.total > 0 && progress.isComplete),
    [worksheetChaptersForList],
  )

  const worksheetOpenChapters = useMemo(
    () => worksheetChaptersForList.filter(({ progress }) => !(progress.total > 0 && progress.isComplete)),
    [worksheetChaptersForList],
  )

  const topicFlowSafeChapterIndex = Math.max(
    0,
    Math.min(topicFlowChapterSession.chapterIndex, Math.max(0, topicFlowBlueprints.length - 1)),
  )
  const topicFlowActiveBlueprint = topicFlowBlueprints[topicFlowSafeChapterIndex] ?? null
  const topicFlowSafeStepIndex = Math.max(
    0,
    Math.min(topicFlowChapterSession.stepIndex, Math.max(0, (topicFlowActiveBlueprint?.steps.length ?? 1) - 1)),
  )
  const topicFlowActiveStep = topicFlowActiveBlueprint?.steps[topicFlowSafeStepIndex] ?? null
  const topicFlowAnswer =
    topicFlowActiveStep?.type === 'question' ? (topicFlowChapterSession.answersByStepId[topicFlowActiveStep.id] ?? '') : ''
  const topicFlowFeedback =
    topicFlowActiveStep?.type === 'question' ? (topicFlowChapterSession.feedbackByStepId[topicFlowActiveStep.id] ?? '') : ''
  const topicFlowIsCorrect =
    topicFlowActiveStep?.type === 'question' ? topicFlowChapterSession.correctnessByStepId[topicFlowActiveStep.id] : undefined
  const topicFlowHasEvaluation = typeof topicFlowIsCorrect === 'boolean'

  const requiredWorksheetProgress = useMemo(() => {
    if (worksheetRequiredChapterIndex === null) {
      return null
    }
    const progressKey = resolveWorksheetProgressChapterKey(topicSessions, worksheetRequiredChapterIndex)
    return getWorksheetChapterProgress(learnWorksheets, progressKey)
  }, [topicSessions, worksheetRequiredChapterIndex, learnWorksheets])

  const useMixedLearnMaterials = useMemo(
    () => shouldUseMixedLearnMaterial(topicSessions),
    [topicSessions],
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

  /** Beste aktuelle Richtig-Serie über alle Kompetenzen — für das 🔥-Badge. */
  const bestCorrectStreak = useMemo(() => {
    let best = 0
    for (const entry of Object.values(skillMasteryBySkillId ?? {})) {
      best = Math.max(best, entry.correctStreak ?? 0)
    }
    return best
  }, [skillMasteryBySkillId])

  /** Landkarte-Inhalte "kapitel-förmig" gebündelt (Diagnosetest + Zwischenschritt-Serie pro Thema), damit
   *  bestehende, blueprint-/session-basierte Auswertungen wiederverwendet werden können — siehe topicSessionCorpora.ts. */
  const topicCorpora = useMemo(() => buildTopicCorpora(topicSessions, syllabus), [topicSessions, syllabus])

  const errorLogbookEntries = useMemo(
    () =>
      buildErrorLogbookEntries({
        entryQuiz,
        entryQuizAnswers,
        entryQuizResult,
        topicCorpora,
        learningChapters,
        learnWorksheets,
      }),
    [entryQuiz, entryQuizAnswers, entryQuizResult, topicCorpora, learningChapters, learnWorksheets],
  )
  const errorLogbookStats = useMemo(() => getErrorLogbookStats(errorLogbookEntries), [errorLogbookEntries])

  const isPathFullyCompleted = useMemo(() => {
    if (topicSessions.length > 0) {
      return allTopicsMastered(topicSessions.map((session) => session.status))
    }
    return chapterBlueprints.length > 0 && chapterSession.completedChapterIndexes.length >= chapterBlueprints.length
  }, [topicSessions, chapterBlueprints, chapterSession.completedChapterIndexes])

  const previousErrorLogbookTotalRef = useRef<number | null>(null)
  const previousErrorLogbookPathIdRef = useRef<string>('')

  /** Wertet nach jeder relevanten Fortschritts-Änderung den Achievement-Katalog aus (siehe gamification.ts).
   *  previousErrorLogbookTotal wird bei Pfadwechsel auf null zurückgesetzt, damit ein Wechsel auf einen
   *  Lernpfad mit weniger Fehlern nicht fälschlich als "Lücken geschlossen" gewertet wird. */
  useEffect(() => {
    const pathChanged = previousErrorLogbookPathIdRef.current !== activePathId
    const previousErrorLogbookTotal = pathChanged ? null : previousErrorLogbookTotalRef.current
    const context: GamificationBadgeContext = {
      completedChapterCount: chapterSession.completedChapterIndexes.length,
      masteredTopicsCount: masteredTopicCount(topicSessions.map((session) => session.status)),
      hasHighMasteryTopic: topicSessions.some(
        (session) => session.status === 'mastered' && topicMasteryScore(session) >= 0.95,
      ),
      errorLogbookTotal: errorLogbookStats.total,
      previousErrorLogbookTotal,
      currentStreakDays: gamification.currentStreakDays,
      flashcardDueNow: flashcardSrStats.dueNow,
      flashcardTotal: flashcardSrStats.total,
      isPathFullyCompleted,
    }
    previousErrorLogbookTotalRef.current = errorLogbookStats.total
    previousErrorLogbookPathIdRef.current = activePathId
    gamification.evaluateBadges(context)
  }, [
    activePathId,
    chapterSession.completedChapterIndexes.length,
    topicSessions,
    errorLogbookStats.total,
    gamification.currentStreakDays,
    flashcardSrStats.dueNow,
    flashcardSrStats.total,
    isPathFullyCompleted,
    gamification.evaluateBadges,
  ])

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
    const useMixed = shouldUseMixedLearnMaterial(topicSessions)
    const outline = useMixed
      ? buildMixedLearnProgressOutline(topicCorpora, skillMasteryBySkillId, learnFlashcardSets, learnWorksheets)
      : buildLearnMaterialOutlineFromBlueprints(
          personalization,
          topicCorpora,
          skillMasteryBySkillId,
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
      // Platzhalter-Modus: Mock-Karten ohne KI/Bild-Guthaben.
      const cards =
        generationMode === 'placeholder'
          ? await placeholderDelay().then(() => buildPlaceholderFlashcards())
          : await generateLearnFlashcards(prependConceptDirective(outlineForApi, conceptDirective))
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
    effectiveChapterBlueprints,
    effectiveTopic,
    learningPaths,
    materials,
    profile?.subscription_plans?.max_images,
    profile?.subscription_usages?.image_credit_balance,
    selectedTopic,
    user,
    generationMode,
    skillMasteryBySkillId,
    topicCorpora,
    topicSessions,
    learnFlashcardSets,
    learnWorksheets,
    conceptDirective,
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
    const useMixed = shouldUseMixedLearnMaterial(topicSessions)
    const requestedSingleTopicIndex =
      !useMixed && typeof targetChapterIndex === 'number' && targetChapterIndex >= 0 ? targetChapterIndex : null
    const sourceTopicCorpora =
      requestedSingleTopicIndex !== null
        ? topicCorpora.filter((corpus) => corpus.topicIndex === requestedSingleTopicIndex)
        : topicCorpora
    const outline = useMixed
      ? buildMixedLearnProgressOutline(topicCorpora, skillMasteryBySkillId, learnFlashcardSets, learnWorksheets)
      : buildLearnMaterialOutlineFromBlueprints(
          personalization,
          sourceTopicCorpora,
          skillMasteryBySkillId,
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
      // Platzhalter-Modus: Mock-Aufgaben ohne KI/Bild-Guthaben.
      const items =
        generationMode === 'placeholder'
          ? await placeholderDelay().then(() => buildPlaceholderWorksheetItems())
          : await generateLearnWorksheet(prependConceptDirective(outlineForApi, conceptDirective))
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
    generationMode,
    skillMasteryBySkillId,
    topicCorpora,
    topicSessions,
    learnFlashcardSets,
    conceptDirective,
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
    (itemId: string, payload: { correct: boolean; answer: string; credit?: number }) => {
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
      // Neue Architektur (Schicht 3 + semantische Teilbewertung): BKT-Update mit optionalem Teil-Credit.
      void applyConceptSignalByTag(item?.skillTag, { correct: payload.correct, credit: payload.credit })
    },
    [applySkillMasterySignal, applyConceptSignalByTag, learnWorksheets, learningPaths],
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
      // Neue Architektur (Schicht 3): BKT-Update auf das getroffene Konzept.
      void applyConceptSignalByTag(item.skillTag, { correct })
    })
  }, [applySkillMasterySignal, applyConceptSignalByTag, learningPaths, worksheetModalItems])

  const worksheetSubmittedCount = useMemo(
    () =>
      worksheetModalItems.filter(
        (item) => typeof item.submittedAt === 'string' && item.submittedAt.trim().length > 0,
      ).length,
    [worksheetModalItems],
  )

  /** `substepTarget` gesetzt: Karte gehört zu einem Teilthema-Übungsset — Bewertung speist zusätzlich
   *  live den Substep-Mastery-Score (siehe `applySubstepMastery`). */
  const handleFlashcardSelfRating = useCallback(
    (cardId: string, rating: 'known' | 'unknown', substepTarget?: { topicIndex: number; substepIndex: number }) => {
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
          // Neue Architektur (Schicht 3): BKT-Update auf das getroffene Konzept.
          void applyConceptSignalByTag(currentCard.skillTag, { correct: rating === 'known' })
          // Neue Architektur (Entscheidung 5): persistenter Karten-SR-Zustand (SM-2, learner_card_states).
          reviewCardByQuestion(currentCard.question, rating === 'known')
          const todayKey = new Date().toISOString().slice(0, 10)
          gamification.recordEvent({
            dedupeKey: `${cardId}:review:${todayKey}`,
            eventType: 'flashcard_reviewed',
            xpAmount: XP_PER_FLASHCARD_REVIEW,
            sourcePathId: pathId || undefined,
          })
        }
        return merged
      })
      if (substepTarget) {
        applySubstepMastery(substepTarget.topicIndex, substepTarget.substepIndex, rating === 'known')
      }
    },
    [
      applySkillMasterySignal,
      applyConceptSignalByTag,
      reviewCardByQuestion,
      applySubstepMastery,
      learningPaths,
      gamification.recordEvent,
    ],
  )

  const handleRateSubstepPracticeCard = useCallback(
    (cardId: string, known: boolean) => {
      if (activeTopicFlowIndex === null || activeSubstepIndex === null) {
        return
      }
      handleFlashcardSelfRating(cardId, known ? 'known' : 'unknown', {
        topicIndex: activeTopicFlowIndex,
        substepIndex: activeSubstepIndex,
      })
    },
    [activeTopicFlowIndex, activeSubstepIndex, handleFlashcardSelfRating],
  )

  useEffect(() => {
    if (!isSetupComplete || !entryQuizResult) {
      return
    }
    const maxPlannedCount = Math.max(1, Math.min(targetChapterCount, chapterBlueprints.length || targetChapterCount))
    const lastUnlockedIndex = Math.max(0, unlockedChapterCount - 1)
    const hasCompletedUnlockedChapter = chapterSession.completedChapterIndexes.includes(lastUnlockedIndex)
    const wsProgressKey = resolveWorksheetProgressChapterKey(topicSessions, lastUnlockedIndex)
    const wsStats = getWorksheetChapterProgress(learnWorksheets, wsProgressKey)
    const hasWorksheetItems = wsStats.total > 0
    const worksheetChapterComplete = wsStats.isComplete
    const worksheetMixed = shouldUseMixedLearnMaterial(topicSessions)
    const nextChapterNumber = Math.min(maxPlannedCount, unlockedChapterCount + 1)
    let action: TutorChatEntry['action']
    let content = ''

    if (!hasCompletedUnlockedChapter) {
      action = 'start-next-chapter'
      content = buildTutorCoachMessage({
        kind: 'start-chapter',
        chapterNumber: lastUnlockedIndex + 1,
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
    topicSessions,
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
        let excerpt = text
        // Bild-Materialien zusätzlich per Vision transkribieren (versteht Diagramme/Formeln/Tabellen,
        // die reines OCR verliert). Best-effort mit OCR-Fallback; im Platzhalter-Modus kein KI-Aufruf.
        if (generationMode !== 'placeholder' && isChatVisionImageFile(file)) {
          const vision = await transcribeImageWithVision(file)
          if (vision) {
            excerpt = text.trim() ? `${vision}\n\n[OCR-Text]\n${text.trim()}` : vision
            excerpt = excerpt.slice(0, LEARN_MATERIAL_EXCERPT_MAX_CHARS)
          }
        }
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          excerpt,
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

  /** Themen-Titel für Prompts/Illustration — gleiche Herleitung überall (Syllabus → Kapitelname → Thema). */
  function deriveTopicTitleForIndex(topicIndex: number): string {
    const syllabusEntry = syllabus[topicIndex]
    return (syllabusEntry?.topic?.trim() || learningChapters[topicIndex]?.trim() || effectiveTopic).trim()
  }

  /** Lazy-Generierung des Vollinhalts eines Zwischenschritts (fester Flow + Übungskarten) beim ersten Öffnen. */
  async function ensureSubstepContent(topicIndex: number, substepIndex: number) {
    const session = topicSessions[topicIndex]
    const substep = session?.substeps[substepIndex]
    if (!session || !substep || substep.contentReady || substepContentInFlightRef.current) {
      return
    }
    substepContentInFlightRef.current = true
    setIsGeneratingSubstepContent(true)
    const activePathIdAtStart = activePathId
    const substepTitle = substep.blueprint.title
    const blueprintId = substep.blueprint.id
    const applyBlueprint = (raw: ChapterBlueprint) => {
      const namespaced =
        namespaceChapterStepIds([{ ...raw, id: blueprintId, title: substepTitle }], {
          chapterIndexOffset: topicIndex * 100 + substepIndex,
        })[0] ?? raw
      setTopicSessions((prev) =>
        prev.map((entry, index) =>
          index !== topicIndex
            ? entry
            : {
                ...entry,
                substeps: entry.substeps.map((ss, j) =>
                  j === substepIndex ? { ...ss, blueprint: namespaced, contentReady: true, contentFailed: false } : ss,
                ),
              },
        ),
      )
    }
    // Fehlerzustand setzen/zurücksetzen (contentReady bleibt false → beim nächsten Öffnen wird neu versucht).
    const setContentFailed = (failed: boolean) => {
      setTopicSessions((prev) =>
        prev.map((entry, index) =>
          index !== topicIndex
            ? entry
            : {
                ...entry,
                substeps: entry.substeps.map((ss, j) =>
                  j === substepIndex ? { ...ss, contentFailed: failed } : ss,
                ),
              },
        ),
      )
    }
    // Beim (erneuten) Start den Fehlerzustand löschen → UI wechselt von Fehler zu Ladeanzeige.
    setContentFailed(false)
    setSubstepContentErrorReason(null)
    try {
      const topicTitle = deriveTopicTitleForIndex(topicIndex)
      const weakQuestions = collectTopicWeakQuestionSteps(session)
      const weaknessSummary = weakQuestions
        .slice(0, 12)
        .map((step, index) => `${index + 1}. ${step.prompt}`)
        .join('\n')
      // Nur die Konzepte DIESES Themas in die Direktive (statt aller Pfad-Konzepte): kleinerer/schnellerer
      // Prompt (weniger Timeout-/Rate-Limit-Risiko) und fokussiertere, themen-treue Inhalte.
      const materialContext = prependConceptDirective(
        formatRelevantMaterialContext(
          buildChapterMaterialSearchQuery(effectiveTopic, selectedTopic, topicTitle),
          materials,
          getChapterMaterialRagOptions(materials.length),
        ),
        topicConceptDirective(topicIndex),
      )

      if (generationMode === 'placeholder') {
        await placeholderDelay()
        applyBlueprint(buildSubstepContentFallback(substepTitle, weakQuestions))
        return
      }

      let validationHint = ''
      let generated: ChapterBlueprint | null = null
      for (let attempt = 1; !generated && attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
        try {
          const request: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: buildSubstepContentPrompt({
              pathTitle: getDisplayPathTitle(activePath?.title ?? ''),
              topicTitle,
              substepTitle,
              learningGoal: syllabus[topicIndex]?.learningGoal,
              materialContext,
              weaknessSummary,
              attempt,
              validationHint,
            }),
            createdAt: new Date().toISOString(),
          }
          let timeoutId: number | null = null
          const response = await Promise.race([
            sendMessage([request], {
              systemPrompt: getPrompt('learn_tutor'),
              useLearnPathModel: true,
              learnTelemetryMode: 'learn_tutor',
              learnPathSystemPromptMode: 'tutor_only',
            }),
            new Promise<never>((_, reject) => {
              timeoutId = window.setTimeout(
                () => reject(new Error('Generierung des Zwischenschritts dauert zu lange.')),
                CHAPTER_ON_DEMAND_TIMEOUT_MS,
              )
            }),
          ]).finally(() => {
            if (timeoutId !== null) {
              window.clearTimeout(timeoutId)
            }
          })
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }
          const parsed = parseInteractiveContentWithFallback(response.assistantMessage.content)
          const candidate = parseChapterBlueprintsFromText(parsed.cleanText || response.assistantMessage.content)[0]
          if (!candidate) {
            validationHint = 'Kein auslesbares JSON erhalten'
          } else {
            const validation = validateGeneratedSubstep(candidate)
            if (validation.valid) {
              generated = candidate
              break
            }
            validationHint = validation.reason
          }
        } catch (err) {
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }
          validationHint = err instanceof Error ? err.message : 'Modell-Fehler'
          console.error(`Lernbereich: Zwischenschritt-Versuch ${attempt} fehlgeschlagen`, err)
          // Nicht-vorübergehende Fehler (z. B. aufgebrauchtes Kontingent) → kein weiterer Versuch.
          if (!isTransientAiFailure(err)) {
            break
          }
        }
        // Vor dem nächsten Versuch kurz warten (Backoff), damit ein überlastetes Rate-Limit-Fenster frei wird.
        if (!generated && attempt < CHAPTER_GENERATION_MAX_ATTEMPTS) {
          await sleep(aiBackoffDelayMs(attempt))
          if (activePathIdRef.current !== activePathIdAtStart) {
            return
          }
        }
      }
      if (activePathIdRef.current !== activePathIdAtStart) {
        return
      }
      if (generated) {
        applyBlueprint(generated)
        // Sobald die Erklärungen stehen: die Folgeschritte GESTAFFELT im Hintergrund vorproduzieren
        // (+5s Übungskarten, danach +10s Abschluss-Arbeitsblatt). Spreizt die KI-Last (weniger 429) und
        // hält alles bereit. (Der Platzhalter-Fall wurde oben bereits per early-return behandelt.)
        void prepareSubstepFollowupsInBackground(topicIndex, substepIndex)
      } else {
        // Kein Platzhalter mehr: ehrlichen Fehlerzustand zeigen (Fehlermeldung + „Erneut versuchen").
        console.error('Lernbereich: Zwischenschritt-Inhalt endgültig fehlgeschlagen — letzter Grund:', validationHint)
        setSubstepContentErrorReason(validationHint || null)
        setContentFailed(true)
      }
    } catch (err) {
      console.error('Lernbereich: Zwischenschritt-Inhalt konnte nicht generiert werden', err)
      if (activePathIdRef.current === activePathIdAtStart) {
        setSubstepContentErrorReason(err instanceof Error ? err.message : 'Unbekannter Fehler')
        setContentFailed(true)
      }
    } finally {
      substepContentInFlightRef.current = false
      setIsGeneratingSubstepContent(false)
    }
  }

  /**
   * Lazy, EINMALIGE KI-Illustration (freigestellt, ohne Hintergrund) zu einem Zwischenschritt — max.
   * 1 Bild pro Teilthema, wird während der Erklärschritte links vom Inhalt angezeigt. Rein dekorativ:
   * Fehler (auch fehlendes Bild-Guthaben) werden nur geloggt und blockieren den Lern-Flow nicht.
   */
  async function ensureSubstepIllustration(
    topicIndex: number,
    substepIndex: number,
    topicTitle: string,
    substepTitle: string,
  ) {
    const session = topicSessions[topicIndex]
    const substep = session?.substeps[substepIndex]
    if (!session || !substep || substep.illustrationImageUrl || substepIllustrationInFlightRef.current) {
      return
    }
    if (generationMode === 'placeholder') {
      return
    }
    substepIllustrationInFlightRef.current = true
    const activePathIdAtStart = activePathId
    try {
      const prompt = [
        `Einfache, freigestellte Illustration zum Lernthema "${substepTitle}" (Teil von "${topicTitle}").`,
        'Nur das Hauptmotiv, OHNE Hintergrund, keine Szenerie, kein Rahmen, keine Bodenfläche.',
        'Klarer, moderner, flacher Illustrationsstil. Keine Schrift, keine Wasserzeichen, keine Personen mit erkennbaren Gesichtern.',
        // Echte Alpha-Transparenz kommt über den API-Parameter `background:"transparent"` — im Prompt
        // NICHT nochmal "transparent" erwähnen, sonst zeichnet das Modell ein Karo-/Schachbrettmuster
        // als Symbolbild für Transparenz statt echter Transparenz zu nutzen.
        'KEIN grafisch gezeichnetes Karo- oder Schachbrettmuster als Hintergrund-Symbol.',
      ].join(' ')
      const { assistantMarkdown } = await generateChatImageFromPrompt(prompt, undefined, {
        transparentBackground: true,
      })
      const dataUrl = assistantMarkdown.match(/\((data:image\/[^)]+)\)/)?.[1]
      if (!dataUrl || activePathIdRef.current !== activePathIdAtStart) {
        return
      }
      setTopicSessions((prev) =>
        prev.map((entry, index) =>
          index !== topicIndex
            ? entry
            : {
                ...entry,
                substeps: entry.substeps.map((ss, j) =>
                  j === substepIndex ? { ...ss, illustrationImageUrl: dataUrl } : ss,
                ),
              },
        ),
      )
    } catch (err) {
      console.error('Lernbereich: Teilthema-Illustration konnte nicht generiert werden', err)
    } finally {
      substepIllustrationInFlightRef.current = false
    }
  }

  /**
   * Nach erfolgreicher Erklärungs-Generierung: die ÜBUNGSKARTEN nach 5s im Hintergrund vorproduzieren,
   * damit sie bereitstehen und die KI-Last gespreizt wird. Idempotent (eigener Guard) → ein späteres
   * manuelles Öffnen der Übungsphase löst keinen Doppel-Lauf aus. Bricht ab, wenn der Pfad wechselt.
   *
   * Das ABSCHLUSS-Arbeitsblatt wird bewusst NICHT hier vorproduziert, sondern erst nach den Übungskarten
   * (`handleFinishSubstepPractice` → `ensureSubstepCompletionWorksheet`) — so bleibt es adaptiv zur
   * tatsächlichen Karten-/Flow-Leistung.
   */
  async function prepareSubstepFollowupsInBackground(topicIndex: number, substepIndex: number) {
    const pathAtStart = activePathIdRef.current
    await sleep(5000)
    if (activePathIdRef.current !== pathAtStart) {
      return
    }
    await ensureSubstepPracticeSet(topicIndex, substepIndex)
  }

  /** Lazy-Generierung des Übungskarten-Sets eines Zwischenschritts (echtes `LearnFlashcardSet`, sobald der
   *  feste Flow durchlaufen ist). Idempotent: läuft nur, solange noch kein gültiges Set verknüpft ist. */
  async function ensureSubstepPracticeSet(topicIndex: number, substepIndex: number) {
    const session = topicSessions[topicIndex]
    const substep = session?.substeps[substepIndex]
    if (!session || !substep) {
      return
    }
    if (substep.practiceFlashcardSetId && learnFlashcardSets.some((set) => set.id === substep.practiceFlashcardSetId)) {
      return
    }
    if (substepPracticeInFlightRef.current) {
      return
    }
    substepPracticeInFlightRef.current = true
    setIsGeneratingSubstepPractice(true)
    const activePathIdAtStart = activePathId
    try {
      const outline = buildFlashcardSourceFromBlueprints([substep.blueprint])
      let cards: LearnFlashcard[] | null = null
      if (generationMode === 'placeholder') {
        await placeholderDelay()
        cards = buildPlaceholderFlashcards()
      } else {
        // Bei Fehlschlag SOFORT (im Hintergrund) erneut versuchen — kurzer Backoff bei Überlast.
        for (let attempt = 1; attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
          try {
            cards = await generateLearnFlashcards(prependConceptDirective(outline, conceptDirective))
            break
          } catch (err) {
            if (activePathIdRef.current !== activePathIdAtStart) {
              return
            }
            console.error(`Lernbereich: Übungskarten-Versuch ${attempt} fehlgeschlagen`, err)
            if (attempt >= CHAPTER_GENERATION_MAX_ATTEMPTS) {
              throw err
            }
            await sleep(isTransientAiFailure(err) ? aiBackoffDelayMs(attempt) : 1200)
            if (activePathIdRef.current !== activePathIdAtStart) {
              return
            }
          }
        }
      }
      if (!cards || activePathIdRef.current !== activePathIdAtStart) {
        return
      }
      // Entscheidung 4 (Echtzeit-Schwierigkeit): das Deck deterministisch nach Lernstand ordnen —
      // schwache Konzepte zuerst (Remediation), dann Schwierigkeits-Anstieg. Ohne Netz unverändert.
      const initializedCards = initializeNewFlashcardSet(cards)
      const orderedCards = adaptiveEngine.hasConceptScoring
        ? adaptiveDeckOrder(initializedCards, (card) => {
            const slug = normalizeConceptTag(card.skillTag)
            const concept = slug ? conceptBySlug.get(slug) : undefined
            return { difficulty: concept?.difficulty ?? 3, mastery: conceptMasteryForSlug(card.skillTag) }
          })
        : initializedCards
      const newSet: LearnFlashcardSet = {
        id: crypto.randomUUID(),
        title: substep.blueprint.title,
        cards: orderedCards,
        topicIndex,
        substepIndex,
      }
      setLearnFlashcardSets((prev) => {
        const merged = [...prev, newSet]
        const pathId = activePathIdRef.current
        if (pathId) {
          const currentSummary = learningPaths.find((entry) => entry.id === pathId)
          void updateLearningPathById(pathId, {
            title: getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad'),
            learnFlashcardSets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })
      setTopicSessions((prev) =>
        prev.map((entry, index) =>
          index !== topicIndex
            ? entry
            : {
                ...entry,
                substeps: entry.substeps.map((ss, j) =>
                  j === substepIndex ? { ...ss, practiceFlashcardSetId: newSet.id } : ss,
                ),
              },
        ),
      )
    } catch (err) {
      console.error('Lernbereich: Übungskarten konnten nicht generiert werden', err)
      if (activePathIdRef.current === activePathIdAtStart) {
        setError(err instanceof Error ? err.message : 'Übungskarten konnten nicht erstellt werden.')
      }
    } finally {
      substepPracticeInFlightRef.current = false
      setIsGeneratingSubstepPractice(false)
    }
  }

  /** Lazy-Generierung des Abschluss-Arbeitsblatts eines Zwischenschritts (Pflicht, letzter Schritt vor
   *  `completed`). Adaptiv: priorisiert Schwachstellen aus Flow + Übungskarten (siehe
   *  `buildSubstepCompletionWorksheetOutline`). Idempotent, solange bereits Items für diesen Zwischenschritt
   *  existieren. */
  async function ensureSubstepCompletionWorksheet(topicIndex: number, substepIndex: number) {
    const session = topicSessions[topicIndex]
    const substep = session?.substeps[substepIndex]
    if (!session || !substep) {
      return
    }
    const hasExistingItems = learnWorksheets.some(
      (item) => item.topicIndex === topicIndex && item.substepIndex === substepIndex,
    )
    if (hasExistingItems || substepWorksheetInFlightRef.current) {
      return
    }
    substepWorksheetInFlightRef.current = true
    setIsGeneratingSubstepWorksheet(true)
    const activePathIdAtStart = activePathId
    try {
      const practiceSet = substep.practiceFlashcardSetId
        ? learnFlashcardSets.find((set) => set.id === substep.practiceFlashcardSetId)
        : undefined
      const outline = buildSubstepCompletionWorksheetOutline(substep, practiceSet?.cards ?? [])
      // Entscheidung 6: Konzept-Direktive + gewichtete Prüfungs-Verteilung kombinieren.
      const completionDirective = [conceptDirective, topicExamDirective(topicIndex)]
        .filter((part) => part.trim().length > 0)
        .join('\n\n')
      const items =
        generationMode === 'placeholder'
          ? await placeholderDelay().then(() => buildPlaceholderWorksheetItems())
          : await generateLearnWorksheet(prependConceptDirective(outline, completionDirective))
      if (activePathIdRef.current !== activePathIdAtStart) {
        return
      }
      const taggedItems = items.map((item, index) => ({
        ...item,
        id: `ws-topic${topicIndex}-substep${substepIndex}-${index}-${item.id}`,
        topicIndex,
        substepIndex,
        chapterIndex: undefined,
      }))
      setLearnWorksheets((prev) => {
        const merged = [
          ...prev.filter((item) => !(item.topicIndex === topicIndex && item.substepIndex === substepIndex)),
          ...taggedItems,
        ]
        const pathId = activePathIdRef.current
        if (pathId) {
          const currentSummary = learningPaths.find((entry) => entry.id === pathId)
          void updateLearningPathById(pathId, {
            title: getDisplayPathTitle(currentSummary?.title ?? 'Neuer Lernpfad'),
            learnWorksheets: merged,
          }).then((updated) => {
            pathCacheRef.current[pathId] = updated
          })
        }
        return merged
      })
    } catch (err) {
      console.error('Lernbereich: Abschluss-Arbeitsblatt konnte nicht generiert werden', err)
      if (activePathIdRef.current === activePathIdAtStart) {
        setError(err instanceof Error ? err.message : 'Abschluss-Arbeitsblatt konnte nicht erstellt werden.')
      }
    } finally {
      substepWorksheetInFlightRef.current = false
      setIsGeneratingSubstepWorksheet(false)
    }
  }

  /** „Erneut versuchen" nach fehlgeschlagener Inhalts-Generierung eines Zwischenschritts. */
  function handleRetrySubstepContent() {
    if (activeTopicFlowIndex === null || activeSubstepIndex === null) {
      return
    }
    void ensureSubstepContent(activeTopicFlowIndex, activeSubstepIndex)
  }

  /** Öffnet einen bestimmten Zwischenschritt im Arbeitsbereich (Schiene) und generiert bei Bedarf den Inhalt. */
  function openSubstep(topicIndex: number, substepIndex: number) {
    const session = topicSessions[topicIndex]
    const substep = session?.substeps[substepIndex]
    if (!session || !substep) {
      return
    }
    setActiveTopicFlowIndex(topicIndex)
    setActiveSubstepIndex(substepIndex)
    setEntryCheckStarted(false)
    setIsSubstepPracticePhase(false)
    setIsSubstepWorksheetPhase(false)
    void ensureSubstepContent(topicIndex, substepIndex)
    // Unabhängig vom Inhalt (eigener Guard über `illustrationImageUrl`) — läuft bei jedem Öffnen erneut
    // an, solange noch keine Illustration da ist (z. B. nach einem vorherigen Fehlschlag).
    void ensureSubstepIllustration(
      topicIndex,
      substepIndex,
      deriveTopicTitleForIndex(topicIndex),
      substep.blueprint.title,
    )
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

  function handleGenerateRequiredWorksheet() {
    if (worksheetRequiredChapterIndex === null) {
      return
    }
    const ch = worksheetRequiredChapterIndex
    const progressKey = resolveWorksheetProgressChapterKey(topicSessions, ch)
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

  /** Kapitel-Arbeitsansicht verlassen → zurück zur Landkarte (Lernpfad-Tab zeigt sie automatisch). */
  function exitChapterWorkspace() {
    closeChapterModal()
  }

  /** Schiene (Variante A): Sprung zu einem bereits erledigten Schritt im aktuellen Zwischenschritt. */
  function handleSelectTopicFlowStepIndex(index: number) {
    setTopicFlowChapterSession((prev) => ({ ...prev, stepIndex: index }))
  }

  function handleSelectChapterStepIndex(index: number) {
    setChapterSession((prev) => ({ ...prev, stepIndex: index }))
  }

  function handleCompleteChapter() {
    setChapterSession((prev) => {
      const idx = prev.chapterIndex
      if (prev.completedChapterIndexes.includes(idx)) {
        return prev
      }
      if (activePathId) {
        gamification.recordEvent({
          dedupeKey: `${activePathId}:chapter-completed:${idx}`,
          eventType: 'chapter_completed',
          xpAmount: XP_PER_CHAPTER_COMPLETED,
          sourcePathId: activePathId,
        })
      }
      return {
        ...prev,
        completedChapterIndexes: [...prev.completedChapterIndexes, idx],
      }
    })
    closeChapterModal()
    setActiveLearnTab('worksheets')
  }

  /** Einstiegscheck fertig → Status „analyzing" (KI-Analyse-Animation), danach leitet useTopicSubstepOutline
   *  die Zwischenschritte ab. Der Einstiegscheck selbst zählt NICHT in den Mastery-Score. */
  function handleCompleteEntryCheck() {
    if (activeTopicFlowIndex === null) {
      return
    }
    const topicIndex = activeTopicFlowIndex
    setTopicSessions((prev) =>
      prev.map((session, index) =>
        index === topicIndex && session.status === 'entry_check'
          ? { ...session, status: 'analyzing' as const }
          : session,
      ),
    )
    setEntryCheckStarted(false)
    // Arbeitsbereich offen lassen — die Analyse-Animation läuft dort weiter, bis die Substeps da sind.
  }

  /** Fester Flow (Erklärungen + Fragen) durchlaufen: schaltet auf die Übungskarten-Phase um und stößt bei
   *  Bedarf die lazy Generierung des zugehörigen Lernkarten-Sets an. */
  function handleFinishSubstepFlow() {
    if (activeTopicFlowIndex === null || activeSubstepIndex === null) {
      return
    }
    setIsSubstepPracticePhase(true)
    void ensureSubstepPracticeSet(activeTopicFlowIndex, activeSubstepIndex)
  }

  /** Alle Übungskarten bewertet: schaltet auf das Abschluss-Arbeitsblatt um (Pflicht, letzter Schritt) und
   *  stößt bei Bedarf dessen lazy Generierung an. */
  function handleFinishSubstepPractice() {
    if (activeTopicFlowIndex === null || activeSubstepIndex === null) {
      return
    }
    setIsSubstepPracticePhase(false)
    setIsSubstepWorksheetPhase(true)
    void ensureSubstepCompletionWorksheet(activeTopicFlowIndex, activeSubstepIndex)
  }

  /** Zwischenschritt abgeschlossen: als `completed` markieren (lineare Plan-Progression). Ist damit das
   *  ganze Kapitel abgeschlossen → Thema gemeistert + Landkarte; sonst zurück zur Kapitel-Übersicht. */
  function handleCompleteSubstep() {
    if (activeTopicFlowIndex === null || activeSubstepIndex === null) {
      return
    }
    const topicIndex = activeTopicFlowIndex
    const substepIndex = activeSubstepIndex
    const session = topicSessions[topicIndex]
    if (!session) {
      return
    }
    setIsSubstepPracticePhase(false)
    setIsSubstepWorksheetPhase(false)
    const allCompleted =
      session.substeps.length > 0 &&
      session.substeps.every((s, i) => (i === substepIndex ? true : s.completed))
    setTopicSessions((prev) =>
      prev.map((entry, index) => {
        if (index !== topicIndex) {
          return entry
        }
        const substeps = entry.substeps.map((s, i) => (i === substepIndex ? { ...s, completed: true } : s))
        return { ...entry, substeps, status: allCompleted ? ('mastered' as const) : entry.status }
      }),
    )
    if (allCompleted) {
      if (activePathId) {
        gamification.recordEvent({
          dedupeKey: `${activePathId}:topic-mastered:${topicIndex}`,
          eventType: 'topic_mastered',
          xpAmount: XP_PER_MASTERED_TOPIC,
          sourcePathId: activePathId,
        })
      }
      closeChapterModal()
      setActiveTopicFlowIndex(null)
      setActiveSubstepIndex(null)
      return
    }
    // Zurück zur Kapitel-Übersicht: das nächste (erste noch nicht abgeschlossene) Teilthema wird „current".
    setActiveSubstepIndex(null)
  }

  function handleTopicFlowMcqSelect(stepId: string, option: string) {
    setTopicFlowChapterSession((prev) => {
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

  function handleTopicFlowTextAnswerChange(stepId: string, value: string) {
    setTopicFlowChapterSession((prev) => {
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

  function openErrorLogbookTab() {
    setActiveLearnTab('statistics')
  }

  function closeWorksheetModal() {
    setIsWorksheetModalVisible(false)
    worksheetModalCloseTimerRef.current = window.setTimeout(() => {
      setIsWorksheetModalMounted(false)
      setWorksheetModalChapterFilter(null)
      setWorksheetModalSubstepFilter(null)
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
    setWorksheetModalSubstepFilter(null)
    setWorksheetModalChapterFilter(chapterFilter === undefined ? null : chapterFilter)
    setIsWorksheetModalMounted(true)
    window.requestAnimationFrame(() => {
      setIsWorksheetModalVisible(true)
    })
  }

  /** Öffnet das Abschluss-Arbeitsblatt eines Zwischenschritts im Lernblätter-Tab (Landkarte-Modell). */
  function openSavedWorksheetsModalForSubstep(topicIndex: number, substepIndex: number) {
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
    setWorksheetModalChapterFilter(null)
    setWorksheetModalSubstepFilter({ topicIndex, substepIndex })
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

  const hasExistingLearnContent =
    chapterBlueprints.length > 0 ||
    learningChapters.length > 0 ||
    Boolean(entryQuizResult) ||
    learnFlashcardSets.length > 0 ||
    learnWorksheets.length > 0 ||
    tutorMessages.length > 0
  /*
   * `isFreshSetupPending` haelt die Einrichtungsoberflaeche (Schritt 4: „wird vorbereitet") auch
   * dann noch an, wenn `isSetupComplete` bereits gesetzt ist — sonst erschienen fuer den Moment
   * zwischen „Einrichtung abschliessen" und fertiger Ingestion die alten Tabs mit drei leeren
   * Bereichen (Lernkarten, Lernblaetter, Statistiken), bevor ueberhaupt ein Pfad dahintersteht.
   */
  const showSetupFlow = (!isSetupComplete && !hasExistingLearnContent) || isFreshSetupPending
  const hasNoLearningPaths = learningPaths.length === 0
  const workspaceDisplayPath =
    embedded && isSwitchingLearningPath && controlledPathId
      ? learningPaths.find((entry) => entry.id === controlledPathId) ?? activePath
      : activePath

  function openPathTitleInlineEdit() {
    setPathTitleDraft(getDisplayPathTitle(workspaceDisplayPath?.title ?? ''))
    setIsPathTitleEditing(true)
  }

  async function commitPathTitleInlineEdit() {
    setIsPathTitleEditing(false)
    const pathId = workspaceDisplayPath?.id
    const nextTitle = pathTitleDraft.trim()
    if (!pathId || !nextTitle || nextTitle === getDisplayPathTitle(workspaceDisplayPath?.title ?? '')) {
      return
    }
    try {
      await handleRenameLearningPath(pathId, nextTitle)
    } catch {
      // `handleRenameLearningPath` setzt bei Fehlern bereits `error` — hier nichts weiter zu tun.
    }
  }

  const isPathWorkspaceBusy =
    isSwitchingLearningPath ||
    (isLearningPathWorkspaceLoading && !learningPaths.some((path) => path.isPending))

  /** Kapitel-Arbeitsansicht: füllt den rechten Bereich (kein Modal mehr) mit Schiene + Fragen. */
  const isChapterWorkspaceOpen = isChapterModalMounted
  const chapterWorkspaceOrdinalLabel = isTopicFlowActive
    ? activeSubstepIndex !== null
      ? `Teilthema ${activeSubstepIndex + 1}`
      : (activeTopicSession?.status === 'learning' || activeTopicSession?.status === 'mastered') &&
          (activeTopicSession?.substeps.length ?? 0) > 0
        ? 'Kapitelübersicht'
        : 'Einstiegscheck'
    : `Kapitel ${safeChapterIndex + 1}`
  const chapterWorkspaceCorrectness = isTopicFlowActive
    ? topicFlowChapterSession.correctnessByStepId
    : chapterSession.correctnessByStepId

  // --- Themen-Arbeitsbereich: Modus (Landing/Einstiegscheck/Analyse/Flow) + Landing-/Übungs-Props ---
  const entryCheckHasProgress = Boolean(
    activeTopicSession?.entryCheckSession &&
      (activeTopicSession.entryCheckSession.stepIndex > 0 ||
        Object.keys(activeTopicSession.entryCheckSession.feedbackByStepId).length > 0 ||
        Object.keys(activeTopicSession.entryCheckSession.answersByStepId).length > 0),
  )
  const topicWorkspaceMode:
    | 'landing'
    | 'entry_check'
    | 'analyzing'
    | 'overview'
    | 'flow'
    | 'practice'
    | 'worksheet'
    | undefined =
    !isTopicFlowActive
      ? undefined
      : activeSubstepIndex !== null
        ? isSubstepWorksheetPhase
          ? 'worksheet'
          : isSubstepPracticePhase
            ? 'practice'
            : 'flow'
        : activeTopicSession?.status === 'analyzing'
          ? 'analyzing'
          : (activeTopicSession?.status === 'learning' || activeTopicSession?.status === 'mastered') &&
              (activeTopicSession?.substeps.length ?? 0) > 0
            ? 'overview'
            : entryCheckStarted || entryCheckHasProgress
              ? 'entry_check'
              : 'landing'
  const topicWorkspaceName = isTopicFlowActive
    ? (syllabus[activeTopicFlowIndex ?? -1]?.topic || learningChapters[activeTopicFlowIndex ?? -1] || 'Thema').trim()
    : undefined
  // Ring-Score: bevorzugt der echte BKT-Themen-Score (neue Architektur), sonst der Legacy-Substep-Schnitt.
  // Themen korrespondieren ordinal (Curriculum wurde in derselben Reihenfolge in den Syllabus abgeleitet).
  const activeCurriculumTopic =
    adaptiveEngine.hasConceptScoring && activeTopicFlowIndex !== null
      ? curriculum.topics[activeTopicFlowIndex]
      : undefined
  const conceptTopicScore = activeCurriculumTopic
    ? adaptiveEngine.topicScoreById.get(activeCurriculumTopic.id)
    : undefined
  const topicWorkspaceMasteryPercent =
    conceptTopicScore !== undefined
      ? Math.round(conceptTopicScore * 100)
      : activeTopicSession
        ? topicMasteryScore(activeTopicSession) * 100
        : 0
  const activeSubstepPracticeSet = activeSubstep?.practiceFlashcardSetId
    ? (learnFlashcardSets.find((set) => set.id === activeSubstep.practiceFlashcardSetId) ?? null)
    : null
  const activeSubstepPracticeCards = activeSubstepPracticeSet?.cards ?? []
  const activeSubstepWorksheetItems =
    activeTopicFlowIndex !== null && activeSubstepIndex !== null
      ? learnWorksheets.filter(
          (item) => item.topicIndex === activeTopicFlowIndex && item.substepIndex === activeSubstepIndex,
        )
      : []
  const topicCompleteLabel =
    activeSubstepIndex !== null ? 'Weiter zu den Übungskarten' : 'Einstiegscheck abschließen'
  /** Teilthemen-Liste für die Kapitel-Übersicht (Plan-Timeline): Status + Schritt-Fortschritt je Teilthema.
   *  „current" = erstes noch nicht abgeschlossenes Teilthema, davor „done", danach „upcoming". */
  const firstOpenSubstepIndex = (activeTopicSession?.substeps ?? []).findIndex((s) => !s.completed)
  const topicSubstepList = (activeTopicSession?.substeps ?? []).map((substep, index) => {
    const status: 'done' | 'current' | 'upcoming' = substep.completed
      ? 'done'
      : index === firstOpenSubstepIndex
        ? 'current'
        : 'upcoming'
    const totalSteps = substep.blueprint.steps.length
    return {
      index,
      title: substep.blueprint.title.trim() || `Teilthema ${index + 1}`,
      status,
      currentStep: Math.min(substep.session.stepIndex + 1, Math.max(1, totalSteps)),
      totalSteps,
    }
  })
  const handleSelectSubstepFromOverview = (index: number) => {
    if (activeTopicFlowIndex !== null) {
      openSubstep(activeTopicFlowIndex, index)
    }
  }

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
        <div className={`learn-page-grid${isChapterWorkspaceOpen ? ' learn-page-grid--chapter' : ''}`}>
          {isChapterWorkspaceOpen ? (
            <LearnChapterWorkspace
              isMounted={isChapterModalMounted}
              isVisible={isChapterModalVisible}
              onClose={exitChapterWorkspace}
              activeChapterBlueprint={isTopicFlowActive ? topicFlowActiveBlueprint : activeChapterBlueprint}
              safeChapterIndex={isTopicFlowActive ? topicFlowSafeChapterIndex : safeChapterIndex}
              bestCorrectStreak={bestCorrectStreak}
              safeChapterStepIndex={isTopicFlowActive ? topicFlowSafeStepIndex : safeChapterStepIndex}
              activeChapterStep={isTopicFlowActive ? topicFlowActiveStep : activeChapterStep}
              currentChapterAnswer={isTopicFlowActive ? topicFlowAnswer : currentChapterAnswer}
              currentChapterFeedback={isTopicFlowActive ? topicFlowFeedback : currentChapterFeedback}
              currentChapterIsCorrect={isTopicFlowActive ? topicFlowIsCorrect : currentChapterIsCorrect}
              hasCurrentChapterEvaluation={isTopicFlowActive ? topicFlowHasEvaluation : hasCurrentChapterEvaluation}
              isEvaluatingChapterStep={isEvaluatingChapterStep}
              stepCorrectnessById={chapterWorkspaceCorrectness}
              stepOrdinalLabel={chapterWorkspaceOrdinalLabel}
              onSelectStepIndex={isTopicFlowActive ? handleSelectTopicFlowStepIndex : handleSelectChapterStepIndex}
              onChapterAnswerChange={isTopicFlowActive ? handleTopicFlowTextAnswerChange : handleChapterTextAnswerChange}
              onSelectMcqOption={isTopicFlowActive ? handleTopicFlowMcqSelect : handleChapterMcqSelect}
              onPreviousChapterStep={isTopicFlowActive ? handlePreviousTopicFlowStep : handlePreviousChapterStep}
              onEvaluateChapterQuestion={
                isTopicFlowActive ? handleEvaluateTopicFlowQuestion : handleEvaluateCurrentChapterQuestion
              }
              onNextChapterStep={isTopicFlowActive ? handleNextTopicFlowStep : handleNextChapterStep}
              onCompleteChapter={
                isTopicFlowActive
                  ? activeSubstepIndex !== null
                    ? handleFinishSubstepFlow
                    : handleCompleteEntryCheck
                  : handleCompleteChapter
              }
              topicMode={topicWorkspaceMode}
              topicName={topicWorkspaceName}
              topicMasteryPercent={topicWorkspaceMasteryPercent}
              onStartEntryCheck={() => setEntryCheckStarted(true)}
              isGeneratingContent={isGeneratingSubstepContent || (isTopicFlowActive && activeSubstepIndex === null && isGeneratingOutline)}
              contentFailed={isTopicFlowActive && activeSubstepIndex !== null ? Boolean(activeSubstep?.contentFailed) : false}
              contentFailedReason={substepContentErrorReason}
              onRetryContent={handleRetrySubstepContent}
              explanationIllustrationUrl={
                isTopicFlowActive && activeSubstepIndex !== null ? activeSubstep?.illustrationImageUrl : undefined
              }
              practiceCards={activeSubstepPracticeCards}
              isGeneratingPractice={isGeneratingSubstepPractice}
              onRatePracticeCard={handleRateSubstepPracticeCard}
              onFinishPractice={handleFinishSubstepPractice}
              worksheetItems={activeSubstepWorksheetItems}
              isGeneratingWorksheet={isGeneratingSubstepWorksheet}
              onWorksheetItemEvaluated={handleWorksheetItemEvaluated}
              onWorksheetSavedAnswerChange={handleWorksheetSavedAnswerChange}
              onFinishWorksheet={handleCompleteSubstep}
              useLocalWorksheetEvaluation={generationMode === 'placeholder'}
              completeLabel={isTopicFlowActive ? topicCompleteLabel : undefined}
              hideRail={isTopicFlowActive}
              substepList={topicSubstepList}
              onSelectSubstep={handleSelectSubstepFromOverview}
            />
          ) : (
            <>
          <article
            className={`learn-card learn-workspace-card${
              activeLearnTab === 'path' && showErrorLogbookHint ? ' has-error-logbook-hint' : ''
            }`}
          >
            {learnAreaBannerEnabled && learnAreaBannerText.trim() ? (
              <LearnAreaAdminBanner text={learnAreaBannerText} />
            ) : null}
            {hasNoLearningPaths || isBrainSessionOpen ? null : (
              <header className="learn-workspace-header">
                {brainPath.isAvailable ? (
                  <BrainProgressRing progress={brainPathHeader.progress} className="learn-workspace-title-ring" />
                ) : (
                  <span className="learn-workspace-title-icon" aria-hidden="true" />
                )}
                {isPathTitleEditing ? (
                  <input
                    className="learn-page-title-input"
                    value={pathTitleDraft}
                    onChange={(event) => setPathTitleDraft(event.target.value)}
                    onBlur={() => void commitPathTitleInlineEdit()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void commitPathTitleInlineEdit()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        setIsPathTitleEditing(false)
                      }
                    }}
                    maxLength={120}
                    autoFocus
                    aria-label="Lernpfadname"
                  />
                ) : (
                  <h1 className="learn-page-title-text">{getDisplayPathTitle(workspaceDisplayPath?.title ?? '')}</h1>
                )}
                {isPathTitleEditing ? null : (
                  <button
                    type="button"
                    className="learn-page-title-edit"
                    onClick={openPathTitleInlineEdit}
                    aria-label="Lernpfadnamen bearbeiten"
                  >
                    <MaskIcon src={editIcon} className="learn-page-title-edit-icon" />
                  </button>
                )}
                {brainPath.isAvailable ? (
                  <BrainGoalChip
                    chip={brainPathHeader.goalChip}
                    onOpenGoal={() => setIsBrainGoalOpen(true)}
                    className="learn-workspace-goal-chip"
                  />
                ) : null}
              </header>
            )}
            {error ? <p className="error-text">{error}</p> : null}

            {hasNoLearningPaths ? (
              <div className="learn-empty-paths">
                <span className="learn-empty-paths-icon" aria-hidden="true" />
                <h2 className="learn-empty-paths-title">Erstelle deinen ersten Lernpfad</h2>
                <p className="learn-empty-paths-subtitle">
                  Lade dein Lernmaterial hoch und Straton baut dir einen personalisierten Lernpfad.
                </p>
                <PrimaryButton type="button" onClick={() => void handleCreateLearningPath()}>
                  <span className="learn-empty-paths-create-plus" aria-hidden="true">
                    +
                  </span>
                  Lernpfad erstellen
                </PrimaryButton>
              </div>
            ) : isPathWorkspaceBusy ? (
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
                onFilesChange={(files) => {
                  void handleUploadMaterials(files)
                }}
                onRemoveMaterial={(materialId) => {
                  setMaterials((prev) => prev.filter((entry) => entry.id !== materialId))
                }}
                onContinueStepOne={handleContinueSetupStepOne}
                onContinueStepTwo={handleContinueSetupStepTwo}
                goalDueAt={pendingGoalDueAt}
                onGoalDueAtChange={setPendingGoalDueAt}
                goalMinutesPerDay={pendingGoalMinutesPerDay}
                onGoalMinutesPerDayChange={setPendingGoalMinutesPerDay}
                allowContinueWithoutMaterials={generationMode === 'placeholder'}
                onFinishSetup={handleFinishSetup}
                onBackToStep1={() => setSetupStep(1)}
                onBackToStep2={handleBackToStep2}
              />
            ) : (
              <>
                {/*
                 * Waehrend einer laufenden Gehirn-Sitzung ("Hier ueben") bleibt nur die Aufgabe im
                 * Blick — Tabs und Pfad-Kopfzeile waeren hier nur Ablenkung von etwas, das man
                 * sowieso nicht anklicken soll (Kapitel 4: „ein einziger Vollbildwechsel").
                 * `BrainSession` traegt ihren eigenen Titel (Konzeptname) und Fortschrittsbalken.
                 */}
                {isBrainSessionOpen ? null : (
                <nav
                  className={`learn-top-tabs${isMobileTabsTouchActive ? ' is-touch-active' : ''}`}
                  aria-label="Lernbereich Tabs"
                  style={{ '--learn-active-tab-index': activeLearnTabIndex } as CSSProperties}
                  data-tab-direction={learnTabDirection}
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
                  {/*
                    * Tabs nach Absicht, nicht nach Format (UI-Spezifikation 3.2): sobald das
                    * Gehirn fuer diesen Pfad traegt, heisst dieser Bereich „Wiederholen" und
                    * fuehrt den Stapel. Pfade ohne Wissensgraph behalten die Lernkarten — kein
                    * Bereich verschwindet, bevor sein Nachfolger traegt.
                    */}
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--flashcards${activeLearnTab === 'flashcards' ? ' is-active' : ''}${
                      brainPath.isAvailable && brainReviewOverview.dueConceptCount > 0 ? ' has-attention' : ''
                    }`}
                    onClick={() => setActiveLearnTab('flashcards')}
                    aria-label={
                      brainPath.isAvailable
                        ? brainReviewOverview.dueConceptCount > 0
                          ? `Wiederholen, ${brainReviewOverview.counterLabel}`
                          : 'Wiederholen'
                        : 'Lernkarten'
                    }
                  >
                    <img
                      className="ui-icon learn-top-tab-flashcards-icon"
                      src={activeLearnTab === 'flashcards' ? cardsFilledIcon : cardsOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="learn-top-tab-label">
                      {brainPath.isAvailable ? 'Wiederholen' : 'Lernkarten'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`learn-top-tab learn-top-tab--worksheets${activeLearnTab === 'worksheets' ? ' is-active' : ''}${
                      worksheetRequiredChapterIndex !== null ? ' has-attention' : ''
                    }`}
                    onClick={() => setActiveLearnTab('worksheets')}
                    aria-label={brainPath.isAvailable ? 'Material' : 'Lernblätter'}
                  >
                    <img
                      className="ui-icon learn-top-tab-worksheets-icon"
                      src={activeLearnTab === 'worksheets' ? paperFilledIcon : paperOutlinedIcon}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="learn-top-tab-label">
                      {brainPath.isAvailable ? 'Material' : 'Lernblätter'}
                    </span>
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
                )}
                {showRequiredWorksheetHint && activeLearnTab !== 'worksheets' && requiredWorksheetHintContent ? (
                  <p className="learn-worksheet-required-hint">{requiredWorksheetHintContent}</p>
                ) : null}
                {activeLearnTab === 'path' ? (
                  /*
                   * Nur noch die Gehirn-Oberflaeche (UI-Spezifikation Kapitel 3) — die fruehere
                   * Uebergangsansicht fuer Pfade ohne Graph ist entfernt. `BrainPathTab` zeigt
                   * seinen eigenen Ladezustand, solange der Wissensgraph noch nicht da ist.
                   */
                  isBrainSummaryOpen ? (
                    <BrainSessionSummary
                      summary={brainSessionSummary}
                      onBackToPath={() => {
                        brainSession.reset()
                        // „Bei der Rueckkehr in den Pfad muss die veraenderte Struktur SOFORT
                        // sichtbar sein" (Kapitel 4.9) — deshalb neu einlesen statt weiterzeigen.
                        void brainPath.refreshAfterSession()
                      }}
                    />
                  ) : isBrainSessionOpen ? (
                    <BrainSession
                      state={brainSession.state}
                      view={brainSessionView}
                      onAnswer={(answer, options) => void brainSession.answer(answer, options)}
                      onNext={() => void brainSession.next()}
                      onAbort={brainSession.abort}
                    />
                  ) : (
                    <BrainPathTab
                      state={brainPath}
                      /*
                       * Der Sprint-Hinweis waechst unten aus der Jetzt-Karte heraus und wird
                       * deshalb dort gerendert. Berechnet wird er trotzdem hier: „fuer diesmal
                       * ausgeschlagen" muss einen Tabwechsel ueberleben, der Pfad-Tab wird dabei
                       * aber abgeraeumt.
                       */
                      sprintCard={brainSprintNotice}
                      onApplySprintScope={handleSprintScope}
                      onKeepFullSprintScope={handleKeepFullScope}
                      onDismissSprintOffer={() => setIsSprintOfferDismissed(true)}
                      isBusy={isBrainActionBusy}
                      onStartSession={() => void brainSession.start(brainPath.plan?.tasks ?? [])}
                      /* „Spaeter" (Kapitel 3.3): der Planer waehlt neu und begruendet erneut. */
                      onDeferConcept={brainPath.deferConcept}
                      /*
                       * „Hier ueben" startet eine Sitzung, die mit DIESEM Konzept beginnt. Der
                       * uebrige Plan bleibt, wie der Planer ihn gelegt hat — die Person waehlt den
                       * Einstieg, nicht die Sitzung (I11).
                       */
                      onPractiseConcept={(conceptId) => {
                        const tasks = brainPath.plan?.tasks ?? []
                        const chosen = tasks.filter((task) => task.conceptId === conceptId)
                        const rest = tasks.filter((task) => task.conceptId !== conceptId)
                        void brainSession.start(chosen.length > 0 ? [...chosen, ...rest] : tasks)
                      }}
                      onExplainConcept={(conceptId) => {
                        const concept = brainPath.data.concepts.find((entry) => entry.id === conceptId)
                        if (concept) {
                          void brainExplanation.request(concept, brainPath.data.images.get(conceptId))
                        }
                      }}
                      onAskInChat={handleBrainAskInChat}
                      onEditConcept={setBrainEditorConceptId}
                      onShowValueInfo={setBrainValueInfoTerm}
                      onRespondObservation={handleBrainRespondObservation}
                      onRespondMapQuestion={handleBrainRespondMapQuestion}
                    />
                  )
                ) : null}
                {activeLearnTab === 'flashcards' ? (
                  <section className="learn-tab-panel">
                    {/*
                      * Der Wiederholen-Bereich (Kapitel 5). Drei Zustaende, ein Ort: Uebersicht,
                      * Stapel im Vollbild, Abschluss mit den naechsten Terminen. Eine Punktzahl
                      * kommt in keinem davon vor — beim Auffrischen interessiert nur, wann es
                      * wieder dran ist.
                      *
                      * Ladezustand zuerst und explizit (`BrainPathTab` macht das intern genauso):
                      * ohne ihn wuerde `overview.isEmpty` waehrend des ersten Ladens kurz „nichts
                      * faellig" zeigen, obwohl die Daten nur noch nicht da sind.
                      */}
                    {!brainPath.hasLoadedOnce && brainPath.isLoading ? (
                      <div className="brain-path-loading" aria-busy="true">Lernstand wird geladen …</div>
                    ) : isBrainStackDone ? (
                      <BrainReviewCompletion
                        completion={brainReviewCompletion}
                        aborted={brainReview.state.aborted}
                        onDone={() => {
                          brainReview.reset()
                          brainPath.reload()
                        }}
                      />
                    ) : isBrainStackOpen ? (
                      <BrainReviewStack
                        state={brainReview.state}
                        onAnswer={(answer) => void brainReview.answer(answer)}
                        onNext={() => void brainReview.next()}
                        onAbort={brainReview.abort}
                      />
                    ) : (
                      <BrainReviewTab
                        overview={brainReviewOverview}
                        onStartFull={() => void brainReview.start()}
                        onStartShort={() => void brainReview.startShort()}
                      />
                    )}
                  </section>
                ) : null}
                {activeLearnTab === 'statistics' ? (
                  <section className="learn-tab-panel learn-stats-tab-panel" aria-label="Lernstatistik">
                    <LearnSkillMasteryPanel skillMasteryBySkillId={skillMasteryBySkillId} />
                    <div className="learn-stats-grid">
                      <article
                        className={`learn-stats-card${errorLogbookStats.total > 0 ? ' learn-stats-card--highlight' : ''}`}
                      >
                        <p className="learn-stats-card-value">{errorLogbookStats.total}</p>
                        <p className="learn-stats-card-label">Noch zu meistern</p>
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
                    {/*
                      * Material, Abschnitt „Quellen" (Kapitel 6): woher jedes Konzept stammt, und
                      * getrennt davon, was die KI ergaenzt hat. Das ist Invariante I4 auf
                      * Pfadebene — die Arbeitsblaetter darunter bleiben, was sie sind: ein Export.
                      */}
                    {brainPath.isAvailable ? <BrainSourcesSection sources={brainSources} /> : null}
                    {/*
                      * Der ergaenzte Lehrstoff steht direkt neben den Quellen, weil er dieselbe
                      * Frage beantwortet: woher kommt, was ich hier lerne. Er ist als „nicht aus
                      * deinen Unterlagen" gekennzeichnet und aenderbar — siehe den Kopf von
                      * `BrainDerivedMaterialPanel`.
                      */}
                    {materialPreparation.phase === 'running' ? (
                      <p className="brain-derived-notice">
                        {materialPreparation.currentMaterial
                          ? `Arbeitsheft wird aufbereitet: ${materialPreparation.currentMaterial} (${materialPreparation.done + 1}/${materialPreparation.total}) …`
                          : 'Arbeitsheft wird aufbereitet …'}
                      </p>
                    ) : null}
                    {materialPreparation.phase === 'failed' && materialPreparation.error ? (
                      <p className="brain-derived-error">{materialPreparation.error}</p>
                    ) : null}
                    {derivedMaterials.map((material) => (
                      <BrainDerivedMaterialPanel
                        key={material.id}
                        material={material}
                        items={derivedItems[material.id] ?? []}
                        summary={materialPreparation.summary}
                        onSave={saveDerivedMaterial}
                      />
                    ))}
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
                        worksheetOpenChapters.map(({ key, chapterIndex, substepFilter, title, progress }) => {
                          const status: 'open' | 'in_progress' | 'completed' =
                            progress.total === 0
                              ? 'open'
                              : progress.isComplete
                                ? 'completed'
                                : 'in_progress'
                          return (
                            <button
                              key={key}
                              type="button"
                              className="learn-tests-list-item"
                              onClick={() =>
                                substepFilter
                                  ? openSavedWorksheetsModalForSubstep(substepFilter.topicIndex, substepFilter.substepIndex)
                                  : openSavedWorksheetsModal(chapterIndex ?? undefined)
                              }
                            >
                              <div className="learn-tests-list-item-main">
                                <div className="learn-tests-list-item-heading">
                                  <p className="learn-tests-list-item-title">{title}</p>
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
                              {worksheetCompletedChapters.map(({ key, chapterIndex, substepFilter, title, progress }) => (
                                <button
                                  key={key}
                                  type="button"
                                  className="learn-tests-list-item"
                                  onClick={() =>
                                    substepFilter
                                      ? openSavedWorksheetsModalForSubstep(substepFilter.topicIndex, substepFilter.substepIndex)
                                      : openSavedWorksheetsModal(chapterIndex ?? undefined)
                                  }
                                >
                                  <div className="learn-tests-list-item-main">
                                    <div className="learn-tests-list-item-heading">
                                      <p className="learn-tests-list-item-title">{title}</p>
                                      <span className="learn-tests-status-badge is-completed">Abgeschlossen</span>
                                    </div>
                                    <p className="learn-tests-list-item-meta">
                                      {progress.evaluatedCount}/{progress.total} Aufgaben geprüft
                                    </p>
                                  </div>
                                </button>
                              ))}
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
              materialsCount={materials.length}
              entryQuizResult={entryQuizResult}
              learningChapters={learningChapters}
              syllabus={syllabus}
            />
          </article>
            </>
          )}
        </div>
        {showPathOnboarding ? <LearnPathOnboarding onClose={handleClosePathOnboarding} /> : null}
      </section>
  )

  const learnWorkspaceModals = (
    <>
      {learnMaterialChoiceTarget !== null ? (
        <ModalShell
          isOpen
          className="learn-flashcards-modal-overlay"
          onRequestClose={() => setLearnMaterialChoiceTarget(null)}
        >
          <section
            className="ui-dialog-card learn-material-choice-modal"
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
      {/*
        * Ziel setzen (Kapitel 7). Erreichbar ueber den Ziel-Chip in der Kopfzeile; die
        * Machbarkeitsaussage steht im Dialog, bevor gespeichert wird.
        */}
      {isBrainGoalOpen && brainPath.isAvailable && user?.id && activePathId ? (
        <BrainGoalDialog
          userId={user.id}
          pathId={activePathId}
          concepts={brainPath.data.concepts}
          images={brainPath.data.images}
          goal={brainPath.data.goal}
          isBusy={isBrainActionBusy}
          onSave={(draft) => {
            const userId = user.id
            void runBrainAction(async () => {
              await setGoal({
                userId,
                pathId: activePathId,
                title: draft.title.trim() || 'Ziel',
                dueAt: draft.dueAt,
                conceptIds: draft.conceptIds,
                minutesPerDay: draft.minutesPerDay,
              })
              setIsBrainGoalOpen(false)
            })
          }}
          onClear={() => {
            const goalId = brainPath.data.goal?.id
            if (!goalId) {
              return
            }
            void runBrainAction(async () => {
              await closeGoal(goalId, 'cancelled')
              setIsBrainGoalOpen(false)
            })
          }}
          onClose={() => setIsBrainGoalOpen(false)}
        />
      ) : null}

      {/* Knoten bearbeiten (Kapitel 3.6) — die Handkorrektur aus Architekturkapitel 3. */}
      {brainEditorConcept && user?.id && activePathId ? (
        <BrainNodeEditor
          concept={brainEditorConcept}
          concepts={brainPath.data.concepts}
          edges={brainPath.data.edges}
          isBusy={isBrainActionBusy}
          error={brainActionError}
          onRename={(conceptId, name) => void runBrainAction(() => renameConcept(conceptId, name))}
          onAddPrerequisite={(conceptId, prerequisiteId) => {
            const userId = user.id
            void runBrainAction(() =>
              applyAddPrerequisite({
                userId,
                pathId: activePathId,
                fromConceptId: prerequisiteId,
                toConceptId: conceptId,
              }),
            )
          }}
          onRemovePrerequisite={(conceptId, prerequisiteId) => {
            const userId = user.id
            void runBrainAction(() =>
              applyRemovePrerequisite({
                userId,
                pathId: activePathId,
                fromConceptId: prerequisiteId,
                toConceptId: conceptId,
              }),
            )
          }}
          onMerge={(keptConceptId, mergedConceptId) => {
            const userId = user.id
            const kept = brainPath.data.concepts.find((entry) => entry.id === keptConceptId)
            const merged = brainPath.data.concepts.find((entry) => entry.id === mergedConceptId)
            if (!kept || !merged) {
              return
            }
            void runBrainAction(async () => {
              await applyConceptMerge({
                userId,
                pathId: activePathId,
                keptConcept: kept,
                mergedConcept: merged,
                keptImage: brainImageFor(kept.id),
                mergedImage: brainImageFor(merged.id),
                edges: brainPath.data.edges,
              })
              setBrainEditorConceptId(null)
            })
          }}
          onClose={() => {
            setBrainEditorConceptId(null)
            setBrainActionError(null)
          }}
        />
      ) : null}

      {/* „Erklaeren lassen" (Kapitel 3.6) — quellengebunden, mit Stellenangabe (I4, I5). */}
      <BrainExplanationDialog
        state={brainExplanation.state}
        onAskInChat={(conceptId) => {
          brainExplanation.close()
          handleBrainAskInChat(conceptId)
        }}
        onClose={brainExplanation.close}
      />

      {/* Werterklaerung im Knoten-Panel (Kapitel 3.6) — ein Wert, ein bis zwei Saetze. */}
      <BrainValueInfoDialog term={brainValueInfoTerm} onClose={() => setBrainValueInfoTerm(null)} />

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
        useLocalEvaluation={generationMode === 'placeholder'}
      />
      {isSettingsMounted ? (
        <ModalShell isOpen={isSettingsVisible} onRequestClose={closeSettingsModal}>
          <SettingsModal onClose={closeSettingsModal} />
        </ModalShell>
      ) : null}
      {openPathMenuId && pathMenuPosition ? (
        <PopoverMenu
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
        </PopoverMenu>
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




















