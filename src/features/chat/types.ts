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
    /** Laufender OpenAI-SSE-Stream: UI blendet Text live ein (ohne Schreib-Animation). */
    liveStream?: boolean
    /** User-Nachricht: Excel-Modus (Marker wurde vor Speichern entfernt). */
    userExcelCommand?: boolean
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
  /** gesetzt wenn Thread über Mitgliedschaft (nicht nur Ersteller-Zeile) geladen wurde */
  membershipRole?: 'owner' | 'member'
}
