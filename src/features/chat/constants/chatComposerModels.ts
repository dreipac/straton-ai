/** Auswahl im Chat-Composer (Hauptchat); IDs sind API-Modellnamen wo möglich. */
export const CHAT_COMPOSER_MODEL_STORAGE_KEY = 'straton-chat-composer-model'

export type ChatComposerModelId = 'gpt-5.4-mini' | 'claude-sonnet-4-6' | 'claude-opus-4-7'

export type ChatComposerModelOption = {
  id: ChatComposerModelId
  /** Kurzlabel in der Pill */
  label: string
  provider: 'openai' | 'anthropic'
  /** Priorisierte OpenAI-Fallback-Kette */
  openAiModels?: readonly string[]
  anthropicModel?: string
}

export const CHAT_COMPOSER_MODELS: readonly ChatComposerModelOption[] = [
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    provider: 'openai',
    openAiModels: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    anthropicModel: 'claude-sonnet-4-6',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    anthropicModel: 'claude-opus-4-7',
  },
]

const DEFAULT_MODEL_ID: ChatComposerModelId = 'gpt-5.4-mini'

export function getChatComposerModelMeta(id: ChatComposerModelId): ChatComposerModelOption {
  const found = CHAT_COMPOSER_MODELS.find((m) => m.id === id)
  return found ?? CHAT_COMPOSER_MODELS[0]
}

export function parseStoredComposerModelId(raw: string | null): ChatComposerModelId {
  const allowed = new Set(CHAT_COMPOSER_MODELS.map((m) => m.id))
  if (raw && allowed.has(raw as ChatComposerModelId)) {
    return raw as ChatComposerModelId
  }
  return DEFAULT_MODEL_ID
}

/** API-Modellstrings aus der Composer-Konfiguration (Admin KI-Tokens Filter, auch ohne bisherige Logs). */
export function getComposerApiModelIdsForAdminFilter(): string[] {
  const ids = new Set<string>()
  for (const m of CHAT_COMPOSER_MODELS) {
    if (m.provider === 'openai' && m.openAiModels?.length) {
      for (const id of m.openAiModels) {
        ids.add(id)
      }
    }
    if (m.anthropicModel) {
      ids.add(m.anthropicModel)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'de'))
}
