import type { User } from '@supabase/supabase-js'

/** Nur Namensfelder — bewusst ohne Import aus auth.service (Zyklen mit ensureProfile). */
export type ProfileNameFields = {
  first_name: string | null
  last_name: string | null
}

/** Für einmaliges Befüllen von profiles aus Auth (OAuth / Signup-Metadaten). */
export function extractProfileNamesFromAuthUser(user: User | null): {
  firstName: string | null
  lastName: string | null
} {
  if (!user) {
    return { firstName: null, lastName: null }
  }
  const meta = user.user_metadata ?? {}
  const f = trimStr(meta.first_name) ?? trimStr((meta as { given_name?: unknown }).given_name)
  const l = trimStr(meta.last_name) ?? trimStr((meta as { family_name?: unknown }).family_name)
  if (f || l) {
    return { firstName: f, lastName: l }
  }
  const full =
    trimStr(meta.full_name) ?? trimStr(meta.name) ?? trimStr((meta as { display_name?: unknown }).display_name)
  if (!full) {
    return { firstName: null, lastName: null }
  }
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: null, lastName: null }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null }
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function trimStr(v: unknown): string | null {
  if (typeof v !== 'string') {
    return null
  }
  const t = v.trim()
  return t || null
}

/**
 * Anzeigename: zuerst Profil, dann Auth-Metadaten (OAuth / Signup), zuletzt E-Mail.
 */
export function getUserDisplayName(user: User | null, profile: ProfileNameFields | null): string {
  const fromProfile = [profile?.first_name, profile?.last_name]
    .map(trimStr)
    .filter(Boolean)
    .join(' ')
    .trim()
  if (fromProfile) {
    return fromProfile
  }

  const meta = user?.user_metadata ?? {}
  const full =
    trimStr(meta.full_name) ?? trimStr(meta.name) ?? trimStr((meta as { display_name?: unknown }).display_name)
  if (full) {
    return full
  }

  const first = trimStr(meta.first_name) ?? trimStr((meta as { given_name?: unknown }).given_name)
  const last = trimStr(meta.last_name) ?? trimStr((meta as { family_name?: unknown }).family_name)
  const fromMeta = [first, last].filter(Boolean).join(' ').trim()
  if (fromMeta) {
    return fromMeta
  }

  const email = user?.email
  if (email) {
    const local = email.split('@')[0]?.trim()
    if (local) {
      return local
    }
  }
  return 'Unbekannter Nutzer'
}

/** Erstes Wort für Begrüßung: Vorname aus Profil, sonst aus Metadaten / Anzeigename. */
export function getGreetingFirstName(user: User | null, profile: ProfileNameFields | null): string {
  const fromProfile = trimStr(profile?.first_name)
  if (fromProfile) {
    return fromProfile
  }

  const meta = user?.user_metadata ?? {}
  const full =
    trimStr(meta.full_name) ?? trimStr(meta.name) ?? trimStr((meta as { display_name?: unknown }).display_name)
  if (full) {
    const w = full.split(/\s+/)[0]
    if (w) {
      return w
    }
  }

  const display = getUserDisplayName(user, profile)
  if (display.includes('@')) {
    const local = display.split('@')[0]?.trim()
    return local || 'da'
  }
  return display.split(/\s+/)[0] || 'da'
}

export function getAvatarFallbackLetter(user: User | null, profile: ProfileNameFields | null): string {
  const fromProfile = trimStr(profile?.first_name)
  if (fromProfile) {
    return fromProfile[0].toUpperCase()
  }

  const meta = user?.user_metadata ?? {}
  const full =
    trimStr(meta.full_name) ?? trimStr(meta.name) ?? trimStr((meta as { display_name?: unknown }).display_name)
  if (full) {
    return full[0].toUpperCase()
  }

  return (user?.email?.[0] ?? 'U').toUpperCase()
}
