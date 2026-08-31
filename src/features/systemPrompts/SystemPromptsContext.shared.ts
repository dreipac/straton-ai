import { createContext } from 'react'
import type { SystemPromptKey } from '../../config/systemPromptDefaults'

export type SystemPromptsContextValue = {
  prompts: Record<SystemPromptKey, string>
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  getPrompt: (key: SystemPromptKey) => string
}

export const SystemPromptsContext = createContext<SystemPromptsContextValue | undefined>(undefined)
