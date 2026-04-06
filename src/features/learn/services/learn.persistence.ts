import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import { namespaceChapterStepIds } from '../utils/chapterStepIds'

export type LearningPathSummary = {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
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
  action?: 'open-entry-test'
}

export type EntryQuizResult = {
  score: number
  total: number
  feedbackByQuestionId: Record<string, string>
  correctnessByQuestionId?: Record<string, boolean>
  evaluatedAnswersByQuestionId?: Record<string, string>
}

export type LearnFlashcard = {
  id: string
  question: string
  answer: string
}

/** Arbeitsblatt: nur Aufgabenstellungen (Antworten handschriftlich / separat). */
export type LearnWorksheetItem = {
  id: string
  prompt: string
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
      questionType: 'mcq' | 'text'
      prompt: string
      options?: string[]
      expectedAnswer: string
      acceptableAnswers?: string[]
      hint?: string
      explanation?: string
      evaluation?: 'exact' | 'contains'
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

export type ChapterBlueprint = {
  id: string
  title: string
  description?: string
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
  learningChapters: string[]
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learnFlashcards: LearnFlashcard[]
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
  learningChapters: string[]
  chapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learnFlashcards: LearnFlashcard[]
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
      const action = candidate.action === 'open-entry-test' ? 'open-entry-test' : undefined
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

function mapChapterStep(value: unknown, index: number): ChapterStep | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  const type = item.type === 'question' || item.type === 'recap' ? item.type : 'explanation'
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `step-${index + 1}`

  if (type === 'question') {
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    const expectedAnswer = typeof item.expectedAnswer === 'string' ? item.expectedAnswer.trim() : ''
    if (!prompt || !expectedAnswer) {
      return null
    }
    const options = Array.isArray(item.options)
      ? item.options
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined
    const acceptableAnswers = Array.isArray(item.acceptableAnswers)
      ? item.acceptableAnswers
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined
    return {
      id,
      type,
      questionType: item.questionType === 'mcq' ? 'mcq' : 'text',
      prompt,
      options: options && options.length > 0 ? options : undefined,
      expectedAnswer,
      acceptableAnswers,
      hint: typeof item.hint === 'string' && item.hint.trim() ? item.hint.trim() : undefined,
      explanation: typeof item.explanation === 'string' && item.explanation.trim() ? item.explanation.trim() : undefined,
      evaluation: item.evaluation === 'contains' ? 'contains' : 'exact',
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
    }
  }
  const item = value as Record<string, unknown>
  const chapterIndex = typeof item.chapterIndex === 'number' && Number.isFinite(item.chapterIndex) ? item.chapterIndex : 0
  const stepIndex = typeof item.stepIndex === 'number' && Number.isFinite(item.stepIndex) ? item.stepIndex : 0
  const completedChapterIndexes = Array.isArray(item.completedChapterIndexes)
    ? item.completedChapterIndexes.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : []
  return {
    chapterIndex,
    stepIndex,
    answersByStepId: mapEntryQuizAnswers(item.answersByStepId),
    feedbackByStepId: mapEntryQuizAnswers(item.feedbackByStepId),
    correctnessByStepId: mapBooleanRecord(item.correctnessByStepId),
    evaluatedAnswersByStepId: mapEntryQuizAnswers(item.evaluatedAnswersByStepId),
    completedChapterIndexes,
  }
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

function resolvePersistedMcqExpectedAnswer(rawExpected: string, options: string[]): string {
  const expected = rawExpected.trim()
  if (!expected) {
    return ''
  }
  const index = Number.parseInt(expected, 10)
  if (Number.isInteger(index) && index >= 0 && index < options.length) {
    return options[index] ?? expected
  }
  return expected
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

      const expectedAnswer = typeof item.expectedAnswer === 'string' ? item.expectedAnswer.trim() : ''
      if (!prompt || !expectedAnswer) {
        return null
      }
      const acceptableAnswers = Array.isArray(item.acceptableAnswers)
        ? item.acceptableAnswers
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
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
          ? resolvePersistedMcqExpectedAnswer(expectedAnswer, normalizedOptions)
          : expectedAnswer
      const normalizedAcceptableAnswers =
        item.questionType === 'mcq' && normalizedOptions
          ? acceptableAnswers.map((value) => resolvePersistedMcqExpectedAnswer(value, normalizedOptions))
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

function mapLearnFlashcards(value: unknown): LearnFlashcard[] {
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
      out.push({ id, question, answer })
    }
  }
  return out.slice(0, 50)
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
    if (rawPrompt) {
      out.push({ id, prompt: rawPrompt })
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
    learningChapters: mapLearningChapters(row.learning_chapters),
    chapterBlueprints: mapChapterBlueprints(row.chapter_blueprints),
    chapterSession: mapChapterSession(row.chapter_session),
    learnFlashcards: mapLearnFlashcards(row.learn_flashcards),
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
  if (patch.learningChapters !== undefined) row.learning_chapters = patch.learningChapters
  if (patch.chapterBlueprints !== undefined) row.chapter_blueprints = patch.chapterBlueprints
  if (patch.chapterSession !== undefined) row.chapter_session = patch.chapterSession
  if (patch.learnFlashcards !== undefined) row.learn_flashcards = patch.learnFlashcards
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
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

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
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
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
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
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
      'id, user_id, title, topic, topic_suggestions, selected_topic, ai_guidance, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, learning_chapters, chapter_blueprints, chapter_session, learn_flashcards, learn_worksheets, created_at, updated_at',
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
