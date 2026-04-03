import { getSupabaseClient } from '../../../integrations/supabase/client'

export type UserFeedbackRow = {
  id: string
  user_id: string
  body: string
  author_email: string | null
  author_first_name: string | null
  author_last_name: string | null
  created_at: string
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

export async function submitUserFeedback(body: string, author: FeedbackAuthorSnapshot): Promise<void> {
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

  const { error } = await supabase.from('user_feedback').insert({
    user_id: user.id,
    body: trimmed,
    author_email: author.email?.trim() || null,
    author_first_name: author.firstName?.trim() || null,
    author_last_name: author.lastName?.trim() || null,
  })

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}

export async function listUserFeedbackForAdmin(): Promise<UserFeedbackRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('user_feedback')
    .select('id, user_id, body, author_email, author_first_name, author_last_name, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(toErrorMessage(error))
  }

  return (data ?? []) as UserFeedbackRow[]
}

export async function deleteUserFeedbackById(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('user_feedback').delete().eq('id', id)

  if (error) {
    throw new Error(toErrorMessage(error))
  }
}
