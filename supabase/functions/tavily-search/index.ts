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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const MAX_QUERY_CHARS = 500
const TAVILY_URL = 'https://api.tavily.com/search'

type TavilyResultRow = {
  title?: string
  url?: string
  content?: string
}

function formatResultsForModel(results: TavilyResultRow[]): string {
  if (!results.length) {
    return '(Keine Treffer.)'
  }
  const lines: string[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    const content = typeof r.content === 'string' ? r.content.trim().slice(0, 1200) : ''
    const head = title || url || `Treffer ${i + 1}`
    lines.push(`${i + 1}. ${head}`)
    if (url) {
      lines.push(`   URL: ${url}`)
    }
    if (content) {
      lines.push(`   Auszug: ${content}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const tavilyApiKey = Deno.env.get('TAVILY_API_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }
  if (!tavilyApiKey) {
    return jsonResponse(
      { error: 'TAVILY_API_KEY ist nicht gesetzt (Supabase Secret für diese Function).' },
      500,
    )
  }
  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  let bodyJson: { query?: unknown }
  try {
    bodyJson = (await req.json()) as { query?: unknown }
  } catch {
    return jsonResponse({ error: 'Ungültiger JSON-Body.' }, 400)
  }

  const rawQuery = typeof bodyJson.query === 'string' ? bodyJson.query.trim() : ''
  if (!rawQuery.length) {
    return jsonResponse({ error: 'Bitte eine Suchanfrage (query) angeben.' }, 400)
  }

  const query = rawQuery.slice(0, MAX_QUERY_CHARS)

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungültig.' }, 401)
  }

  const { data: prof } = await userClient
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .maybeSingle()

  const isSuperadmin = prof?.is_superadmin === true

  let remainingCredits: number | undefined
  const serviceClient =
    serviceRoleKey.length > 0
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : null

  if (!isSuperadmin) {
    const { data: rem, error: consumeErr } = await userClient.rpc('consume_one_web_search_credit')
    if (consumeErr) {
      const em = String(consumeErr.message ?? '')
      if (em.includes('WEB_SEARCH_LIMIT')) {
        return jsonResponse(
          {
            error: 'WEB_SEARCH_LIMIT',
            message: 'Dein Websuche-Guthaben ist aufgebraucht. Es wird täglich (UTC) wieder aufgeladen.',
          },
          402,
        )
      }
      return jsonResponse({ error: em || 'Websuche-Kontingent konnte nicht gebucht werden.' }, 500)
    }
    remainingCredits = typeof rem === 'number' ? rem : undefined
  }

  let tavilyJson: {
    results?: TavilyResultRow[]
    error?: string
  }

  try {
    const tr = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        max_results: 8,
      }),
    })

    tavilyJson = (await tr.json()) as { results?: TavilyResultRow[]; error?: string }

    if (!tr.ok) {
      if (!isSuperadmin && serviceClient) {
        await serviceClient.rpc('refund_one_web_search_credit', { p_user_id: user.id })
      }
      const msg =
        typeof tavilyJson.error === 'string' && tavilyJson.error.trim()
          ? tavilyJson.error.trim()
          : `Tavily HTTP ${tr.status}`
      return jsonResponse({ error: msg }, 502)
    }
  } catch (e) {
    if (!isSuperadmin && serviceClient) {
      await serviceClient.rpc('refund_one_web_search_credit', { p_user_id: user.id })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: `Websuche nicht erreichbar: ${msg}` }, 502)
  }

  const rows = Array.isArray(tavilyJson.results) ? tavilyJson.results : []
  const contextText = formatResultsForModel(rows)

  return jsonResponse({
    contextText,
    remainingWebSearchCredits: isSuperadmin ? undefined : remainingCredits,
  })
})
