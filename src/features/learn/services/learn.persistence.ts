import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  coerceQuizScalarToString,
  resolveMcqExpectedAnswer,
  type InteractiveQuizPayload,
} from '../../chat/utils/interactiveQuiz'
import { namespaceChapterStepIds } from '../utils/chapterStepIds'
import { isLearningPathEmpty } from '../utils/learnPageHelpers'
import { normalizeFlashcardSr } from '../utils/spacedRepetition'

export type LearningPathSummary = {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
  /** Client-only: optimistischer Eintrag bis die DB-Antwort da ist. */
  isPending?: boolean
  /** Stabile Sidebar-`key`-ID über Platzhalter → echter Pfad (kein Remount). */
  sidebarListKey?: string
  /** Client-only: Ausblend-Animation vor dem Entfernen leerer Pfade. */
  isRemoving?: boolean
}

export type UploadedMaterial = {
  id: string
  name: string
  size: number
  excerpt: string
}

export type TutorChatEntry = {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: 'open-entry-test' | 'start-next-chapter' | 'create-flashcards' | 'create-worksheet'
}

export type EntryQuizResult = {
  score: number
  total: number
  feedbackByQuestionId: Record<string, string>
  correctnessByQuestionId?: Record<string, boolean>
  evaluatedAnswersByQuestionId?: Record<string, string>
}

export type LearnTutorState = 'entry_quiz_pending' | 'entry_quiz_done' | 'chapter_learning' | 'chapter_completed'

export type LearnFlashcard = {
  id: string
  question: string
  answer: string
  /** Konzept-/Kompetenz-Tag (z. B. "mwst-berechnung") für quellenübergreifende Skill-Mastery. */
  skillTag?: string
  /** Selbsteinschätzung nach dem Umdrehen */
  selfRating?: 'known' | 'unknown'
  /** Spaced repetition: 0 = neu / zurückgesetzt, höher = längere Intervalle */
  srStage?: number
  /** ISO-Zeitpunkt: Karte ist fällig, wenn <= jetzt */
  nextReviewAt?: string
  lastReviewedAt?: string
}

/** Ein erzeugter Stapel Lernkarten (ein API-Lauf / eine Session). */
export type LearnFlashcardSet = {
  id: string
  title?: string
  cards: LearnFlashcard[]
}

/** Arbeitsblatt-Aufgabe (strukturiert wie Kapitel-/Quiz-Fragen; alte Einträge nur mit prompt = Freitext). */
export type LearnWorksheetItem = {
  id: string
  prompt: string
  questionType?: 'mcq' | 'text' | 'match' | 'true_false' | 'categorize'
  matchLeft?: string[]
  matchRight?: string[]
  /** Kategorisieren: Begriffe (items) in Kategorien (categories) einsortieren; expectedAnswer = Kategorie-Index pro item. */
  categories?: string[]
  items?: string[]
  options?: string[]
  expectedAnswer?: string
  acceptableAnswers?: string[]
  hint?: string
  explanation?: string
  evaluation?: 'exact' | 'contains'
  /** Konzept-/Kompetenz-Tag (z. B. "mwst-berechnung") für quellenübergreifende Skill-Mastery. */
  skillTag?: string
  chapterIndex?: number
  /** Mindestens einmal per Kreis geprüft */
  evaluated?: boolean
  /** Ergebnis der letzten Kreis-Prüfung */
  lastCorrect?: boolean
  /** Zuletzt eingegebene / gespeicherte Antwort (Textfeld) */
  savedAnswer?: string
  /** Nutzer hat das Arbeitsblatt (bzw. die Aufgabe) bewusst abgegeben */
  submittedAt?: string
}

export type ChapterStep =
  | {
      id: string
      type: 'explanation'
      title: string
      content: string
      bullets?: string[]
    }
  | {
      id: string
      type: 'question'
      questionType: 'mcq' | 'text' | 'match' | 'true_false' | 'categorize'
      prompt: string
      options?: string[]
      matchLeft?: string[]
      matchRight?: string[]
      /** Kategorisieren: Begriffe (items) in Kategorien (categories) einsortieren; expectedAnswer = Kategorie-Index pro item. */
      categories?: string[]
      items?: string[]
      expectedAnswer: string
      acceptableAnswers?: string[]
      hint?: string
      explanation?: string
      evaluation?: 'exact' | 'contains'
      /** Konzept-/Kompetenz-Tag (z. B. "mwst-berechnung") für aggregierte Skill-Mastery über Kapitel hinweg. */
      skillTag?: string
    }
  | {
      id: string
      type: 'recap'
      title: string
      content: string
      bullets?: string[]
    }

/** Schritt ohne id (Vorlagen, z. B. vor namespaceChapterStepIds). Union-sicher — nicht `Omit<ChapterStep,'id'>`. */
export type ChapterStepWithoutId =
  | Omit<Extract<ChapterStep, { type: 'explanation' }>, 'id'>
  | Omit<Extract<ChapterStep, { type: 'question' }>, 'id'>
  | Omit<Extract<ChapterStep, { type: 'recap' }>, 'id'>

/** Ein geplantes Kapitel im Syllabus (Unterthema + Lernziel). */
export type SyllabusEntry = {
  topic: string
  learningGoal: string
}

