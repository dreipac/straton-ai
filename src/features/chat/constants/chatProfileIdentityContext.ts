import type { User } from '@supabase/supabase-js'

import {
  getUserDisplayName,
  type ProfileNameFields,
} from '../../auth/utils/userDisplay'

export type ChatProfileIdentity = {
  firstName: string | null
  lastName: string | null
  /** Anzeigename (Profil, OAuth-Metadaten oder E-Mail-Lokalteil). */
  displayName: string
}

function trimName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const t = value.trim()
  return t || null
}

/** Aus eingeloggtem Nutzer + Profil — kein Extra-Request pro Chat-Turn. */
export function resolveChatProfileIdentity(
  user: User | null,
  profile: ProfileNameFields | null,
): ChatProfileIdentity | null {
  if (!user) {
    return null
  }
  const firstName = trimName(profile?.first_name)
  const lastName = trimName(profile?.last_name)
  const displayName = getUserDisplayName(user, profile)
  if (!firstName && !lastName && displayName === 'Unbekannter Nutzer') {
    return null
  }
  return { firstName, lastName, displayName }
}

let cachedIdentityKey = ''
let cachedIdentityInstruction = ''

/**
 * Nutzer-Identität für die KI (Hauptchat).
 * Direkt **vor** dem Datumskontext — statischer Prefix darüber bleibt prompt-cache-fähig;
 * Datum bleibt letzter Block (wechselt häufig).
 */
export function getChatProfileIdentityInstruction(
  identity: ChatProfileIdentity | null | undefined,
): string {
  if (!identity) {
    return ''
  }

  const cacheKey = `${identity.firstName ?? ''}\0${identity.lastName ?? ''}\0${identity.displayName}`
  if (cacheKey === cachedIdentityKey) {
    return cachedIdentityInstruction
  }

  const nameParts = [identity.firstName, identity.lastName].filter(Boolean) as string[]
  const profileFullName = nameParts.length > 0 ? nameParts.join(' ') : ''
  const lines = [
    'Nutzer-Identität (verbindlich — Straton-Profil des eingeloggten Kontos):',
    identity.firstName ? `- Vorname: ${identity.firstName}` : '- Vorname: (nicht im Profil hinterlegt)',
    identity.lastName ? `- Nachname: ${identity.lastName}` : '- Nachname: (nicht im Profil hinterlegt)',
    profileFullName
      ? `- Vollständiger Name aus dem Profil: ${profileFullName}`
      : `- Anzeigename (Fallback): ${identity.displayName}`,
    '- Bei «Wer bin ich?», «Wie heisse ich?», «Kennst du mich?»: Namen aus Konto nennen; Persönliches (Alter, Hobbys, Beruf) aus Nutzer-Einführung, falls hinterlegt.',
    '- Namen natürlich in Du-Form nutzen — nicht in jeder Antwort erzwingen.',
    '- Nicht behaupten, persönliche Daten ausserhalb von Profil, Verlauf und KI-Speicher zu kennen.',
  ]

  cachedIdentityKey = cacheKey
  cachedIdentityInstruction = lines.join('\n')
  return cachedIdentityInstruction
}
