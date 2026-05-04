export type ChatRole = 'user' | 'assistant'

export type ChatMessageExcelExport = {
  bucket: string
  path: string
  fileName: string
}

export type ChatMessageWordExport = {
  bucket: string
  path: string
  fileName: string
}

/** KI/Gliederung für «Word aus Vorlage» – wird zu OOXML in die Vorlage injiziert. */
export type WordOutlineV1 = {
  version: 1
  fileName?: string
  title?: string
  blocks: Array<
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
    | { type: 'paragraph'; text: string }
  >
}

export type ChatMessage = {
  id: string
  threadId?: string
  role: ChatRole
  content: string
  createdAt: string
  metadata?: {
    excelExport?: ChatMessageExcelExport
    wordExport?: ChatMessageWordExport
    /** Laufender OpenAI-SSE-Stream: UI blendet Text live ein (ohne Schreib-Animation). */
    liveStream?: boolean
    /** User-Nachricht: Excel-Modus (Marker wurde vor Speichern entfernt). */
    userExcelCommand?: boolean
    /** User-Nachricht: Word-Export-Befehl (Marker entfernt). */
    userWordCommand?: boolean
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
