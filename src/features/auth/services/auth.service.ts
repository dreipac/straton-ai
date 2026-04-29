import type { AuthChangeEvent, PostgrestError, Session, User } from '@supabase/supabase-js'
import { AI_CHAT_MEMORY_MAX_CHARS } from '../../chat/constants/aiChatMemory'
import { getSupabaseClient, prepareAuthStorageForSignIn } from '../../../integrations/supabase/client'
import { extractProfileNamesFromAuthUser } from '../utils/userDisplay'
import { parseUiSettings, type UiSettingsV1 } from '../../settings/uiSettings'

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

/** Volle Profil-Spalten inkl. KI-Speicher (`20260425120000_profiles_ai_chat_memory`). */
const PROFILE_SELECT =
  'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed, beta_notice_seen, ui_settings, must_change_password_on_first_login, subscription_plan_id, subscription_plans!subscription_plan_id ( id, name, max_tokens, max_images, max_files, chat_allow_model_choice, default_chat_model_id ), subscription_usages ( used_tokens, used_images, used_files, last_reset_date ), ai_chat_memory, ai_chat_memory_enabled' as const

/** Ohne KI-Speicher-Spalten — wenn Migration noch nicht ausgerollt. */
const PROFILE_SELECT_WITHOUT_AI_MEMORY =
  'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed, beta_notice_seen, ui_settings, must_change_password_on_first_login, subscription_plan_id, subscription_plans!subscription_plan_id ( id, name, max_tokens, max_images, max_files, chat_allow_model_choice, default_chat_model_id ), subscription_usages ( used_tokens, used_images, used_files, last_reset_date )' as const

/** Ohne ui_settings — wenn Remote-DB die Migration `20260405140000_add_ui_settings_to_profiles` noch nicht hat (sonst PostgREST 400). */
const PROFILE_SELECT_COMPAT =
  'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed, beta_notice_seen, must_change_password_on_first_login, subscription_plan_id, subscription_plans!subscription_plan_id ( id, name, max_tokens, max_images, max_files, chat_allow_model_choice, default_chat_model_id ), subscription_usages ( used_tokens, used_images, used_files, last_reset_date )' as const

/** Ohne ui_settings und ohne must_change_password_on_first_login (aeltere DB ohne Spalte). */
const PROFILE_SELECT_COMPAT_LEGACY =
  'first_name, last_name, avatar_url, auto_remove_empty_chats, is_superadmin, language, chat_onboarding_completed, beta_notice_seen, subscription_plan_id, subscription_plans!subscription_plan_id ( id, name, max_tokens, max_images, max_files, chat_allow_model_choice, default_chat_model_id ), subscription_usages ( used_tokens, used_images, used_files, last_reset_date )' as const

function isMissingUiSettingsColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase()
  return msg.includes('ui_settings')
}

function isMissingMustChangePasswordColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase()
  return msg.includes('must_change_password_on_first_login')
}

function isMissingAiChatMemoryColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase()
  return msg.includes('ai_chat_memory')
}

async function updateProfileReturningNoUiSettingsPatch(
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ data: ProfileRow | null; error: PostgrestError | null }> {
  const supabase = getSupabaseClient()
  let r = await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_SELECT).single()
  if (!r.error) {
    return r
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'ui_settings')) {
    return r
  }
  if (isMissingUiSettingsColumnError(r.error)) {
    r = await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_SELECT_COMPAT).single()
    if (!r.error) {
      return r
    }
  }
  if (isMissingMustChangePasswordColumnError(r.error) || isMissingUiSettingsColumnError(r.error)) {
    return supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_SELECT_COMPAT_LEGACY).single()
  }
  return r
}

type ProfileRow = {
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  auto_remove_empty_chats: boolean
  is_superadmin: boolean
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  chat_onboarding_completed: boolean
  beta_notice_seen: boolean
  ui_settings: unknown | null
  must_change_password_on_first_login?: boolean
  subscription_plan_id: string | null
  subscription_plans:
    | {
        id: string
        name: string
        max_tokens: number | null
        max_images: number | null
        max_files: number | null
        chat_allow_model_choice?: boolean | null
        default_chat_model_id?: string | null
      }
    | {
        id: string
        name: string
        max_tokens: number | null
        max_images: number | null
        max_files: number | null
        chat_allow_model_choice?: boolean | null
        default_chat_model_id?: string | null
      }[]
    | null
  subscription_usages:
    | { used_tokens: number; used_images: number; used_files: number; last_reset_date: string | null }
    | { used_tokens: number; used_images: number; used_files: number; last_reset_date: string | null }[]
    | null
  ai_chat_memory?: string | null
  ai_chat_memory_enabled?: boolean | null
}

function currentUtcDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function mapProfileRow(data: ProfileRow | null): UserProfile | null {
  if (!data) {
    return null
  }
  const sp = data.subscription_plans
  const plan =
    sp == null
      ? null
      : Array.isArray(sp)
        ? (sp[0] ?? null)
        : sp
  const su = data.subscription_usages
  const rawUsage =
    su == null ? null : Array.isArray(su) ? (su[0] ?? null) : su
  const usage =
    rawUsage && rawUsage.last_reset_date !== currentUtcDateString()
      ? {
          used_tokens: 0,
          used_images: 0,
          used_files: 0,
        }
      : rawUsage
        ? {
            used_tokens: rawUsage.used_tokens,
            used_images: rawUsage.used_images,
            used_files: rawUsage.used_files,
          }
        : null
  return {
    first_name: data.first_name,
    last_name: data.last_name,
    avatar_url: data.avatar_url,
    auto_remove_empty_chats: data.auto_remove_empty_chats,
    is_superadmin: data.is_superadmin,
    language: data.language,
    chat_onboarding_completed: data.chat_onboarding_completed,
    beta_notice_seen: data.beta_notice_seen,
    ui_settings: parseUiSettings(data.ui_settings ?? {}),
    must_change_password_on_first_login: data.must_change_password_on_first_login === true,
    subscription_plan_id: data.subscription_plan_id,
    subscription_plans: plan,
    subscription_usages: usage,
    ai_chat_memory:
      typeof data.ai_chat_memory === 'string'
        ? data.ai_chat_memory.length > AI_CHAT_MEMORY_MAX_CHARS
          ? data.ai_chat_memory.slice(0, AI_CHAT_MEMORY_MAX_CHARS)
          : data.ai_chat_memory
        : null,
    ai_chat_memory_enabled: data.ai_chat_memory_enabled !== false,
  }
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
  /** false = Beta-Hinweis nach erster Tour noch nicht bestätigt */
  beta_notice_seen: boolean
  /** Oberflächen-Einstellungen (Theme, Paletten, Emoji, …), aus Spalte ui_settings */
  ui_settings: UiSettingsV1
  /** true = Nutzer muss nach erstem Login neues Passwort setzen (bis erledigt) */
  must_change_password_on_first_login: boolean
  subscription_plan_id: string | null
  subscription_plans:
    | {
        id: string
        name: string
        max_tokens: number | null
        max_images: number | null
        max_files: number | null
        chat_allow_model_choice?: boolean | null
        default_chat_model_id?: string | null
      }
    | null
  subscription_usages: { used_tokens: number; used_images: number; used_files: number } | null
  /** Aus profiles.ai_chat_memory; für persönlichen Hauptchat-Kontext. */
  ai_chat_memory: string | null
  /** false: kein Lesen/Aktualisieren des Nutzer-Speichers */
  ai_chat_memory_enabled: boolean
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

export async function signInWithEmailPassword(
  email: string,
  password: string,
  rememberSession = true,
) {
  prepareAuthStorageForSignIn(rememberSession)
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
  let { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle()
  if (error && isMissingAiChatMemoryColumnError(error)) {
    ;({ data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_WITHOUT_AI_MEMORY)
      .eq('id', userId)
      .maybeSingle())
  }
  if (error && isMissingUiSettingsColumnError(error)) {
    ;({ data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_COMPAT)
      .eq('id', userId)
      .maybeSingle())
  }
  if (
    error &&
    (isMissingMustChangePasswordColumnError(error) || isMissingUiSettingsColumnError(error))
  ) {
    ;({ data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_COMPAT_LEGACY)
      .eq('id', userId)
      .maybeSingle())
  }

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function updateAiChatMemoryByUserId(
  userId: string,
  patch: { ai_chat_memory?: string | null; ai_chat_memory_enabled?: boolean },
): Promise<UserProfile | null> {
  let payload = patch
  if (typeof patch.ai_chat_memory === 'string' && patch.ai_chat_memory.length > AI_CHAT_MEMORY_MAX_CHARS) {
    payload = {
      ...patch,
      ai_chat_memory: patch.ai_chat_memory.slice(0, AI_CHAT_MEMORY_MAX_CHARS),
    }
  }
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, payload)

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function clearMustChangePasswordOnFirstLogin(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('user_clear_must_change_password_on_first_login')
  if (error) {
    throw error
  }
}

export async function updateAutoRemoveEmptyChatsByUserId(
  userId: string,
  enabled: boolean,
): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, {
    auto_remove_empty_chats: enabled,
  })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function updateProfileNamesByUserId(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, {
    first_name: firstName.trim() || null,
    last_name: lastName.trim() || null,
  })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

const AVATAR_BUCKET = 'avatars'
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

function mapAvatarStorageError(err: unknown): Error {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: string }).message ?? '')
      : err instanceof Error
        ? err.message
        : String(err)
  if (/bucket not found/i.test(raw)) {
    return new Error(
      'Profilbild-Speicher fehlt: In Supabase ist der Storage-Bucket „avatars“ nicht angelegt. Im Dashboard unter Storage einen öffentlichen Bucket „avatars“ erstellen oder die Migration `20260430200000_avatars_storage_public_bucket.sql` auf das Projekt anwenden.',
    )
  }
  return err instanceof Error ? err : new Error(raw || 'Speichern des Profilbildes ist fehlgeschlagen.')
}

