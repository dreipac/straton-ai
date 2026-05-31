import type { ChatMessage } from '../types'

/** Entfernt eingebettete Vision-Daten (Base64) — für ältere Chat-Turns im Gateway. */
export function stripVisionBlocksFromMessageContent(content: string): string {
  let s = content.replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild im Chatverlauf]')
  s = s.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/gi, '[Bild im Chatverlauf]')
  s = s.replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '[Bild im Chatverlauf]')
  return s
}

/**
 * Nur die letzte User-Nachricht darf `[BildData]` behalten — sonst multiplizieren sich
 * Vision-Tokens (z. B. 149k) und ältere Fotos überlasten die Anfrage.
 */
export function prepareChatMessagesForVisionGateway(messages: ChatMessage[]): ChatMessage[] {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) {
    return messages
  }
  return messages.map((m) => {
    if (m.role === 'user' && m.id !== lastUser.id) {
      return { ...m, content: stripVisionBlocksFromMessageContent(m.content) }
    }
    return m
  })
}
