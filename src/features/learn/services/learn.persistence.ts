import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'

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

export type LearningPathRecord = LearningPathSummary & {
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
}

type LearningPathRow = {
  id: string
  user_id: string
  title: string
  topic: string
  topic_suggestions: unknown
  selected_topic: string
  proficiency_level: string
  setup_step: number
  is_setup_complete: boolean
  materials: unknown
  tutor_messages: unknown
  entry_quiz: unknown
  entry_quiz_answers: unknown
  entry_quiz_result: unknown
  created_at: string
  updated_at: string
}

type LearningPathPatch = Partial<{
  title: string
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
}>

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
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
        prompt,
        questionType: item.questionType === 'mcq' ? 'mcq' : 'text',
        options: options && options.length > 0 ? options : undefined,
        expectedAnswer,
        acceptableAnswers,
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
    proficiencyLevel: mapProficiencyLevel(row.proficiency_level),
    setupStep: row.setup_step === 2 ? 2 : row.setup_step === 3 ? 3 : 1,
    isSetupComplete: row.is_setup_complete === true,
    materials: mapMaterials(row.materials),
    tutorMessages: mapTutorMessages(row.tutor_messages),
    entryQuiz: mapEntryQuiz(row.entry_quiz),
    entryQuizAnswers: mapEntryQuizAnswers(row.entry_quiz_answers),
    entryQuizResult: mapEntryQuizResult(row.entry_quiz_result),
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
  if (patch.proficiencyLevel !== undefined) row.proficiency_level = patch.proficiencyLevel
  if (patch.setupStep !== undefined) row.setup_step = patch.setupStep
  if (patch.isSetupComplete !== undefined) row.is_setup_complete = patch.isSetupComplete
  if (patch.materials !== undefined) row.materials = patch.materials
  if (patch.tutorMessages !== undefined) row.tutor_messages = patch.tutorMessages
  if (patch.entryQuiz !== undefined) row.entry_quiz = patch.entryQuiz
  if (patch.entryQuizAnswers !== undefined) row.entry_quiz_answers = patch.entryQuizAnswers
  if (patch.entryQuizResult !== undefined) row.entry_quiz_result = patch.entryQuizResult
  return row
}

export async function listLearningPathsByUserId(userId: string): Promise<LearningPathRecord[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, created_at, updated_at',
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapRecord(row as LearningPathRow))
}

export async function getLearningPathById(pathId: string): Promise<LearningPathRecord | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, created_at, updated_at',
    )
    .eq('id', pathId)
    .maybeSingle()

  if (error) {
    throw error
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
      'id, user_id, title, topic, topic_suggestions, selected_topic, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapRecord(data as LearningPathRow)
}

export async function updateLearningPathById(
  pathId: string,
  patch: LearningPathPatch,
): Promise<LearningPathRecord> {
  const rowPatch = toUpdateRow(patch)
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .update(rowPatch)
    .eq('id', pathId)
    .select(
      'id, user_id, title, topic, topic_suggestions, selected_topic, proficiency_level, setup_step, is_setup_complete, materials, tutor_messages, entry_quiz, entry_quiz_answers, entry_quiz_result, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapRecord(data as LearningPathRow)
}

export async function deleteLearningPathById(pathId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('learning_paths').delete().eq('id', pathId)

  if (error) {
    throw error
  }
}
