import { matchQuizPracticeIntent } from '../utils/quizFormatChoice'
import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import {
  normalizeDocumentIntentUserText,
  userAsksDocumentVisibilityQuestion,
  userMessageWantsDocumentSummary,
} from './documentAttachmentIntent'
import { userWantsSummaryDocumentExport } from './documentExportIntent'
import type { InstantAnalyzeResult } from './instantAnalyze'
import { syncReplyModeWithRoute } from './instantAnalyzeRoute'

/** Lernaufgabe im Hauptchat-Instant — steuert Antwortstil und Turn-Briefing. */
export type InstantChatTaskType = 'mc_solve' | 'quiz_generate' | 'explanation' | 'summary'

export type InstantExplanationDepth = 'brief' | 'standard' | 'detailed'

export const INSTANT_CHAT_TASK_TYPES: InstantChatTaskType[] = [
  'mc_solve',
  'quiz_generate',
  'explanation',
  'summary',
]

const DETAILED_EXPLANATION_RE =
  /\b(ausführlich|detailliert|gründlich|im\s+detail|schritt\s+für\s+schritt|unterschiede?\s+zwischen|vergleich(?:e)?|alles\s+erklären|gut\s+erklären|was\s+sind\s+die\s+unterschiede)\b/i

const COMPLEX_EXPLANATION_TOPIC_RE =
  /\b(unterschied|vergleich|vor-?\s*und\s+nachteil|pro\s+und\s+contra|zusammenhang|ablauf|funktionsweise|architektur|theorie|konzept)\b/i

const QUIZ_GENERATION_VERB_RE =
  /\b(?:erstell|generier|mach|schreib|erzeug|stell\s+.+\s+(?:fragen|quiz)|teste?\s+mich|frag(?:e|en)?\s+mich\s+ab)\b/i

/** Thema/Inhalt fragen — kein Zusammenfassungsauftrag («fasse zusammen»). */
const DOCUMENT_TOPIC_QUESTION_RE =
  /\b(über\s+was\s+geht|worum\s+geht|was\s+ist\s+das\s+thema|thema\s+(?:des|vom)\s+(?:dokument|pdf|anhang|material|dossier)|was\s+behandelt(?:\s+(?:das|der))?\s*(?:dokument|pdf|anhang|text)?|wofür\s+ist\s+(?:das\s+)?(?:dokument|pdf)|was\s+steht\s+(?:im|in\s+dem)\s+(?:dokument|pdf)|inhalt\s+(?:des|vom)\s+(?:dokument|pdf))\b/i

const SIMPLE_EXPLANATION_RE =
  /^(?:was\s+ist|was\s+sind|wer\s+ist|wann\s+war|wann\s+ist|define|definition)\b/i

export function parseInstantChatTaskType(value: unknown): InstantChatTaskType {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (INSTANT_CHAT_TASK_TYPES.includes(raw as InstantChatTaskType)) {
    return raw as InstantChatTaskType
  }
  return 'explanation'
}

export function parseInstantExplanationDepth(value: unknown): InstantExplanationDepth {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === 'brief' || raw === 'standard' || raw === 'detailed') {
    return raw
  }
  return 'standard'
}

function userWantsQuizGeneration(text: string): boolean {
  const t = text.trim()
  if (!t || !matchQuizPracticeIntent(t)) {
    return false
  }
  return QUIZ_GENERATION_VERB_RE.test(t)
}

export function userMessageWantsSummary(text: string, hasDocumentFileAttachment = false): boolean {
  return userMessageWantsDocumentSummary(text, hasDocumentFileAttachment)
}

export function userAsksDocumentTopicQuestion(text: string): boolean {
  const t = normalizeDocumentIntentUserText(text)
  if (!t) {
    return false
  }
  return DOCUMENT_TOPIC_QUESTION_RE.test(t)
}

export function inferInstantExplanationDepth(
  userMessage: string,
  taskType: InstantChatTaskType,
): InstantExplanationDepth {
  if (taskType !== 'explanation') {
    return 'standard'
  }
  const t = normalizeDocumentIntentUserText(userMessage)
  if (!t) {
    return 'standard'
  }
  if (userAsksDocumentVisibilityQuestion(t)) {
    return 'brief'
  }
  if (userAsksDocumentTopicQuestion(t) && !userMessageWantsSummary(t)) {
    return 'brief'
  }
  if (DETAILED_EXPLANATION_RE.test(t)) {
    return 'detailed'
  }
  if (
    COMPLEX_EXPLANATION_TOPIC_RE.test(t) &&
    (t.length > 48 || /\b(und|between|zwischen|vs\.?|gegenüber)\b/i.test(t))
  ) {
    return 'detailed'
  }
  if (SIMPLE_EXPLANATION_RE.test(t) && t.length < 120 && !COMPLEX_EXPLANATION_TOPIC_RE.test(t)) {
    return 'brief'
  }
  return 'standard'
}

