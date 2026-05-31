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

function sanitizeDbText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function sanitizeJsonbMetadata<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'string' ? sanitizeDbText(v) : v)),
  ) as T
}
const TEMPLATE_BUCKET = 'word-templates'

const PLACEHOLDER_TOKEN = '[[STRATON_WORD_BODY]]'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

type WordBlock =
  | { type: 'heading'; level: HeadingLevel; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; rows: string[][]; header?: boolean }

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

function escapeXmlAttr(s: string): string {
  return escapeXmlText(s)
}

/** Alle in styles.xml deklarierten w:styleId-Werte + Anzeigenamen (z. B. «Überschrift 1»). */
function parseStyleCatalog(stylesXml: string): { ids: Set<string>; displayNameToId: Map<string, string> } {
  const ids = new Set<string>()
  const displayNameToId = new Map<string, string>()
  const idRe = /w:styleId="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = idRe.exec(stylesXml)) !== null) {
    ids.add(m[1]!)
  }
  const styleBlockRe = /<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g
  while ((m = styleBlockRe.exec(stylesXml)) !== null) {
    const styleId = m[1]!
    const inner = m[2] ?? ''
    const nameMatch = /<w:name\s+w:val="([^"]+)"/.exec(inner)
    if (nameMatch?.[1]) {
      displayNameToId.set(nameMatch[1].trim().toLowerCase(), styleId)
    }
  }
  return { ids, displayNameToId }
}

/** Tiefe aus nummeriertem Stilnamen: «1. Überschrift» → 1, «1.1 Überschrift» → 2. */
function headingDepthFromNumberedStyleName(displayNameLower: string): number | null {
  if (/inhalts|verzeichnis|toc\b|table of/.test(displayNameLower)) {
    return null
  }
  if (!/übers|uebers|berschrift/.test(displayNameLower)) {
    return null
  }
  const m = displayNameLower.match(/^(\d+(?:\.\d+)*)\.\s+/)
  if (!m?.[1]) {
    return null
  }
  const depth = m[1].split('.').length
  return depth >= 1 && depth <= 6 ? depth : null
}

function scoreNumberedHeadingStyleName(displayNameLower: string): number {
  const depth = headingDepthFromNumberedStyleName(displayNameLower)
  if (depth === null) {
    return -100
  }
  let score = 40
  if (/überschrift|ueberschrift/.test(displayNameLower)) {
    score += 15
  } else if (/übers|uebers/.test(displayNameLower)) {
    score += 10
  }
  return score
}

/** «1. Überschrift» → Tiefe 1 (Kapitel), «1.1 Überschrift» → Tiefe 2 (Unterkapitel). */
function buildNumberedHeadingStyleByDepth(
  existing: Set<string>,
  displayNameToId: Map<string, string>,
): Map<number, string> {
  const best = new Map<number, { id: string; score: number }>()
  for (const [nameLower, styleId] of displayNameToId) {
    if (!existing.has(styleId)) {
      continue
    }
    const depth = headingDepthFromNumberedStyleName(nameLower)
    if (depth === null) {
      continue
    }
    const score = scoreNumberedHeadingStyleName(nameLower)
    const prev = best.get(depth)
    if (!prev || score > prev.score) {
      best.set(depth, { id: styleId, score })
    }
  }
  for (const styleId of existing) {
    const depth = headingDepthFromNumberedStyleName(styleId.toLowerCase())
    if (depth === null) {
      continue
    }
    const score = scoreNumberedHeadingStyleName(styleId.toLowerCase())
    const prev = best.get(depth)
    if (!prev || score > prev.score) {
      best.set(depth, { id: styleId, score })
    }
  }
  const out = new Map<number, string>()
  for (const [depth, { id }] of best) {
    out.set(depth, id)
  }
  return out
}

