// @ts-expect-error Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import PizZip from 'npm:pizzip@3.1.7'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPORT_BUCKET = 'chat-word-exports'
const TEMPLATE_BUCKET = 'word-templates'

const PLACEHOLDER_TOKEN = '[[STRATON_WORD_BODY]]'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

type WordBlock =
  | { type: 'heading'; level: HeadingLevel; text: string }
  | { type: 'paragraph'; text: string }

type WordOutlineV1 = {
  version: 1
  fileName?: string
  title?: string
  blocks: WordBlock[]
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function defaultHeadingStyleId(level: HeadingLevel): string {
  const ids = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'] as const
  return ids[level - 1] ?? 'Heading6'
}

/** Halbpunkte (Word w:sz): optische Fallbacks, falls die Vorlage keinen passenden Absatzstil hat. */
function headingRunHalfPoints(level: HeadingLevel): number {
  const map: Record<HeadingLevel, number> = {
    1: 36,
    2: 32,
    3: 28,
    4: 26,
    5: 24,
    6: 22,
  }
  return map[level] ?? 28
}

const BODY_RUN_HALF_POINTS = 24

function escapeXmlAttr(s: string): string {
  return escapeXmlText(s)
}

/** Alle in styles.xml deklarierten w:styleId-Werte (ohne vollen Parser). */
function parseExistingStyleIds(stylesXml: string): Set<string> {
  const ids = new Set<string>()
  const re = /w:styleId="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stylesXml)) !== null) {
    ids.add(m[1]!)
  }
  return ids
}

/**
 * Deutsch/Englisch: Word nutzt oft «Überschrift1»/«berschrift1» statt «Heading1».
 * Wir nehmen die erste ID, die in der Vorlage wirklich vorkommt.
 */
function pickHeadingStyleId(existing: Set<string>, level: HeadingLevel): string {
  const candidates: string[] = [
    `Heading${level}`,
    `heading${level}`,
    `Heading_${level}`,
    // Deutsch (OOXML-IDs oft ohne Umlaut)
    `berschrift${level}`,
    `Ueberschrift${level}`,
    `Absatz-Überschrift${level}`,
    `Absatz-Ueberschrift${level}`,
  ]
  if (level === 1) {
    candidates.push('Title', 'Titel')
  }
  for (const c of candidates) {
    if (existing.has(c)) {
      return c
    }
  }
  // Typisch deutsch: beliebige «…berschriftN» / «HeadingN»-IDs aus der Vorlage
  for (const id of existing) {
    const m = id.match(/(\d+)\s*$/)
    if (!m || Number(m[1]) !== level) {
      continue
    }
    const lower = id.toLowerCase()
    if (
      lower.includes('berschrift') ||
      lower.includes('überschrift') ||
      lower.includes('ueberschrift') ||
      (lower.startsWith('heading') && /^heading\d+$/i.test(id))
    ) {
      return id
    }
  }
  return defaultHeadingStyleId(level)
}

function pickBodyParagraphStyleId(existing: Set<string>): string {
  const candidates = ['Normal', 'Standard', 'BodyText', 'Flietext', 'Fliesstext']
  for (const c of candidates) {
    if (existing.has(c)) {
      return c
    }
  }
  return 'Normal'
}

type StylePickers = {
  heading: (level: HeadingLevel) => string
  body: () => string
}

function buildStylePickers(zip: PizZip): StylePickers {
  const stylesFile = zip.file('word/styles.xml')
  const existing = stylesFile ? parseExistingStyleIds(stylesFile.asText()) : new Set<string>()
  const headingCache = new Map<HeadingLevel, string>()
  return {
    heading(level: HeadingLevel) {
      let id = headingCache.get(level)
      if (!id) {
        id = pickHeadingStyleId(existing, level)
        headingCache.set(level, id)
      }
      return id
    },
    body: () => pickBodyParagraphStyleId(existing),
  }
}

