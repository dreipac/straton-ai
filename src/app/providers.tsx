import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../features/auth/context/AuthProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>
}