/** Entfernt «Kapitel 1:» / «1.» / «1.1» — nummerierte Vorlagen-Stile nummerieren selbst. */
function sanitizeHeadingTextForTemplate(text: string): string {
  let t = text.trim()
  t = t.replace(/^Kapitel\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Chapter\s+\d+\s*[:：.\-–—]\s*/i, '')
  t = t.replace(/^Kapitel\s+\d+\s*$/i, '')
  t = t.replace(/^Chapter\s+\d+\s*$/i, '')
  // «1. Titel», «1.1 Titel» oder doppelt «1.1 1.1 Titel» (KI + Vorlage)
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^(\d+(?:\.\d+)*)(?:\.\s+|\s+)/, '').trim()
    if (next === t) {
      break
    }
    t = next
  }
  return t.trim()
}

/**
 * Kapitel = Ebene 1 → Vorlage «1. Überschrift», Unterkapitel = Ebene 2 → «1.1 …».
 * Nummerierte Vorlagen haben Vorrang vor «Titel» / «Überschrift 1».
 */
function pickHeadingStyleId(
  existing: Set<string>,
  displayNameToId: Map<string, string>,
  level: HeadingLevel,
  numberedByDepth: Map<number, string>,
): string {
  const fromNumbered = numberedByDepth.get(level)
  if (fromNumbered && existing.has(fromNumbered)) {
    return fromNumbered
  }
  const displayCandidates = [
    `überschrift ${level}`,
    `ueberschrift ${level}`,
    `heading ${level}`,
    `heading${level}`,
  ]
  for (const d of displayCandidates) {
    const id = displayNameToId.get(d)
    if (id && existing.has(id)) {
      return id
    }
  }
  const candidates: string[] = [
    `Heading${level}`,
    `heading${level}`,
    `Heading_${level}`,
    `berschrift${level}`,
    `Ueberschrift${level}`,
    `Absatz-Überschrift${level}`,
    `Absatz-Ueberschrift${level}`,
  ]
  for (const c of candidates) {
    if (existing.has(c)) {
      return c
    }
  }
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
  if (level === 1) {
    for (const d of ['titel', 'title']) {
      const id = displayNameToId.get(d)
      if (id && existing.has(id)) {
        return id
      }
    }
    for (const c of ['Title', 'Titel']) {
      if (existing.has(c)) {
        return c
      }
    }
  }
  return defaultHeadingStyleId(level)
}

function pickBodyParagraphStyleId(existing: Set<string>, displayNameToId: Map<string, string>): string {
  const displayCandidates = ['standard', 'normal', 'fließtext', 'fliesstext', 'body text', 'textkörper', 'textkoerper']
  for (const d of displayCandidates) {
    const id = displayNameToId.get(d)
    if (id && existing.has(id)) {
      return id
    }
  }
  const candidates = ['Normal', 'Standard', 'BodyText', 'Flietext', 'Fliesstext', 'Textkörper', 'Textkoerper']
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
  const catalog = stylesFile
    ? parseStyleCatalog(stylesFile.asText())
    : { ids: new Set<string>(), displayNameToId: new Map<string, string>() }
  const numberedByDepth = buildNumberedHeadingStyleByDepth(catalog.ids, catalog.displayNameToId)
  const headingCache = new Map<HeadingLevel, string>()
  let bodyId: string | null = null
  return {
    heading(level: HeadingLevel) {
      let id = headingCache.get(level)
      if (!id) {
        id = pickHeadingStyleId(catalog.ids, catalog.displayNameToId, level, numberedByDepth)
        headingCache.set(level, id)
      }
      return id
    },
    body: () => {
      if (!bodyId) {
        bodyId = pickBodyParagraphStyleId(catalog.ids, catalog.displayNameToId)
      }
      return bodyId
    },
  }
}

