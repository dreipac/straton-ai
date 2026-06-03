/** Fortschritt während `submitMessage` — für Status neben dem Loader. */
export type ChatSendPhase =
  | 'analyzing'
  | 'web_search'
  | 'generating'
  | 'thinking_analyze'
  | 'thinking_clarify'
  | 'thinking'
  | 'image'
  | 'image_search'
  | 'excel'
  | 'word'
  | 'pdf'

export type ChatSendPhaseState = ChatSendPhase | null

export function getChatSendPhaseLabel(phase: ChatSendPhaseState | undefined): string | undefined {
  switch (phase) {
    case 'analyzing':
      return 'Wird eingeordnet …'
    case 'web_search':
      return 'Suche im Web …'
    case 'generating':
      return 'Denkt nach …'
    case 'thinking_analyze':
      return 'Aufgabe wird analysiert …'
    case 'thinking_clarify':
      return 'Rückfrage wird vorbereitet …'
    case 'thinking':
      return 'Anleitung wird erstellt …'
    case 'image':
      return 'Bild wird erstellt …'
    case 'image_search':
      return 'Fotos werden gesucht …'
    case 'excel':
      return 'Excel wird vorbereitet …'
    case 'word':
      return 'Word wird vorbereitet …'
    case 'pdf':
      return 'PDF wird vorbereitet …'
    default:
      return undefined
  }
}
