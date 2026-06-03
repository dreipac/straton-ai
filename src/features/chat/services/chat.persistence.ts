import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  isPostgresUnicodeEscapeError,
  sanitizeChatMessageContentForDb,
  sanitizeForJsonbStorage,
} from '../../../utils/sanitizeDatabaseText'
import type { ChatMessage, ChatRole, ChatThread } from '../types'

type ChatThreadRow = {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export type ChatMessageRow = {
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
  const out: NonNullable<ChatMessage['metadata']> = {}

  if (o.userExcelCommand === true) {
    out.userExcelCommand = true
  }

  if (o.userWordCommand === true) {
    out.userWordCommand = true
  }

  if (o.userPdfCommand === true) {
    out.userPdfCommand = true
  }

  if (o.userWebSearchCommand === true) {
    out.userWebSearchCommand = true
  }
  if (o.autoWebSearch === true) {
    out.autoWebSearch = true
  }
  if (o.assistantAutoWebSearch === true) {
    out.assistantAutoWebSearch = true
  }

  const dbg = o.instantAnalyzeDebug
  if (dbg && typeof dbg === 'object') {
    const d = dbg as Record<string, unknown>
    const source = d.source === 'edge' || d.source === 'fallback' ? d.source : 'fallback'
    const missing = Array.isArray(d.missing)
      ? d.missing.filter((m): m is string => typeof m === 'string').slice(0, 3)
      : []
    out.instantAnalyzeDebug = {
      source,
      category: typeof d.category === 'string' ? d.category : 'chat',
      action: typeof d.action === 'string' ? d.action : 'answer',
      category_from_ai: typeof d.category_from_ai === 'string' ? d.category_from_ai : 'chat',
      action_from_ai: typeof d.action_from_ai === 'string' ? d.action_from_ai : 'answer',
      clarity: typeof d.clarity === 'string' ? d.clarity : 'partial',
      intent: typeof d.intent === 'string' ? d.intent : '',
      missing,
      reply_mode: typeof d.reply_mode === 'string' ? d.reply_mode : 'normal',
      needs_live_web_from_ai: d.needs_live_web_from_ai === true,
      needs_live_web_final: d.needs_live_web_final === true,
      heuristic_applied: d.heuristic_applied === true,
      web_query: typeof d.web_query === 'string' ? d.web_query : '',
      web_reason: typeof d.web_reason === 'string' ? d.web_reason : '',
      auto_web_planned: d.auto_web_planned === true,
      auto_web_ran: d.auto_web_ran === true,
    }
  }

  if (o.userQuizFormat === 'markdown_mcq' || o.userQuizFormat === 'interactive') {
    out.userQuizFormat = o.userQuizFormat
  }

  if (o.liveStream === true) {
    out.liveStream = true
  }

  const ex = o.excelExport
  if (ex && typeof ex === 'object') {
    const e = ex as Record<string, unknown>
    const bucket = typeof e.bucket === 'string' ? e.bucket : ''
    const path = typeof e.path === 'string' ? e.path : ''
    const fileName = typeof e.fileName === 'string' ? e.fileName : ''
    if (bucket && path && fileName) {
      out.excelExport = { bucket, path, fileName }
    }
  }

  const wx = o.wordExport
  if (wx && typeof wx === 'object') {
    const w = wx as Record<string, unknown>
    const bucket = typeof w.bucket === 'string' ? w.bucket : ''
    const path = typeof w.path === 'string' ? w.path : ''
    const fileName = typeof w.fileName === 'string' ? w.fileName : ''
    if (bucket && path && fileName) {
      out.wordExport = { bucket, path, fileName }
    }
  }

  const vx = o.visionImage
  if (vx && typeof vx === 'object') {
    const v = vx as Record<string, unknown>
    const bucket = typeof v.bucket === 'string' ? v.bucket : ''
    const path = typeof v.path === 'string' ? v.path : ''
    const attachmentId = typeof v.attachmentId === 'string' ? v.attachmentId : ''
    if (bucket && path && attachmentId) {
      out.visionImage = { bucket, path, attachmentId }
    }
  }

  const px = o.pdfExport
  if (px && typeof px === 'object') {
    const p = px as Record<string, unknown>
    const bucket = typeof p.bucket === 'string' ? p.bucket : ''
    const path = typeof p.path === 'string' ? p.path : ''
    const fileName = typeof p.fileName === 'string' ? p.fileName : ''
    if (bucket && path && fileName) {
      out.pdfExport = { bucket, path, fileName }
    }
  }

  const unsplash = o.unsplashSearch
  if (unsplash && typeof unsplash === 'object') {
    const u = unsplash as Record<string, unknown>
    const query = typeof u.query === 'string' ? u.query.trim() : ''
    const photosRaw = Array.isArray(u.photos) ? u.photos : []
    const photos = photosRaw
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object' && !Array.isArray(p)))
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : '',
        description: typeof p.description === 'string' ? p.description : '',
        thumbUrl: typeof p.thumbUrl === 'string' ? p.thumbUrl : '',
        regularUrl: typeof p.regularUrl === 'string' ? p.regularUrl : '',
        photoPageUrl: typeof p.photoPageUrl === 'string' ? p.photoPageUrl : '',
        photographerName: typeof p.photographerName === 'string' ? p.photographerName : '',
        photographerUrl: typeof p.photographerUrl === 'string' ? p.photographerUrl : '',
        downloadLocation: typeof p.downloadLocation === 'string' ? p.downloadLocation : '',
      }))
      .filter((p) => p.id && p.regularUrl && p.photoPageUrl)
      .slice(0, 2)
    if (query && photos.length > 0) {
      out.unsplashSearch = { query, photos }
    }
  }

  const gen = o.generatedImage
  if (gen && typeof gen === 'object') {
    const g = gen as Record<string, unknown>
    const bucket = typeof g.bucket === 'string' ? g.bucket : ''
    const path = typeof g.path === 'string' ? g.path : ''
    const imageId = typeof g.imageId === 'string' ? g.imageId : ''
    if (bucket && path && imageId) {
      out.generatedImage = { bucket, path, imageId }
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

export function mapMessage(row: ChatMessageRow): ChatMessage {
  const content =
    typeof row.content === 'string' ? row.content : row.content == null ? '' : String(row.content)
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content,
    createdAt: row.created_at,
    metadata: mapMessageMetadata(row.metadata),
  }
}

type MemberThreadJoinRow = {
  role: string
  chat_threads: ChatThreadRow | ChatThreadRow[] | null
}

export async function listChatThreads(userId: string): Promise<ChatThread[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_thread_members')
    .select(
      `
      role,
      chat_threads (
        id,
        user_id,
        title,
        created_at,
        updated_at
      )
    `,
    )
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  const rows = (data ?? []) as MemberThreadJoinRow[]
  const threads: ChatThread[] = []
  for (const row of rows) {
    const nested = row.chat_threads
    const threadRow = Array.isArray(nested) ? nested[0] : nested
    if (!threadRow) {
      continue
    }
    const role = row.role === 'owner' || row.role === 'member' ? row.role : undefined
    threads.push({
      ...mapThread(threadRow as ChatThreadRow),
      membershipRole: role,
    })
  }

  threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return threads
}

const CHAT_MESSAGE_SELECT_WITH_METADATA =
  'id, thread_id, role, content, created_at, metadata' as const

const CHAT_MESSAGE_SELECT_BASE = 'id, thread_id, role, content, created_at' as const

function mapMessageRows(data: unknown): ChatMessage[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.map((row) => mapMessage(row as ChatMessageRow))
}

async function listMessagesByThreadIdsQuery(
  threadIds: string[],
  includeMetadata: boolean,
): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient()
  const { data, error } = includeMetadata
    ? await supabase
        .from('chat_messages')
        .select(CHAT_MESSAGE_SELECT_WITH_METADATA)
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true })
    : await supabase
        .from('chat_messages')
        .select(CHAT_MESSAGE_SELECT_BASE)
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return mapMessageRows(data)
}