export type ChapterBlueprint = {
  id: string
  title: string
  description?: string
  source?: 'ai' | 'fallback'
  steps: ChapterStep[]
}

export type ChapterSession = {
  chapterIndex: number
  stepIndex: number
  answersByStepId: Record<string, string>
  feedbackByStepId: Record<string, string>
  correctnessByStepId: Record<string, boolean>
  evaluatedAnswersByStepId: Record<string, string>
  completedChapterIndexes: number[]
  /** Skill-Mastery V2: 0..1 je Skill/Fragetyp im Lernpfad. */
  skillMasteryBySkillId: Record<
    string,
    {
      score: number
      attempts: number
      correct: number
      label?: string
      source?: 'chapter' | 'flashcard' | 'worksheet'
      /** Letzte Prompts mit falscher Bewertung (max. 6). */
      lastWrongPrompts?: string[]
      /** Letzte Prompts mit korrekter Bewertung (max. 6). */
      lastCorrectPrompts?: string[]
      wrongStreak?: number
      correctStreak?: number
      lastWrongAt?: string
      lastCorrectAt?: string
      lastUpdatedAt: string
    }
  >
}

export type LearningPathRecord = LearningPathSummary & {
  topic: string
  topicSuggestions: string[]
  selectedTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  setupStep: 1 | 2 | 3 | 4
  isSetupComplete: boolean
  materials: UploadedMaterial[]
  tutorMessages: TutorChatEntry[]
  entryQuiz: InteractiveQuizPayload | null
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  tutorState: LearnTutorState
  currentChapterIndex: number
  targetChapterCount: number
  unlockedChapterCount: number
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learnFlashcardSets: LearnFlashcardSet[]
  learnWorksheets: LearnWorksheetItem[]
}

type LearningPathRow = {
  id: string
  user_id: string
  title: string
  topic: string
  topic_suggestions: unknown
  selected_topic: string
  ai_guidance: string
  proficiency_level: string
  setup_step: number
  is_setup_complete: boolean
  materials: unknown
  tutor_messages: unknown
  entry_quiz: unknown
  entry_quiz_answers: unknown
  entry_quiz_result: unknown
  tutor_state: unknown
  current_chapter_index: unknown
  target_chapter_count: unknown
  unlocked_chapter_count: unknown
  syllabus: unknown
  learning_chapters: unknown
  chapter_blueprints: unknown
  chapter_session: unknown
  learn_flashcards: unknown
  learn_worksheets: unknown
  created_at: string
  updated_at: string
}

type LearningPathPatch = Partial<{
  title: string
  topic: string
  topicSuggestions: string[]
  selectedTopic: string
  aiGuidance: string
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  setupStep: 1 | 2 | 3 | 4
  isSetupComplete: boolean
  materials: UploadedMaterial[]
  tutorMessages: TutorChatEntry[]
  entryQuiz: InteractiveQuizPayload | null
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  tutorState: LearnTutorState
  currentChapterIndex: number
  targetChapterCount: number
  unlockedChapterCount: number
  syllabus: SyllabusEntry[]
  learningChapters: string[]
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learnFlashcardSets: LearnFlashcardSet[]
  learnWorksheets: LearnWorksheetItem[]
}>

