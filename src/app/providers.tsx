import type { PropsWithChildren } from 'react'
import { ToastProvider } from '../components/toast/ToastProvider'
import { AuthProvider } from '../features/auth/context/AuthProvider'
import { ChatInvitationSubscriptions } from '../features/chat/components/ChatInvitationSubscriptions'
import { AppNewsSubscriptions } from '../features/news/components/AppNewsSubscriptions'
import { SystemPromptsProvider } from '../features/systemPrompts/SystemPromptsContext'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ChatInvitationSubscriptions />
        <AppNewsSubscriptions />
        <SystemPromptsProvider>{children}</SystemPromptsProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
