import { normalizeVisionDataUrl } from './imageVisionNormalize'
import type { ChatMessage } from '../types'

const BILDDATA_BLOCK_RE = /\[BildData:[^\]]*\]([\s\S]*?)\[\/BildData\]/i

/** Data-URL aus `[BildData]…[/BildData]` (vor Storage-Persistenz). */
export function extractInlineVisionDataUrlFromContent(content: string): string | null {
  const block = BILDDATA_BLOCK_RE.exec(content)
  if (!block?.[1]) {
    return null
  }
  const dataMatch = block[1].trim().match(/data:image\/[^;]+;base64,[\s\S]+/i)
  if (!dataMatch?.[0]) {
    return null
  }
  const normalized = normalizeVisionDataUrl(dataMatch[0])
  return normalized.length > 64 ? normalized : null
}

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
