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
}
