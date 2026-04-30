import { getSupabaseClient } from '../../../integrations/supabase/client'

export type SubscriptionUsage = {
  used_tokens: number
  used_images: number
  used_files: number
}

/** Wandelt Postgres-/PostgREST-Fehler der Quota-RPC in verständliche Meldungen (UI). */
export function formatSubscriptionQuotaError(error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : error instanceof Error
        ? error.message
        : ''
  const msg = raw.trim()
  if (/Datei Limit/i.test(msg)) {
    return 'Datei-Limit erreicht (Tages- oder Abo-Kontingent). Bitte später erneut versuchen oder Plan prüfen.'
  }
  if (/Bilder Limit/i.test(msg)) {
    return 'Kein Bild-Guthaben mehr. Es lädt sich täglich auf (bis zu 60 angespart).'
  }
  if (/Token Limit/i.test(msg)) {
    return 'Token-Limit erreicht. Bitte später erneut versuchen oder Plan prüfen.'
  }
  if (/Unauthorized quota/i.test(msg)) {
    return 'Sitzung ungültig. Bitte neu anmelden.'
  }
  if (/Negative deltas/i.test(msg)) {
    return 'Ungültige Nutzungsdaten.'
  }
  return msg || 'Nutzungszähler konnte nicht aktualisiert werden.'
}

export async function incrementMySubscriptionUsage(args: {
  userId: string
  usedTokensDelta?: number
  usedImagesDelta?: number
  usedFilesDelta?: number
}): Promise<SubscriptionUsage> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.rpc('user_increment_subscription_usage', {
    p_user_id: args.userId,
    p_used_tokens_delta: args.usedTokensDelta ?? 0,
    p_used_images_delta: args.usedImagesDelta ?? 0,
    p_used_files_delta: args.usedFilesDelta ?? 0,
  })

  if (error) {
    throw new Error(formatSubscriptionQuotaError(error))
  }

  const row = Array.isArray(data) ? data[0] : data
  return row as SubscriptionUsage
}

