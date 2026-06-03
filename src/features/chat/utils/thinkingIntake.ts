import type { ThinkingAnalyzeResult, ThinkingAnalyzeDimension } from '../constants/thinkingAnalyze'
import { THINKING_MAX_CLARIFY_ROUNDS } from '../constants/thinkingAnalyze'
import type { ChatMessage } from '../types'
import {
  messageContainsCompleteThinkingClarifyBlock,
  parseThinkingClarifyContent,
} from './thinkingClarify'

export type ThinkingIntakeAnswer = {
  dimensionId: string
  label: string
  answer: string
}

export type ThinkingIntakeSession = {
  analyze: ThinkingAnalyzeResult
  answers: ThinkingIntakeAnswer[]
  clarifyRoundsCompleted: number
  readyForFinal: boolean
}

export function createThinkingIntakeSession(analyze: ThinkingAnalyzeResult): ThinkingIntakeSession {
  return {
    analyze,
    answers: [],
    clarifyRoundsCompleted: 0,
    readyForFinal: !analyze.needs_clarification,
  }
}

export function buildThinkingIntakeSummary(session: ThinkingIntakeSession): string {
  if (session.answers.length === 0) {
    return ''
  }
  return session.answers.map((a) => `- ${a.label}: ${a.answer}`).join('\n')
}

export function getOpenThinkingDimensions(session: ThinkingIntakeSession): ThinkingAnalyzeDimension[] {
  const answered = new Set(session.answers.map((a) => a.dimensionId))
  return session.analyze.missing_dimensions.filter((d) => !answered.has(d.id))
}

export function getNextThinkingFocusDimension(
  session: ThinkingIntakeSession,
): ThinkingAnalyzeDimension | null {
  const open = getOpenThinkingDimensions(session)
  return open[0] ?? null
}

export function recordThinkingIntakeAnswer(
  session: ThinkingIntakeSession,
  params: { dimensionId: string; label: string; answer: string },
): ThinkingIntakeSession {
  const filtered = session.answers.filter((a) => a.dimensionId !== params.dimensionId)
  const answers = [
    ...filtered,
    {
      dimensionId: params.dimensionId,
      label: params.label,
      answer: params.answer.trim(),
    },
  ]
  const clarifyRoundsCompleted = session.clarifyRoundsCompleted + 1
  return recomputeThinkingIntakeReady({
    ...session,
    answers,
    clarifyRoundsCompleted,
  })
}

function recomputeThinkingIntakeReady(session: ThinkingIntakeSession): ThinkingIntakeSession {
  if (!session.analyze.needs_clarification) {
    return { ...session, readyForFinal: true }
  }
  const planned = Math.min(THINKING_MAX_CLARIFY_ROUNDS, Math.max(1, session.analyze.clarify_rounds_planned))
  const maxRoundsReached = session.clarifyRoundsCompleted >= planned
  const noOpenDimensions = getOpenThinkingDimensions(session).length === 0
  const readyForFinal = maxRoundsReached || (noOpenDimensions && session.clarifyRoundsCompleted >= 1)

  return { ...session, readyForFinal }
}

/** Nutzer antwortet auf eine Thinking-Rückfrage (letzte Assistenten-Nachricht = Clarify). */
export function isThinkingClarifyFollowUp(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user') {
    return false
  }
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'assistant') {
      return messageContainsCompleteThinkingClarifyBlock(m.content)
    }
  }
  return false
}

/** Neue Aufgabe im Thinking-Modus (nicht direkt nach Clarify-Antwort). */
export function isNewThinkingTask(messages: ChatMessage[]): boolean {
  return !isThinkingClarifyFollowUp(messages)
}

export function resolveThinkingConversationPhase(
  messages: ChatMessage[],
  intake: ThinkingIntakeSession | null,
): 'clarify' | 'final' {
  if (intake) {
    return intake.readyForFinal ? 'final' : 'clarify'
  }
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user') {
    return 'final'
  }
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'assistant') {
      return messageContainsCompleteThinkingClarifyBlock(m.content) ? 'final' : 'final'
    }
  }
  return 'final'
}

export function extractDimensionFromLastClarify(messages: ChatMessage[]): {
  dimensionId: string
  label: string
} | null {
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'assistant') {
      const parsed = parseThinkingClarifyContent(m.content)
      if (parsed.kind !== 'clarify') {
        return null
      }
      const dimensionId =
        typeof parsed.payload.dimension_id === 'string' && parsed.payload.dimension_id.trim()
          ? parsed.payload.dimension_id.trim()
          : 'general'
      const label =
        typeof parsed.payload.dimension_label === 'string' && parsed.payload.dimension_label.trim()
          ? parsed.payload.dimension_label.trim()
          : parsed.payload.prompt
      return { dimensionId, label }
    }
  }
  return null
}

export function getThinkingClarifyProgress(session: ThinkingIntakeSession): {
  round: number
  roundsTotal: number
} {
  const roundsTotal = session.analyze.needs_clarification
    ? Math.min(THINKING_MAX_CLARIFY_ROUNDS, Math.max(1, session.analyze.clarify_rounds_planned))
    : 0
  const round = Math.min(roundsTotal, session.clarifyRoundsCompleted + 1)
  return { round, roundsTotal }
}
