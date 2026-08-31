import {
  CHAT_COMPOSER_MODELS,
  type ChatComposerModelId,
  getChatComposerModelMeta,
} from './chatComposerModels'
import type { ChatThinkingMode } from './chatThinkingMode'

/**
 * Was im Composer-Menü angehakt ist. Intern bleiben es zwei Angaben — der Verarbeitungsweg
 * (`ChatThinkingMode`) und das feste Modell (`ChatComposerModelId | null`) —, im Menü ist es eine
 * einzige Auswahl. Dieses Modul rechnet zwischen beiden Sichten um.
 */
export type ChatComposerSelection = 'normal' | 'thinking' | ChatComposerModelId

export type ChatComposerSelectionState = {
  thinkingMode: ChatThinkingMode
  /** `null` = Smart Instant wählt das Modell selbst. */
  modelId: ChatComposerModelId | null
}

const MODEL_IDS = new Set<string>(CHAT_COMPOSER_MODELS.map((model) => model.id))

export function isChatComposerModelId(value: string): value is ChatComposerModelId {
  return MODEL_IDS.has(value)
}

export function toChatComposerSelection(state: ChatComposerSelectionState): ChatComposerSelection {
  if (state.thinkingMode === 'thinking') {
    return 'thinking'
  }
  return state.modelId ?? 'normal'
}

export function fromChatComposerSelection(
  selection: ChatComposerSelection,
): ChatComposerSelectionState {
  if (selection === 'thinking') {
    return { thinkingMode: 'thinking', modelId: null }
  }
  if (selection === 'normal') {
    return { thinkingMode: 'normal', modelId: null }
  }
  /* Ein festes Modell läuft über denselben Weg wie Smart Instant, nur ohne automatische Modellwahl. */
  return { thinkingMode: 'normal', modelId: selection }
}

/** Beschriftung der Pille im Composer. */
export function chatComposerSelectionLabel(selection: ChatComposerSelection): string {
  if (selection === 'thinking') {
    return 'Thinking'
  }
  if (selection === 'normal') {
    return 'Smart Instant'
  }
  return getChatComposerModelMeta(selection).label
}
