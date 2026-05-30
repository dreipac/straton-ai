import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatFolder } from '../types'

type ChatFolderRow = {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

type ChatThreadFolderLinkRow = {
  user_id: string
  thread_id: string
  folder_id: string
}

function mapFolder(row: ChatFolderRow): ChatFolder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name.trim(),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listChatFolders(userId: string): Promise<ChatFolder[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_folders')
    .select('id, user_id, name, sort_order, created_at, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapFolder(row as ChatFolderRow))
}

export async function listChatThreadFolderLinks(userId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_thread_folder_links')
    .select('user_id, thread_id, folder_id')
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  const map: Record<string, string> = {}
  for (const row of (data ?? []) as ChatThreadFolderLinkRow[]) {
    map[row.thread_id] = row.folder_id
  }
  return map
}

export async function createChatFolder(userId: string, name: string, sortOrder?: number): Promise<ChatFolder> {
  const supabase = getSupabaseClient()
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Ordnername darf nicht leer sein.')
  }

  const { data, error } = await supabase
    .from('chat_folders')
    .insert({
      user_id: userId,
      name: trimmed,
      sort_order: sortOrder ?? 0,
    })
    .select('id, user_id, name, sort_order, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return mapFolder(data as ChatFolderRow)
}

export async function renameChatFolder(folderId: string, name: string): Promise<ChatFolder> {
  const supabase = getSupabaseClient()
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Ordnername darf nicht leer sein.')
  }

  const { data, error } = await supabase
    .from('chat_folders')
    .update({ name: trimmed })
    .eq('id', folderId)
    .select('id, user_id, name, sort_order, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return mapFolder(data as ChatFolderRow)
}

export async function deleteChatFolder(folderId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_folders').delete().eq('id', folderId)
  if (error) {
    throw error
  }
}

export async function setChatThreadFolder(
  userId: string,
  threadId: string,
  folderId: string | null,
): Promise<void> {
  const supabase = getSupabaseClient()

  if (folderId === null) {
    const { error } = await supabase
      .from('chat_thread_folder_links')
      .delete()
      .eq('user_id', userId)
      .eq('thread_id', threadId)
    if (error) {
      throw error
    }
    return
  }

  const { error } = await supabase.from('chat_thread_folder_links').upsert(
    {
      user_id: userId,
      thread_id: threadId,
      folder_id: folderId,
    },
    { onConflict: 'user_id,thread_id' },
  )

  if (error) {
    throw error
  }
}
