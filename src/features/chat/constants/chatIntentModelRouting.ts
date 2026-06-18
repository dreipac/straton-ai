import {
  type ChatDailyTierOpenAiModelId,
  parseChatDailyTierOpenAiModelId,
} from './chatComposerModels'

/**
 * Admin-konfigurierbares Modell pro Intent-Kategorie+Action (Smart-Instant-Hauptantwort).
 * `image` ist bewusst ausgeschlossen — Bildgenerierung/-suche läuft über eine eigene Bild-API,
 * nicht über ein Chat-Textmodell.
 */
export const CHAT_INTENT_MODEL_ROUTING_ENTRIES: ReadonlyArray<{
  category: string
  action: string
  defaultModel: ChatDailyTierOpenAiModelId
  label: string
}> = [
  { category: 'chat', action: 'answer', defaultModel: 'gpt-5.4-mini', label: 'Chat – vollständige Antwort' },
  { category: 'chat', action: 'short_answer', defaultModel: 'gpt-5-mini', label: 'Chat – Kurzantwort' },
  { category: 'chat', action: 'clarify', defaultModel: 'gpt-5-mini', label: 'Chat – Rückfrage' },
  { category: 'chat', action: 'one_step', defaultModel: 'gpt-5-mini', label: 'Chat – ein Prüfschritt' },
  { category: 'document', action: 'word_generate', defaultModel: 'gpt-5.4-mini', label: 'Dokument – Word' },
  { category: 'document', action: 'pdf_generate', defaultModel: 'gpt-5.4-mini', label: 'Dokument – PDF' },
  { category: 'document', action: 'excel_generate', defaultModel: 'gpt-5.4-mini', label: 'Dokument – Excel' },
  { category: 'chart', action: 'chart_generate', defaultModel: 'gpt-5.4-mini', label: 'Chart' },
  { category: 'diagram', action: 'diagram_generate', defaultModel: 'gpt-5.4-mini', label: 'Diagramm' },
]

export type ChatIntentModelRoutingRow = {
  category: string
  action: string
  modelActive: ChatDailyTierOpenAiModelId
  modelDraft: ChatDailyTierOpenAiModelId
}

export type ChatIntentModelRoutingConfig = ReadonlyArray<ChatIntentModelRoutingRow>

function defaultModelFor(category: string, action: string): ChatDailyTierOpenAiModelId {
  return (
    CHAT_INTENT_MODEL_ROUTING_ENTRIES.find((e) => e.category === category && e.action === action)
      ?.defaultModel ?? 'gpt-5.4-mini'
  )
}

export function parseChatIntentModelRoutingRows(raw: unknown): ChatIntentModelRoutingRow[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const o = entry as Record<string, unknown>
      const category = typeof o.category === 'string' ? o.category : ''
      const action = typeof o.action === 'string' ? o.action : ''
      if (!category || !action) {
        return null
      }
      return {
        category,
        action,
        modelActive: parseChatDailyTierOpenAiModelId(o.model_active),
        modelDraft: parseChatDailyTierOpenAiModelId(o.model_draft),
      }
    })
    .filter((row): row is ChatIntentModelRoutingRow => row !== null)
}

/** Liefert das admin-konfigurierte (aktive) Modell für category+action, sonst den Tiefen-Default. */
export function resolveChatIntentModel(
  category: string | undefined | null,
  action: string | undefined | null,
  config?: ChatIntentModelRoutingConfig | null,
): ChatDailyTierOpenAiModelId {
  if (!category || !action) {
    return 'gpt-5.4-mini'
  }
  const row = config?.find((r) => r.category === category && r.action === action)
  if (row) {
    return row.modelActive
  }
  return defaultModelFor(category, action)
}
