import { getSupabaseClient } from '../../../integrations/supabase/client'
import { CHAT_VISION_MEDIA_BUCKET } from './chat.visionStorage'

const DOC_PREFIX = 'doc'

/** Storage-Key (S3-kompatibel): kein Leerzeichen, keine Umlaute im Pfad — Anzeigename bleibt `file.name`. */
function sanitizeFileName(name: string): string {
  const trimmed = name.replace(/[/\\]/g, '_').trim() || 'document'
  const dot = trimmed.lastIndexOf('.')
  const ext = dot > 0 ? trimmed.slice(dot) : ''
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed

  function asciiSafe(part: string): string {
    return (
      part
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'document'
    )
  }

  const safeStem = asciiSafe(stem)
  const safeExt = ext
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]+/g, '')
    .slice(0, 12)

  return `${safeStem}${safeExt}`.slice(0, 180)
}

export function buildChatDocumentStoragePath(
  userId: string,
  threadId: string,
  attachmentId: string,
  fileName: string,
): string {
  return `${userId}/${threadId}/${DOC_PREFIX}-${attachmentId}/${sanitizeFileName(fileName)}`
}

export function isServerExtractedDocumentFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return true
  }
  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true
  }
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('spreadsheet') ||
    file.type === 'text/csv'
  ) {
    return true
  }
  return false
}

export async function uploadChatDocumentAttachment(
  userId: string,
  threadId: string,
  file: File,
  attachmentId: string,
): Promise<{ bucket: string; path: string; mimeType: string }> {
  const path = buildChatDocumentStoragePath(userId, threadId, attachmentId, file.name)
  const supabase = getSupabaseClient()
  const { error } = await supabase.storage.from(CHAT_VISION_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
  if (error) {
    throw new Error(error.message || 'Dokument konnte nicht hochgeladen werden.')
  }
  return {
    bucket: CHAT_VISION_MEDIA_BUCKET,
    path,
    mimeType: file.type || 'application/octet-stream',
  }
}
