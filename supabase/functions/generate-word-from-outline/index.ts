// @ts-expect-error Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPORT_BUCKET = 'chat-word-exports'
const MAX_DOCX_BYTES = 40 * 1024 * 1024

function sanitizeDbText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function sanitizeJsonbMetadata<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'string' ? sanitizeDbText(v) : v)),
  ) as T
}

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

type WordBlock =
  | { type: 'heading'; level: HeadingLevel; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; rows: string[][]; header?: boolean }

type WordOutlineV1 = {
  version: 1
  fileName?: string
  title?: string
  subtitle?: string
  author?: string
  date?: string
  blocks: WordBlock[]
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isHeadingLevel(n: number): n is HeadingLevel {
  return n >= 1 && n <= 6
}

/** Entfernt «Kapitel 1:» / «1.» / «1.1» — feste Word-Stile nummerieren nicht selbst, aber doppelte Nummern stören. */
function sanitizeHeadingText(text: string): string {
  let t = text.trim()
  t = t.replace(/^Kapitel\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Chapter\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Kapitel\s+\d+\s*$/i, '')
  t = t.replace(/^Chapter\s+\d+\s*$/i, '')
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^(\d+(?:\.\d+)*)(?:\.\s+|\s+)/, '').trim()
    if (next === t) {
      break
    }
    t = next
  }
  return t.trim()
}

function parseOutline(raw: unknown): WordOutlineV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const o = raw as Record<string, unknown>
  const version = o.version === undefined ? 1 : o.version
  if (version !== 1) {
    return null
  }
  if (!Array.isArray(o.blocks)) {
    return null
  }
  const blocks: WordBlock[] = []
  for (const item of o.blocks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }
    const b = item as Record<string, unknown>
    const t = typeof b.type === 'string' ? b.type.trim().toLowerCase() : ''
    if (t === 'heading') {
      const lvRaw =
        typeof b.level === 'number'
          ? b.level
          : typeof b.depth === 'number'
            ? b.depth
            : Number(b.level ?? b.depth)
      if (!isHeadingLevel(lvRaw)) {
        return null
      }
      blocks.push({ type: 'heading', level: lvRaw, text: typeof b.text === 'string' ? b.text : '' })
    } else if (t === 'paragraph') {
      blocks.push({ type: 'paragraph', text: typeof b.text === 'string' ? b.text : '' })
    } else if (t === 'list') {
      if (!Array.isArray(b.items)) {
        return null
      }
      const items = b.items
        .map((it) => (typeof it === 'string' ? it : String(it ?? '')))
        .map((it) => it.trim())
        .filter(Boolean)
      if (items.length === 0) {
        return null
      }
      blocks.push({ type: 'list', ordered: b.ordered === true, items })
    } else if (t === 'table') {
      if (!Array.isArray(b.rows) || b.rows.length === 0) {
        return null
      }
      const rows: string[][] = []
      for (const row of b.rows) {
        if (!Array.isArray(row) || row.length === 0) {
          return null
        }
        rows.push(row.map((c) => (typeof c === 'string' ? c : String(c ?? ''))))
      }
      const colCount = Math.max(...rows.map((r) => r.length))
      const normalized = rows.map((r) => {
        const copy = r.slice(0, colCount)
        while (copy.length < colCount) {
          copy.push('')
        }
        return copy
      })
      blocks.push({ type: 'table', header: b.header === true, rows: normalized })
    } else {
      return null
    }
  }
  return {
    version: 1,
    fileName: typeof o.fileName === 'string' ? o.fileName : undefined,
    title: typeof o.title === 'string' ? o.title : undefined,
    subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined,
    author: typeof o.author === 'string' ? o.author : undefined,
    date: typeof o.date === 'string' ? o.date : undefined,
    blocks,
  }
}

/** Überschriften-Nummern bereinigen, leere Roh-Markdown-Überschriften entfernen. */
function sanitizeExportOutline(o: WordOutlineV1): WordOutlineV1 {
  const blocks: WordBlock[] = []
  for (const b of o.blocks) {
    if (b.type === 'heading') {
      const text = sanitizeHeadingText(b.text)
      if (text) {
        blocks.push({ type: 'heading', level: b.level, text })
      }
    } else if (b.type === 'paragraph') {
      const t = b.text.trim()
      if (t && !/^#{1,6}\s+/.test(t)) {
        blocks.push({ type: 'paragraph', text: t })
      }
    } else {
      blocks.push(b)
    }
  }
  return {
    version: 1,
    fileName: o.fileName,
    title: o.title,
    subtitle: o.subtitle,
    author: o.author,
    date: o.date,
    blocks,
  }
}

function sanitizeDocxFileName(raw: unknown): string {
  const d = typeof raw === 'string' ? raw.trim() : ''
  const base = d || 'Dokument.docx'
  const safe = base.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 180)
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const renderServiceUrl = Deno.env.get('PPTX_RENDER_SERVICE_URL') ?? ''
  const renderServiceToken = Deno.env.get('PPTX_RENDER_SERVICE_TOKEN') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey || !renderServiceUrl || !renderServiceToken) {
    return jsonResponse({ error: 'Server-Konfiguration fehlt.' }, 500)
  }
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

    let outline = parseOutline(body.outline)
    if (!outline || outline.blocks.length === 0) {
      return jsonResponse({ error: 'Ungültiges Word-Gliederungs-JSON (version 1, blocks).' }, 400)
    }
    outline = sanitizeExportOutline(outline)
    if (outline.blocks.length === 0) {
      return jsonResponse({ error: 'Kein exportierbarer Text in der Gliederung.' }, 400)
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

    // Feste Formatierung serverseitig via Python-Renderer (python-docx) — gleiche Spec wie die Chat-Vorschau.
    const renderRes = await fetch(`${renderServiceUrl.replace(/\/$/, '')}/render-docx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': renderServiceToken,
      },
      body: JSON.stringify({ outline }),
    })
    if (!renderRes.ok) {
      const detail = await renderRes.text().catch(() => '')
      return jsonResponse(
        { error: `Word-Rendering fehlgeschlagen: ${detail || renderRes.statusText}` },
        502,
      )
    }
    const outBytes = new Uint8Array(await renderRes.arrayBuffer())
    if (outBytes.length === 0) {
      return jsonResponse({ error: 'Erzeugtes Dokument ist leer.' }, 500)
    }
    if (outBytes.length > MAX_DOCX_BYTES) {
      return jsonResponse({ error: 'Erzeugtes Dokument zu gross.' }, 400)
    }

    const fileName = sanitizeDocxFileName(outline.fileName)
    const path = `${user.id}/${messageId}.docx`

    const upload = await admin.storage.from(EXPORT_BUCKET).upload(path, outBytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    })
    if (upload.error) {
      return jsonResponse({ error: upload.error.message || 'Upload fehlgeschlagen.' }, 500)
    }

    const prevMeta =
      msg.metadata && typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>) : {}
    const newContent =
      'Das Word-Dokument wurde erstellt. Nutze den Button «Word herunterladen» unter dieser Nachricht.'
    const nextMetadata = {
      ...prevMeta,
      wordExport: {
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
      wordExport: nextMetadata.wordExport,
      displayContent: newContent,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})
