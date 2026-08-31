// @ts-expect-error - Deno URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { buildPdfFromOutline, sanitizePdfFileName, type PdfOutlineV1 } from './pdfBuild.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPORT_BUCKET = 'chat-pdf-exports'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sanitizeDbText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function sanitizeJsonbMetadata<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'string' ? sanitizeDbText(v) : v)),
  ) as T
}

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

function isHeadingLevel(n: number): n is HeadingLevel {
  return n >= 1 && n <= 6
}

function parseOutline(raw: unknown): PdfOutlineV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1 || !Array.isArray(o.blocks)) return null
  const blocks: PdfOutlineV1['blocks'] = []
  for (const item of o.blocks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const b = item as Record<string, unknown>
    const t = typeof b.type === 'string' ? b.type.trim().toLowerCase() : ''
    if (t === 'heading') {
      const lvRaw = typeof b.level === 'number' ? b.level : typeof b.depth === 'number' ? b.depth : Number(b.level ?? b.depth)
      const lv = lvRaw
      const text = typeof b.text === 'string' ? b.text : ''
      if (!isHeadingLevel(lv)) return null
      blocks.push({ type: 'heading', level: lv, text })
    } else if (t === 'paragraph') {
      blocks.push({ type: 'paragraph', text: typeof b.text === 'string' ? b.text : '' })
    } else if (t === 'table') {
      if (!Array.isArray(b.rows) || b.rows.length === 0) return null
      const rows: string[][] = []
      for (const row of b.rows) {
        if (!Array.isArray(row) || row.length === 0) return null
        rows.push(row.map((c) => (typeof c === 'string' ? c : String(c ?? ''))))
      }
      const colCount = Math.max(...rows.map((r) => r.length))
      blocks.push({
        type: 'table',
        header: b.header === true,
        rows: rows.map((r) => {
          const copy = r.slice(0, colCount)
          while (copy.length < colCount) copy.push('')
          return copy
        }),
      })
    } else {
      return null
    }
  }
  return {
    version: 1,
    fileName: typeof o.fileName === 'string' ? o.fileName : undefined,
    title: typeof o.title === 'string' ? o.title : undefined,
    blocks,
  }
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
  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
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
      outline?: unknown
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
    const threadId = typeof body.threadId === 'string' ? body.threadId.trim() : ''
    if (!messageId || !threadId) {
      return jsonResponse({ error: 'messageId und threadId sind erforderlich.' }, 400)
    }

    const outline = parseOutline(body.outline)
    if (!outline || outline.blocks.length === 0) {
      return jsonResponse({ error: 'Ungültiges PDF-Gliederungs-JSON (version 1, blocks).' }, 400)
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

    const outBytes = await buildPdfFromOutline(outline)
    if (outBytes.length > 25 * 1024 * 1024) {
      return jsonResponse({ error: 'Erzeugtes PDF zu gross.' }, 400)
    }

    const fileName = sanitizePdfFileName(outline.fileName ?? outline.title)
    const path = `${user.id}/${messageId}.pdf`

    const upload = await admin.storage.from(EXPORT_BUCKET).upload(path, outBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (upload.error) {
      return jsonResponse({ error: upload.error.message || 'Upload fehlgeschlagen.' }, 500)
    }

    const prevMeta =
      msg.metadata && typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>) : {}
    const newContent =
      'Das PDF wurde erstellt. Nutze den Button «PDF herunterladen» unter dieser Nachricht.'
    const nextMetadata = {
      ...prevMeta,
      pdfExport: {
        bucket: EXPORT_BUCKET,
        path,
        fileName,
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
      pdfExport: nextMetadata.pdfExport,
      displayContent: newContent,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})
