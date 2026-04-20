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

type CreateUserRequest = {
  email?: unknown
  temporaryPassword?: unknown
  firstName?: unknown
  lastName?: unknown
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server-Konfiguration unvollständig.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user: caller },
      error: callerErr,
    } = await userClient.auth.getUser()
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('is_superadmin')
      .eq('id', caller.id)
      .maybeSingle()

    if (profileErr || !profile?.is_superadmin) {
      return new Response(JSON.stringify({ error: 'Nur Superadmins duerfen Nutzer erstellen.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as CreateUserRequest
    const email = toTrimmedString(body.email).toLowerCase()
    const temporaryPassword = toTrimmedString(body.temporaryPassword)
    const firstName = toTrimmedString(body.firstName)
    const lastName = toTrimmedString(body.lastName)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (temporaryPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Temporäres Passwort muss mindestens 8 Zeichen haben.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName || null,
        last_name: lastName || null,
      },
    })

    if (createErr || !created.user) {
      const msg = createErr?.message?.trim() || 'Nutzer konnte nicht erstellt werden.'
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = created.user.id
    const { error: upsertErr } = await adminClient.from('profiles').upsert(
      {
        id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        must_change_password_on_first_login: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

    if (upsertErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: 'Profil konnte nicht angelegt werden.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        userId,
        email: created.user.email ?? email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
