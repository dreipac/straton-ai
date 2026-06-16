export type ChatRole = 'user' | 'assistant'

/** Admin-Debug: Ergebnis von Smart-Instant Schritt 1 (an User-Nachricht). */
/** Admin-Debug: Thinking-Aufgabenanalyse (task_type = Kategorie für Generierung). */
export type PresentationProfileDebugMeta = {
  density: string
  layout: string
  compact: boolean
  chapter_style: string
  required_blocks: string[]
  forbidden_blocks: string[]
  reason: string
}

export type PresentationLayoutMetricsMeta = {
  tables: number
  cards: number
  card_tiles: number
  hr: number
  definitions: number
  callouts: number
  divided_lists: number
  divided_list_items: number
  mcq: number
  headings: number
  lists: number
  paragraphs: number
  code_blocks: number
  layout_satisfied?: string[]
  layout_missing?: string[]
}

export type ThinkingAnalyzeDebugMeta = {
  source: 'edge' | 'fallback'
  task_type: string
  complexity: string
  intent: string
  needs_clarification_from_ai: boolean
  needs_clarification_final: boolean
  clarify_rounds_planned_final: number
  needs_live_web_from_ai: boolean
  needs_live_web_final: boolean
  web_query: string
  web_reason: string
  heuristic_applied: boolean
  analysis_summary: string
  document_coverage_topics?: string[]
  presentation_profile?: PresentationProfileDebugMeta
  layout_metrics?: PresentationLayoutMetricsMeta
}

export type InstantAnalyzeDebugMeta = {
  source: 'edge' | 'fallback'
  category: string
  action: string
  category_from_ai: string
  action_from_ai: string
  task_type: string
  task_type_from_ai: string
  explanation_depth: string
  explanation_depth_from_ai: string
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
  document_coverage_topics?: string[]
  presentation_profile?: PresentationProfileDebugMeta
  layout_metrics?: PresentationLayoutMetricsMeta
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

/** User-Nachricht: hochgeladenes Dokument in `chat-media` (PDF/Word/Excel …). */
export type ChatMessageDocumentAttachment = {
  id: string
  name: string
  bucket: string
  path: string
  mimeType: string
}

/** Unsplash-Treffer (Hotlink-URLs, Attribution in der UI). */
export type UnsplashPhotoResult = {
  id: string
  description: string
  thumbUrl: string
  regularUrl: string
  photoPageUrl: string
  photographerName: string
  photographerUrl: string
  downloadLocation: string
}

/** Tavily-/Websuche-Bildtreffer (Hotlink-URLs, Attribution in der UI). */
export type ImageSearchPhotoResult = {
  id: string
  description?: string
  thumbUrl: string
  regularUrl: string
  photoPageUrl: string
  photographerName: string
  photographerUrl: string
  downloadLocation?: string
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
    /** User-Nachricht: Diagramm/Chart-Befehl (Marker entfernt). */
    userChartCommand?: boolean
    /** User-Nachricht: Struktur-Diagramm (Stammbaum, Ablauf, Mermaid). */
    userDiagramCommand?: boolean
    /** User-Nachricht: Multiple-Choice / Direktantwort (nur richtige Option). */
    userDirectAnswerCommand?: boolean
    /** User-Nachricht: Antwort soll mit vorheriger Tavily-Websuche gestützt werden. */
    userWebSearchCommand?: boolean
    /** User-Nachricht: automatische Tavily-Websuche (Smart Instant). */
    autoWebSearch?: boolean
    /** Assistant-Nachricht: Antwort nutzte automatische Websuche. */
    assistantAutoWebSearch?: boolean
    /** User-Nachricht: Smart-Instant Einordnung (nur wenn Admin-Debug aktiv). */
    instantAnalyzeDebug?: InstantAnalyzeDebugMeta
    /** User-Nachricht: Thinking-Aufgabenanalyse (nur wenn Admin-Debug aktiv). */
    thinkingAnalyzeDebug?: ThinkingAnalyzeDebugMeta
    /** Assistant-Stream: Thinking Klärung vs. finale Antwort. */
    thinkingStreamKind?: 'clarify' | 'final'
    /** Assistant: Layout-Metriken (Admin-Debug, nach Antwort). */
    presentationLayoutMetrics?: PresentationLayoutMetricsMeta
    /** User-Nachricht: gewähltes Quiz-Format vor Generierung (MC-Chat vs. interaktiv). */
    userQuizFormat?: 'markdown_mcq' | 'interactive'
    /** User-Nachricht: Foto in Storage (`chat-media`), Inhalt nur `@chat-media:`-Referenz. */
    visionImage?: {
      bucket: string
      path: string
      attachmentId: string
    }
    /** User-Nachricht: angehängte Dokumente (Storage-Ref + Anzeigename). */
    documentAttachments?: ChatMessageDocumentAttachment[]
    /** Assistant: generiertes Bild in Storage (`chat-media`), Inhalt nur `@chat-media:`-Link. */
    generatedImage?: {
      bucket: string
      path: string
      imageId: string
    }
    /** Assistant: Unsplash-Fotosuche (max. 4 Treffer). */
    unsplashSearch?: {
      query: string
      photos: UnsplashPhotoResult[]
    }
    /** Assistant: Tavily-/Websuche-Bilder (max. 4 Treffer). */
    imageSearch?: {
      query: string
      photos: ImageSearchPhotoResult[]
    }
  }
}

export type ChatThread = {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
  isTemporary?: boolean
  isRemoving?: boolean
  /** gesetzt wenn Thread über Mitgliedschaft (nicht nur Ersteller-Zeile) geladen wurde */
  membershipRole?: 'owner' | 'member'
}

export type ChatFolder = {
  id: string
  userId: string
  name: string
  color: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ChatFolderFile = {
  id: string
  userId: string
  folderId: string
  name: string
  mimeType: string
  sizeBytes: number
  storageBucket: string
  storagePath: string
  excerpt: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ChatFolderOverviewTab = 'chats' | 'files'
