import type { ChatMessage } from '../types'

/** Entfernt eingebettete Vision-Daten (Base64) — für ältere Chat-Turns im Gateway. */
export function stripVisionBlocksFromMessageContent(content: string): string {
  let s = content.replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild im Chatverlauf]')
  s = s.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/gi, '[Bild im Chatverlauf]')
  s = s.replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '[Bild im Chatverlauf]')
  return s
}

export function messageHasVisionPayload(content: string): boolean {
  return content.includes('[BildData:') || content.includes('@chat-media:')
}

/**
 * Nur die neueste User-Nachricht mit Bild bleibt für Vision vollständig — sonst Token-Explosion.
 */
export function prepareChatMessagesForVisionGateway(messages: ChatMessage[]): ChatMessage[] {
  const visionUser = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && messageHasVisionPayload(m.content))
  if (!visionUser) {
    return messages
  }
  return messages.map((m) => {
    if (m.role === 'user' && m.id !== visionUser.id) {
      return { ...m, content: stripVisionBlocksFromMessageContent(m.content) }
    }
    return m
  })
}
