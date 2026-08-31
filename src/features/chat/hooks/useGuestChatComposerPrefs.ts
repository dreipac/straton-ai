import { useState } from 'react'
import {
  CHAT_COMPOSER_MODEL_STORAGE_KEY,
  parseStoredComposerModelChoice,
} from '../constants/chatComposerModels'
import {
  fromChatComposerSelection,
  toChatComposerSelection,
  type ChatComposerSelection,
} from '../constants/chatComposerSelection'
import {
  CHAT_REPLY_MODE_STORAGE_KEY,
  type ChatReplyMode,
  parseStoredChatReplyMode,
} from '../constants/chatReplyMode'
import {
  CHAT_THINKING_MODE_STORAGE_KEY,
  parseStoredChatThinkingMode,
} from '../constants/chatThinkingMode'

export function useGuestChatComposerPrefs() {
  const [guestComposerSelection, setGuestComposerSelection] = useState<ChatComposerSelection>(() =>
    toChatComposerSelection({
      thinkingMode: parseStoredChatThinkingMode(
        typeof window !== 'undefined' ? localStorage.getItem(CHAT_THINKING_MODE_STORAGE_KEY) : null,
      ),
      modelId: parseStoredComposerModelChoice(
        typeof window !== 'undefined' ? localStorage.getItem(CHAT_COMPOSER_MODEL_STORAGE_KEY) : null,
      ),
    }),
  )
  const [guestChatReplyMode, setGuestChatReplyMode] = useState<ChatReplyMode>(() =>
    parseStoredChatReplyMode(
      typeof window !== 'undefined' ? localStorage.getItem(CHAT_REPLY_MODE_STORAGE_KEY) : null,
    ),
  )

  /* Gäste senden nichts — die Auswahl wird trotzdem gemerkt, damit sie nach der Anmeldung steht. */
  function handleGuestComposerSelection(selection: ChatComposerSelection) {
    setGuestComposerSelection(selection)
    const next = fromChatComposerSelection(selection)
    try {
      localStorage.setItem(CHAT_THINKING_MODE_STORAGE_KEY, next.thinkingMode)
      if (next.modelId) {
        localStorage.setItem(CHAT_COMPOSER_MODEL_STORAGE_KEY, next.modelId)
      } else {
        localStorage.removeItem(CHAT_COMPOSER_MODEL_STORAGE_KEY)
      }
    } catch {
      /* ignore */
    }
  }

  function handleGuestChatReplyMode(mode: ChatReplyMode) {
    setGuestChatReplyMode(mode)
    try {
      localStorage.setItem(CHAT_REPLY_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return {
    guestComposerSelection,
    guestChatReplyMode,
    handleGuestComposerSelection,
    handleGuestChatReplyMode,
  }
}
