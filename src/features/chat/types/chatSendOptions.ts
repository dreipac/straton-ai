export type ChatDocumentAttachmentRef = {
  id: string
  name: string
  bucket: string
  path: string
  mimeType: string
}

export type ChatPendingDocumentFile = {
  id: string
  name: string
  file: File
}

export type ChatSendMessageOptions = {
  quizFormat?: 'markdown_mcq' | 'interactive'
  visionInlineDataUrl?: string
  /** Hochgeladene Dokumente — Extraktion erst serverseitig beim Senden. */
  documentAttachments?: ChatDocumentAttachmentRef[]
  /** Noch nicht hochgeladen (kein Thread beim Anhängen). */
  pendingDocumentFiles?: ChatPendingDocumentFile[]
  /**
   * Editier-Box in der Folien-Vorschau: aktueller Foliensatz, gegen den die Antwort (ein Patch,
   * kein voller Foliensatz) angewendet wird. Nur gesetzt, wenn der Marker `PPTX_EDIT_COMMAND_MARKER`
   * im gesendeten Text steckt (siehe `submitPptxEditMessage` in `useChat.ts`).
   */
  pptxEditCurrentSlides?: import('../utils/pptxOutline').PptxSlide[]
  /** Nummerierte Serialisierung von `pptxEditCurrentSlides` für den Modell-Kontext (Turn-Block, nicht im Systemprompt). */
  pptxEditCurrentDeckContext?: string
  /** ID der ursprünglichen Präsentations-Nachricht (Anker) — markiert User- und Assistant-Nachricht dieses Turns als Editier-Turn (siehe `pptxEditAnchorMessageId` in `types.ts`), rein clientseitige Buchführung, geht nicht an das Modell. */
  pptxEditAnchorMessageId?: string
  /** Vom Nutzer im Preset-Modal gewähltes Design (vor einer Neugenerierung) — steuert das `data-theme` der KI-Antwort (siehe `buildPptxChatDocumentHtmlHint`). */
  pptxSelectedPreset?: import('../constants/pptxExportPrompt').PptxPresetKey
}
