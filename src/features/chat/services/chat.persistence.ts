import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatMessage, ChatRole, ChatThread } from '../types'

type ChatThreadRow = {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

type ChatMessageRow = {
  id: string
  thread_id: string
  role: ChatRole
  content: string
  created_at: string
  metadata?: unknown
}

function mapThread(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMessageMetadata(raw: unknown): ChatMessage['metadata'] {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const o = raw as Record<string, unknown>
  const ex = o.excelExport
  if (!ex || typeof ex !== 'object') {
    return undefined
  }
  const e = ex as Record<string, unknown>
  const bucket = typeof e.bucket === 'string' ? e.bucket : ''
  const path = typeof e.path === 'string' ? e.path : ''
  const fileName = typeof e.fileName === 'string' ? e.fileName : ''
  if (!bucket || !path || !fileName) {
    return undefined
  }
  return { excelExport: { bucket, path, fileName } }
}

function mapMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    metadata: mapMessageMetadata(row.metadata),
  }
}

export async function listChatThreads(userId: string): Promise<ChatThread[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_threads')
    .select('id, user_id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapThread(row as ChatThreadRow))
}

export async function listMessagesByThreadIds(threadIds: string[]): Promise<ChatMessage[]> {
  if (threadIds.length === 0) {
    return []
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, thread_id, role, content, created_at, metadata')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapMessage(row as ChatMessageRow))
}

export async function createChatThread(userId: string, title: string): Promise<ChatThread> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_threads')
    .insert({ user_id: userId, title })
    .select('id, user_id, title, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return mapThread(data as ChatThreadRow)
}

export async function updateChatThreadTitle(threadId: string, title: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_threads').update({ title }).eq('id', threadId)

  if (error) {
    throw error
  }
}

export async function touchChatThread(threadId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)

  if (error) {
    throw error
  }
}

export async function createChatMessage(
  threadId: string,
  role: ChatRole,
  content: string,
): Promise<ChatMessage> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      role,
      content,
    })
    .select('id, thread_id, role, content, created_at, metadata')
    .single()

  if (error) {
    throw error
  }

  return mapMessage(data as ChatMessageRow)
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_threads').delete().eq('id', threadId)

  if (error) {
    throw error
  }
}

export async function deleteEmptyChatThreadsByUserId(userId: string): Promise<number> {
  const supabase = getSupabaseClient()

  const { data: threadsData, error: threadsError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)

  if (threadsError) {
    throw threadsError
  }

  const threadIds = (threadsData ?? []).map((row) => String((row as { id: string }).id))
  if (threadIds.length === 0) {
    return 0
  }

  const { data: messagesData, error: messagesError } = await supabase
    .from('chat_messages')
    .select('thread_id')
    .in('thread_id', threadIds)

  if (messagesError) {
    throw messagesError
  }

  const nonEmptyThreadIds = new Set((messagesData ?? []).map((row) => String((row as { thread_id: string }).thread_id)))
  const emptyThreadIds = threadIds.filter((threadId) => !nonEmptyThreadIds.has(threadId))

  if (emptyThreadIds.length === 0) {
    return 0
  }

  const { error: deleteError } = await supabase.from('chat_threads').delete().in('id', emptyThreadIds)
  if (deleteError) {
    throw deleteError
  }

  return emptyThreadIds.length
}
