export type InteractiveQuizQuestion = {
  id: string
  prompt: string
  questionType?: 'mcq' | 'text' | 'match' | 'true_false'
  /** Zuordnung: links Begriffe, rechts passende Definitionen (Index i gehört zusammen). */
  matchLeft?: string[]
  matchRight?: string[]
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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** MCQ: erwartete Antwort oft als Index (`0`/`"1"`); UI speichert den gewählten Optionstext. */
export function resolveMcqExpectedAnswer(rawExpected: string, options: string[]): string {
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

/** JSON-Felder `expectedAnswer` / acceptableAnswers können Zahl oder String sein. */
export function coerceQuizScalarToString(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw)
  }
  if (typeof raw === 'string') {
    return raw.trim()
  }
  return ''
}

function sanitizeQuestion(input: unknown, index: number): InteractiveQuizQuestion | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as Record<string, unknown>
  const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : ''

  const wantsMatch =
    candidate.questionType === 'match' ||
    candidate.type === 'match' ||
    (Array.isArray(candidate.matchLeft) && Array.isArray(candidate.matchRight))

  const matchLeft = parseStringArray(candidate.matchLeft)
  const matchRight = parseStringArray(candidate.matchRight)

  if (wantsMatch && matchLeft.length >= 2 && matchLeft.length === matchRight.length && prompt) {
    const n = matchLeft.length
    const canonicalExpected = Array.from({ length: n }, (_, i) => String(i)).join(',')
    const expectedAnswer =
      typeof candidate.expectedAnswer === 'string' && candidate.expectedAnswer.trim()
        ? candidate.expectedAnswer.trim()
        : canonicalExpected
    const acceptableAnswers = Array.isArray(candidate.acceptableAnswers)
      ? candidate.acceptableAnswers
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    return {
      id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `q${index + 1}`,
      prompt,
      questionType: 'match',
      matchLeft,
      matchRight,
      expectedAnswer,
      acceptableAnswers,
      hint: typeof candidate.hint === 'string' ? candidate.hint.trim() : undefined,
      explanation: typeof candidate.explanation === 'string' ? candidate.explanation.trim() : undefined,
      evaluation: 'exact',
    }
  }

  const rawQType = candidate.questionType ?? candidate.type
  const wantsTrueFalse =
    rawQType === 'true_false' ||
    rawQType === 'boolean' ||
    rawQType === 'tf' ||
    rawQType === 'wahr_falsch'

  if (wantsTrueFalse && prompt) {
    const rawExpected = typeof candidate.expectedAnswer === 'string' ? candidate.expectedAnswer.trim() : ''
    const lower = rawExpected.toLowerCase()
    const truthy = new Set(['wahr', 'true', 't', 'ja', 'yes', '1', 'richtig', 'korrekt'])
    const falsy = new Set(['falsch', 'false', 'f', 'nein', 'no', '0'])
    let resolved: 'Wahr' | 'Falsch' | null = null
    if (truthy.has(lower)) {
      resolved = 'Wahr'
    } else if (falsy.has(lower)) {
      resolved = 'Falsch'
    }
    if (!resolved) {
      return null
    }
    const acceptableAnswersTf = Array.isArray(candidate.acceptableAnswers)
      ? candidate.acceptableAnswers
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
    return {
      id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `q${index + 1}`,
      prompt,
      questionType: 'true_false',
      options: ['Wahr', 'Falsch'],
      expectedAnswer: resolved,
      acceptableAnswers: acceptableAnswersTf,
      hint: typeof candidate.hint === 'string' ? candidate.hint.trim() : undefined,
      explanation: typeof candidate.explanation === 'string' ? candidate.explanation.trim() : undefined,
      evaluation: 'exact',
    }
  }

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
    const normalizedExpected = resolveMcqExpectedAnswer(expectedAnswer, options)
    const normalizedAcceptableAnswers = acceptableAnswers.map((value) => resolveMcqExpectedAnswer(value, options))
    options = dedupeStrings([...options, normalizedExpected, ...normalizedAcceptableAnswers]).slice(0, 6)
    return {
      id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `q${index + 1}`,
      prompt,
      questionType,
      options,
      expectedAnswer: normalizedExpected || expectedAnswer,
      acceptableAnswers: normalizedAcceptableAnswers,
      hint: typeof candidate.hint === 'string' ? candidate.hint.trim() : undefined,
      explanation: typeof candidate.explanation === 'string' ? candidate.explanation.trim() : undefined,
      evaluation,
    }
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `q${index + 1}`,
    prompt,
    questionType,
    options: undefined,
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

