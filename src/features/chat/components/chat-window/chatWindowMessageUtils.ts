import { readImageFileAsVisionDataUrl } from '../../utils/imageVisionNormalize'
import { extractUserMessageCopyText } from '../../utils/chatMessageCopy'
import { isChatVisionImageFile } from '../../../learn/utils/documentParser'

export type ChatWindowPendingAttachment = {
  id: string
  name: string
  /** Leer bei serverseitiger Dokument-Extraktion. */
  content: string
  kind: 'file' | 'pasted-image'
  previewDataUrl?: string
  /** Nach Upload in `chat-media` — Extraktion beim Senden auf der Edge. */
  documentStorage?: {
    bucket: string
    path: string
    mimeType: string
  }
  /** Bis Thread existiert: Datei erst beim Senden hochladen. */
  pendingFile?: File
}

/** PostgREST / Zwischenzustände: content nie undefined bei .length */
export function safeMessageContent(content: string | null | undefined): string {
  return typeof content === 'string' ? content : ''
}

/** Typing-Reveal streamt Zeichenweise — bei eingebetteten Bildern (riesige data:-URLs) entstehen kaputte Markdown-Slices. */
export const ASSISTANT_TYPING_REVEAL_MAX_CHARS = 12_000

export function shouldSkipAssistantTypingReveal(strippedContent: string): boolean {
  return (
    strippedContent.length > ASSISTANT_TYPING_REVEAL_MAX_CHARS ||
    strippedContent.includes('data:image/')
  )
}

/** Data-URL aus gespeichertem `[BildData:id]…[/BildData]` (lokale Preview-Map fehlt nach Reload). */
export function extractBildDataUrlFromStoredContent(content: string, imageId: string): string | undefined {
  if (!imageId || !content.includes('[BildData:')) {
    return undefined
  }
  const escaped = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[BildData:${escaped}\\]\\s*([\\s\\S]*?)\\s*\\[/BildData\\]`, 'm')
  const m = content.match(re)
  const raw = m?.[1]?.trim()
  if (raw && raw.startsWith('data:')) {
    return raw
  }
  return undefined
}

/** Storage-Pfad aus `@chat-media:` in gespeichertem `[BildData]` (nach Upload in Supabase). */
export function extractChatMediaStoragePathFromStoredContent(
  content: string,
  imageId: string,
): string | undefined {
  if (!imageId || !content.includes('[BildData:')) {
    return undefined
  }
  const escaped = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[BildData:${escaped}\\]\\s*([\\s\\S]*?)\\s*\\[/BildData\\]`, 'm')
  const m = content.match(re)
  const raw = m?.[1]?.trim()
  if (!raw) {
    return undefined
  }
  const refMatch = raw.match(/@chat-media:([^\s)\]]+)/i)
  return refMatch?.[1]?.trim() || undefined
}

export function extractDateiFileNamesFromContent(content: string): string[] {
  if (!content.includes('[Datei:')) {
    return []
  }
  const names: string[] = []
  const re = /\[Datei:\s*([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const label = String(m[1] ?? '').trim()
    if (label) {
      names.push(label)
    }
  }
  return names
}

/** Extrahierten Dokumenttext aus gespeichertem `[Datei:…]…[/Datei]`-Block lesen. */
export function extractDateiTextFromContent(content: string, fileName: string): string {
  if (!content.includes('[Datei:') || !fileName.trim()) {
    return ''
  }
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[Datei:\\s*${escaped}\\]\\s*([\\s\\S]*?)\\s*\\[/Datei\\]`, 'i')
  const match = content.match(re)
  return match?.[1]?.trim() ?? ''
}

export type ResolvedUserDocumentAttachment = {
  id: string
  name: string
  bucket: string
  path: string
  mimeType: string
  /** Nur Text aus `content` — kein Storage (ältere Nachrichten). */
  textOnly?: boolean
}

/** Metadaten bevorzugen; Fallback auf Dateinamen aus `content`. */
export function resolveUserMessageDocumentAttachments(
  message: { content: string; metadata?: { documentAttachments?: Array<{ id: string; name: string; bucket: string; path: string; mimeType: string }> } },
): ResolvedUserDocumentAttachment[] {
  const fromMeta = message.metadata?.documentAttachments
  if (fromMeta?.length) {
    return fromMeta.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      bucket: attachment.bucket,
      path: attachment.path,
      mimeType: attachment.mimeType,
    }))
  }
  return extractDateiFileNamesFromContent(message.content).map((name, index) => ({
    id: `legacy-${index}`,
    name,
    bucket: '',
    path: '',
    mimeType: '',
    textOnly: true,
  }))
}

/**
 * Desktop liefert eingefügte Bilder oft in `clipboardData.files`.
 * iOS Safari oft nur über `items[].getAsFile()` — ohne diesen Zweig bleibt die Liste leer.
 */
export function getImageFilesFromClipboard(data: DataTransfer | null | undefined): File[] {
  if (!data) {
    return []
  }
  const fromFiles = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
  if (fromFiles.length > 0) {
    return fromFiles
  }
  const out: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') {
      continue
    }
    if (item.type === 'image/svg+xml') {
      continue
    }
    const file = item.getAsFile()
    if (!file) {
      continue
    }
    if (item.type.startsWith('image/')) {
      out.push(file)
      continue
    }
    if (!item.type && isChatVisionImageFile(file)) {
      out.push(file)
    }
  }
  return out
}

export function extractPastedImageIdsFromContent(content: string): string[] {
  const regex = /\[(?:BildData|Bild):([^:\]]+)(?::[^\]]+)?\][\s\S]*?\[\/(?:BildData|Bild)\]/g
  const ids = new Set<string>()
  let match: RegExpExecArray | null = regex.exec(content)
  while (match) {
    const id = String(match[1] ?? '').trim()
    if (id) {
      ids.add(id)
    }
    match = regex.exec(content)
  }
  return [...ids]
}

export function stripAttachmentBlocksForDisplay(content: string): string {
  return extractUserMessageCopyText(content)
}

export async function buildPastedImagePendingAttachments(
  files: File[],
): Promise<ChatWindowPendingAttachment[]> {
  const imageAttachments: ChatWindowPendingAttachment[] = []
  for (const file of files) {
    const previewDataUrl = await readImageFileAsVisionDataUrl(file)
    imageAttachments.push({
      id: crypto.randomUUID(),
      name: file.name || `image-${Date.now()}.png`,
      content: '',
      kind: 'pasted-image',
      previewDataUrl,
    })
  }
  return imageAttachments
}
