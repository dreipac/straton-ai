export type ChatRole = 'user' | 'assistant'

export type ChatMessageExcelExport = {
  bucket: string
  path: string
  fileName: string
}

export type ChatMessage = {
  id: string
  threadId?: string
  role: ChatRole
  content: string
  createdAt: string
  metadata?: {
    excelExport?: ChatMessageExcelExport
  }
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
