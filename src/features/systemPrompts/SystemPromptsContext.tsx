import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  DEFAULT_SYSTEM_PROMPTS,
  type SystemPromptKey,
  mergeSystemPromptsWithDefaults,
} from '../../config/systemPromptDefaults'
import { useAuth } from '../auth/context/useAuth'
import { fetchSystemPromptsFromDb } from './systemPrompts.service'
import { SystemPromptsContext, type SystemPromptsContextValue } from './SystemPromptsContext.shared'

export function SystemPromptsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const [rawFromDb, setRawFromDb] = useState<Partial<Record<string, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setRawFromDb({})
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const rows = await fetchSystemPromptsFromDb()
      setRawFromDb(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Systemanweisungen konnten nicht geladen werden.')
      setRawFromDb({})
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const prompts = useMemo(() => mergeSystemPromptsWithDefaults(rawFromDb), [rawFromDb])

  const getPrompt = useCallback(
    (key: SystemPromptKey) => prompts[key] ?? DEFAULT_SYSTEM_PROMPTS[key],
    [prompts],
  )

  const value = useMemo<SystemPromptsContextValue>(
    () => ({
      prompts,
      isLoading,
      error,
      refresh,
      getPrompt,
    }),
    [prompts, isLoading, error, refresh, getPrompt],
  )

  return <SystemPromptsContext.Provider value={value}>{children}</SystemPromptsContext.Provider>
}