export function classifyInstantChatTaskType(
  userMessage: string,
  analyze: Pick<InstantAnalyzeResult, 'category' | 'action' | 'reply_mode'>,
  options?: {
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>
  },
): InstantChatTaskType {
  const t = normalizeDocumentIntentUserText(userMessage)
  if (userMessageRequestsDirectAnswer(t, options?.priorTurns)) {
    return 'mc_solve'
  }
  if (userAsksDocumentVisibilityQuestion(t)) {
    return 'explanation'
  }
  if (userAsksDocumentTopicQuestion(t) && !userMessageWantsSummary(t, options?.hasDocumentFileAttachment === true)) {
    return 'explanation'
  }
  if (
    analyze.category === 'document' &&
    (analyze.action === 'pdf_generate' || analyze.action === 'word_generate') &&
    userWantsSummaryDocumentExport(t, options?.hasDocumentFileAttachment === true)
  ) {
    return 'summary'
  }
  if (analyze.category !== 'chat') {
    return 'explanation'
  }
  if (userWantsQuizGeneration(t)) {
    return 'quiz_generate'
  }
  if (userMessageWantsSummary(t, options?.hasDocumentFileAttachment === true)) {
    return 'summary'
  }
  if (analyze.action === 'short_answer' && analyze.reply_mode === 'short_answer') {
    return 'mc_solve'
  }
  return 'explanation'
}

export function applyInstantChatTaskTypeHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: {
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>
  },
): InstantAnalyzeResult {
  const aiTaskType = parseInstantChatTaskType(analyze.task_type)
  const heuristicTaskType = classifyInstantChatTaskType(userMessage, analyze, options)
  const wantsSummary = userMessageWantsSummary(userMessage, options?.hasDocumentFileAttachment === true)
  const task_type =
    heuristicTaskType === 'mc_solve' ||
    heuristicTaskType === 'quiz_generate' ||
    heuristicTaskType === 'summary'
      ? heuristicTaskType
      : aiTaskType === 'summary' && !wantsSummary
        ? heuristicTaskType
        : aiTaskType !== 'explanation'
          ? aiTaskType
          : heuristicTaskType

  const explanation_depth =
    task_type === 'explanation'
      ? inferInstantExplanationDepth(userMessage, task_type)
      : 'standard'

  let next: InstantAnalyzeResult = {
    ...analyze,
    task_type,
    explanation_depth,
  }

  if (task_type === 'summary') {
    next = syncReplyModeWithRoute({
      ...next,
      reply_mode: next.reply_mode === 'ask_only' ? 'normal' : next.reply_mode,
      clarity: 'clear',
      missing: [],
    })
  }

  if (task_type === 'mc_solve' && next.category === 'chat') {
    next = syncReplyModeWithRoute({
      ...next,
      category: 'chat',
      action: 'short_answer',
      reply_mode: 'short_answer',
      clarity: 'clear',
      missing: [],
    })
  }

  if (options?.hasDocumentFileAttachment && userAsksDocumentVisibilityQuestion(userMessage)) {
    next = syncReplyModeWithRoute({
      ...next,
      category: 'chat',
      action: 'answer',
      reply_mode: 'short_answer',
      clarity: 'clear',
      missing: [],
      needs_live_web: false,
      web_query: '',
      task_type: 'explanation',
      explanation_depth: 'brief',
      intent: 'Anhang-Sichtbarkeit bestätigen',
    })
  }

  if (
    wantsSummary &&
    next.task_type !== 'mc_solve' &&
    !userAsksDocumentVisibilityQuestion(userMessage)
  ) {
    next = syncReplyModeWithRoute({
      ...next,
      task_type: 'summary',
      explanation_depth: 'standard',
      clarity: 'clear',
      missing: [],
      reply_mode: next.reply_mode === 'ask_only' ? 'normal' : next.reply_mode,
    })
  }

  return next
}

/** Summary-Instant: OpenAI gpt-5-mini statt Gemini (Experiment). */
export function shouldRouteSummaryInstantToOpenAi(
  analyze?: Pick<InstantAnalyzeResult, 'task_type'> | null,
  thinking = false,
): boolean {
  return !thinking && analyze?.task_type === 'summary'
}

