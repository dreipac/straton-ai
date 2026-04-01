import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../features/auth/context/AuthProvider'
import { SystemPromptsProvider } from '../features/systemPrompts/SystemPromptsContext'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <SystemPromptsProvider>{children}</SystemPromptsProvider>
    </AuthProvider>
  )
}
