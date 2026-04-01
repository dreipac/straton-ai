import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../../integrations/supabase/client'

let sessionResolveInFlight: Promise<Session | null> | null = null

/** Erkennt abgelaufene/ungültige JWTs (Auth API und PostgREST PGRST303). */
export function isLikelyExpiredJwtError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const o = err as { code?: unknown; message?: unknown; status?: unknown }
  const code = String(o.code ?? '').toUpperCase()
  const msg = String(o.message ?? '').toLowerCase()
  if (code === 'PGRST303') {
    return true
  }
  if (msg.includes('pgrst303')) {
    return true
  }
  if (msg.includes('jwt expired') || msg.includes('invalid jwt')) {
    return true
  }
  const st = o.status
  if (st === 401 || st === '401') {
    return true
  }
  return false
}

function authFailureSuggestsTokenRefresh(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('jwt') ||
    m.includes('expired') ||
    m.includes('invalid token') ||
    m.includes('malformed') ||
    m.includes('refresh token')
  )
}

async function resolveCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient()

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw sessionError
  }

  const session = sessionData.session
  if (!session) {
    return null
  }

  const { error: userError } = await supabase.auth.getUser()
  if (!userError) {
    return (await supabase.auth.getSession()).data.session ?? session
  }

  const msg = userError.message || ''
  if (authFailureSuggestsTokenRefresh(msg)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (!refreshError && refreshed.session) {
      return refreshed.session
    }
  }

  await supabase.auth.signOut({ scope: 'local' })
  return null
}

export type UserProfile = {
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  auto_remove_empty_chats: boolean
  is_superadmin: boolean
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  /** false = Chat-Einstiegs-Tour (Neuer Chat, Lernpfade) noch anzeigen */
  chat_onboarding_completed: boolean
}

/**
 * Liefert eine gültige Sitzung: prüft per Auth-Server (getUser), erneuert abgelaufene Access-Tokens
 * oder meldet lokal ab, wenn keine Erneuerung möglich ist.
 */
export async function getCurrentSession(): Promise<Session | null> {
  if (sessionResolveInFlight) {
    return sessionResolveInFlight
  }

  sessionResolveInFlight = resolveCurrentSession().finally(() => {
    sessionResolveInFlight = null
  })

  return sessionResolveInFlight
}

/** Nach Profil-/DB-Fehler: Session erneuern und Profil erneut anlegen/laden (ein Versuch). */
export async function ensureProfileForUserWithSessionRecovery(userId: string): Promise<UserProfile | null> {
  try {
    return await ensureProfileForUser(userId)
  } catch (err) {
    if (!isLikelyExpiredJwtError(err)) {
      throw err
    }
    const session = await getCurrentSession()
    const nextId = session?.user?.id ?? null
    if (!nextId) {
      throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.')
    }
    return await ensureProfileForUser(nextId)
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }
}

export async function signOut() {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

/** Ändert die Login-E-Mail über Supabase Auth (Bestätigung per Link an die neue Adresse, je nach Projekt-Einstellung). */
export async function updateAuthEmail(newEmail: string): Promise<void> {
  const supabase = getSupabaseClient()
  const email = newEmail.trim()
  if (!email) {
    throw new Error('E-Mail darf nicht leer sein.')
  }
  const { error } = await supabase.auth.updateUser({ email })
  if (error) {
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('same') || msg.includes('gleich')) {
      throw new Error('Die neue E-Mail ist identisch mit der aktuellen.')
    }
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      throw new Error('Diese E-Mail ist bereits registriert.')
    }
    throw new Error(error.message || 'E-Mail konnte nicht geändert werden.')
  }
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  const supabase = getSupabaseClient()
  const { data } = supabase.auth.onAuthStateChange(callback)
  return data.subscription
}

export function getUserFromSession(session: Session | null): User | null {
  return session?.user ?? null
}

export async function getProfileByUserId(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function updateAutoRemoveEmptyChatsByUserId(
  userId: string,
  enabled: boolean,
): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ auto_remove_empty_chats: enabled })
    .eq('id', userId)
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function updateProfileNamesByUserId(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
    })
    .eq('id', userId)
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function ensureProfileForUser(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

  if (error) {
    throw error
  }

  return getProfileByUserId(userId)
}

export async function updateSuperadminByUserId(
  userId: string,
  enabled: boolean,
): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_superadmin: enabled })
    .eq('id', userId)
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function completeChatOnboardingByUserId(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ chat_onboarding_completed: true })
    .eq('id', userId)
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function updateLanguageByUserId(
  userId: string,
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE',
): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ language })
    .eq('id', userId)
    .select(
      'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed',
    )
    .single()

  if (error) {
    throw error
  }

  return data
}
