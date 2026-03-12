import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../../integrations/supabase/client'

export type UserProfile = {
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  auto_remove_empty_chats: boolean
  is_superadmin: boolean
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
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
    .select('first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language')
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
    .select('first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language')
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
    .select('first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language')
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
    .select('first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language')
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
    .select('first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language')
    .single()

  if (error) {
    throw error
  }

  return data
}
