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

const MAX_QUERY_CHARS = 120
const MAX_RESULTS = 2
const FETCH_CANDIDATES = 20
const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos'

const IRRELEVANT_RE =
  /\b(wax(?:work)?|tussauds|madame|statue|figurine|figur|impersonator|look[\s-]?alike|tribute|mural|graffiti|cartoon|drawing|sketch|illustration|cosplay|cake|toy|lego|wax\s+figure)\b/i

function refineUnsplashSearchQuery(query: string): string {
  const q = query.replace(/\s+/g, ' ').trim().replace(/\?+$/, '')
  if (!q) {
    return q
  }
  const lower = q.toLowerCase()
  if (/\b(foto|photo|portrait|concert|live|performance)\b/i.test(lower)) {
    return q.slice(0, MAX_QUERY_CHARS)
  }
  const looksLikePerson =
    /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,4}$/u.test(q) &&
    !/\b(stadt|city|land|country|gebäude|building|auto|car|hund|dog|katze)\b/i.test(lower)
  if (looksLikePerson) {
    return `${q} portrait`.slice(0, MAX_QUERY_CHARS)
  }
  return `${q} photo`.slice(0, MAX_QUERY_CHARS)
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function scorePhoto(
  description: string,
  altText: string,
  tagTitles: string[],
  query: string,
): number {
  const hay = `${description} ${altText} ${tagTitles.join(' ')}`.toLowerCase()
  const qLower = query.toLowerCase().trim()
  let score = 0
  if (qLower && hay.includes(qLower)) {
    score += 40
  }
  for (const token of tokenizeQuery(query)) {
    if (hay.includes(token)) {
      score += 12
    }
  }
  if (IRRELEVANT_RE.test(hay)) {
    score -= 80
  }
  return score
}

export type UnsplashPhotoPayload = {
  id: string
  description: string
  thumbUrl: string
  regularUrl: string
  photoPageUrl: string
  photographerName: string
  photographerUrl: string
  downloadLocation: string
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const t = value.trim()
  if (!t) {
    return ''
  }
  return t.length > max ? t.slice(0, max).trim() : t
}

function mapPhoto(row: Record<string, unknown>): UnsplashPhotoPayload | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const urls = row.urls && typeof row.urls === 'object' ? (row.urls as Record<string, unknown>) : null
  const links = row.links && typeof row.links === 'object' ? (row.links as Record<string, unknown>) : null
  const user = row.user && typeof row.user === 'object' ? (row.user as Record<string, unknown>) : null
  const userLinks =
    user?.links && typeof user.links === 'object' ? (user.links as Record<string, unknown>) : null

  const regularUrl = clipText(urls?.regular, 2048)
  const thumbUrl = clipText(urls?.small, 2048) || clipText(urls?.thumb, 2048) || regularUrl
  const photoPageUrl = clipText(links?.html, 2048)
  const downloadLocation = clipText(links?.download_location, 2048)
  const photographerName = clipText(user?.name, 200) || 'Unbekannt'
  const photographerUrl = clipText(userLinks?.html, 2048)

  if (!id || !regularUrl || !photoPageUrl) {
    return null
  }

  const altText = clipText(row.alt_description, 500)
  const description =
    clipText(row.description, 500) || altText || 'Foto ohne Beschreibung'

  const tagTitles: string[] = []
  if (Array.isArray(row.tags)) {
    for (const tag of row.tags) {
      if (tag && typeof tag === 'object' && !Array.isArray(tag)) {
        const title = clipText((tag as Record<string, unknown>).title, 80)
        if (title) {
          tagTitles.push(title)
        }
      }
    }
  }

  return {
    id,
    description,
    altText,
    tagTitles,
    thumbUrl,
    regularUrl,
    photoPageUrl,
    photographerName,
    photographerUrl: photographerUrl || 'https://unsplash.com',
    downloadLocation: downloadLocation || photoPageUrl,
  }
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
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }
  if (!accessKey) {
    return jsonResponse(
      { error: 'UNSPLASH_ACCESS_KEY ist nicht gesetzt (Supabase Secret für diese Function).' },
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

  const userQuery = rawQuery.slice(0, MAX_QUERY_CHARS)
  const apiQuery = refineUnsplashSearchQuery(userQuery)

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

  const searchUrl = new URL(UNSPLASH_SEARCH_URL)
  searchUrl.searchParams.set('query', apiQuery)
  searchUrl.searchParams.set('per_page', String(FETCH_CANDIDATES))
  searchUrl.searchParams.set('order_by', 'relevant')
  searchUrl.searchParams.set('content_filter', 'high')

  try {
    const res = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    })

    const json = (await res.json()) as { results?: unknown[]; errors?: string[] }

    if (!res.ok) {
      const msg =
        Array.isArray(json.errors) && json.errors.length > 0
          ? json.errors.join(' ')
          : `Unsplash HTTP ${res.status}`
      return jsonResponse({ error: msg }, 502)
    }

    const rows = Array.isArray(json.results) ? json.results : []
    type Scored = UnsplashPhotoPayload & {
      altText: string
      tagTitles: string[]
      _score: number
    }
    const scored: Scored[] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        continue
      }
      const mapped = mapPhoto(row as Record<string, unknown>) as (UnsplashPhotoPayload & {
        altText: string
        tagTitles: string[]
      }) | null
      if (!mapped) {
        continue
      }
      const _score = scorePhoto(
        mapped.description,
        mapped.altText,
        mapped.tagTitles,
        userQuery,
      )
      scored.push({ ...mapped, _score })
    }

    scored.sort((a, b) => b._score - a._score)
    const photos = scored.slice(0, MAX_RESULTS).map(({ _score: _s, altText: _a, tagTitles: _t, ...rest }) => rest)

    if (photos.length === 0) {
      return jsonResponse({ error: 'Keine passenden Fotos gefunden.', query: userQuery, photos: [] }, 404)
    }

    return jsonResponse({ query: userQuery, photos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: `Unsplash nicht erreichbar: ${msg}` }, 502)
  }
})
