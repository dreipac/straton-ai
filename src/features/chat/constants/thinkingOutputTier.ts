import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import type { ThinkingAnalyzeResult, ThinkingTaskType } from './thinkingAnalyze'

export type ThinkingOutputTier = 'standard' | 'rich'

/** Steuert Layout-Hinweise in Draft/Review/Final (Analyze-Feld). */
export type ThinkingLayoutHint = 'cards' | 'stepwise' | 'tabular' | 'narrative'

const LAYOUT_HINTS: ThinkingLayoutHint[] = ['cards', 'stepwise', 'tabular', 'narrative']

const STEPWISE_TASK_TYPES = new Set<ThinkingTaskType>([
  'server_setup',
  'software_setup',
  'troubleshooting',
  'process_howto',
])

export function parseThinkingLayoutHint(value: unknown): ThinkingLayoutHint | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  return LAYOUT_HINTS.includes(raw as ThinkingLayoutHint) ? (raw as ThinkingLayoutHint) : null
}

export function inferThinkingLayoutHint(
  analyze: Pick<ThinkingAnalyzeResult, 'task_type' | 'complexity' | 'output_tier'>,
  userMessage?: string,
): ThinkingLayoutHint {
  if (analyze.task_type === 'document_summary') {
    return 'cards'
  }
  const trimmed = (userMessage ?? '').trim()
  if (trimmed && userMessageRequestsDirectAnswer(trimmed)) {
    return 'tabular'
  }
  if (STEPWISE_TASK_TYPES.has(analyze.task_type)) {
    return 'stepwise'
  }
  if (analyze.task_type === 'decision_planning') {
    return 'tabular'
  }
  return 'narrative'
}

export function resolveThinkingLayoutHint(
  analyze: ThinkingAnalyzeResult,
  userMessage?: string,
): ThinkingLayoutHint {
  if (analyze.task_type === 'document_summary') {
    return 'cards'
  }
  return parseThinkingLayoutHint(analyze.layout_hint) ?? inferThinkingLayoutHint(analyze, userMessage)
}

const RICH_TASK_TYPES = new Set<ThinkingTaskType>([
  'document_summary',
  'server_setup',
  'software_setup',
  'troubleshooting',
  'decision_planning',
])

export function parseThinkingOutputTier(value: unknown): ThinkingOutputTier | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === 'standard' || raw === 'rich') {
    return raw
  }
  return null
}

export function inferThinkingOutputTier(
  analyze: Pick<ThinkingAnalyzeResult, 'task_type' | 'complexity'>,
  userMessage?: string,
): ThinkingOutputTier {
  const trimmed = (userMessage ?? '').trim()
  if (trimmed && userMessageRequestsDirectAnswer(trimmed)) {
    return 'standard'
  }
  if (analyze.task_type === 'document_summary') {
    return 'rich'
  }
  if (analyze.complexity === 'high') {
    return 'rich'
  }
  if (RICH_TASK_TYPES.has(analyze.task_type) && analyze.complexity !== 'low') {
    return 'rich'
  }
  return 'standard'
}

export function resolveThinkingOutputTier(
  analyze: ThinkingAnalyzeResult,
  userMessage?: string,
): ThinkingOutputTier {
  const heuristic = inferThinkingOutputTier(analyze, userMessage)
  const fromAnalyze = parseThinkingOutputTier(analyze.output_tier)
  if (analyze.task_type === 'document_summary') {
    return 'rich'
  }
  if (heuristic === 'rich') {
    return 'rich'
  }
  if (fromAnalyze === 'rich' && heuristic !== 'standard') {
    return 'rich'
  }
  return fromAnalyze ?? heuristic
}