function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const candidate = error as {
    message?: unknown
    details?: unknown
    hint?: unknown
    code?: unknown
  }
  const parts = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.details === 'string' ? candidate.details : '',
    typeof candidate.hint === 'string' ? candidate.hint : '',
    typeof candidate.code === 'string' ? `Code: ${candidate.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}

function mapMaterials(value: unknown): UploadedMaterial[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const candidate = entry as Record<string, unknown>
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const excerpt = typeof candidate.excerpt === 'string' ? candidate.excerpt : ''
      const size =
        typeof candidate.size === 'number'
          ? candidate.size
          : typeof candidate.size === 'string'
            ? Number(candidate.size)
            : NaN
      if (!id || !name || !Number.isFinite(size) || size < 0) {
        return null
      }
      return {
        id,
        name,
        size,
        excerpt,
      }
    })
    .filter((entry): entry is UploadedMaterial => entry !== null)
}

function mapTutorMessages(value: unknown): TutorChatEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry): TutorChatEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const candidate = entry as Record<string, unknown>
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      const role = candidate.role === 'user' ? 'user' : candidate.role === 'assistant' ? 'assistant' : null
      const content = typeof candidate.content === 'string' ? candidate.content : ''
      const action =
        candidate.action === 'open-entry-test'
          ? 'open-entry-test'
          : candidate.action === 'start-next-chapter'
            ? 'start-next-chapter'
            : candidate.action === 'create-flashcards'
              ? 'create-flashcards'
              : candidate.action === 'create-worksheet'
                ? 'create-worksheet'
            : undefined
      if (!id || !role || !content) {
        return null
      }
      const result: TutorChatEntry = {
        id,
        role,
        content,
      }
      if (action) {
        result.action = action
      }
      return result
    })
    .filter((entry): entry is TutorChatEntry => entry !== null)
}

function mapTopicSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 5)
}

function mapLearningChapters(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function mapSyllabus(value: unknown): SyllabusEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries: SyllabusEntry[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const item = raw as Record<string, unknown>
    const topic = typeof item.topic === 'string' ? item.topic.trim() : ''
    const learningGoal = typeof item.learningGoal === 'string' ? item.learningGoal.trim() : ''
    if (!topic || !learningGoal) {
      continue
    }
    entries.push({
      topic: topic.slice(0, 160),
      learningGoal: learningGoal.slice(0, 320),
    })
  }
  return entries.slice(0, 6)
}

function mapChapterStep(value: unknown, index: number): ChapterStep | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  const type = item.type === 'question' || item.type === 'recap' ? item.type : 'explanation'
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `step-${index + 1}`

  if (type === 'question') {
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    const acceptableAnswers = Array.isArray(item.acceptableAnswers)
      ? item.acceptableAnswers
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined
    const hint = typeof item.hint === 'string' && item.hint.trim() ? item.hint.trim() : undefined
    const explanation = typeof item.explanation === 'string' && item.explanation.trim() ? item.explanation.trim() : undefined
    const evaluation = item.evaluation === 'contains' ? 'contains' : 'exact'
    const skillTag = typeof item.skillTag === 'string' && item.skillTag.trim() ? item.skillTag.trim().slice(0, 80) : undefined

    const matchLeft = Array.isArray(item.matchLeft)
      ? item.matchLeft
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    const matchRight = Array.isArray(item.matchRight)
      ? item.matchRight
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    const wantsMatch =
      item.questionType === 'match' ||
      (matchLeft.length >= 2 && matchLeft.length === matchRight.length && prompt.length > 0)

    if (wantsMatch && matchLeft.length === matchRight.length && matchLeft.length >= 2 && prompt) {
      const n = matchLeft.length
      const canonicalExpected = Array.from({ length: n }, (_, i) => String(i)).join(',')
      const expectedAnswer =
        typeof item.expectedAnswer === 'string' && item.expectedAnswer.trim()
          ? item.expectedAnswer.trim()
          : canonicalExpected
      return {
        id,
        type,
        questionType: 'match',
        prompt,
        matchLeft,
        matchRight,
        expectedAnswer,
        acceptableAnswers,
        hint,
        explanation,
        evaluation: 'exact',
        skillTag,
      }
    }

    const categories = Array.isArray(item.categories)
      ? item.categories
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    const items = Array.isArray(item.items)
      ? item.items
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    const wantsCategorize =
      item.questionType === 'categorize' || (categories.length >= 2 && items.length >= 2 && prompt.length > 0)

    if (wantsCategorize && categories.length >= 2 && items.length >= 2 && prompt) {
      const expectedParts = (typeof item.expectedAnswer === 'string' ? item.expectedAnswer : '')
        .split(',')
        .map((s) => s.trim())
      const expectedValid =
        expectedParts.length === items.length &&
        expectedParts.every((p) => {
          const num = Number.parseInt(p, 10)
          return !Number.isNaN(num) && num >= 0 && num < categories.length
        })
      if (expectedValid) {
        return {
          id,
          type,
          questionType: 'categorize',
          prompt,
          categories,
          items,
          expectedAnswer: expectedParts.map((p) => String(Number.parseInt(p, 10))).join(','),
          acceptableAnswers,
          hint,
          explanation,
          evaluation: 'exact',
          skillTag,
        }
      }
    }

    const qtf = item.questionType === 'true_false' || item.type === 'true_false'
    const expectedRaw = coerceQuizScalarToString(item.expectedAnswer)
    if (qtf && prompt && expectedRaw) {
      const lower = expectedRaw.toLowerCase()
      const truthy = new Set(['wahr', 'true', 't', 'ja', 'yes', '1', 'richtig', 'korrekt'])
      const falsy = new Set(['falsch', 'false', 'f', 'nein', 'no', '0'])
      let norm: 'Wahr' | 'Falsch' | null = null
      if (truthy.has(lower)) {
        norm = 'Wahr'
      } else if (falsy.has(lower)) {
        norm = 'Falsch'
      }
      if (!norm) {
        return null
      }
      return {
        id,
        type,
        questionType: 'true_false',
        prompt,
        options: ['Wahr', 'Falsch'],
        expectedAnswer: norm,
        acceptableAnswers,
        hint,
        explanation,
        evaluation: 'exact',
        skillTag,
      }
    }

    const expectedStr = expectedRaw
    if (!prompt || !expectedStr) {
      return null
    }
    const options = Array.isArray(item.options)
      ? item.options
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined
    const optList = options && options.length > 0 ? options : []
    const acceptableList = Array.isArray(item.acceptableAnswers)
      ? item.acceptableAnswers
          .map((entry) => coerceQuizScalarToString(entry))
          .filter(Boolean)
      : undefined

    if (item.questionType === 'mcq' && optList.length >= 2) {
      return {
        id,
        type,
        questionType: 'mcq',
        prompt,
        options: optList,
        expectedAnswer: resolveMcqExpectedAnswer(expectedStr, optList),
        acceptableAnswers: acceptableList?.map((a) => resolveMcqExpectedAnswer(a, optList)),
        hint,
        explanation,
        evaluation,
        skillTag,
      }
    }

    return {
      id,
      type,
      questionType: 'text',
      prompt,
      expectedAnswer: expectedStr,
      acceptableAnswers: acceptableList,
      hint,
      explanation,
      evaluation,
      skillTag,
    }
  }

  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const content = typeof item.content === 'string' ? item.content.trim() : ''
  if (!title || !content) {
    return null
  }
  const bullets = Array.isArray(item.bullets)
    ? item.bullets
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined

  if (type === 'recap') {
    return {
      id,
      type: 'recap',
      title,
      content,
      bullets,
    }
  }

  return {
    id,
    type: 'explanation',
    title,
    content,
    bullets,
  }
}

function mapChapterBlueprints(value: unknown): ChapterBlueprint[] {
  if (!Array.isArray(value)) {
    return []
  }

  return namespaceChapterStepIds(
    value
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const item = entry as Record<string, unknown>
        const title = typeof item.title === 'string' ? item.title.trim() : ''
        const rawSteps = Array.isArray(item.steps) ? item.steps : []
        const steps = rawSteps
          .map((step, stepIndex) => mapChapterStep(step, stepIndex))
          .filter(Boolean) as ChapterStep[]
        if (!title || steps.length === 0) {
          return null
        }
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `chapter-${index + 1}`,
          title,
          description: typeof item.description === 'string' ? item.description.trim() : undefined,
          source: item.source === 'fallback' ? 'fallback' : 'ai',
          steps,
        } satisfies ChapterBlueprint
      })
      .filter(Boolean)
      .map((entry) => entry as ChapterBlueprint)
      .slice(0, 6),
  )
}

function mapChapterSession(value: unknown): ChapterSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      chapterIndex: 0,
      stepIndex: 0,
      answersByStepId: {},
      feedbackByStepId: {},
      correctnessByStepId: {},
      evaluatedAnswersByStepId: {},
      completedChapterIndexes: [],
      skillMasteryBySkillId: {},
    }
  }
  const item = value as Record<string, unknown>
  const chapterIndex = typeof item.chapterIndex === 'number' && Number.isFinite(item.chapterIndex) ? item.chapterIndex : 0
  const stepIndex = typeof item.stepIndex === 'number' && Number.isFinite(item.stepIndex) ? item.stepIndex : 0
  const completedChapterIndexes = Array.isArray(item.completedChapterIndexes)
    ? item.completedChapterIndexes.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : []
  const skillMasteryBySkillId = mapSkillMasteryRecord(item.skillMasteryBySkillId)
  return {
    chapterIndex,
    stepIndex,
    answersByStepId: mapEntryQuizAnswers(item.answersByStepId),
    feedbackByStepId: mapEntryQuizAnswers(item.feedbackByStepId),
    correctnessByStepId: mapBooleanRecord(item.correctnessByStepId),
    evaluatedAnswersByStepId: mapEntryQuizAnswers(item.evaluatedAnswersByStepId),
    completedChapterIndexes,
    skillMasteryBySkillId,
  }
}

function mapSkillMasteryRecord(
  value: unknown,
): ChapterSession['skillMasteryBySkillId'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: ChapterSession['skillMasteryBySkillId'] = {}
  for (const [skillId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!skillId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue
    }
    const e = raw as Record<string, unknown>
    const scoreRaw = typeof e.score === 'number' && Number.isFinite(e.score) ? e.score : 0
    const attemptsRaw = typeof e.attempts === 'number' && Number.isFinite(e.attempts) ? e.attempts : 0
    const correctRaw = typeof e.correct === 'number' && Number.isFinite(e.correct) ? e.correct : 0
    const score = Math.max(0, Math.min(1, scoreRaw))
    const attempts = Math.max(0, Math.floor(attemptsRaw))
    const correct = Math.max(0, Math.floor(correctRaw))
    const label = typeof e.label === 'string' && e.label.trim().length > 0 ? e.label.trim() : undefined
    const source =
      e.source === 'chapter' || e.source === 'flashcard' || e.source === 'worksheet'
        ? e.source
        : undefined
    const lastUpdatedAt =
      typeof e.lastUpdatedAt === 'string' && e.lastUpdatedAt.trim().length > 0
        ? e.lastUpdatedAt.trim()
        : new Date(0).toISOString()
    const rawWrongPrompts = Array.isArray(e.lastWrongPrompts) ? e.lastWrongPrompts : []
    const rawCorrectPrompts = Array.isArray(e.lastCorrectPrompts) ? e.lastCorrectPrompts : []
    const lastWrongPrompts = rawWrongPrompts
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
      .slice(0, 6)
    const lastCorrectPrompts = rawCorrectPrompts
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
      .slice(0, 6)
    const wrongStreak =
      typeof e.wrongStreak === 'number' && Number.isFinite(e.wrongStreak)
        ? Math.max(0, Math.floor(e.wrongStreak))
        : 0
    const correctStreak =
      typeof e.correctStreak === 'number' && Number.isFinite(e.correctStreak)
        ? Math.max(0, Math.floor(e.correctStreak))
        : 0
    const lastWrongAt =
      typeof e.lastWrongAt === 'string' && e.lastWrongAt.trim().length > 0
        ? e.lastWrongAt.trim()
        : undefined
    const lastCorrectAt =
      typeof e.lastCorrectAt === 'string' && e.lastCorrectAt.trim().length > 0
        ? e.lastCorrectAt.trim()
        : undefined
    out[skillId] = {
      score,
      attempts,
      correct,
      ...(label ? { label } : {}),
      ...(source ? { source } : {}),
      ...(lastWrongPrompts.length > 0 ? { lastWrongPrompts } : {}),
      ...(lastCorrectPrompts.length > 0 ? { lastCorrectPrompts } : {}),
      ...(wrongStreak > 0 ? { wrongStreak } : {}),
      ...(correctStreak > 0 ? { correctStreak } : {}),
      ...(lastWrongAt ? { lastWrongAt } : {}),
      ...(lastCorrectAt ? { lastCorrectAt } : {}),
      lastUpdatedAt,
    }
  }
  return out
}

function mapEntryQuizAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim() || typeof raw !== 'string') {
      continue
    }
    out[key] = raw
  }
  return out
}

function mapBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const out: Record<string, boolean> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim() || typeof raw !== 'boolean') {
      continue
    }
    out[key] = raw
  }
  return out
}

function parsePersistedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function mapEntryQuiz(value: unknown): InteractiveQuizPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const rawQuestions = Array.isArray(candidate.questions) ? candidate.questions : []
  if (rawQuestions.length === 0) {
    return null
  }

  const questions = rawQuestions
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const item = entry as Record<string, unknown>
      const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
      const matchLeft = parsePersistedStringArray(item.matchLeft)
      const matchRight = parsePersistedStringArray(item.matchRight)
      const wantsMatch =
        item.questionType === 'match' ||
        (matchLeft.length >= 2 && matchLeft.length === matchRight.length && prompt.length > 0)

      if (wantsMatch && matchLeft.length === matchRight.length && matchLeft.length >= 2 && prompt) {
        const n = matchLeft.length
        const canonicalExpected = Array.from({ length: n }, (_, i) => String(i)).join(',')
        const expectedAnswer =
          typeof item.expectedAnswer === 'string' && item.expectedAnswer.trim()
            ? item.expectedAnswer.trim()
            : canonicalExpected
        const acceptableAnswers = Array.isArray(item.acceptableAnswers)
          ? item.acceptableAnswers
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean)
          : []
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
          prompt,
          questionType: 'match' as const,
          matchLeft,
          matchRight,
          expectedAnswer,
          acceptableAnswers,
          hint: typeof item.hint === 'string' ? item.hint.trim() : undefined,
          explanation: typeof item.explanation === 'string' ? item.explanation.trim() : undefined,
          evaluation: 'exact' as const,
        } satisfies InteractiveQuizPayload['questions'][number]
      }

      const categories = parsePersistedStringArray(item.categories)
      const items = parsePersistedStringArray(item.items)
      const wantsCategorize =
        item.questionType === 'categorize' || (categories.length >= 2 && items.length >= 2 && prompt.length > 0)
      if (wantsCategorize && categories.length >= 2 && items.length >= 2 && prompt) {
        const expectedParts = (typeof item.expectedAnswer === 'string' ? item.expectedAnswer : '')
          .split(',')
          .map((s) => s.trim())
        const expectedValid =
          expectedParts.length === items.length &&
          expectedParts.every((p) => {
            const num = Number.parseInt(p, 10)
            return !Number.isNaN(num) && num >= 0 && num < categories.length
          })
        if (expectedValid) {
          return {
            id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
            prompt,
            questionType: 'categorize' as const,
            categories,
            items,
            expectedAnswer: expectedParts.map((p) => String(Number.parseInt(p, 10))).join(','),
            acceptableAnswers: [],
            hint: typeof item.hint === 'string' ? item.hint.trim() : undefined,
            explanation: typeof item.explanation === 'string' ? item.explanation.trim() : undefined,
            evaluation: 'exact' as const,
          } satisfies InteractiveQuizPayload['questions'][number]
        }
      }

      const qtf = item.questionType === 'true_false' || item.type === 'true_false'
      const expectedTfRaw = coerceQuizScalarToString(item.expectedAnswer)
      if (qtf && prompt && expectedTfRaw) {
        const lower = expectedTfRaw.toLowerCase()
        const truthy = new Set(['wahr', 'true', 't', 'ja', 'yes', '1', 'richtig', 'korrekt'])
        const falsy = new Set(['falsch', 'false', 'f', 'nein', 'no', '0'])
        let norm: 'Wahr' | 'Falsch' | null = null
        if (truthy.has(lower)) {
          norm = 'Wahr'
        } else if (falsy.has(lower)) {
          norm = 'Falsch'
        }
        if (!norm) {
          return null
        }
        const acceptableAnswersTf = Array.isArray(item.acceptableAnswers)
          ? item.acceptableAnswers
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean)
          : []
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
          prompt,
          questionType: 'true_false' as const,
          options: ['Wahr', 'Falsch'],
          expectedAnswer: norm,
          acceptableAnswers: acceptableAnswersTf,
          hint: typeof item.hint === 'string' ? item.hint.trim() : undefined,
          explanation: typeof item.explanation === 'string' ? item.explanation.trim() : undefined,
          evaluation: 'exact' as const,
        } satisfies InteractiveQuizPayload['questions'][number]
      }

      const expectedAnswer = coerceQuizScalarToString(item.expectedAnswer)
      if (!prompt || !expectedAnswer) {
        return null
      }
      const acceptableAnswers = Array.isArray(item.acceptableAnswers)
        ? item.acceptableAnswers
            .map((value) => coerceQuizScalarToString(value))
            .filter(Boolean)
        : []
      const options = Array.isArray(item.options)
        ? item.options
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined
      const normalizedOptions = options && options.length > 0 ? options : undefined
      const normalizedExpectedAnswer =
        item.questionType === 'mcq' && normalizedOptions
          ? resolveMcqExpectedAnswer(expectedAnswer, normalizedOptions)
          : expectedAnswer
      const normalizedAcceptableAnswers =
        item.questionType === 'mcq' && normalizedOptions
          ? acceptableAnswers.map((value) => resolveMcqExpectedAnswer(value, normalizedOptions))
          : acceptableAnswers
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
        prompt,
        questionType: item.questionType === 'mcq' ? 'mcq' : 'text',
        options: normalizedOptions,
        expectedAnswer: normalizedExpectedAnswer,
        acceptableAnswers: normalizedAcceptableAnswers,
        hint: typeof item.hint === 'string' ? item.hint : undefined,
        explanation: typeof item.explanation === 'string' ? item.explanation : undefined,
        evaluation: item.evaluation === 'contains' ? 'contains' : 'exact',
      } as InteractiveQuizPayload['questions'][number]
    })
    .filter((entry): entry is InteractiveQuizPayload['questions'][number] => entry !== null)

  if (questions.length === 0) {
    return null
  }

  return {
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    questions,
  }
}

function mapEntryQuizResult(value: unknown): EntryQuizResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Record<string, unknown>
  const score = typeof candidate.score === 'number' ? candidate.score : Number.NaN
  const total = typeof candidate.total === 'number' ? candidate.total : Number.NaN
  if (!Number.isFinite(score) || !Number.isFinite(total)) {
    return null
  }

  return {
    score,
    total,
    feedbackByQuestionId: mapEntryQuizAnswers(candidate.feedbackByQuestionId),
    correctnessByQuestionId: mapBooleanRecord(candidate.correctnessByQuestionId),
    evaluatedAnswersByQuestionId: mapEntryQuizAnswers(candidate.evaluatedAnswersByQuestionId),
  }
}

function mapLearnFlashcardsFlat(value: unknown): LearnFlashcard[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: LearnFlashcard[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const o = entry as Record<string, unknown>
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `fc-${out.length + 1}`
    const question = typeof o.question === 'string' ? o.question.trim() : ''
    const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
    if (question && answer) {
      const sr = o.selfRating
      const selfRating =
        sr === 'known' || sr === 'unknown' ? sr : undefined
      const srStageRaw = o.srStage
      const srStage =
        typeof srStageRaw === 'number' && Number.isFinite(srStageRaw) && srStageRaw >= 0
          ? Math.floor(srStageRaw)
          : undefined
      const nextReviewAt =
        typeof o.nextReviewAt === 'string' && o.nextReviewAt.trim() ? o.nextReviewAt.trim() : undefined
      const lastReviewedAt =
        typeof o.lastReviewedAt === 'string' && o.lastReviewedAt.trim() ? o.lastReviewedAt.trim() : undefined
      const skillTag =
        typeof o.skillTag === 'string' && o.skillTag.trim() ? o.skillTag.trim().slice(0, 80) : undefined
      out.push(
        normalizeFlashcardSr({
          id,
          question,
          answer,
          ...(skillTag ? { skillTag } : {}),
          ...(selfRating ? { selfRating } : {}),
          ...(srStage !== undefined ? { srStage } : {}),
          ...(nextReviewAt ? { nextReviewAt } : {}),
          ...(lastReviewedAt ? { lastReviewedAt } : {}),
        }),
      )
    }
  }
  return out.slice(0, 50)
}

function mapLearnFlashcardSets(value: unknown): LearnFlashcardSet[] {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }
  const first = value[0]
  const looksLikeSet =
    first &&
    typeof first === 'object' &&
    first !== null &&
    'cards' in first &&
    Array.isArray((first as { cards: unknown }).cards)

  if (looksLikeSet) {
    const out: LearnFlashcardSet[] = []
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const id =
        typeof o.id === 'string' && o.id.trim()
          ? o.id.trim()
          : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `fs-${out.length + 1}`
      const title = typeof o.title === 'string' ? o.title.trim() : undefined
      const cards = mapLearnFlashcardsFlat(o.cards)
      if (cards.length > 0) {
        out.push({
          id,
          ...(title ? { title } : {}),
          cards,
        })
      }
    }
    return out.slice(0, 25)
  }

  const flat = mapLearnFlashcardsFlat(value)
  if (flat.length === 0) {
    return []
  }
  return [{ id: 'legacy-flashcards-set', cards: flat }]
}

function mapLearnWorksheets(value: unknown): LearnWorksheetItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: LearnWorksheetItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const o = entry as Record<string, unknown>
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `ws-${out.length + 1}`
    const rawPrompt =
      typeof o.prompt === 'string'
        ? o.prompt.trim()
        : typeof o.question === 'string'
          ? o.question.trim()
          : ''
    const chapterIndex =
      typeof o.chapterIndex === 'number' &&
      Number.isFinite(o.chapterIndex) &&
      (o.chapterIndex === -1 || o.chapterIndex >= 0)
        ? Math.floor(o.chapterIndex)
        : undefined
    if (rawPrompt) {
      const evaluated = o.evaluated === true
      const lastCorrect = typeof o.lastCorrect === 'boolean' ? o.lastCorrect : undefined
      const rawSaved =
        typeof o.savedAnswer === 'string'
          ? o.savedAnswer
          : typeof o.answer === 'string'
            ? o.answer
            : ''
      const submittedAtRaw = typeof o.submittedAt === 'string' ? o.submittedAt.trim() : ''
      const clipped = rawSaved.length > 16000 ? `${rawSaved.slice(0, 16000)}…` : rawSaved
      const savedAnswer = clipped.length > 0 ? clipped : undefined
      const submittedAt = submittedAtRaw.length > 0 ? submittedAtRaw : undefined
      const rawQType = o.questionType ?? o.type
      const questionType =
        rawQType === 'mcq' ||
        rawQType === 'text' ||
        rawQType === 'match' ||
        rawQType === 'true_false' ||
        rawQType === 'categorize'
          ? rawQType
          : undefined
      const parseStringArray = (value: unknown): string[] | undefined => {
        if (!Array.isArray(value)) {
          return undefined
        }
        const arr = value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
        return arr.length > 0 ? arr : undefined
      }
      const expectedAnswer =
        typeof o.expectedAnswer === 'string' && o.expectedAnswer.trim() ? o.expectedAnswer.trim() : undefined
      const acceptableAnswers = parseStringArray(o.acceptableAnswers)
      const hint = typeof o.hint === 'string' && o.hint.trim() ? o.hint.trim() : undefined
      const explanation =
        typeof o.explanation === 'string' && o.explanation.trim() ? o.explanation.trim() : undefined
      const evaluation = o.evaluation === 'contains' ? 'contains' : o.evaluation === 'exact' ? 'exact' : undefined
      const skillTag =
        typeof o.skillTag === 'string' && o.skillTag.trim() ? o.skillTag.trim().slice(0, 80) : undefined
      out.push({
        id,
        prompt: rawPrompt,
        chapterIndex,
        ...(questionType ? { questionType } : {}),
        ...(skillTag ? { skillTag } : {}),
        ...(parseStringArray(o.options) ? { options: parseStringArray(o.options) } : {}),
        ...(parseStringArray(o.categories) ? { categories: parseStringArray(o.categories) } : {}),
        ...(parseStringArray(o.items) ? { items: parseStringArray(o.items) } : {}),
        ...(parseStringArray(o.matchLeft) ? { matchLeft: parseStringArray(o.matchLeft) } : {}),
        ...(parseStringArray(o.matchRight) ? { matchRight: parseStringArray(o.matchRight) } : {}),
        ...(expectedAnswer ? { expectedAnswer } : {}),
        ...(acceptableAnswers ? { acceptableAnswers } : {}),
        ...(hint ? { hint } : {}),
        ...(explanation ? { explanation } : {}),
        ...(evaluation ? { evaluation } : {}),
        ...(evaluated ? { evaluated: true } : {}),
        ...(typeof lastCorrect === 'boolean' ? { lastCorrect } : {}),
        ...(savedAnswer !== undefined && savedAnswer.length > 0 ? { savedAnswer } : {}),
        ...(submittedAt ? { submittedAt } : {}),
      })
    }
  }
  return out.slice(0, 50)
}

function mapProficiencyLevel(value: unknown): '' | 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }
  return ''
}

function mapTutorState(value: unknown): LearnTutorState {
  return value === 'entry_quiz_done' ||
    value === 'chapter_learning' ||
    value === 'chapter_completed'
    ? value
    : 'entry_quiz_pending'
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(n)) {
    return fallback
  }
  return Math.max(0, Math.floor(n))
}

function mapRecord(row: LearningPathRow): LearningPathRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    topic: row.topic ?? '',
    topicSuggestions: mapTopicSuggestions(row.topic_suggestions),
    selectedTopic: (row.selected_topic ?? '').trim(),
    aiGuidance: (row.ai_guidance ?? '').trim(),
    proficiencyLevel: mapProficiencyLevel(row.proficiency_level),
    setupStep: row.setup_step === 2 ? 2 : row.setup_step === 3 ? 3 : row.setup_step === 4 ? 4 : 1,
    isSetupComplete: row.is_setup_complete === true,
    materials: mapMaterials(row.materials),
    tutorMessages: mapTutorMessages(row.tutor_messages),
    entryQuiz: mapEntryQuiz(row.entry_quiz),
    entryQuizAnswers: mapEntryQuizAnswers(row.entry_quiz_answers),
    entryQuizResult: mapEntryQuizResult(row.entry_quiz_result),
    tutorState: mapTutorState(row.tutor_state),
    currentChapterIndex: toNonNegativeInt(row.current_chapter_index, 0),
    targetChapterCount: Math.max(1, toNonNegativeInt(row.target_chapter_count, 1)),
    unlockedChapterCount: Math.max(1, toNonNegativeInt(row.unlocked_chapter_count, 1)),
    syllabus: mapSyllabus(row.syllabus),
    learningChapters: mapLearningChapters(row.learning_chapters),
    chapterBlueprints: mapChapterBlueprints(row.chapter_blueprints),
    chapterSession: mapChapterSession(row.chapter_session),
    learnFlashcardSets: mapLearnFlashcardSets(row.learn_flashcards),
    learnWorksheets: mapLearnWorksheets(row.learn_worksheets ?? []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toUpdateRow(patch: LearningPathPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.topic !== undefined) row.topic = patch.topic
  if (patch.topicSuggestions !== undefined) row.topic_suggestions = patch.topicSuggestions
  if (patch.selectedTopic !== undefined) row.selected_topic = patch.selectedTopic
  if (patch.aiGuidance !== undefined) row.ai_guidance = patch.aiGuidance
  if (patch.proficiencyLevel !== undefined) row.proficiency_level = patch.proficiencyLevel
  if (patch.setupStep !== undefined) row.setup_step = patch.setupStep
  if (patch.isSetupComplete !== undefined) row.is_setup_complete = patch.isSetupComplete
  if (patch.materials !== undefined) row.materials = patch.materials
  if (patch.tutorMessages !== undefined) row.tutor_messages = patch.tutorMessages
  if (patch.entryQuiz !== undefined) row.entry_quiz = patch.entryQuiz
  if (patch.entryQuizAnswers !== undefined) row.entry_quiz_answers = patch.entryQuizAnswers
  if (patch.entryQuizResult !== undefined) row.entry_quiz_result = patch.entryQuizResult
  if (patch.tutorState !== undefined) row.tutor_state = patch.tutorState
  if (patch.currentChapterIndex !== undefined) row.current_chapter_index = patch.currentChapterIndex
  if (patch.targetChapterCount !== undefined) row.target_chapter_count = patch.targetChapterCount
  if (patch.unlockedChapterCount !== undefined) row.unlocked_chapter_count = patch.unlockedChapterCount
  if (patch.syllabus !== undefined) row.syllabus = patch.syllabus
  if (patch.learningChapters !== undefined) row.learning_chapters = patch.learningChapters
  if (patch.chapterBlueprints !== undefined) row.chapter_blueprints = patch.chapterBlueprints
  if (patch.chapterSession !== undefined) row.chapter_session = patch.chapterSession
  if (patch.learnFlashcardSets !== undefined) row.learn_flashcards = patch.learnFlashcardSets
  if (patch.learnWorksheets !== undefined) row.learn_worksheets = patch.learnWorksheets
  return row
}

function stripNullChars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.split('\0').join('')
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripNullChars(entry))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stripNullChars(entry)
    }
    return out
  }
  return value
}

export async function listLearningPathsByUserId(userId: string): Promise<LearningPathRecord[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, tutor_state, current_chapter_index, target_chapter_count, unlocked_chapter_count, syllabus, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw toReadableError(error)
  }

  return (data ?? []).map((row) => mapRecord(row as LearningPathRow))
}

export async function getLearningPathById(pathId: string): Promise<LearningPathRecord | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, tutor_state, current_chapter_index, target_chapter_count, unlocked_chapter_count, syllabus, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
    )
    .eq('id', pathId)
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }

  if (!data) {
    return null
  }

  return mapRecord(data as LearningPathRow)
}

export async function createLearningPathByUserId(
  userId: string,
  title: string,
): Promise<LearningPathRecord> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .insert({
      user_id: userId,
      title,
    })
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, tutor_state, current_chapter_index, target_chapter_count, unlocked_chapter_count, syllabus, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
    )
    .single()

  if (error) {
    throw toReadableError(error)
  }

  return mapRecord(data as LearningPathRow)
}

export async function updateLearningPathById(
  pathId: string,
  patch: LearningPathPatch,
): Promise<LearningPathRecord> {
  const rowPatch = stripNullChars(toUpdateRow(patch)) as Record<string, unknown>
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .update(rowPatch)
    .eq('id', pathId)
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, tutor_state, current_chapter_index, target_chapter_count, unlocked_chapter_count, syllabus, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
    )
    .single()

  if (error) {
    throw toReadableError(error)
  }

  return mapRecord(data as LearningPathRow)
}

export async function deleteLearningPathById(pathId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learning_paths').delete().eq('id', pathId)

  if (error) {
    throw toReadableError(error)
  }
}

/** Entfernt unbearbeitete Lernpfade (Setup Schritt 1 ohne Inhalt). */
export async function deleteEmptyLearningPathsByUserId(userId: string): Promise<number> {
  const paths = await listLearningPathsByUserId(userId)
  const emptyIds = paths.filter((path) => isLearningPathEmpty(path)).map((path) => path.id)
  if (emptyIds.length === 0) {
    return 0
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learning_paths').delete().in('id', emptyIds)
  if (error) {
    throw toReadableError(error)
  }
  return emptyIds.length
}
