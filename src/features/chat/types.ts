export type ChatRole = 'user' | 'assistant'

/** Admin-Debug: Ergebnis von Smart-Instant Schritt 1 (an User-Nachricht). */
export type InstantAnalyzeDebugMeta = {
  source: 'edge' | 'fallback'
  clarity: string
  intent: string
  missing: string[]
  reply_mode: string
  needs_live_web_from_ai: boolean
  needs_live_web_final: boolean
  heuristic_applied: boolean
  web_query: string
  web_reason: string
  auto_web_planned: boolean
  auto_web_ran: boolean
}

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

export type ChatMessagePdfExport = {
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
    | { type: 'table'; rows: string[][]; header?: boolean }
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
    pdfExport?: ChatMessagePdfExport
    /** Laufender OpenAI-SSE-Stream: UI blendet Text live ein (ohne Schreib-Animation). */
    liveStream?: boolean
    /** User-Nachricht: Excel-Modus (Marker wurde vor Speichern entfernt). */
    userExcelCommand?: boolean
    /** User-Nachricht: Word-Export-Befehl (Marker entfernt). */
    userWordCommand?: boolean
    /** User-Nachricht: PDF-Export-Befehl (Marker entfernt). */
    userPdfCommand?: boolean
    /** User-Nachricht: Antwort soll mit vorheriger Tavily-Websuche gestützt werden. */
    userWebSearchCommand?: boolean
    /** User-Nachricht: automatische Tavily-Websuche (Smart Instant). */
    autoWebSearch?: boolean
    /** Assistant-Nachricht: Antwort nutzte automatische Websuche. */
    assistantAutoWebSearch?: boolean
    /** User-Nachricht: Smart-Instant Einordnung (nur wenn Admin-Debug aktiv). */
    instantAnalyzeDebug?: InstantAnalyzeDebugMeta
    /** User-Nachricht: gewähltes Quiz-Format vor Generierung (MC-Chat vs. interaktiv). */
    userQuizFormat?: 'markdown_mcq' | 'interactive'
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

export type ChatFolder = {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}
