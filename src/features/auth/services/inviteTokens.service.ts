import { getSupabaseClient } from '../../../integrations/supabase/client'

/** Zeile aus `admin_list_invite_tokens` — der volle Token wird nach dem Erzeugen nie wieder gelesen. */
export type InviteTokenRow = {
  id: string
  /** Letzte 8 Zeichen des Tokens, nur zur Wiedererkennung in der Liste. */
  token_suffix: string
  created_at: string
  expires_at: string
  used_at: string | null
  used_by_email: string | null
  revoked_at: string | null
}

export type CreatedInviteToken = {
  token: string
  expiresAt: string
}

export type RedeemInviteTokenPayload = {
  token: string
  email: string
  password: string
  firstName: string
  lastName: string
}

export type RedeemInviteTokenResult = {
  userId: string
  email: string
}

/** Baut den Link zur Registrierungsseite aus dem aktuellen Origin (Hash-Router: `#/register?token=…`). */
export function buildInviteRegistrationLink(token: string): string {
  const suffix = `#/register?token=${encodeURIComponent(token)}`
  if (typeof window === 'undefined') {
    return suffix
  }
  return `${window.location.origin}${window.location.pathname}${suffix}`
}

/** Superadmin: neuen Einladungslink erzeugen. `hours`: Gültigkeit 1–8760 (365 Tage). */
export async function adminCreateInviteToken(hours: number): Promise<CreatedInviteToken> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('admin_create_invite_token', { p_hours: hours })
  if (error) {
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as { token?: unknown; expires_at?: unknown } | null
  const token = typeof row?.token === 'string' ? row.token : ''
  const expiresAt = typeof row?.expires_at === 'string' ? row.expires_at : ''
  if (!token || !expiresAt) {
    throw new Error('Einladungslink konnte nicht erzeugt werden.')
  }
  return { token, expiresAt }
}

/** Superadmin: bestehende Einladungslinks (ohne Klartext-Token) auflisten, neueste zuerst. */
export async function adminListInviteTokens(): Promise<InviteTokenRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('admin_list_invite_tokens')
  if (error) {
    throw error
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    token_suffix: String(row.token_suffix ?? ''),
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : '',
    used_at: typeof row.used_at === 'string' ? row.used_at : null,
    used_by_email: typeof row.used_by_email === 'string' ? row.used_by_email : null,
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  }))
}

/** Superadmin: einen noch unverbrauchten Einladungslink vorzeitig widerrufen. */
export async function adminRevokeInviteToken(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_revoke_invite_token', { p_id: id })
  if (error) {
    throw error
  }
}

/** Öffentlich (auch ohne Sitzung): ist der Token gerade gültig? Für die Registrierungsseite. */
export async function checkInviteTokenValid(token: string): Promise<boolean> {
  const trimmed = token.trim()
  if (!trimmed) {
    return false
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('is_invite_token_valid', { p_token: trimmed })
  if (error) {
    throw error
  }
  return data === true
}

/**
 * Edge Functions liefern Fehlertexte im JSON-Body (`{ error: "…" }`), aber supabase-js wirft bei
 * einem Nicht-2xx-Status nur einen generischen `FunctionsHttpError` — der eigentliche Body steckt
 * in `error.context` (die rohe `Response`). Ohne dieses Auslesen sähe der Nutzer nur "Edge Function
 * returned a non-2xx status code" statt z. B. "Dieser Einladungslink ist abgelaufen."
 */
async function extractEdgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown }
      if (typeof body?.error === 'string' && body.error.trim()) {
        return body.error
      }
    } catch {
      /* Body kein JSON (z. B. Netzwerkfehler) — Fallback unten */
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

/** Öffentlich: Token einlösen und Konto mit selbst gewähltem Passwort anlegen (Edge Function, Service-Role). */
export async function redeemInviteToken(payload: RedeemInviteTokenPayload): Promise<RedeemInviteTokenResult> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('redeem-invite-token', {
    body: {
      token: payload.token,
      email: payload.email,
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
  })
  if (error) {
    throw new Error(await extractEdgeFunctionErrorMessage(error, 'Konto konnte nicht erstellt werden.'))
  }
  const result = data as { userId?: unknown; email?: unknown; error?: unknown } | null
  if (typeof result?.error === 'string' && result.error) {
    throw new Error(result.error)
  }
  const userId = typeof result?.userId === 'string' ? result.userId : ''
  const email = typeof result?.email === 'string' ? result.email : ''
  if (!userId || !email) {
    throw new Error('Konto konnte nicht erstellt werden.')
  }
  return { userId, email }
}
