import { getSupabaseClient } from '../../../integrations/supabase/client'
import { normalizeVisionDataUrl } from '../utils/imageVisionNormalize'
import type { ChatMessage } from '../types'

export const CHAT_VISION_MEDIA_BUCKET = 'chat-media'

const BILDDATA_BLOCK_RE = /\[BildData:([^\]]+)\]([\s\S]*?)\[\/BildData\]/g
const CHAT_MEDIA_REF_PREFIX = '@chat-media:'

function dataUrlToBlob(dataUrl: string): Blob {
  const normalized = normalizeVisionDataUrl(dataUrl)
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(normalized)
  if (!m?.[2]) {
    throw new Error('Bildformat ungültig.')
  }
  const mime = (m[1] ?? 'image/jpeg').toLowerCase() === 'image/jpg' ? 'image/jpeg' : (m[1] ?? 'image/jpeg')
  const binary = atob(m[2]!.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

export function buildChatVisionStoragePath(userId: string, threadId: string, attachmentId: string): string {
  return `${userId}/${threadId}/${attachmentId}.jpg`
}

export function buildPersistedBildDataBlock(attachmentId: string, storagePath: string): string {
  return `[BildData:${attachmentId}]\n${CHAT_MEDIA_REF_PREFIX}${storagePath}\n[/BildData]`
}

/**
 * Ersetzt eingebettete Data-URLs durch `@chat-media:`-Referenzen (kleine DB, Edge lädt Bild).
 */
export async function persistInlineVisionImagesInContent(
  userId: string,
  threadId: string,
  content: string,
): Promise<{ content: string; metadata?: ChatMessage['metadata'] }> {
  if (!content.includes('[BildData:')) {
    return { content }
  }

  const supabase = getSupabaseClient()
  let nextContent = content
  let visionImage: NonNullable<ChatMessage['metadata']>['visionImage'] | undefined

  const blocks = [...content.matchAll(BILDDATA_BLOCK_RE)]
  for (const block of blocks) {
    const full = block[0]
    const attachmentId = String(block[1] ?? '').trim()
    const inner = String(block[2] ?? '').trim()
    if (!attachmentId || !full) {
      continue
    }

    if (inner.includes(CHAT_MEDIA_REF_PREFIX)) {
      continue
    }

    const dataUrlMatch = inner.match(/data:image\/[^;]+;base64,[\s\S]+/i)
    if (!dataUrlMatch?.[0]) {
      continue
    }

    const path = buildChatVisionStoragePath(userId, threadId, attachmentId)
    const blob = dataUrlToBlob(dataUrlMatch[0])
    const { error } = await supabase.storage.from(CHAT_VISION_MEDIA_BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (error) {
      /** iOS/Storage: Inline-Data-URL bleibt in `content` — Edge bekommt `visionInlineDataUrl` vom Client. */
      console.warn('[chat.visionStorage] upload failed, keeping inline BildData', error.message)
      continue
    }

    const replacement = buildPersistedBildDataBlock(attachmentId, path)
    nextContent = nextContent.replace(full, replacement)
    visionImage = {
      bucket: CHAT_VISION_MEDIA_BUCKET,
      path,
      attachmentId,
    }
  }

  return {
    content: nextContent,
    ...(visionImage ? { metadata: { visionImage } } : {}),
  }
}