export function parseInteractiveContent(rawContent: unknown): ParsedInteractiveContent {
  const content = typeof rawContent === 'string' ? rawContent : ''
  const startIndex = content.indexOf(QUIZ_START)
  const endIndex = content.indexOf(QUIZ_END)

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      cleanText: content.trim(),
      quiz: null,
    }
  }

  const jsonStart = startIndex + QUIZ_START.length
  const jsonChunk = content.slice(jsonStart, endIndex).trim()
  const before = content.slice(0, startIndex).trim()
  const after = content.slice(endIndex + QUIZ_END.length).trim()
  const cleanText = [before, after].filter(Boolean).join('\n\n').trim()

  const markerQuiz = tryParseQuizPayload(jsonChunk)
  if (markerQuiz) {
    return {
      cleanText,
      quiz: markerQuiz,
    }
  }

  return {
    cleanText: content.trim(),
    quiz: null,
  }
}

export function parseInteractiveContentWithFallback(rawContent: unknown): ParsedInteractiveContent {
  const content = typeof rawContent === 'string' ? rawContent : ''
  const primary = parseInteractiveContent(rawContent)
  if (primary.quiz) {
    return primary
  }

  const fenceJson = extractJsonCodeFence(content)
  if (fenceJson) {
    const fenceQuiz = tryParseQuizPayload(fenceJson)
    if (fenceQuiz) {
      return {
        cleanText: content.replace(/```(?:json)?\s*[\s\S]*?\s*```/i, '').trim(),
        quiz: fenceQuiz,
      }
    }
  }

  const objectJson = extractLikelyJsonObject(content)
  if (objectJson) {
    const objectQuiz = tryParseQuizPayload(objectJson)
    if (objectQuiz) {
      return {
        cleanText: content.replace(objectJson, '').trim(),
        quiz: objectQuiz,
      }
    }
  }

  return primary
}

export function isMatchQuestion(question: InteractiveQuizQuestion | null | undefined): boolean {
  return (
    question?.questionType === 'match' &&
    Array.isArray(question.matchLeft) &&
    Array.isArray(question.matchRight) &&
    question.matchLeft.length >= 2 &&
    question.matchLeft.length === question.matchRight.length
  )
}

/** Antwortformat: Komma-getrennte Original-Indizes der rechten Karten, Zeile für Zeile links (z. B. 2,0,1). */
export function isMatchAnswerComplete(question: InteractiveQuizQuestion | null | undefined, answer: string): boolean {
  if (!isMatchQuestion(question) || !question) {
    return answer.trim().length > 0
  }
  const n = question.matchLeft!.length
  const parts = answer
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length !== n) {
    return false
  }
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.some((x) => Number.isNaN(x))) {
    return false
  }
  if (nums.some((x) => x < 0 || x >= n)) {
    return false
  }
  return new Set(nums).size === n
}

function evaluateMatchAnswer(answer: string, question: InteractiveQuizQuestion): { isCorrect: boolean; feedback: string } {
  const n = question.matchLeft!.length
  const parts = answer
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length !== n) {
    return {
      isCorrect: false,
      feedback: 'Bitte ordne alle Begriffe per Drag-and-Drop zu.',
    }
  }
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.some((x) => Number.isNaN(x)) || new Set(nums).size !== n || nums.some((x) => x < 0 || x >= n)) {
    return {
      isCorrect: false,
      feedback: 'Die Zuordnung ist unvollständig oder ungültig.',
    }
  }
  const expected = Array.from({ length: n }, (_, i) => i)
  const ok = nums.every((v, i) => v === expected[i])
  if (ok) {
    return {
      isCorrect: true,
      feedback: question.explanation || 'Richtig. Alle Zuordnungen stimmen.',
    }
  }
  const baseHint = question.hint || 'Vergleiche Begriff und Definition erneut.'
  return {
    isCorrect: false,
    feedback: question.explanation ? `${baseHint} ${question.explanation}` : baseHint,
  }
}

export function evaluateInteractiveAnswer(
  answer: string,
  question: InteractiveQuizQuestion,
): { isCorrect: boolean; feedback: string } {
  if (question.questionType === 'match' && isMatchQuestion(question)) {
    const trimmed = answer.trim()
    if (!trimmed) {
      return {
        isCorrect: false,
        feedback: 'Bitte ordne alle Begriffe zu.',
      }
    }
    return evaluateMatchAnswer(trimmed, question)
  }

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
