import { useContext } from 'react'
import { SystemPromptsContext } from './SystemPromptsContext.shared'

export function useSystemPrompts() {
  const ctx = useContext(SystemPromptsContext)
  if (!ctx) {
    throw new Error('useSystemPrompts muss innerhalb von SystemPromptsProvider verwendet werden.')
  }
  return ctx
}
