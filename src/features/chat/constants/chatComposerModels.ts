/** Auswahl im Chat-Composer (Hauptchat); IDs sind API-Modellnamen wo möglich. */
export const CHAT_COMPOSER_MODEL_STORAGE_KEY = 'straton-chat-composer-model'

export type ChatComposerModelId =
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5-mini'
  | 'claude-opus-5'
  | 'claude-opus-4-8'
  | 'claude-sonnet-5'

/** Nur OpenAI — für Abo «Tages-Staffel» (Tier 1 / Tier 2), Admin Abo-Eigenschaften. */
export type ChatDailyTierOpenAiModelId =
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5-mini'
  | 'gpt-4o'
  | 'gpt-4o-mini'

export const CHAT_DAILY_TIER_OPENAI_MODELS: readonly {
  id: ChatDailyTierOpenAiModelId
  label: string
}[] = [
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'gpt-4o', label: 'GPT-4' },
  { id: 'gpt-4o-mini', label: 'GPT-4 mini' },
]

const CHAT_DAILY_TIER_OPENAI_MODEL_ID_SET = new Set<string>(CHAT_DAILY_TIER_OPENAI_MODELS.map((m) => m.id))

export function parseChatDailyTierOpenAiModelId(raw: unknown): ChatDailyTierOpenAiModelId {
  if (typeof raw === 'string' && CHAT_DAILY_TIER_OPENAI_MODEL_ID_SET.has(raw)) {
    return raw as ChatDailyTierOpenAiModelId
  }
  return 'gpt-5.4'
}

export function getChatDailyTierOpenAiModelLabel(id: ChatDailyTierOpenAiModelId): string {
  return CHAT_DAILY_TIER_OPENAI_MODELS.find((m) => m.id === id)?.label ?? id
}

export type ChatComposerModelOption = {
  id: ChatComposerModelId
  /** Kurzlabel in der Pill */
  label: string
  provider: 'openai' | 'anthropic'
  /** Priorisierte OpenAI-Fallback-Kette */
  openAiModels?: readonly string[]
  anthropicModel?: string
}

/**
 * Hauptchat-Modelle. Für OpenAI gilt zusätzlich die Tages-Staffelung (Edge + Client, pro Abo):
 * erstes/zweites Modell + Token-Budget aus `subscription_plans`; Verbrauch in `subscription_usages.used_tokens`.
 */
export const CHAT_COMPOSER_MODELS: readonly ChatComposerModelOption[] = [
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    provider: 'openai',
    openAiModels: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.4', 'gpt-5-mini'],
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    provider: 'openai',
    openAiModels: ['gpt-5.6-terra', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini'],
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    provider: 'openai',
    /* Luna ist das günstigste Modell der Liste. Die Kette bleibt deshalb bewusst im Billigsegment:
       ein Ausweichen auf Terra würde die Anfrage verzehnfachen, obwohl bewusst das Budget-Modell
       gewählt wurde. */
    openAiModels: ['gpt-5.6-luna', 'gpt-5-mini', 'gpt-5.4-mini'],
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'openai',
    openAiModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    provider: 'openai',
    openAiModels: ['gpt-5.4-mini', 'gpt-5-mini'],
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'openai',
    openAiModels: ['gpt-5-mini', 'gpt-5.4-mini'],
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    provider: 'anthropic',
    anthropicModel: 'claude-opus-5',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    anthropicModel: 'claude-opus-4-8',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    anthropicModel: 'claude-sonnet-5',
  },
]

export function getChatComposerModelMeta(id: ChatComposerModelId): ChatComposerModelOption {
  const found = CHAT_COMPOSER_MODELS.find((m) => m.id === id)
  return found ?? CHAT_COMPOSER_MODELS[0]
}

/**
 * Liest die gespeicherte Modellwahl. `null` heisst, dass kein Modell festgelegt ist und Smart
 * Instant selbst wählt — das ist der Normalfall.
 */
export function parseStoredComposerModelChoice(raw: string | null): ChatComposerModelId | null {
  const allowed = new Set<string>(CHAT_COMPOSER_MODELS.map((m) => m.id))
  return raw && allowed.has(raw) ? (raw as ChatComposerModelId) : null
}

/** API-Modellstrings aus der Composer-Konfiguration (Admin KI-Tokens Filter, auch ohne bisherige Logs). */
/**
 * Abo: Modellwahl im Hauptchat (Profil → subscription_plans).
 *
 * Grundsätzlich stehen alle Modelle offen — die Kosten regelt der Credit-Verbrauch, der pro Modell
 * unterschiedlich hoch ausfällt. Ein Abo kann einzelne Modelle sperren; die bleiben im Menü sichtbar,
 * aber nicht anwählbar.
 */
export type SubscriptionPlanChatModelFields = {
  chat_blocked_model_ids?: string[] | null
}

/** Gesperrte Modelle des Abos, auf gültige Composer-IDs gefiltert. */
export function getBlockedChatModelIds(
  plan: SubscriptionPlanChatModelFields | null,
): ChatComposerModelId[] {
  const raw = plan?.chat_blocked_model_ids
  if (!Array.isArray(raw)) {
    return []
  }
  const allowed = new Set<string>(CHAT_COMPOSER_MODELS.map((m) => m.id))
  return raw.filter((id): id is ChatComposerModelId => typeof id === 'string' && allowed.has(id))
}

export function isChatModelBlocked(
  id: ChatComposerModelId,
  blockedIds: readonly ChatComposerModelId[],
): boolean {
  return blockedIds.includes(id)
}

export function getComposerApiModelIdsForAdminFilter(): string[] {
  const ids = new Set<string>()
  /** Zusätzlich: Lernpfad / Lernkarten / Arbeitsblätter (nicht im Chat-Composer). */
  ids.add('gpt-5.4')
  for (const m of CHAT_DAILY_TIER_OPENAI_MODELS) {
    ids.add(m.id)
  }
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
