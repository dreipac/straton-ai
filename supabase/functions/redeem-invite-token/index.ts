// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RedeemInviteTokenRequest = {
  token?: unknown
  email?: unknown
  password?: unknown
  firstName?: unknown
  lastName?: unknown
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: 'Server-Konfiguration unvollständig.' })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const body = (await req.json()) as RedeemInviteTokenRequest
    const token = toTrimmedString(body.token)
    const email = toTrimmedString(body.email).toLowerCase()
    const password = toTrimmedString(body.password)
    const firstName = toTrimmedString(body.firstName)
    const lastName = toTrimmedString(body.lastName)

    if (!token) {
      return jsonResponse(400, { error: 'Ungültiger Einladungslink.' })
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
    }
    if (password.length < 8) {
      return jsonResponse(400, { error: 'Passwort muss mindestens 8 Zeichen haben.' })
    }

    // Atomar claimen: nur ein gueltiger, unverbrauchter, nicht widerrufener Token geht durch.
    // Das Update passiert VOR dem Anlegen des Kontos, damit zwei gleichzeitige Einloesungen
    // desselben Links nicht beide durchkommen (zweite UPDATE findet keine passende Zeile mehr).
    const { data: claimed, error: claimErr } = await adminClient
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) {
      return jsonResponse(400, {
        error: 'Dieser Einladungslink ist ungültig, abgelaufen oder bereits verwendet.',
      })
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName || null,
        last_name: lastName || null,
      },
    })

    if (createErr || !created.user) {
      // Token wieder freigeben, damit der Link nicht verbrannt ist (z. B. E-Mail schon vergeben)
      await adminClient.from('invite_tokens').update({ used_at: null }).eq('id', claimed.id)
      const rawMsg = createErr?.message?.trim() || 'Konto konnte nicht erstellt werden.'
      const friendlyMsg = /already.*registered|already.*exists/i.test(rawMsg)
        ? 'Für diese E-Mail-Adresse existiert bereits ein Konto.'
        : rawMsg
      return jsonResponse(400, { error: friendlyMsg })
    }

    const userId = created.user.id
    const { error: upsertErr } = await adminClient.from('profiles').upsert(
      {
        id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

    if (upsertErr) {
      await adminClient.auth.admin.deleteUser(userId)
      await adminClient.from('invite_tokens').update({ used_at: null }).eq('id', claimed.id)
      return jsonResponse(500, { error: 'Profil konnte nicht angelegt werden.' })
    }

    await adminClient.from('invite_tokens').update({ used_by: userId }).eq('id', claimed.id)

    return jsonResponse(200, { userId, email: created.user.email ?? email })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return jsonResponse(500, { error: message })
  }
})
