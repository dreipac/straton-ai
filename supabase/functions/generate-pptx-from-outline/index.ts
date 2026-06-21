// @ts-expect-error - Deno URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPORT_BUCKET = 'chat-pptx-exports'
const MAX_HTML_LENGTH = 200_000
const MAX_PPTX_BYTES = 25 * 1024 * 1024

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sanitizeDbText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    const isControl = code === 0 || (code >= 1 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
    if (!isControl) {
      out += text[i]
    }
  }
  return out
}

function sanitizeJsonbMetadata<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'string' ? sanitizeDbText(v) : v)),
  ) as T
}

function sanitizePptxFileName(raw: string | undefined): string {
  const base = (raw?.trim() || 'praesentation').replace(/[^\wäöüÄÖÜß\- ]+/gi, '').trim() || 'praesentation'
  return base.toLowerCase().endsWith('.pptx') ? base : `${base}.pptx`
}

function countSlides(html: string): number {
  return (html.match(/<section\b/gi) ?? []).length
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const renderServiceUrl = Deno.env.get('PPTX_RENDER_SERVICE_URL')
  const renderServiceToken = Deno.env.get('PPTX_RENDER_SERVICE_TOKEN')
  if (!supabaseUrl || !supabaseAnonKey || !serviceKey || !renderServiceUrl || !renderServiceToken) {
    return jsonResponse({ error: 'Server-Konfiguration fehlt.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungültig.' }, 401)
  }

  try {
    const body = (await req.json()) as {
      messageId?: unknown
      threadId?: unknown
      html?: unknown
      fileName?: unknown
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
    const threadId = typeof body.threadId === 'string' ? body.threadId.trim() : ''
    const html = typeof body.html === 'string' ? body.html.trim() : ''
    if (!messageId || !threadId) {
      return jsonResponse({ error: 'messageId und threadId sind erforderlich.' }, 400)
    }
    if (!html || html.length > MAX_HTML_LENGTH || !/<section\b/i.test(html)) {
      return jsonResponse({ error: 'Ungültiges Folien-HTML.' }, 400)
    }

    const { data: msg, error: msgErr } = await userClient
      .from('chat_messages')
      .select('id, thread_id, role, content, metadata')
      .eq('id', messageId)
      .single()

    if (msgErr || !msg) {
      return jsonResponse({ error: 'Nachricht nicht gefunden.' }, 404)
    }
    if (msg.thread_id !== threadId || msg.role !== 'assistant') {
      return jsonResponse({ error: 'Ungültige Nachricht.' }, 400)
    }

    const { data: thread, error: thrErr } = await userClient
      .from('chat_threads')
      .select('user_id')
      .eq('id', threadId)
      .single()

    if (thrErr || !thread || thread.user_id !== user.id) {
      return jsonResponse({ error: 'Kein Zugriff auf diesen Chat.' }, 403)
    }

    const renderRes = await fetch(`${renderServiceUrl.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': renderServiceToken,
      },
      body: JSON.stringify({ html }),
    })
    if (!renderRes.ok) {
      const detail = await renderRes.text().catch(() => '')
      return jsonResponse(
        { error: `PowerPoint-Rendering fehlgeschlagen: ${detail || renderRes.statusText}` },
        502,
      )
    }
    const outBytes = new Uint8Array(await renderRes.arrayBuffer())
    if (outBytes.length === 0) {
      return jsonResponse({ error: 'Erzeugte Präsentation ist leer.' }, 500)
    }
    if (outBytes.length > MAX_PPTX_BYTES) {
      return jsonResponse({ error: 'Erzeugte Präsentation zu gross.' }, 400)
    }

    const fileName = sanitizePptxFileName(typeof body.fileName === 'string' ? body.fileName : undefined)
    const path = `${user.id}/${messageId}.pptx`

    const upload = await admin.storage.from(EXPORT_BUCKET).upload(path, outBytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      upsert: true,
    })
    if (upload.error) {
      return jsonResponse({ error: upload.error.message || 'Upload fehlgeschlagen.' }, 500)
    }

    const prevMeta =
      msg.metadata && typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>) : {}
    const newContent =
      'Die PowerPoint-Präsentation wurde erstellt. Nutze den Button «PowerPoint herunterladen» unter dieser Nachricht.'
    const nextMetadata = {
      ...prevMeta,
      pptxExport: {
        bucket: EXPORT_BUCKET,
        path,
        fileName,
        slideCount: countSlides(html),
      },
    }

    const { error: upErr } = await admin
      .from('chat_messages')
      .update({
        content: sanitizeDbText(newContent),
        metadata: sanitizeJsonbMetadata(nextMetadata),
      })
      .eq('id', messageId)

    if (upErr) {
      return jsonResponse({ error: upErr.message || 'Metadaten konnten nicht gespeichert werden.' }, 500)
    }

    return jsonResponse({
      pptxExport: nextMetadata.pptxExport,
      displayContent: newContent,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})
