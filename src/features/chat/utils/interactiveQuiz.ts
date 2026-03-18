export type InteractiveQuizQuestion = {
  id: string
  prompt: string
  questionType?: 'mcq' | 'text'
  options?: string[]
  expectedAnswer: string
  acceptableAnswers: string[]
  hint?: string
  explanation?: string
  evaluation: 'exact' | 'contains'
}

export type InteractiveQuizPayload = {
  title?: string
  questions: InteractiveQuizQuestion[]
}

export type ParsedInteractiveContent = {
  cleanText: string
  quiz: InteractiveQuizPayload | null
}

const QUIZ_START = '<<<STRATON_QUIZ_JSON>>>'
const QUIZ_END = '<<<END_STRATON_QUIZ_JSON>>>'

function tryParseQuizPayload(chunk: string): InteractiveQuizPayload | null {
  try {
    const parsed = JSON.parse(chunk) as unknown
    return sanitizeQuizPayload(parsed)
  } catch {
    return null
  }
}

function extractJsonCodeFence(content: string): string | null {
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (!fenceMatch || typeof fenceMatch[1] !== 'string') {
    return null
  }
  return fenceMatch[1].trim()
}

function extractLikelyJsonObject(content: string): string | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return content.slice(start, end + 1).trim()
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    unique.push(value)
  }
  return unique
}

function sanitizeQuestion(input: unknown, index: number): InteractiveQuizQuestion | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as Record<string, unknown>
  const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : ''
  const expectedAnswer = typeof candidate.expectedAnswer === 'string' ? candidate.expectedAnswer.trim() : ''
  if (!prompt || !expectedAnswer) {
    return null
  }

  const acceptableAnswers = Array.isArray(candidate.acceptableAnswers)
    ? candidate.acceptableAnswers
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []

  const evaluation = candidate.evaluation === 'contains' ? 'contains' : 'exact'
  const rawQuestionType =
    candidate.questionType === 'mcq' ||
    candidate.questionType === 'multiple_choice' ||
    candidate.type === 'mcq' ||
    candidate.type === 'multiple_choice'
      ? 'mcq'
      : 'text'
  const rawOptions = Array.isArray(candidate.options)
    ? candidate.options
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []
  const questionType = rawQuestionType === 'mcq' ? 'mcq' : 'text'
  let options = dedupeStrings(rawOptions)
  if (questionType === 'mcq') {
    options = dedupeStrings([...options, expectedAnswer, ...acceptableAnswers]).slice(0, 6)
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `q${index + 1}`,
    prompt,
    questionType,
    options: questionType === 'mcq' ? options : undefined,
    expectedAnswer,
    acceptableAnswers,
    hint: typeof candidate.hint === 'string' ? candidate.hint.trim() : undefined,
    explanation: typeof candidate.explanation === 'string' ? candidate.explanation.trim() : undefined,
    evaluation,
  }
}

function sanitizeQuizPayload(input: unknown): InteractiveQuizPayload | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as Record<string, unknown>
  const rawQuestions = Array.isArray(candidate.questions) ? candidate.questions : []
  const questions = rawQuestions
    .map((entry, index) => sanitizeQuestion(entry, index))
    .filter((entry): entry is InteractiveQuizQuestion => entry !== null)

  if (questions.length === 0) {
    return null
  }

  return {
    title: typeof candidate.title === 'string' ? candidate.title.trim() : undefined,
    questions,
  }
}

export function parseInteractiveContent(rawContent: string): ParsedInteractiveContent {
  const startIndex = rawContent.indexOf(QUIZ_START)
  const endIndex = rawContent.indexOf(QUIZ_END)

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      cleanText: rawContent.trim(),
      quiz: null,
    }
  }

  const jsonStart = startIndex + QUIZ_START.length
  const jsonChunk = rawContent.slice(jsonStart, endIndex).trim()
  const before = rawContent.slice(0, startIndex).trim()
  const after = rawContent.slice(endIndex + QUIZ_END.length).trim()
  const cleanText = [before, after].filter(Boolean).join('\n\n').trim()

  const markerQuiz = tryParseQuizPayload(jsonChunk)
  if (markerQuiz) {
    return {
      cleanText,
      quiz: markerQuiz,
    }
  }

  return {
    cleanText: rawContent.trim(),
    quiz: null,
  }
}

export function parseInteractiveContentWithFallback(rawContent: string): ParsedInteractiveContent {
  const primary = parseInteractiveContent(rawContent)
  if (primary.quiz) {
    return primary
  }

  const fenceJson = extractJsonCodeFence(rawContent)
  if (fenceJson) {
    const fenceQuiz = tryParseQuizPayload(fenceJson)
    if (fenceQuiz) {
      return {
        cleanText: rawContent.replace(/```(?:json)?\s*[\s\S]*?\s*```/i, '').trim(),
        quiz: fenceQuiz,
      }
    }
  }

  const objectJson = extractLikelyJsonObject(rawContent)
  if (objectJson) {
    const objectQuiz = tryParseQuizPayload(objectJson)
    if (objectQuiz) {
      return {
        cleanText: rawContent.replace(objectJson, '').trim(),
        quiz: objectQuiz,
      }
    }
  }

  return primary
}

export function evaluateInteractiveAnswer(
  answer: string,
  question: InteractiveQuizQuestion,
): { isCorrect: boolean; feedback: string } {
  const user = normalizeText(answer)
  if (!user) {
    return {
      isCorrect: false,
      feedback: 'Bitte gib zuerst eine Antwort ein.',
    }
  }

  const candidates = [question.expectedAnswer, ...question.acceptableAnswers]
    .map(normalizeText)
    .filter(Boolean)

  const isCorrect =
    question.evaluation === 'contains'
      ? candidates.some((candidate) => user.includes(candidate))
      : candidates.includes(user)

  if (isCorrect) {
    return {
      isCorrect: true,
      feedback: question.explanation || 'Richtig. Sehr gut gemacht.',
    }
  }

  const baseHint = question.hint || 'Versuche es noch einmal.'
  return {
    isCorrect: false,
    feedback: question.explanation ? `${baseHint} ${question.explanation}` : baseHint,
  }
}
