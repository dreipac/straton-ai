import { getSupabaseClient } from '../../../integrations/supabase/client'

export type UserFriend = {
  friendUserId: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  friendsSince: string
}

export type IncomingFriendRequest = {
  id: string
  requesterId: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  createdAt: string
}

export type OutgoingFriendRequest = {
  id: string
  addresseeId: string
  inviteeEmail: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  createdAt: string
}

function mapFriendRequestError(code: string): string {
  switch (code) {
    case 'EMAIL_REQUIRED':
      return 'Bitte eine E-Mail-Adresse eingeben.'
    case 'USER_NOT_FOUND':
      return 'Kein registrierter Benutzer mit dieser E-Mail.'
    case 'SELF_REQUEST':
      return 'Du kannst dir selbst keine Anfrage senden.'
    case 'ALREADY_FRIENDS':
      return 'Ihr seid bereits befreundet.'
    case 'REQUEST_PENDING':
      return 'Für diese Person liegt bereits eine ausstehende Anfrage vor.'
    case 'REQUEST_PENDING_INCOMING':
      return 'Diese Person hat dir bereits eine Anfrage gesendet — nimm sie unter «Ausstehende Anfragen» an.'
    case 'REQUEST_NOT_FOUND':
      return 'Anfrage wurde nicht gefunden.'
    case 'FORBIDDEN':
      return 'Keine Berechtigung.'
    case 'REQUEST_NOT_PENDING':
      return 'Diese Anfrage ist nicht mehr ausstehend.'
    default:
      return code
  }
}

export function parseFriendRequestRpcError(message: string): string {
  const trimmed = message.trim()
  const known = [
    'EMAIL_REQUIRED',
    'USER_NOT_FOUND',
    'SELF_REQUEST',
    'ALREADY_FRIENDS',
    'REQUEST_PENDING',
    'REQUEST_PENDING_INCOMING',
    'REQUEST_NOT_FOUND',
    'FORBIDDEN',
    'REQUEST_NOT_PENDING',
  ]
  for (const code of known) {
    if (trimmed.includes(code)) {
      return mapFriendRequestError(code)
    }
  }
  return trimmed || 'Freundschaftsanfrage fehlgeschlagen.'
}

export function formatFriendDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = 'Unbekannt',
): string {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean)
  if (parts.length === 0) {
    return fallback
  }
  return parts.join(' ')
}

export async function sendFriendRequest(inviteeEmail: string): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_invitee_email: inviteeEmail.trim(),
  })
  if (error) {
    throw new Error(parseFriendRequestRpcError(error.message))
  }
  return String(data ?? '')
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('accept_friend_request', {
    p_request_id: requestId,
  })
  if (error) {
    throw new Error(parseFriendRequestRpcError(error.message))
  }
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('decline_friend_request', {
    p_request_id: requestId,
  })
  if (error) {
    throw new Error(parseFriendRequestRpcError(error.message))
  }
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('cancel_friend_request', {
    p_request_id: requestId,
  })
  if (error) {
    throw new Error(parseFriendRequestRpcError(error.message))
  }
}

export async function countIncomingFriendRequests(): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('count_incoming_friend_requests')
  if (error) {
    throw new Error(error.message || 'Anfragen konnten nicht geladen werden.')
  }
  return typeof data === 'number' ? data : Number(data ?? 0)
}

type FriendRow = {
  friend_user_id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  friends_since: string
}

type IncomingRow = {
  id: string
  requester_id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  created_at: string
}

type OutgoingRow = {
  id: string
  addressee_id: string
  invitee_email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  created_at: string
}

export async function listUserFriends(): Promise<UserFriend[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_user_friends')
  if (error) {
    throw new Error(error.message || 'Freunde konnten nicht geladen werden.')
  }
  return ((data ?? []) as FriendRow[]).map((row) => ({
    friendUserId: row.friend_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    friendsSince: row.friends_since,
  }))
}

export async function listIncomingFriendRequests(): Promise<IncomingFriendRequest[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_incoming_friend_requests')
  if (error) {
    throw new Error(error.message || 'Eingehende Anfragen konnten nicht geladen werden.')
  }
  return ((data ?? []) as IncomingRow[]).map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }))
}

export async function listOutgoingFriendRequests(): Promise<OutgoingFriendRequest[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('list_outgoing_friend_requests')
  if (error) {
    throw new Error(error.message || 'Gesendete Anfragen konnten nicht geladen werden.')
  }
  return ((data ?? []) as OutgoingRow[]).map((row) => ({
    id: row.id,
    addresseeId: row.addressee_id,
    inviteeEmail: row.invitee_email,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }))
}