export async function listMessagesByThreadIds(threadIds: string[]): Promise<ChatMessage[]> {
  if (threadIds.length === 0) {
    return []
  }

  try {
    return await listMessagesByThreadIdsQuery(threadIds, true)
  } catch (err) {
    if (!isPostgresUnicodeEscapeError(err)) {
      throw err
    }
    return listMessagesByThreadIdsQuery(threadIds, false)
  }
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
  metadata?: ChatMessage['metadata'],
): Promise<ChatMessage> {
  const supabase = getSupabaseClient()
  const safeContent = sanitizeChatMessageContentForDb(content)
  const insertPayload: {
    thread_id: string
    role: ChatRole
    content: string
    metadata?: ChatMessage['metadata']
  } = {
    thread_id: threadId,
    role,
    content: safeContent,
  }
  if (metadata && Object.keys(metadata).length > 0) {
    insertPayload.metadata = sanitizeForJsonbStorage(metadata)
  }
  const { data, error } = await supabase.from('chat_messages').insert(insertPayload).select('id, thread_id, role, content, created_at, metadata').single()

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

/** Eingeladenes Mitglied entfernt nur seine Zeile — Chat bleibt für andere bestehen (RLS: user_id = auth.uid()). */
export async function leaveSharedChatThreadMembership(threadId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('chat_thread_members')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId)

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
