import {
  type ChatDailyTierOpenAiModelId,
  parseChatDailyTierOpenAiModelId,
} from './chatComposerModels'
import type { ChatMessage } from '../types'

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
  { category: 'document', action: 'pptx_generate', defaultModel: 'gpt-5.4-mini', label: 'Dokument – PowerPoint' },
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

/**
 * Wie `resolveChatIntentModel`, aber für `category:'chat'` thread-stabil: sobald ein früherer
 * Turn dieses Threads bereits ein Modell gewählt hat (`metadata.mainChatActionModel`), bleibt
 * es für alle weiteren 'chat'-Turns gleich — sonst wechselt die Action-Klassifikation (answer ⇄
 * short_answer/clarify/one_step) bei praktisch jeder Nachricht das Modell und damit den
 * OpenAI-Prompt-Cache-Scope (Caching ist pro Modell gescoped, ein Wechsel verwirft den Cache).
 * Andere Kategorien (document/chart/diagram) routen unverändert pro Action — die nutzen ohnehin
 * durchgängig dasselbe Modell, eine Sperre wäre dort wirkungslos.
 */
export function resolveStickyChatActionModel(
  messages: ReadonlyArray<Pick<ChatMessage, 'role' | 'metadata'>>,
  category: string | undefined | null,
  action: string | undefined | null,
  config?: ChatIntentModelRoutingConfig | null,
): ChatDailyTierOpenAiModelId {
  if (category === 'chat') {
    const locked = messages.find((m) => m.role === 'assistant' && m.metadata?.mainChatActionModel)
      ?.metadata?.mainChatActionModel
    if (locked) {
      return locked
    }
  }
  return resolveChatIntentModel(category, action, config)
}
