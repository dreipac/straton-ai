import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatThread } from '../types'

export type ChatThreadInvitationRow = {
  id: string
  threadId: string
  inviterId: string
  inviteeEmail: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
  threadTitle?: string
}

function mapInviteError(code: string): string {
  switch (code) {
    case 'THREAD_NOT_FOUND':
      return 'Chat wurde nicht gefunden.'
    case 'FORBIDDEN':
      return 'Keine Berechtigung.'
    case 'EMAIL_REQUIRED':
      return 'Bitte eine E-Mail-Adresse eingeben.'
    case 'USER_NOT_FOUND':
      return 'Kein registrierter Benutzer mit dieser E-Mail.'
    case 'SELF_INVITE':
      return 'Du kannst dich nicht selbst einladen.'
    case 'ALREADY_MEMBER':
      return 'Diese Person ist bereits Mitglied.'
    case 'INVITE_PENDING':
      return 'Für diese E-Mail liegt bereits eine ausstehende Einladung vor.'
    default:
      return code
  }
}

export function parseInviteRpcError(message: string): string {
  const trimmed = message.trim()
  const known = [
    'THREAD_NOT_FOUND',
    'FORBIDDEN',
    'EMAIL_REQUIRED',
    'USER_NOT_FOUND',
    'SELF_INVITE',
    'ALREADY_MEMBER',
    'INVITE_PENDING',
  ]
  for (const k of known) {
    if (trimmed.includes(k)) {
      return mapInviteError(k)
    }
  }
  return trimmed || 'Einladung konnte nicht gesendet werden.'
}

export async function inviteUserToChatThread(threadId: string, inviteeEmail: string): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('invite_user_to_chat_thread', {
    p_thread_id: threadId,
    p_invitee_email: inviteeEmail.trim(),
  })
  if (error) {
    throw new Error(parseInviteRpcError(error.message))
  }
  return String(data ?? '')
}

export async function acceptChatInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('accept_chat_invitation', {
    p_invitation_id: invitationId,
  })
  if (error) {
    throw new Error(error.message || 'Beitreten fehlgeschlagen.')
  }
}

export async function declineChatInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('decline_chat_invitation', {
    p_invitation_id: invitationId,
  })
  if (error) {
    throw new Error(error.message || 'Ablehnen fehlgeschlagen.')
  }
}

type InvitationSelectRow = {
  id: string
  thread_id: string
  inviter_id: string
  invitee_email: string
  status: string
  created_at: string
  chat_threads: { title: string } | { title: string }[] | null
}

export async function listPendingInvitationsForUser(userId: string): Promise<ChatThreadInvitationRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_thread_invitations')
    .select(
      `
      id,
      thread_id,
      inviter_id,
      invitee_email,
      status,
      created_at,
      chat_threads ( title )
    `,
    )
    .eq('invitee_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row: InvitationSelectRow) => {
    const nested = row.chat_threads
    const t = Array.isArray(nested) ? nested[0] : nested
    return {
      id: row.id,
      threadId: row.thread_id,
      inviterId: row.inviter_id,
      inviteeEmail: row.invitee_email,
      status: row.status as ChatThreadInvitationRow['status'],
      createdAt: row.created_at,
      threadTitle: t?.title,
    }
  })
}

export function isThreadOwner(thread: ChatThread | undefined, currentUserId: string): boolean {
  if (!thread || thread.isTemporary) {
    return false
  }
  return thread.userId === currentUserId
}

export type ChatThreadMemberPublic = {
  userId: string
  role: 'owner' | 'member'
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  joinedAt: string
}

type ListMembersRpcRow = {
  user_id: string
  role: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  joined_at: string
}

function mapListMembersRow(row: ListMembersRpcRow): ChatThreadMemberPublic {
  const role = row.role === 'owner' || row.role === 'member' ? row.role : 'member'
  return {
    userId: row.user_id,
    role,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    joinedAt: row.joined_at,
  }
}

export async function listChatThreadMembersPublic(threadId: string): Promise<ChatThreadMemberPublic[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_chat_thread_members_public', {
    p_thread_id: threadId,
  })
  if (error) {
    throw new Error(error.message || 'Mitglieder konnten nicht geladen werden.')
  }
  const rows = (data ?? []) as ListMembersRpcRow[]
  return rows.map(mapListMembersRow)
}

function parseEndSharingError(message: string): string {
  const trimmed = message.trim()
  if (trimmed.includes('THREAD_NOT_FOUND')) {
    return 'Chat wurde nicht gefunden.'
  }
  if (trimmed.includes('FORBIDDEN')) {
    return 'Keine Berechtigung.'
  }
  return trimmed || 'Freigabe konnte nicht beendet werden.'
}

export async function endChatThreadSharing(threadId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('end_chat_thread_sharing', {
    p_thread_id: threadId,
  })
  if (error) {
    throw new Error(parseEndSharingError(error.message))
  }
}
