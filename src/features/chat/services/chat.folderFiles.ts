import { getSupabaseClient } from '../../../integrations/supabase/client'
import { CHAT_VISION_MEDIA_BUCKET } from './chat.visionStorage'

type ChatFolderFileRow = {
  id: string
  user_id: string
  folder_id: string
  name: string
  mime_type: string
  size_bytes: number
  storage_bucket: string
  storage_path: string
  excerpt: string
  sort_order: number
  created_at: string
  updated_at: string
}

const FILE_SELECT =
  'id, user_id, folder_id, name, mime_type, size_bytes, storage_bucket, storage_path, excerpt, sort_order, created_at, updated_at' as const

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

function mapFolderFile(row: ChatFolderFileRow) {
  return {
    id: row.id,
    userId: row.user_id,
    folderId: row.folder_id,
    name: row.name.trim(),
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    excerpt: row.excerpt,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type ChatFolderFileRecord = ReturnType<typeof mapFolderFile>

export function buildChatFolderFileStoragePath(
  userId: string,
  folderId: string,
  fileId: string,
  fileName: string,
): string {
  return `${userId}/folders/${folderId}/doc-${fileId}/${sanitizeFileName(fileName)}`
}

export async function listChatFolderFiles(userId: string, folderId: string): Promise<ChatFolderFileRecord[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_folder_files')
    .select(FILE_SELECT)
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapFolderFile(row as ChatFolderFileRow))
}

export async function createChatFolderFile(args: {
  userId: string
  folderId: string
  file: File
  excerpt: string
  sortOrder?: number
}): Promise<ChatFolderFileRecord> {
  const fileId = crypto.randomUUID()
  const path = buildChatFolderFileStoragePath(args.userId, args.folderId, fileId, args.file.name)
  const supabase = getSupabaseClient()

  const { error: uploadError } = await supabase.storage.from(CHAT_VISION_MEDIA_BUCKET).upload(path, args.file, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: true,
  })
  if (uploadError) {
    throw new Error(uploadError.message || 'Datei konnte nicht hochgeladen werden.')
  }

  const { data, error } = await supabase
    .from('chat_folder_files')
    .insert({
      id: fileId,
      user_id: args.userId,
      folder_id: args.folderId,
      name: args.file.name.trim() || 'Datei',
      mime_type: args.file.type || 'application/octet-stream',
      size_bytes: args.file.size,
      storage_bucket: CHAT_VISION_MEDIA_BUCKET,
      storage_path: path,
      excerpt: args.excerpt.slice(0, 2500),
      sort_order: args.sortOrder ?? 0,
    })
    .select(FILE_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(CHAT_VISION_MEDIA_BUCKET).remove([path])
    throw error
  }

  return mapFolderFile(data as ChatFolderFileRow)
}

export async function deleteChatFolderFile(file: Pick<ChatFolderFileRecord, 'storageBucket' | 'storagePath' | 'id'>): Promise<void> {
  const supabase = getSupabaseClient()
  const { error: storageError } = await supabase.storage.from(file.storageBucket).remove([file.storagePath])
  if (storageError) {
    throw new Error(storageError.message || 'Datei konnte nicht aus dem Speicher entfernt werden.')
  }

  const { error } = await supabase.from('chat_folder_files').delete().eq('id', file.id)
  if (error) {
    throw error
  }
}

export async function deleteAllChatFolderFilesForFolder(userId: string, folderId: string): Promise<void> {
  const files = await listChatFolderFiles(userId, folderId)
  if (files.length === 0) {
    return
  }
  const supabase = getSupabaseClient()
  const pathsByBucket = new Map<string, string[]>()
  for (const file of files) {
    const list = pathsByBucket.get(file.storageBucket) ?? []
    list.push(file.storagePath)
    pathsByBucket.set(file.storageBucket, list)
  }
  for (const [bucket, paths] of pathsByBucket) {
    if (paths.length > 0) {
      await supabase.storage.from(bucket).remove(paths)
    }
  }
  const { error } = await supabase.from('chat_folder_files').delete().eq('user_id', userId).eq('folder_id', folderId)
  if (error) {
    throw error
  }
}

export async function createChatFolderFileSignedUrl(
  file: Pick<ChatFolderFileRecord, 'storageBucket' | 'storagePath'>,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage.from(file.storageBucket).createSignedUrl(file.storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Download-Link konnte nicht erstellt werden.')
  }
  return data.signedUrl
}
