export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  threadId?: string
  role: ChatRole
  content: string
  createdAt: string
}

export type ChatThread = {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
  isTemporary?: boolean
  isRemoving?: boolean
}
