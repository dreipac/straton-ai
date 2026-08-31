import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { buildDateiBlock, extractDocumentFromBytes, type ExtractedDocument } from './documentExtract.ts'

const CHAT_MEDIA_BUCKET = 'chat-media'

export type DocumentAttachmentInput = {
  bucket: string
  path: string
  name: string
  mimeType?: string
}

function sanitizeAttachments(payload: unknown): DocumentAttachmentInput[] | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const raw = (payload as { attachments?: unknown }).attachments
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) {
    return null
  }
  const out: DocumentAttachmentInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const o = item as Record<string, unknown>
    const bucket = typeof o.bucket === 'string' ? o.bucket.trim() : ''
    const path = typeof o.path === 'string' ? o.path.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const mimeType = typeof o.mimeType === 'string' ? o.mimeType.trim() : ''
    if (bucket !== CHAT_MEDIA_BUCKET || !path || !name) {
      continue
    }
    out.push({ bucket, path, name, mimeType: mimeType || undefined })
  }
  return out.length > 0 ? out : null
}

function assertOwnStoragePath(userId: string, path: string): boolean {
  const prefix = `${userId}/`
  return path.startsWith(prefix) && !path.includes('..')
}

export async function handleDocumentExtract(
  userClient: SupabaseClient,
  userId: string,
  payload: unknown,
): Promise<{ documents: ExtractedDocument[]; fileBlocks: string }> {
  const attachments = sanitizeAttachments(payload)
  if (!attachments) {
    throw new Error('Keine gültigen Dokument-Anhänge übermittelt.')
  }

  const documents: ExtractedDocument[] = []

  for (const att of attachments) {
    if (!assertOwnStoragePath(userId, att.path)) {
      throw new Error('Ungültiger Speicherpfad für Dokument.')
    }

    const { data, error } = await userClient.storage.from(att.bucket).download(att.path)
    if (error || !data) {
      throw new Error(
        error?.message
          ? `Dokument «${att.name}» konnte nicht geladen werden: ${error.message}`
          : `Dokument «${att.name}» konnte nicht geladen werden.`,
      )
    }

    const buffer = await data.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const extracted = await extractDocumentFromBytes(bytes, att.name, att.mimeType ?? '')
    documents.push(extracted)
  }

  const fileBlocks = documents.map((d) => buildDateiBlock(d.fileName, d.text)).join('\n\n')
  return { documents, fileBlocks }
}

export { sanitizeAttachments as sanitizeDocumentExtractPayload }
