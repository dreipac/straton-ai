import { isValidVisionDataUrl, normalizeVisionDataUrl } from './imageVisionNormalize'
import type { ChatMessage } from '../types'
import { VISION_CONTEXT_IMAGE_LIMIT } from '../constants/mainChatContext'

const BILDDATA_BLOCK_RE = /\[BildData:[^\]]*\]([\s\S]*?)\[\/BildData\]/i

/** Data-URL aus `[BildData]…[/BildData]` (vor Storage-Persistenz). */
export function extractInlineVisionDataUrlFromContent(content: string): string | null {
  const block = BILDDATA_BLOCK_RE.exec(content)
  if (!block?.[1]) {
    return null
  }
  const dataMatch = block[1].trim().match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/i)
  if (!dataMatch?.[0]) {
    return null
  }
  const normalized = normalizeVisionDataUrl(dataMatch[0].trim())
  return isValidVisionDataUrl(normalized) ? normalized : null
}

/** Alias — gleiche Logik wie {@link isValidVisionDataUrl} (kein Vollstring-Regex). */
export function isValidVisionDataUrlForGateway(dataUrl: string): boolean {
  return isValidVisionDataUrl(dataUrl)
}

/**
 * Ersetzt `@chat-media:` / fehlende Inline-Daten im letzten `[BildData]`-Block —
 * damit die Edge Function das Bild auch ohne Storage-Download sieht.
 */
/** Gleiche Schwelle wie `buildChatCompletionRequestBody` → Edge `resolveVisionUrlFromBody`. */
function canInjectVisionDataUrlForGateway(dataUrl: string): boolean {
  const safe = normalizeVisionDataUrl(dataUrl.trim())
  if (!safe.startsWith('data:image/')) {
    return false
  }
  const marker = 'base64,'
  const idx = safe.indexOf(marker)
  return idx >= 0 && safe.length > idx + marker.length + 64
}

export function injectVisionInlineDataUrlIntoMessageContent(
  content: string,
  inlineDataUrl: string,
): string {
  const safe = normalizeVisionDataUrl(inlineDataUrl.trim())
  if (!canInjectVisionDataUrlForGateway(safe)) {
    return content
  }
  const matches = [...content.matchAll(/\[BildData:([^\]]+)\]([\s\S]*?)\[\/BildData\]/gi)]
  if (matches.length === 0) {
    const block = `[BildData:vision]\n${safe}\n[/BildData]`
    const trimmed = content.trim()
    return trimmed ? `${trimmed}\n\n${block}` : block
  }
  const last = matches[matches.length - 1]!
  const id = String(last[1] ?? 'vision').trim() || 'vision'
  const full = last[0]!
  const replacement = `[BildData:${id}]\n${safe}\n[/BildData]`
  return content.replace(full, replacement)
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

/** IDs der letzten N User-Nachrichten mit Bild (chronologisch). */
export function getLastVisionUserMessageIds(
  messages: ChatMessage[],
  limit = VISION_CONTEXT_IMAGE_LIMIT,
): Set<string> {
  const ids: string[] = []
  for (let i = messages.length - 1; i >= 0 && ids.length < limit; i -= 1) {
    const m = messages[i]!
    if (m.role === 'user' && messageHasVisionPayload(m.content)) {
      ids.push(m.id)
    }
  }
  return new Set(ids)
}

/**
 * Die letzten {@link VISION_CONTEXT_IMAGE_LIMIT} User-Bilder bleiben vollständig — ältere nur Platzhalter.
 */
export function prepareChatMessagesForVisionGateway(messages: ChatMessage[]): ChatMessage[] {
  const keepIds = getLastVisionUserMessageIds(messages)
  if (keepIds.size === 0) {
    return messages
  }
  return messages.map((m) => {
    if (m.role === 'user' && messageHasVisionPayload(m.content) && !keepIds.has(m.id)) {
      return { ...m, content: stripVisionBlocksFromMessageContent(m.content) }
    }
    return m
  })
}

/**
 * Entfernt Base64 aus Gateway-`messages`, wenn das Bild separat als `visionInlineDataUrl` läuft
 * (kleinerer Request; Edge hängt das Bild am letzten User-Turn an).
 */
export function stripEmbeddedVisionBase64ForTransport(content: string): string {
  if (!content.includes('[BildData:') && !content.includes('data:image/')) {
    return content
  }
  const textOnly = stripVisionBlocksFromMessageContent(content)
  const idMatch = content.match(/\[BildData:([^\]]+)\]/)
  if (!idMatch) {
    return textOnly
  }
  const id = String(idMatch[1] ?? 'vision').trim() || 'vision'
  const block = `[BildData:${id}]\n(Bild in dieser Nachricht)\n[/BildData]`
  const trimmed = textOnly.trim()
  return trimmed ? `${trimmed}\n\n${block}` : block
}