/** Nur Absatzformatvorlage — keine w:sz/w:b, damit die .docx-Vorlage greift. */
function styledParagraphXml(styleId: string, text: string): string {
  const sid = escapeXmlAttr(styleId)
  const t = escapeXmlText(text.trim())
  return `<w:p><w:pPr><w:pStyle w:val="${sid}"/></w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
}

function tableToWordMl(table: { rows: string[][]; header?: boolean }, styles: StylePickers): string {
  const rows = table.rows.filter((r) => r.length > 0)
  if (rows.length === 0) {
    return ''
  }
  const colCount = Math.max(...rows.map((r) => r.length))
  const colWidth = Math.max(1200, Math.floor(9000 / colCount))
  const grid = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')
  const bodySid = escapeXmlAttr(styles.body())
  const parts: string[] = [
    '<w:tbl>',
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>',
    '</w:tblBorders></w:tblPr>',
    `<w:tblGrid>${grid}</w:tblGrid>`,
  ]
  rows.forEach((row, rowIndex) => {
    parts.push('<w:tr>')
    for (let c = 0; c < colCount; c += 1) {
      const text = escapeXmlText(String(row[c] ?? '').trim())
      const bold =
        table.header === true && rowIndex === 0 ? '<w:b/>' : ''
      parts.push(
        `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr>` +
          `<w:p><w:pPr><w:pStyle w:val="${bodySid}"/></w:pPr>` +
          `<w:r><w:rPr>${bold}</w:rPr>` +
          `<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`,
      )
    }
    parts.push('</w:tr>')
  })
  parts.push('</w:tbl>')
  return parts.join('')
}

/** OOXML-Absätze: ausschließlich Absatzstile aus der Vorlage (Überschrift 1/2, Normal, …). */
function blocksToWordMl(blocks: WordBlock[], styles: StylePickers): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'table') {
      const tbl = tableToWordMl(b, styles)
      if (tbl) {
        parts.push(tbl)
      }
    } else if (b.type === 'heading') {
      const headingText = sanitizeHeadingTextForTemplate(b.text)
      if (headingText) {
        parts.push(styledParagraphXml(styles.heading(b.level), headingText))
      }
    } else if (b.type === 'paragraph') {
      parts.push(styledParagraphXml(styles.body(), b.text))
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
      const lvRaw =
        typeof b.level === 'number'
          ? b.level
          : typeof b.depth === 'number'
            ? b.depth
            : Number(b.level ?? b.depth)
      const lv = lvRaw
      const text = typeof b.text === 'string' ? b.text : ''
      if (!isHeadingLevel(lv)) {
        return null
      }
      blocks.push({ type: 'heading', level: lv, text })
    } else if (t === 'paragraph') {
      const text = typeof b.text === 'string' ? b.text : ''
      blocks.push({ type: 'paragraph', text })
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
      blocks.push({
        type: 'table',
        header: b.header === true,
        rows: normalized,
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

/** Banner/KI-Zeilen vermeiden; Struktur für Formatvorlagen anreichern. */
function sanitizeExportOutline(o: WordOutlineV1): WordOutlineV1 {
  let blocks = o.blocks.filter((b) => {
    if (b.type !== 'paragraph') {
      return true
    }
    const t = b.text.trim()
    if (/^#{1,6}\s+/.test(t)) {
      return false
    }
    return true
  })
  blocks = refineOutlineBlocksForTemplate(blocks)
  return {
    version: 1,
    fileName: o.fileName,
    title: undefined,
    blocks,
  }
}

const KAPITEL_WITH_SEP_RE = /^Kapitel\s+\d+\s*[:：.\-–—]\s*(.*)$/i
const CHAPTER_WITH_SEP_RE = /^Chapter\s+\d+\s*[:：.\-–—]\s*(.*)$/i

function tryDecimalSubsectionHeading(line: string): { level: HeadingLevel; text: string } | null {
  const t = line.trim().replace(/\*\*/g, '').trim()
  if (t.length > 200) {
    return null
  }
  const three = t.match(/^(\d+)\.(\d+)\.(\d+)\s+(\S.*)$/)
  if (three?.[4]) {
    return { level: 3, text: three[4].trim() }
  }
  const two = t.match(/^(\d+)\.(\d+)\s+(\S.*)$/)
  if (two?.[3]) {
    return { level: 2, text: two[3].trim() }
  }
  return null
}

function pushHeading(out: WordBlock[], level: HeadingLevel, text: string) {
  const clean = sanitizeHeadingTextForTemplate(text)
  if (clean) {
    out.push({ type: 'heading', level, text: clean })
  }
}

function classifyLineForExport(line: string, lastHeadingLevel: number): WordBlock | null {
  const t = line.trim().replace(/\*\*/g, '').trim()
  if (!t) {
    return null
  }
  const md = t.match(/^(#{1,6})\s+(.+)$/)
  if (md?.[1] && md[2]) {
    const lv = Math.min(6, Math.max(1, md[1].length <= 2 ? 1 : md[1].length - 1)) as HeadingLevel
    return { type: 'heading', level: lv, text: sanitizeHeadingTextForTemplate(md[2].trim()) }
  }
  const decimal = tryDecimalSubsectionHeading(t)
  if (decimal) {
    return { type: 'heading', level: decimal.level, text: sanitizeHeadingTextForTemplate(decimal.text) }
  }
  const kapitel = t.match(KAPITEL_WITH_SEP_RE)
  if (kapitel) {
    const title = (kapitel[1] ?? '').trim()
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(title || t) }
  }
  const chapter = t.match(CHAPTER_WITH_SEP_RE)
  if (chapter) {
    const title = (chapter[1] ?? '').trim()
    return { type: 'heading', level: 1, text: sanitizeHeadingTextForTemplate(title || t) }
  }
  const singleNum = t.match(/^(\d+)\.\s+(.+)$/)
  if (singleNum?.[2] && !/^\d+\.\d+/.test(t)) {
    const n = parseInt(singleNum[1]!, 10)
    const title = singleNum[2].trim()
    const wasBold = /^\*\*[^*]+\*\*/.test(line.trim())
    // Kapitel: «2. …», «Kapitel …», fette «1. …» → Ebene 1 («1. Überschrift»)
    // Unterkapitel: «1. …» nach Kapitel, nicht fett → Ebene 2 («1.1 …»)
    let level: HeadingLevel = 1
    if (wasBold || n >= 2 || lastHeadingLevel === 0) {
      level = 1
    } else {
      level = 2
    }
    return { type: 'heading', level, text: sanitizeHeadingTextForTemplate(title) }
  }
  const boldOnly = line.trim().match(/^\*\*([^*]+)\*\*\s*$/)
  if (boldOnly?.[1] && boldOnly[1].length <= 120) {
    const lv: HeadingLevel = lastHeadingLevel >= 1 ? 2 : 1
    return { type: 'heading', level: lv, text: sanitizeHeadingTextForTemplate(boldOnly[1].trim()) }
  }
  return { type: 'paragraph', text: t }
}

function refineOutlineBlocksForTemplate(blocks: WordBlock[]): WordBlock[] {
  const out: WordBlock[] = []
  let lastHeadingLevel = 0
  for (const b of blocks) {
    if (b.type === 'table') {
      out.push(b)
      continue
    }
    if (b.type === 'heading') {
      pushHeading(out, b.level, b.text)
      lastHeadingLevel = b.level
      continue
    }
    const chunks = b.text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    for (const chunk of chunks) {
      const kapitelSplit = chunk.match(/^(Kapitel\s+\d+\s*[:：.\-–—]\s*[^.!?]{3,80})([.!?].+)$/i)
      if (kapitelSplit?.[1] && kapitelSplit[2]) {
        pushHeading(out, 1, kapitelSplit[1].trim())
        lastHeadingLevel = 1
        out.push({ type: 'paragraph', text: kapitelSplit[2].trim() })
        continue
      }
      const classified = classifyLineForExport(chunk, lastHeadingLevel)
      if (classified) {
        out.push(classified)
        if (classified.type === 'heading') {
          lastHeadingLevel = classified.level
        }
      }
    }
  }
  return out.length > 0 ? out : blocks
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
