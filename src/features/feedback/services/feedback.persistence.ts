import { getSupabaseClient } from '../../../integrations/supabase/client'

export type UserFeedbackRow = {
  id: string
  display_id: string
  user_id: string
  body: string
  author_email: string | null
  author_first_name: string | null
  author_last_name: string | null
  created_at: string
  resolved_at: string | null
  resolution_message: string | null
  resolution_seen_at: string | null
}

export type UnseenFeedbackResolution = {
  id: string
  display_id: string
  resolution_message: string
  resolved_at: string
}

export type FeedbackAuthorSnapshot = {
  email: string | null
  firstName: string | null
  lastName: string | null
}

function toErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Feedback konnte nicht gespeichert werden.'
}

export async function submitUserFeedback(
  body: string,
  author: FeedbackAuthorSnapshot,
): Promise<{ displayId: string }> {
  const supabase = getSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Bitte melde dich an, um Feedback zu senden.')
  }

  const trimmed = body.trim()
  if (!trimmed) {
    throw new Error('Bitte gib einen Text ein.')
  }

  const { data, error } = await supabase
    .from('user_feedback')
    .insert({
      user_id: user.id,
      body: trimmed,
      author_email: author.email?.trim() || null,
      author_first_name: author.firstName?.trim() || null,
      author_last_name: author.lastName?.trim() || null,
    })
    .select('display_id')
    .single()

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  const displayId = typeof data?.display_id === 'string' ? data.display_id : ''
  if (!displayId) {
    throw new Error('Feedback-ID konnte nicht erzeugt werden.')
  }

  return { displayId }
}

export async function listUserFeedbackForAdmin(): Promise<UserFeedbackRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('user_feedback')
    .select(
      'id, display_id, user_id, body, author_email, author_first_name, author_last_name, created_at, resolved_at, resolution_message, resolution_seen_at',
    )
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return (data ?? []) as UserFeedbackRow[]
}

export async function listUnseenFeedbackResolutions(): Promise<UnseenFeedbackResolution[]> {
  const supabase = getSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return []
  }

  const { data, error } = await supabase
    .from('user_feedback')
    .select('id, display_id, resolution_message, resolved_at')
    .not('resolved_at', 'is', null)
    .is('resolution_seen_at', null)
    .order('resolved_at', { ascending: true })
    .limit(20)

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return (data ?? [])
    .filter(
      (row): row is UnseenFeedbackResolution =>
        typeof row.id === 'string' &&
        typeof row.display_id === 'string' &&
        typeof row.resolution_message === 'string' &&
        row.resolution_message.trim().length > 0 &&
        typeof row.resolved_at === 'string',
    )
    .map((row) => ({
      id: row.id,
      display_id: row.display_id,
      resolution_message: row.resolution_message.trim(),
      resolved_at: row.resolved_at,
    }))
}

export async function markFeedbackResolutionSeen(feedbackId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('mark_feedback_resolution_seen', {
    p_feedback_id: feedbackId,
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function resolveUserFeedback(feedbackId: string, resolutionMessage: string): Promise<void> {
  const supabase = getSupabaseClient()
  const trimmed = resolutionMessage.trim()
  if (!trimmed) {
    throw new Error('Bitte eine Abschlussnachricht eingeben.')
  }

  const { error } = await supabase
    .from('user_feedback')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_message: trimmed,
      resolution_seen_at: null,
    })
    .eq('id', feedbackId)

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function deleteUserFeedbackById(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('user_feedback').delete().eq('id', id)

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}