/** OOXML-Absätze: Absatzstil aus Vorlage + klare Lauf-Formatierung als Fallback. */
function blocksToWordMl(blocks: WordBlock[], styles: StylePickers): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'heading') {
      const sid = escapeXmlAttr(styles.heading(b.level))
      const hp = headingRunHalfPoints(b.level)
      const text = escapeXmlText(b.text.trim())
      parts.push(
        `<w:p><w:pPr><w:pStyle w:val="${sid}"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`,
      )
    } else if (b.type === 'paragraph') {
      const sid = escapeXmlAttr(styles.body())
      const text = escapeXmlText(b.text.trim())
      if (!text) {
        parts.push(`<w:p><w:pPr><w:pStyle w:val="${sid}"/></w:pPr><w:r><w:rPr><w:sz w:val="${BODY_RUN_HALF_POINTS}"/><w:szCs w:val="${BODY_RUN_HALF_POINTS}"/></w:rPr><w:t xml:space="preserve"></w:t></w:r></w:p>`)
      } else {
        parts.push(
          `<w:p><w:pPr><w:pStyle w:val="${sid}"/></w:pPr><w:r><w:rPr><w:sz w:val="${BODY_RUN_HALF_POINTS}"/><w:szCs w:val="${BODY_RUN_HALF_POINTS}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`,
        )
      }
    }
  }
  return parts.join('')
}

function sanitizeDocxFileName(raw: unknown): string {
  const d = typeof raw === 'string' ? raw.trim() : ''
  const base = d || 'Dokument.docx'
  const safe = base.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 180)
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`
}

function isHeadingLevel(n: number): n is HeadingLevel {
  return n >= 1 && n <= 6
}

function parseOutline(raw: unknown): WordOutlineV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const o = raw as Record<string, unknown>
  if (o.version !== 1) {
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
      const lv = typeof b.level === 'number' ? b.level : Number(b.level)
      const text = typeof b.text === 'string' ? b.text : ''
      if (!isHeadingLevel(lv)) {
        return null
      }
      blocks.push({ type: 'heading', level: lv, text })
    } else if (t === 'paragraph') {
      const text = typeof b.text === 'string' ? b.text : ''
      blocks.push({ type: 'paragraph', text })
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

/** Banner/KI-Zeilen vermeiden, die versehentlich als Fließtext im Payload landen. */
function sanitizeExportOutline(o: WordOutlineV1): WordOutlineV1 {
  const blocks = o.blocks.filter((b) => {
    if (b.type !== 'paragraph') {
      return true
    }
    const t = b.text.trim()
    if (/^#{1,6}\s+/.test(t)) {
      return false
    }
    return true
  })
  return {
    version: 1,
    fileName: o.fileName,
    title: undefined,
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return jsonResponse({ error: 'Supabase-Konfiguration unvollständig.' }, 500)
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
      return jsonResponse({ error: 'Ungültiges Word-Gliederungs-JSON (version 1, blocks).' }, 400)
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

    const { data: tplRow, error: tplErr } = await admin.from('app_word_template').select('storage_path').eq('id', 1).maybeSingle()

    if (tplErr || !tplRow?.storage_path || typeof tplRow.storage_path !== 'string') {
      return jsonResponse(
        {
          error:
            'Keine Word-Vorlage hinterlegt. Bitte im Admin-Bereich unter Word-Vorlagen eine .docx hochladen.',
        },
        400,
      )
    }

    const templatePath = tplRow.storage_path.trim()
    const dl = await admin.storage.from(TEMPLATE_BUCKET).download(templatePath)
    if (dl.error || !dl.data) {
      return jsonResponse({ error: 'Vorlagendatei konnte nicht geladen werden.' }, 500)
    }

    const templateBuf = new Uint8Array(await dl.data.arrayBuffer())
    const zip = new PizZip(templateBuf)
    const docEntry = zip.file('word/document.xml')
    if (!docEntry) {
      return jsonResponse({ error: 'Ungültige Vorlage (word/document.xml fehlt).' }, 400)
    }

    let docXml = docEntry.asText()
    const stylePickers = buildStylePickers(zip)
    /** Kein separater Dokumenttitel aus `outline.title` — nur `blocks` (z. B. nur «Kapitel»-Überschriften). */
    const bodyXml = blocksToWordMl(outline.blocks, stylePickers)

    if (docXml.includes(PLACEHOLDER_TOKEN)) {
      docXml = docXml.split(PLACEHOLDER_TOKEN).join(bodyXml)
    } else {
      const closeBody = '</w:body>'
      const idx = docXml.lastIndexOf(closeBody)
      if (idx === -1) {
        return jsonResponse(
          {
            error:
              'Vorlage ohne Platzhalter: bitte [[STRATON_WORD_BODY]] im Dokument einfügen oder gültige word/document.xml.',
          },
          400,
        )
      }
      docXml = `${docXml.slice(0, idx)}${bodyXml}${docXml.slice(idx)}`
    }

    zip.file('word/document.xml', docXml)
    const outBytes = zip.generate({ type: 'uint8array' }) as Uint8Array

    if (outBytes.length > 40 * 1024 * 1024) {
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
        content: newContent,
        metadata: nextMetadata,
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