function avatarExtensionFromFile(file: File): string {
  const t = file.type.toLowerCase()
  if (t === 'image/jpeg' || t === 'image/jpg') {
    return 'jpg'
  }
  if (t === 'image/png') {
    return 'png'
  }
  if (t === 'image/webp') {
    return 'webp'
  }
  if (t === 'image/gif') {
    return 'gif'
  }
  return 'jpg'
}

/** Lädt ein Profilbild in Storage und setzt profiles.avatar_url (öffentliche URL). */
export async function uploadProfileAvatarByUserId(userId: string, file: File): Promise<UserProfile | null> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Nur Bilddateien sind erlaubt.')
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error('Bild darf maximal 2 MB groß sein.')
  }

  const supabase = getSupabaseClient()
  const ext = avatarExtensionFromFile(file)
  const path = `${userId}/avatar.${ext}`

  const { data: existing, error: listError } = await supabase.storage.from(AVATAR_BUCKET).list(userId)
  if (listError) {
    throw mapAvatarStorageError(listError)
  }
  if (existing?.length) {
    const paths = existing.map((f) => `${userId}/${f.name}`)
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths)
    if (removeError) {
      throw mapAvatarStorageError(removeError)
    }
  }

  const contentType =
    file.type || (ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : `image/${ext}`)

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  })

  if (uploadError) {
    throw mapAvatarStorageError(uploadError)
  }

  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, {
    avatar_url: publicUrl,
  })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

/** Entfernt Profilbild-Dateien im Storage und setzt avatar_url auf null. */
export async function removeProfileAvatarByUserId(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data: existing, error: listError } = await supabase.storage.from(AVATAR_BUCKET).list(userId)
  if (listError) {
    const msg = String((listError as { message?: string }).message ?? '')
    if (!/bucket not found/i.test(msg)) {
      throw mapAvatarStorageError(listError)
    }
    /* Bucket nie angelegt: Profil-Eintrag trotzdem leeren */
  } else if (existing?.length) {
    const paths = existing.map((f) => `${userId}/${f.name}`)
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths)
    if (removeError) {
      throw mapAvatarStorageError(removeError)
    }
  }

  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, {
    avatar_url: null,
  })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

function isProfileNameEmpty(profile: UserProfile | null): boolean {
  if (!profile) {
    return true
  }
  const f = profile.first_name?.trim() ?? ''
  const l = profile.last_name?.trim() ?? ''
  return f === '' && l === ''
}

export async function ensureProfileForUser(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

  if (error) {
    throw error
  }

  let profile = await getProfileByUserId(userId)
  if (!isProfileNameEmpty(profile)) {
    return profile
  }

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData?.user
  if (!authUser || authUser.id !== userId) {
    return profile
  }

  const { firstName, lastName } = extractProfileNamesFromAuthUser(authUser)
  if (!firstName && !lastName) {
    return profile
  }

  const { data, error: updateError } = await updateProfileReturningNoUiSettingsPatch(userId, {
    first_name: firstName,
    last_name: lastName,
  })

  if (updateError || !data) {
    return profile
  }

  return mapProfileRow(data as ProfileRow)
}

export async function updateSuperadminByUserId(
  userId: string,
  enabled: boolean,
): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, { is_superadmin: enabled })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function completeChatOnboardingByUserId(userId: string): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, {
    chat_onboarding_completed: true,
  })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function markBetaNoticeSeenByUserId(userId: string): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, { beta_notice_seen: true })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function updateLanguageByUserId(
  userId: string,
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE',
): Promise<UserProfile | null> {
  const { data, error } = await updateProfileReturningNoUiSettingsPatch(userId, { language })

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export async function replaceUiSettingsByUserId(
  userId: string,
  settings: UiSettingsV1,
): Promise<UserProfile | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ ui_settings: settings })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapProfileRow(data as ProfileRow)
}

export type { UiSettingsV1 }
