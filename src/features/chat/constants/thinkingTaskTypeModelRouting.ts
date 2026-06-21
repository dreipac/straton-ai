import { type AnalyzeModelId, parseAnalyzeModelId } from './geminiModels'
import type { ThinkingTaskType } from './thinkingAnalyze'

export type ThinkingTaskTypeTier = 'standard' | 'rich'

function parseThinkingTaskTypeTier(value: unknown, fallback: ThinkingTaskTypeTier): ThinkingTaskTypeTier {
  return value === 'rich' || value === 'standard' ? value : fallback
}

const THINKING_TASK_TYPES: readonly ThinkingTaskType[] = [
  'server_setup',
  'software_setup',
  'troubleshooting',
  'document_summary',
  'process_howto',
  'decision_planning',
  'general_howto',
  'other',
]

function isThinkingTaskType(value: string): value is ThinkingTaskType {
  return (THINKING_TASK_TYPES as readonly string[]).includes(value)
}

/**
 * Admin-konfigurierbares Tier (standard/rich) + Modell pro Thinking-`task_type`, gilt für
 * Draft + Reply. Review bleibt auf den bestehenden Standard/Rich-Gemini-Dropdowns.
 */
export const THINKING_TASK_TYPE_MODEL_ROUTING_ENTRIES: ReadonlyArray<{
  taskType: ThinkingTaskType
  defaultTier: ThinkingTaskTypeTier
  defaultModel: AnalyzeModelId
  label: string
}> = [
  { taskType: 'document_summary', defaultTier: 'rich', defaultModel: 'gemini-3-flash-preview', label: 'Zusammenfassung (Dokument)' },
  { taskType: 'server_setup', defaultTier: 'rich', defaultModel: 'gemini-3-flash-preview', label: 'Server-Setup' },
  { taskType: 'software_setup', defaultTier: 'rich', defaultModel: 'gemini-3-flash-preview', label: 'Software-Setup' },
  { taskType: 'troubleshooting', defaultTier: 'rich', defaultModel: 'gemini-3-flash-preview', label: 'Fehlerdiagnose' },
  { taskType: 'decision_planning', defaultTier: 'rich', defaultModel: 'gemini-3-flash-preview', label: 'Entscheidung / Planung' },
  { taskType: 'process_howto', defaultTier: 'standard', defaultModel: 'gemini-3.1-flash-lite', label: 'Anleitung / Prozess' },
  { taskType: 'general_howto', defaultTier: 'standard', defaultModel: 'gemini-3.1-flash-lite', label: 'Allgemeine Anleitung' },
  { taskType: 'other', defaultTier: 'standard', defaultModel: 'gemini-3.1-flash-lite', label: 'Sonstiges' },
]

export type ThinkingTaskTypeModelRoutingRow = {
  taskType: ThinkingTaskType
  tierActive: ThinkingTaskTypeTier
  tierDraft: ThinkingTaskTypeTier
  modelActive: AnalyzeModelId
  modelDraft: AnalyzeModelId
}

export type ThinkingTaskTypeModelRoutingConfig = ReadonlyArray<ThinkingTaskTypeModelRoutingRow>

function defaultEntryFor(taskType: string) {
  return THINKING_TASK_TYPE_MODEL_ROUTING_ENTRIES.find((e) => e.taskType === taskType)
}

export function parseThinkingTaskTypeModelRoutingRows(raw: unknown): ThinkingTaskTypeModelRoutingRow[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const o = entry as Record<string, unknown>
      const taskType = typeof o.task_type === 'string' ? o.task_type : ''
      if (!taskType || !isThinkingTaskType(taskType)) {
        return null
      }
      const fallback = defaultEntryFor(taskType)
      return {
        taskType,
        tierActive: parseThinkingTaskTypeTier(o.tier_active, fallback?.defaultTier ?? 'standard'),
        tierDraft: parseThinkingTaskTypeTier(o.tier_draft, fallback?.defaultTier ?? 'standard'),
        modelActive: parseAnalyzeModelId(o.model_active, fallback?.defaultModel),
        modelDraft: parseAnalyzeModelId(o.model_draft, fallback?.defaultModel),
      }
    })
    .filter((row): row is ThinkingTaskTypeModelRoutingRow => row !== null)
}

/** Liefert Tier+Modell für `taskType`, sonst den Default für diesen Aufgabentyp. */
export function resolveThinkingTaskTypeRouting(
  taskType: ThinkingTaskType | string | undefined | null,
  config?: ThinkingTaskTypeModelRoutingConfig | null,
): { tier: ThinkingTaskTypeTier; model: AnalyzeModelId } {
  if (!taskType) {
    return { tier: 'standard', model: 'gemini-3.1-flash-lite' }
  }
  const row = config?.find((r) => r.taskType === taskType)
  if (row) {
    return { tier: row.tierActive, model: row.modelActive }
  }
  const fallback = defaultEntryFor(taskType)
  return {
    tier: fallback?.defaultTier ?? 'standard',
    model: fallback?.defaultModel ?? 'gemini-3.1-flash-lite',
  }
}
