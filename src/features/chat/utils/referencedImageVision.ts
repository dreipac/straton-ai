import { getSupabaseClient } from '../../../integrations/supabase/client'
import { CHAT_VISION_MEDIA_BUCKET } from '../services/chat.visionStorage'
import { normalizeVisionDataUrl, isValidVisionDataUrl } from './imageVisionNormalize'
import type { ChatMessage } from '../types'

const CHAT_MEDIA_REF_RE = /@chat-media:([^\s)\]]+)/i
const GENERATED_PATH_SEGMENT = '/gen-'

type ThreadMessage = {
  role: string
  content?: string | null
  metadata?: ChatMessage['metadata']
}

function squeezeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function storagePathFromMessage(message: ThreadMessage): string | null {
  const metaPath =
    message.metadata?.generatedImage?.path ?? message.metadata?.visionImage?.path
  if (typeof metaPath === 'string' && metaPath.trim()) {
    return metaPath.trim()
  }
  const content = typeof message.content === 'string' ? message.content : ''
  const ref = CHAT_MEDIA_REF_RE.exec(content)
  return ref?.[1]?.trim() ?? null
}

export function assistantMessageHasGeneratedImage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') {
    return false
  }
  const path = storagePathFromMessage(message)
  if (path?.includes(GENERATED_PATH_SEGMENT)) {
    return true
  }
  const content = typeof message.content === 'string' ? message.content : ''
  return (
    /\[Generiertes Bild\]/i.test(content) ||
    /\[[^\]]*\]\(\s*data:image\//i.test(content)
  )
}

export function userMessageHasUploadedImage(message: ThreadMessage): boolean {
  if (message.role !== 'user') {
    return false
  }
  const path = storagePathFromMessage(message)
  if (path && !path.includes(GENERATED_PATH_SEGMENT)) {
    return true
  }
  const content = typeof message.content === 'string' ? message.content : ''
  return content.includes('[BildData:') || content.includes('@chat-media:')
}

/** Nutzer bezieht sich auf ein früheres Bild (Frage zum Inhalt, nicht neue Generierung). */
export function matchImageReferenceQuestion(raw: string): boolean {
  const t = squeezeWs(raw)
  if (!t || t.length > 480) {
    return false
  }
  if (
    /^(?:was|welche[rs]?)\s+(?:steht|stehen|ist|sind|siehst\s+du|steht\s+da|zeigt|zeigen)/i.test(t) &&
    /\b(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)
  ) {
    return true
  }
  if (/^beschreib(?:e)?\s+(?:mir\s+)?(?:das\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/^(?:was|welcher)\s+text\b/i.test(t) && /\b(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (
    /^(?:kannst|könntest)\s+du\s+(?:das\s+)?(?:bild|foto)\s+(?:lesen|sehen|erkennen|analysieren)/i.test(t)
  ) {
    return true
  }
  if (/^lies\s+(?:mir\s+)?(?:den\s+)?text\s+(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/^(?:sieh|sieht)\s+du\s+(?:etwas\s+)?(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/\b(?:mein(?:e)?|hochgeladene[ns]?)\s+(?:foto|bild)\b/i.test(t)) {
    return true
  }
  if (/\b(?:das|dem)\s+foto\b/i.test(t)) {
    return true
  }
  if (/(?:nochmal|erneut|wieder)\s+(?:das\s+)?(?:foto|bild)\b/i.test(t)) {
    return true
  }
  return false
}

/**
 * Lädt das referenzierte Bild aus dem Thread-Storage (User-Foto oder generiertes Bild).
 * Bei beiden: das **zeitlich neuere** Bild.
 */
export function resolveReferencedImageStoragePath(
  priorMessages: ReadonlyArray<ThreadMessage>,
): string | null {
  let lastGen: { path: string; index: number } | null = null
  let lastUser: { path: string; index: number } | null = null

  for (let i = priorMessages.length - 1; i >= 0; i -= 1) {
    const m = priorMessages[i]!
    const path = storagePathFromMessage(m)
    if (!path) {
      continue
    }
    if (!lastGen && m.role === 'assistant' && assistantMessageHasGeneratedImage(m)) {
      lastGen = { path, index: i }
    }
    if (!lastUser && m.role === 'user' && userMessageHasUploadedImage(m)) {
      if (!path.includes(GENERATED_PATH_SEGMENT)) {
        lastUser = { path, index: i }
      }
    }
    if (lastGen && lastUser) {
      break
    }
  }

  if (lastGen && !lastUser) {
    return lastGen.path
  }
  if (lastUser && !lastGen) {
    return lastUser.path
  }
  if (lastGen && lastUser) {
    return lastGen.index > lastUser.index ? lastGen.path : lastUser.path
  }
  return null
}

/** @deprecated Nutze {@link resolveReferencedImageStoragePath} + {@link matchImageReferenceQuestion}. */
export function findLastGeneratedImagePath(priorMessages: ReadonlyArray<ThreadMessage>): string | null {
  for (let i = priorMessages.length - 1; i >= 0; i -= 1) {
    const m = priorMessages[i]!
    if (!assistantMessageHasGeneratedImage(m)) {
      continue
    }
    const path = storagePathFromMessage(m)
    if (path) {
      return path
    }
  }
  return null
}

/** @deprecated Nutze {@link matchImageReferenceQuestion}. */
export function matchAskAboutGeneratedImageRequest(
  raw: string,
  priorMessages: ReadonlyArray<ThreadMessage>,
): boolean {
  return matchImageReferenceQuestion(raw) && Boolean(findLastGeneratedImagePath(priorMessages))
}

export async function loadChatMediaPathAsVisionDataUrl(storagePath: string): Promise<string | null> {
  const path = storagePath.trim()
  if (!path) {
    return null
  }
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage.from(CHAT_VISION_MEDIA_BUCKET).download(path)
    if (error || !data) {
      console.warn('[referencedImageVision] download failed', error?.message)
      return null
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const normalized = normalizeVisionDataUrl(`data:image/jpeg;base64,${btoa(binary)}`)
    return isValidVisionDataUrl(normalized) ? normalized : null
  } catch (err) {
    console.warn('[referencedImageVision] load failed', err)
    return null
  }
}
