// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

type Provider = 'openai' | 'anthropic'
type LearnModelId =
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5-mini'
  | 'gpt-4o-mini'
  | 'claude-sonnet-4-6'
  | 'claude-3-5-haiku-latest'

type InputMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Gleicher Marker wie Client `wordExportPrompt.ts` — Word-Slash-Befehl. */
const STRATON_WORD_EXPORT_COMMAND_MARKER = '[[STRATON_WORD_COMMAND]]'

/** jsonb / OpenAI: NUL und Steuerzeichen entfernen (PDF/OCR-Anhänge). */
function sanitizeChatTextForTransport(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function sanitizeInputMessages(messages: InputMessage[]): InputMessage[] {
  return messages.map((m) => ({
    ...m,
    content: sanitizeChatTextForTransport(m.content),
  }))
}

/**
 * Wenn der Nutzer /Word ausgelöst hat: Systemhinweis für die #### / ##### / ######-Konvention,
 * damit die KI nicht nur «normales» Markdown (#–###) liefert.
 */
function injectWordExportMarkdownConventionSystemMessage(messages: InputMessage[]): InputMessage[] {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content.includes(STRATON_WORD_EXPORT_COMMAND_MARKER)) {
    return messages
  }
  const block = [
    '',
    '## Word-Dokument (Straton)',
    'Der Nutzer hat den Word-Export angefragt (Marker im User-Text). Der sichtbare Text ist die **Vorschau des späteren .docx** — schreibe ihn wie **fertigen Dokumentinhalt für Leser**, nicht wie Tutorial zum Ausfüllen.',
    '**Streng verboten:** Einleitungen über «diese Vorlage» oder «empfohlene Kapitelstruktur»; Sätze wie «In diesem Kapitel beschreiben Sie…», «Hier wird erklärt…», «Dieser Abschnitt soll…», «Tragen Sie ein…»; reine Leitfragen ohne Antworttext (z. B. nur «Warum? Wer?»); Platzhalter-Unterkapitel («Schritt 1», «Schritt 2» ohne Beschreibung); zusätzliche Blöcke «Direkt nutzbare Vorlage» oder ähnliche Meta-Bereiche.',
    '**Stattdessen:** Unter jeder Überschrift steht **konkreter Fließtext** (vollständige Sätze), der zum Nutzerthema passt — Anleitungsschritte, Definitionen, Hinweise als **ausformulierte** Absätze.',
    '**Trennung vom normalen Chat:** Üblicher Chat nutzt `#` bis `###`. **Hier** strukturierst du den Körper nur mit:',
    '- `#### ` = Absatz/Fließtext (Formatvorlage «Normal»/«Standard» in der .docx-Vorlage)',
    '- `##### ` = Überschrift 1',
    '- `###### ` = Überschrift 2',
    'Keine manuelle Fett/Schriftgröße — die Vorlage formatiert automatisch. «Kapitel 1: …» immer als `#####`-Zeile, nicht als Fließtext.',
    'Jeder Block beginnt mit einer dieser Zeilen; Folgezeilen ohne Präfix gehören zum letzten `####`-Absatz.',
    'Tabellen: GFM-Pipe (`| Spalte |` + `| --- |`) unter einem Absatz oder im WordOutline-JSON `{"type":"table","header":true,"rows":[["A","B"]]}`.',
    'Optional zusätzlich gültiges WordOutline-JSON in ```json … ``` (`version`: 1, `blocks`: heading, paragraph, table).',
    'Keine langen Meta-Vorreden — beginne direkt mit der ersten Überschrift oder dem ersten Absatz des Dokuments.',
    'Die .docx erzeugt die App erst nach Bestätigung in der UI; du lieferst nur Text/JSON für die Vorschau.',
  ].join('\n')
  if (messages.length > 0 && messages[0]!.role === 'system') {
    return [
      { ...messages[0]!, content: `${messages[0]!.content}\n\n${block}` },
      ...messages.slice(1),
    ]
  }
  return [{ role: 'system', content: block.trim() }, ...messages]
}

/** OpenAI Prompt Caching (Routing + ggf. 24h-Retention auf unterstützten Modellen). */
type OpenAiPromptCacheOptions = {
  key: string
  retention?: 'in_memory' | '24h'
}

/** Gleicher Default wie Client `chat.service.ts` (`OPENAI_PROMPT_CACHE_KEY_MAIN`). */
const OPENAI_PROMPT_CACHE_DEFAULT_CHAT_KEY = 'straton-main-v4'

function sanitizePromptCacheKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const t = value.trim()
  if (t.length === 0 || t.length > 64) {
    return null
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) {
    return null
  }
  return t
}

function sanitizePromptCacheRetention(value: unknown): 'in_memory' | '24h' | null {
  if (value === '24h' || value === 'in_memory') {
    return value
  }
  return null
}

/** Extended retention laut OpenAI-Doku u. a. für GPT-5.x, GPT-4.1, Codex. */
function openAiSupportsExtendedPromptCache(modelId: string): boolean {
  const m = modelId.toLowerCase()
  return m.includes('gpt-5') || m.includes('gpt-4.1') || m.includes('codex')
}

function resolveOpenAiPromptCacheForRequest(
  mode: string,
  clientKey: string | null,
  clientRetention: 'in_memory' | '24h' | null,
): OpenAiPromptCacheOptions | undefined {
  const defaults: Partial<Record<string, OpenAiPromptCacheOptions>> = {
    evaluate_quiz: { key: 'straton-eval-quiz-v1', retention: '24h' },
    generate_title: { key: 'straton-gen-title-v1', retention: '24h' },
    instant_analyze: { key: 'straton-instant-analyze-v1', retention: '24h' },
    thinking_analyze: { key: 'straton-thinking-analyze-v1', retention: '24h' },
    generate_topic_suggestions: { key: 'straton-topic-suggest-v1', retention: '24h' },
    generate_flashcards: { key: 'straton-flashcards-v1', retention: '24h' },
    generate_worksheet: { key: 'straton-worksheet-v1', retention: '24h' },
  }
  if (mode === 'chat') {
    const key = clientKey ?? OPENAI_PROMPT_CACHE_DEFAULT_CHAT_KEY
    return {
      key,
      retention: clientRetention ?? undefined,
    }
  }
  return defaults[mode]
}

type OpenAiVisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

const OPENAI_VISION_MIME_RE = /^image\/(jpeg|png|gif|webp)$/i

/** Entfernt Zeilenumbrüche in Base64 (iOS) und normalisiert MIME — sonst «invalid base64 image url». */
function normalizeVisionDataUrl(dataUrl: string): string {
  let t = dataUrl.trim().replace(/^data:image\/jpg;/i, 'data:image/jpeg;')
  const marker = 'base64,'
  const idx = t.indexOf(marker)
  if (idx === -1) {
    return t
  }
  return t.slice(0, idx + marker.length) + t.slice(idx + marker.length).replace(/\s+/g, '')
}

function isLikelyValidBase64Payload(payload: string): boolean {
  if (payload.length < 32) {
    return false
  }
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload[i]!
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '+' ||
      ch === '/' ||
      ch === '='
    ) {
      continue
    }
    return false
  }
  return true
}

/** Streng; bei langen JPEG-Data-URLs kann Vollstring-Regex sonst fehlschlagen. */
function sanitizeOpenAiVisionDataUrl(dataUrl: string): string | null {
  const n = normalizeVisionDataUrl(dataUrl)
  const headerMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(n)
  if (!headerMatch?.[1]) {
    return null
  }
  let media = (headerMatch[1] ?? '').toLowerCase()
  if (media === 'image/jpg') {
    media = 'image/jpeg'
  }
  if (!OPENAI_VISION_MIME_RE.test(media)) {
    return null
  }
  const marker = 'base64,'
  const idx = n.indexOf(marker)
  if (idx === -1) {
    return null
  }
  let payload = n.slice(idx + marker.length).replace(/\s+/g, '')
  if (!isLikelyValidBase64Payload(payload)) {
    payload = stripToBase64Payload(payload)
    if (payload.length < 64) {
      return null
    }
  }
  return `data:${media};base64,${payload}`
}

function stripToBase64Payload(payload: string): string {
  let out = ''
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload[i]!
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '+' ||
      ch === '/' ||
      ch === '='
    ) {
      out += ch
    }
  }
  return out
}

/** Client-`visionInlineDataUrl` und `[BildData]`-Blöcke → OpenAI-taugliche Data-URL. */
function resolveVisionUrlFromBody(raw: string): string | null {
  const t = raw.trim()
  if (!t.startsWith('data:image/')) {
    return null
  }
  return coerceOpenAiVisionDataUrl(t)
}

/** Client-Override: normalisieren, Sanitize optional nachziehen. */
function coerceOpenAiVisionDataUrl(dataUrl: string): string | null {
  const n = normalizeVisionDataUrl(dataUrl.trim())
  if (!n.startsWith('data:image/')) {
    return null
  }
  const strict = sanitizeOpenAiVisionDataUrl(n)
  if (strict) {
    return strict
  }
  const marker = 'base64,'
  const idx = n.indexOf(marker)
  if (idx === -1 || n.length < idx + marker.length + 32) {
    return null
  }
  const headerMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(n)
  let media = (headerMatch?.[1] ?? 'image/jpeg').toLowerCase()
  if (media === 'image/jpg') {
    media = 'image/jpeg'
  }
  if (!OPENAI_VISION_MIME_RE.test(media)) {
    return null
  }
  let payload = n.slice(idx + marker.length).replace(/\s+/g, '')
  if (!isLikelyValidBase64Payload(payload)) {
    payload = stripToBase64Payload(payload)
    if (payload.length < 64) {
      return null
    }
  }
  return `data:${media};base64,${payload}`
}

/** `[BildData]`-Blöcke per indexOf — Regex auf 100k+ Base64 bricht sonst in Deno/Edge. */
function stripBildDataBlocksFromContent(content: string): string {
  let result = ''
  let cursor = 0
  const closeTag = '[/BildData]'
  while (true) {
    const openIdx = content.indexOf('[BildData:', cursor)
    if (openIdx === -1) {
      result += content.slice(cursor)
      break
    }
    result += content.slice(cursor, openIdx)
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      result += content.slice(openIdx)
      break
    }
    cursor = closeIdx + closeTag.length
  }
  return result
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
    .trim()
}

function extractUserVisionFromContent(content: string): { text: string; imageDataUrls: string[] } {
  const imageDataUrls: string[] = []
  let searchFrom = 0
  const closeTag = '[/BildData]'
  while (imageDataUrls.length < 1) {
    const openIdx = content.indexOf('[BildData:', searchFrom)
    if (openIdx === -1) {
      break
    }
    const closeIdx = content.indexOf(closeTag, openIdx)
    if (closeIdx === -1) {
      break
    }
    const headerEnd = content.indexOf(']', openIdx)
    if (headerEnd === -1 || headerEnd > closeIdx) {
      searchFrom = openIdx + 1
      continue
    }
    const inner = content.slice(headerEnd + 1, closeIdx).trim()
    if (inner.startsWith('data:image/')) {
      const safe = resolveVisionUrlFromBody(inner)
      if (safe) {
        imageDataUrls.push(safe)
      }
    } else {
      const dataIdx = inner.indexOf('data:image/')
      if (dataIdx >= 0) {
        const safe = resolveVisionUrlFromBody(inner.slice(dataIdx))
        if (safe) {
          imageDataUrls.push(safe)
        }
      }
    }
    searchFrom = closeIdx + closeTag.length
  }
  return { text: stripBildDataBlocksFromContent(content), imageDataUrls: imageDataUrls.slice(0, 1) }
}

function stripVisionAttachmentsFromContent(content: string): string {
  return content
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild im Chatverlauf]')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/gi, '[Bild im Chatverlauf]')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '[Bild im Chatverlauf]')
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '[Datei-Anhang]')
    .trim()
}

function findLastUserMessageIndex(messages: InputMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return i
    }
  }
  return -1
}

function messageContentHasVisionPayload(content: string): boolean {
  return content.includes('[BildData:') || content.includes('@chat-media:')
}

function findLastUserMessageWithVisionIndex(messages: InputMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'user' && messageContentHasVisionPayload(m.content)) {
      return i
    }
  }
  return -1
}

const CHAT_VISION_CONTEXT_LIMIT = 2

/** Bis zu zwei neueste User-Nachrichten mit Bild für Vision (Rest → Platzhalter). */
function findOpenAiVisionUserIndices(
  messages: InputMessage[],
  visionOverrideUrl?: string | null,
): number[] {
  const override =
    typeof visionOverrideUrl === 'string' && visionOverrideUrl.trim().startsWith('data:image/')
      ? resolveVisionUrlFromBody(visionOverrideUrl.trim())
      : null
  const indices: number[] = []
  const lastUser = findLastUserMessageIndex(messages)
  if (lastUser >= 0 && override) {
    indices.push(lastUser)
  }
  for (let i = messages.length - 1; i >= 0 && indices.length < CHAT_VISION_CONTEXT_LIMIT; i -= 1) {
    const m = messages[i]
    if (m?.role !== 'user') {
      continue
    }
    if (!messageContentHasVisionPayload(m.content)) {
      continue
    }
    const parsed = extractUserVisionFromContent(m.content)
    if (parsed.imageDataUrls.length > 0 || (override && i === lastUser)) {
      if (!indices.includes(i)) {
        indices.push(i)
      }
    }
  }
  if (indices.length === 0 && override && lastUser >= 0) {
    indices.push(lastUser)
  }
  indices.sort((a, b) => a - b)
  return indices
}

const CHAT_VISION_MEDIA_BUCKET = 'chat-media'
const CHAT_MEDIA_REF_LINE = /@chat-media:([^\n]+)/
const GENERATED_IMAGE_PATH_SEGMENT = '/gen-'

function findLastGeneratedImagePathInMessages(messages: InputMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role !== 'assistant') {
      continue
    }
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content.includes('@chat-media:') && !/\[Generiertes Bild\]/i.test(content)) {
      continue
    }
    const ref =
      CHAT_MEDIA_REF_LINE.exec(content) ?? content.match(/@chat-media:([^\s)\]]+)/i)
    const path = ref?.[1]?.trim()
    if (!path) {
      continue
    }
    if (path.includes(GENERATED_IMAGE_PATH_SEGMENT) || /\[Generiertes Bild\]/i.test(content)) {
      return path
    }
  }
  return null
}

function userAsksAboutPriorImage(content: string): boolean {
  const t = content.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 480) {
    return false
  }
  if (
    /^(?:was|welche[rs]?)\s+(?:steht|stehen|ist|sind|siehst\s+du|steht\s+da|zeigt|zeigen)/i.test(t) &&
    /\b(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)
  ) {
    return true
  }
  if (/^beschreib(?:e)?\s+(?:mir\s+)?(?:das\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/^(?:was|welcher)\s+text\b/i.test(t) && /\b(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (
    /^(?:kannst|könntest)\s+du\s+(?:das\s+)?(?:bild|foto)\s+(?:lesen|sehen|erkennen|analysieren)/i.test(t)
  ) {
    return true
  }
  if (/^lies\s+(?:mir\s+)?(?:den\s+)?text\s+(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/^(?:sieh|sieht)\s+du\s+(?:etwas\s+)?(?:auf\s+)?(?:dem\s+)?(?:bild|foto)\b/i.test(t)) {
    return true
  }
  if (/\b(?:mein(?:e)?|hochgeladene[ns]?)\s+(?:foto|bild)\b/i.test(t)) {
    return true
  }
  if (/\b(?:das|dem)\s+foto\b/i.test(t)) {
    return true
  }
  if (/(?:nochmal|erneut|wieder)\s+(?:das\s+)?(?:foto|bild)\b/i.test(t)) {
    return true
  }
  return false
}

function findLastUserUploadedImagePathInMessages(messages: InputMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role !== 'user') {
      continue
    }
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content.includes('[BildData:') && !content.includes('@chat-media:')) {
      continue
    }
    const ref =
      CHAT_MEDIA_REF_LINE.exec(content) ?? content.match(/@chat-media:([^\s)\]]+)/i)
    const path = ref?.[1]?.trim()
    if (path && !path.includes(GENERATED_IMAGE_PATH_SEGMENT)) {
      return path
    }
  }
  return null
}

function resolveReferencedImagePathInMessages(messages: InputMessage[]): string | null {
  const gen = findLastGeneratedImagePathInMessages(messages)
  const user = findLastUserUploadedImagePathInMessages(messages)
  if (gen && !user) {
    return gen
  }
  if (user && !gen) {
    return user
  }
  if (gen && user) {
    let genIdx = -1
    let userIdx = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (genIdx < 0 && m?.role === 'assistant') {
        const c = typeof m.content === 'string' ? m.content : ''
        if (c.includes('@chat-media:') && c.includes(GENERATED_IMAGE_PATH_SEGMENT)) {
          genIdx = i
        }
      }
      if (userIdx < 0 && m?.role === 'user') {
        const c = typeof m.content === 'string' ? m.content : ''
        if (c.includes('[BildData:') || c.includes('@chat-media:')) {
          userIdx = i
        }
      }
      if (genIdx >= 0 && userIdx >= 0) {
        break
      }
    }
    return genIdx > userIdx ? gen : user
  }
  return null
}

async function downloadChatMediaAsDataUrl(
  userClient: SupabaseClient,
  path: string,
  adminClient?: SupabaseClient | null,
): Promise<string | null> {
  const objectPath = path.trim()
  if (!objectPath) {
    return null
  }
  const clients = [userClient, adminClient].filter((c): c is SupabaseClient => Boolean(c))
  for (const client of clients) {
    const { data, error } = await client.storage.from(CHAT_VISION_MEDIA_BUCKET).download(objectPath)
    if (error || !data) {
      continue
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const dataUrl = coerceOpenAiVisionDataUrl(`data:image/jpeg;base64,${btoa(binary)}`)
    if (dataUrl) {
      return dataUrl
    }
  }
  console.error('[chat-completion] vision storage download failed', objectPath)
  return null
}

async function resolveVisionDataUrlsForUserContent(
  content: string,
  userClient: SupabaseClient,
  adminClient?: SupabaseClient | null,
): Promise<string[]> {
  const inline = extractUserVisionFromContent(content).imageDataUrls
  if (inline.length > 0) {
    return inline
  }
  const pathMatch = CHAT_MEDIA_REF_LINE.exec(content)
  if (!pathMatch?.[1]) {
    return []
  }
  const dataUrl = await downloadChatMediaAsDataUrl(userClient, pathMatch[1], adminClient)
  return dataUrl ? [dataUrl] : []
}

/** Storage-Referenzen → inline Data-URL; optional Client-Override (iOS, zuverlässig). */
async function resolveChatMessagesVisionForOpenAi(
  messages: InputMessage[],
  userClient: SupabaseClient,
  inlineOverride?: string | null,
  adminClient?: SupabaseClient | null,
): Promise<InputMessage[]> {
  let working = messages
  const resolvedUrl =
    typeof inlineOverride === 'string' && inlineOverride.trim().startsWith('data:image/')
      ? resolveVisionUrlFromBody(inlineOverride.trim())
      : null

  const lastUserIdxEarly = findLastUserMessageIndex(working)
  if (
    lastUserIdxEarly >= 0 &&
    !resolvedUrl &&
    typeof working[lastUserIdxEarly]?.content === 'string' &&
    !messageContentHasVisionPayload(working[lastUserIdxEarly]!.content) &&
    userAsksAboutPriorImage(working[lastUserIdxEarly]!.content)
  ) {
    const refPath = resolveReferencedImagePathInMessages(working)
    if (refPath) {
      const dataUrl = await downloadChatMediaAsDataUrl(userClient, refPath, adminClient)
      if (dataUrl) {
        const msg = working[lastUserIdxEarly]!
        const text = stripVisionAttachmentsFromContent(msg.content).trim()
        const block = `[BildData:referenced]\n${dataUrl}\n[/BildData]`
        working = working.map((m, i) =>
          i === lastUserIdxEarly
            ? { ...m, content: text ? `${text}\n\n${block}` : block }
            : m,
        )
        console.log('[chat-completion] vision: re-attached referenced image from storage')
      }
    }
  }

  let forcedVisionIdx = -1
  if (resolvedUrl) {
    const idx = findLastUserMessageIndex(working)
    if (idx >= 0) {
      const msg = working[idx]!
      const text = extractUserVisionFromContent(msg.content).text.trim()
      const idMatch = msg.content.match(/\[BildData:([^\]]+)\]/)
      const id = idMatch?.[1] ?? 'vision'
      const block = `[BildData:${id}]\n${resolvedUrl}\n[/BildData]`
      working = working.map((m, i) =>
        i === idx ? { ...m, content: text ? `${text}\n\n${block}` : block } : m,
      )
      forcedVisionIdx = idx
    }
  } else if (typeof inlineOverride === 'string' && inlineOverride.trim().startsWith('data:image/')) {
    console.warn('[chat-completion] visionInlineDataUrl rejected (strict+lenient)', inlineOverride.trim().length)
  }

  const visionIndices = new Set<number>()
  if (forcedVisionIdx >= 0) {
    /** Aktuelles Foto (`visionInlineDataUrl`): nur letzter User-Turn — nicht ältere Kontext-Bilder. */
    visionIndices.add(forcedVisionIdx)
  } else {
    for (const idx of findOpenAiVisionUserIndices(working, resolvedUrl)) {
      if (visionIndices.size >= CHAT_VISION_CONTEXT_LIMIT) {
        break
      }
      visionIndices.add(idx)
    }
  }
  if (visionIndices.size === 0) {
    return working
  }

  const out: InputMessage[] = []
  for (let i = 0; i < working.length; i += 1) {
    const message = working[i]!
    if (message.role !== 'user') {
      out.push(message)
      continue
    }
    if (!visionIndices.has(i)) {
      out.push({
        role: 'user',
        content: stripVisionAttachmentsFromContent(message.content) || message.content,
      })
      continue
    }
    const urls =
      resolvedUrl && i === forcedVisionIdx
        ? [resolvedUrl]
        : await resolveVisionDataUrlsForUserContent(message.content, userClient, adminClient)
    if (urls.length === 0) {
      console.warn('[chat-completion] vision resolve: no image URL for user turn', i)
      out.push({
        role: 'user',
        content:
          stripVisionAttachmentsFromContent(message.content) ||
          'Der Nutzer hat ein Bild gesendet, aber es konnte nicht geladen werden.',
      })
      continue
    }
    console.log('[chat-completion] vision resolve: image attached for OpenAI/Anthropic', { index: i })
    const idMatch = message.content.match(/\[BildData:([^\]]+)\]/)
    const id = idMatch?.[1] ?? 'vision'
    const text = extractUserVisionFromContent(message.content).text
    const block = `[BildData:${id}]\n${urls[0]}\n[/BildData]`
    out.push({
      role: 'user',
      content: text ? `${text}\n\n${block}` : block,
    })
  }
  return out
}

type AnthropicImageBlock = {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}

type AnthropicUserContentPart =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | AnthropicImageBlock

function dataUrlToAnthropicImageBlock(dataUrl: string): AnthropicImageBlock | null {
  const safe = resolveVisionUrlFromBody(dataUrl) ?? coerceOpenAiVisionDataUrl(dataUrl)
  if (!safe) {
    return null
  }
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(safe)
  if (!m) {
    return null
  }
  let media_type = (m[1] ?? 'image/jpeg').toLowerCase()
  if (media_type === 'image/jpg') {
    media_type = 'image/jpeg'
  }
  const data = (m[2] ?? '').replace(/\s+/g, '')
  if (!data) {
    return null
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type, data },
  }
}

/** Claude: Bilder als strukturierte Blöcke, nicht als Rohstring mit Base64. */
function buildAnthropicUserMessageContent(raw: string, allowVision: boolean): string | AnthropicUserContentPart[] {
  if (!allowVision) {
    return stripVisionAttachmentsFromContent(raw) || raw
  }
  const { text, imageDataUrls } = extractUserVisionFromContent(raw)
  if (imageDataUrls.length === 0) {
    return raw
  }
  const blocks: AnthropicUserContentPart[] = []
  blocks.push({ type: 'text', text: text || 'Bitte analysiere dieses Bild.' })
  let anyImage = false
  for (const url of imageDataUrls) {
    const img = dataUrlToAnthropicImageBlock(url)
    if (img) {
      blocks.push(img)
      anyImage = true
    }
  }
  if (!anyImage) {
    return raw
  }
  return blocks
}

type QuizEvaluationPayload = {
  question: string
  expectedAnswer: string
  acceptableAnswers?: string[]
  userAnswer: string
}

type QuizEvaluationResult = {
  isCorrect: boolean
  feedback: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Primärmodell für Chat; Fallbacks bei 404 oder „unknown model“. */
const DEFAULT_OPENAI_CHAT_MODELS: string[] = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']

/** Nach Erreichen des Kosten-Budgets: günstigeres Modell zuerst (ohne gpt-5.4-mini). */
const ECONOMY_OPENAI_CHAT_MODELS: string[] = ['gpt-5-mini', 'gpt-4o-mini']

type ChatDailyTierOpenAiModelId = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5-mini' | 'gpt-4o' | 'gpt-4o-mini'

type PlanDailyOpenAiTierEdge = {
  tier1ModelId: ChatDailyTierOpenAiModelId
  tier1TokenBudget: number
  tier2ModelId: ChatDailyTierOpenAiModelId
}

const DEFAULT_PLAN_DAILY_OPENAI_TIER: PlanDailyOpenAiTierEdge = {
  tier1ModelId: 'gpt-5.4',
  tier1TokenBudget: 50_000,
  tier2ModelId: 'gpt-5.4-mini',
}

const DEFAULT_PLAN_THINKING_OPENAI_TIER: PlanDailyOpenAiTierEdge = {
  ...DEFAULT_PLAN_DAILY_OPENAI_TIER,
}

function parseTierOpenAiModelId(raw: unknown): ChatDailyTierOpenAiModelId {
  if (
    raw === 'gpt-5.4' ||
    raw === 'gpt-5.4-mini' ||
    raw === 'gpt-5-mini' ||
    raw === 'gpt-4o' ||
    raw === 'gpt-4o-mini'
  ) {
    return raw
  }
  return 'gpt-5.4'
}

function openAiChainForTierModelId(id: ChatDailyTierOpenAiModelId): string[] {
  switch (id) {
    case 'gpt-4o':
      return ['gpt-4o', 'gpt-4o-mini']
    case 'gpt-4o-mini':
      return ['gpt-4o-mini', 'gpt-5-mini']
    case 'gpt-5-mini':
      return ['gpt-5-mini', 'gpt-4o-mini']
    case 'gpt-5.4-mini':
      return ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']
    default:
      return ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini']
  }
}

function mainChatOpenAiModelsForPlanDailyUsage(
  usedTokensToday: number,
  tier: PlanDailyOpenAiTierEdge,
): string[] {
  const u = Number.isFinite(usedTokensToday) && usedTokensToday >= 0 ? usedTokensToday : 0
  const threshold = Math.max(0, tier.tier1TokenBudget)
  if (u >= threshold) {
    return openAiChainForTierModelId(tier.tier2ModelId)
  }
  return openAiChainForTierModelId(tier.tier1ModelId)
}

async function fetchSubscriptionUsedTokensToday(
  admin: SupabaseClient | null,
  userId: string,
): Promise<number | null> {
  if (!admin) {
    return null
  }
  const { data, error } = await admin
    .from('subscription_usages')
    .select('used_tokens')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[chat-completion] subscription_usages used_tokens', error.message)
    return null
  }
  const raw = data?.used_tokens
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw))
  }
  return 0
}

type UsdRates = { inPerM: number; outPerM: number }

function costFromTokens(tokens: number, usdPerMillion: number): number {
  return (Math.max(0, tokens) / 1_000_000) * usdPerMillion
}

/** Gleiche Tarif-Logik wie `src/features/auth/utils/aiModelPricing.ts` (Edge Function dupliziert). */
function openAiRatesForEstimate(model: string): UsdRates | null {
  const m = model.toLowerCase()
  const tryMatch = (predicate: (s: string) => boolean, rates: UsdRates): UsdRates | null =>
    predicate(m) ? rates : null
  return (
    tryMatch((s) => s.includes('gpt-4o-mini'), { inPerM: 0.15, outPerM: 0.6 }) ??
    tryMatch((s) => s.includes('gpt-4o-2024-05-13'), { inPerM: 5, outPerM: 15 }) ??
    tryMatch((s) => s.includes('gpt-4o') && !s.includes('mini'), { inPerM: 2.5, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-5-nano'), { inPerM: 0.05, outPerM: 0.4 }) ??
    tryMatch((s) => s === 'gpt-5.4', { inPerM: 4, outPerM: 16 }) ??
    tryMatch((s) => s.includes('gpt-5.4-mini'), { inPerM: 0.75, outPerM: 4.5 }) ??
    tryMatch((s) => s.includes('gpt-5-mini'), { inPerM: 0.25, outPerM: 2 }) ??
    tryMatch((s) => s.includes('gpt-5-pro'), { inPerM: 15, outPerM: 120 }) ??
    tryMatch((s) => /gpt-5(\.|$|-)/.test(s) || s === 'gpt-5', { inPerM: 1.25, outPerM: 10 }) ??
    tryMatch((s) => s.includes('gpt-4.1-nano'), { inPerM: 0.1, outPerM: 0.4 }) ??
    tryMatch((s) => s.includes('gpt-4.1-mini'), { inPerM: 0.4, outPerM: 1.6 }) ??
    tryMatch((s) => s.includes('gpt-4.1'), { inPerM: 2, outPerM: 8 }) ??
    tryMatch((s) => s.includes('o4-mini'), { inPerM: 1.1, outPerM: 4.4 }) ??
    tryMatch((s) => s.includes('o3-mini') || s.includes('o1-mini'), { inPerM: 1.1, outPerM: 4.4 }) ??
    tryMatch((s) => s.includes('gpt-3.5-turbo'), { inPerM: 0.5, outPerM: 1.5 }) ??
    null
  )
}

function anthropicRatesForEstimate(model: string): UsdRates | null {
  const m = model.toLowerCase()
  if (m.includes('opus')) {
    return { inPerM: 15, outPerM: 75 }
  }
  if (m.includes('haiku')) {
    return { inPerM: 0.8, outPerM: 4 }
  }
  if (m.includes('claude') || m.includes('sonnet')) {
    return { inPerM: 3, outPerM: 15 }
  }
  return null
}

function estimateAiUsageUsd(
  provider: Provider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = provider === 'anthropic' ? anthropicRatesForEstimate(model) : openAiRatesForEstimate(model)
  if (!rates) {
    return 0
  }
  return costFromTokens(inputTokens, rates.inPerM) + costFromTokens(outputTokens, rates.outPerM)
}

/**
 * Schwelle in USD: ab dieser kumulierten geschätzten Kosten wird `ECONOMY_OPENAI_CHAT_MODELS` genutzt.
 * Optional: `AI_OPENAI_COST_DOWNGRADE_THRESHOLD_USD` setzen (überschreibt CHF).
 * Sonst: `AI_OPENAI_PREMIUM_MODEL_MAX_CHF` (Default 2) × `AI_USD_PER_CHF` (Default 1.14, USD je 1 CHF).
 */
function getPremiumBudgetThresholdUsd(): number {
  const direct = Deno.env.get('AI_OPENAI_COST_DOWNGRADE_THRESHOLD_USD')?.trim()
  if (direct) {
    const n = Number(direct)
    if (Number.isFinite(n) && n > 0) {
      return n
    }
  }
  const maxChf = Number(Deno.env.get('AI_OPENAI_PREMIUM_MODEL_MAX_CHF') ?? '2')
  const usdPerChf = Number(Deno.env.get('AI_USD_PER_CHF') ?? '1.14')
  const mc = Number.isFinite(maxChf) && maxChf > 0 ? maxChf : 2
  const fx = Number.isFinite(usdPerChf) && usdPerChf > 0 ? usdPerChf : 1.14
  return mc * fx
}

function openAiChatModelsForCumulativeCost(cumulativeUsd: number): string[] {
  if (cumulativeUsd >= getPremiumBudgetThresholdUsd()) {
    return [...ECONOMY_OPENAI_CHAT_MODELS]
  }
  return [...DEFAULT_OPENAI_CHAT_MODELS]
}

async function getUserCumulativeEstimatedCostUsd(
  admin: SupabaseClient | null,
  userId: string,
): Promise<number> {
  if (!admin) {
    return 0
  }
  const { data, error } = await admin.rpc('sum_user_ai_estimated_cost_usd', { p_user_id: userId })
  if (error) {
    console.error('[chat-completion] sum_user_ai_estimated_cost_usd failed', error.message)
    return 0
  }
  const n = typeof data === 'number' ? data : Number(data)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

type PlanChatFields = {
  chat_allow_model_choice: boolean
  default_chat_model_id: string | null
  dailyOpenAiTier: PlanDailyOpenAiTierEdge
  thinkingOpenAiTier: PlanDailyOpenAiTierEdge
}

async function fetchSubscriptionPlanChatFields(
  admin: SupabaseClient | null,
  userId: string,
): Promise<PlanChatFields | null> {
  if (!admin) {
    return null
  }
  const { data, error } = await admin
    .from('profiles')
    .select(
      'subscription_plans ( chat_allow_model_choice, default_chat_model_id, chat_daily_tier1_openai_model_id, chat_daily_tier1_token_budget, chat_daily_tier2_openai_model_id, thinking_tier1_openai_model_id, thinking_tier1_token_budget, thinking_tier2_openai_model_id )',
    )
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[chat-completion] subscription plan read failed', error.message)
    return null
  }
  const rel = (data as { subscription_plans?: unknown } | null)?.subscription_plans
  const plan = Array.isArray(rel) ? rel[0] : rel
  if (!plan || typeof plan !== 'object') {
    return null
  }
  const p = plan as Record<string, unknown>
  const budgetRaw = p.chat_daily_tier1_token_budget
  const budget =
    typeof budgetRaw === 'number' && Number.isFinite(budgetRaw)
      ? Math.max(0, Math.floor(budgetRaw))
      : DEFAULT_PLAN_DAILY_OPENAI_TIER.tier1TokenBudget
  const thinkingBudgetRaw = p.thinking_tier1_token_budget
  const thinkingBudget =
    typeof thinkingBudgetRaw === 'number' && Number.isFinite(thinkingBudgetRaw)
      ? Math.max(0, Math.floor(thinkingBudgetRaw))
      : DEFAULT_PLAN_THINKING_OPENAI_TIER.tier1TokenBudget
  return {
    chat_allow_model_choice: p.chat_allow_model_choice !== false,
    default_chat_model_id: typeof p.default_chat_model_id === 'string' ? p.default_chat_model_id : null,
    dailyOpenAiTier: {
      tier1ModelId: parseTierOpenAiModelId(p.chat_daily_tier1_openai_model_id),
      tier1TokenBudget: budget,
      tier2ModelId: parseTierOpenAiModelId(p.chat_daily_tier2_openai_model_id),
    },
    thinkingOpenAiTier: {
      tier1ModelId: parseTierOpenAiModelId(p.thinking_tier1_openai_model_id),
      tier1TokenBudget: thinkingBudget,
      tier2ModelId: parseTierOpenAiModelId(p.thinking_tier2_openai_model_id),
    },
  }
}

function sanitizeLearnModelId(raw: unknown): LearnModelId {
  if (
    raw === 'gpt-5.4' ||
    raw === 'gpt-5.4-mini' ||
    raw === 'gpt-5-mini' ||
    raw === 'gpt-4o-mini' ||
    raw === 'claude-sonnet-4-6' ||
    raw === 'claude-3-5-haiku-latest'
  ) {
    return raw
  }
  return 'gpt-5.4-mini'
}

type LearnAiConfig = { provider: Provider; model: LearnModelId }

function normalizeLearnModelForProvider(provider: Provider, model: LearnModelId): LearnModelId {
  const isOpenAiModel =
    model === 'gpt-5.4' || model === 'gpt-5.4-mini' || model === 'gpt-5-mini' || model === 'gpt-4o-mini'
  if (provider === 'openai') {
    return isOpenAiModel ? model : 'gpt-5.4-mini'
  }
  return isOpenAiModel ? 'claude-sonnet-4-6' : model
}

async function fetchActiveLearnAiConfig(admin: SupabaseClient | null): Promise<LearnAiConfig> {
  if (!admin) {
    return { provider: 'openai', model: 'gpt-5.4-mini' }
  }
  try {
    const { data, error } = await admin
      .from('app_feature_flags')
      .select('learn_ai_provider_active, learn_ai_model_active')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      return { provider: 'openai', model: 'gpt-5.4-mini' }
    }
    const rawProvider =
      typeof (data as { learn_ai_provider_active?: unknown } | null)?.learn_ai_provider_active === 'string'
        ? String((data as { learn_ai_provider_active?: string }).learn_ai_provider_active).trim().toLowerCase()
        : ''
    const provider: Provider = rawProvider === 'anthropic' ? 'anthropic' : 'openai'
    const model = sanitizeLearnModelId(
      (data as { learn_ai_model_active?: unknown } | null)?.learn_ai_model_active,
    )
    return { provider, model: normalizeLearnModelForProvider(provider, model) }
  } catch {
    return { provider: 'openai', model: 'gpt-5.4-mini' }
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeProvider(value: unknown): Provider {
  return value === 'anthropic' ? 'anthropic' : 'openai'
}

/** Optional: Modellreihenfolge für OpenAI-Chat (Client sendet für Lernpfad z. B. `gpt-5.4` zuerst). */
function sanitizeOpenAiModelsOverride(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const t = item.trim()
    if (t.length > 0 && t.length <= 120 && out.length < 12) {
      out.push(t)
    }
  }
  return out.length > 0 ? out : null
}

/** Einzelnes Claude-Modell (Chat); z. B. aus Composer-Auswahl. */
function sanitizeAnthropicModelOverride(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const t = value.trim()
  if (t.length === 0 || t.length > 120) {
    return null
  }
  if (!/^claude-[a-z0-9._-]+$/i.test(t)) {
    return null
  }
  return t
}

function normalizeMode(
  value: unknown,
):
  | 'chat'
  | 'learn_setup_topic'
  | 'learn_entry_quiz'
  | 'learn_tutor'
  | 'evaluate_quiz'
  | 'generate_title'
  | 'instant_analyze'
  | 'thinking_analyze'
  | 'generate_topic_suggestions'
  | 'generate_flashcards'
  | 'generate_worksheet'
  | 'merge_ai_chat_memory' {
  const v = typeof value === 'string' ? value.trim() : value
  if (v === 'learn_setup_topic') {
    return 'learn_setup_topic'
  }
  if (v === 'learn_entry_quiz') {
    return 'learn_entry_quiz'
  }
  if (v === 'learn_tutor') {
    return 'learn_tutor'
  }
  if (v === 'merge_ai_chat_memory') {
    return 'merge_ai_chat_memory'
  }
  if (v === 'evaluate_quiz') {
    return 'evaluate_quiz'
  }
  if (v === 'generate_title') {
    return 'generate_title'
  }
  if (v === 'instant_analyze') {
    return 'instant_analyze'
  }
  if (v === 'thinking_analyze') {
    return 'thinking_analyze'
  }
  if (v === 'generate_topic_suggestions') {
    return 'generate_topic_suggestions'
  }
  if (v === 'generate_flashcards') {
    return 'generate_flashcards'
  }
  if (v === 'generate_worksheet') {
    return 'generate_worksheet'
  }
  return 'chat'
}

function chapterOutlineFromBody(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const o = payload as { chapterOutline?: unknown }
  return typeof o.chapterOutline === 'string' ? o.chapterOutline.trim() : ''
}

function sanitizeQuizEvaluationPayload(value: unknown): QuizEvaluationPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Record<string, unknown>
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  const expectedAnswer = typeof payload.expectedAnswer === 'string' ? payload.expectedAnswer.trim() : ''
  const userAnswer = typeof payload.userAnswer === 'string' ? payload.userAnswer.trim() : ''
  const acceptableAnswers = Array.isArray(payload.acceptableAnswers)
    ? payload.acceptableAnswers
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined

  if (!question || !expectedAnswer || !userAnswer) {
    return null
  }

  return {
    question,
    expectedAnswer,
    acceptableAnswers,
    userAnswer,
  }
}

function parseQuizEvaluationResult(raw: string): QuizEvaluationResult {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('KI Bewertung konnte nicht als JSON gelesen werden.')
  }

  const jsonChunk = trimmed.slice(start, end + 1)
  const parsed = JSON.parse(jsonChunk) as { isCorrect?: unknown; feedback?: unknown }
  const isCorrect = parsed.isCorrect === true
  const feedback =
    typeof parsed.feedback === 'string' && parsed.feedback.trim()
      ? parsed.feedback.trim()
      : isCorrect
        ? 'Richtig.'
        : 'Nicht ganz korrekt.'

  return { isCorrect, feedback }
}

async function getProviderApiKey(
  provider: Provider,
): Promise<string> {
  const envKeyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const apiKey = String(Deno.env.get(envKeyName) ?? '').trim()
  if (!apiKey) {
    throw new Error(`API Key für Provider "${provider}" ist nicht als Supabase Secret gesetzt.`)
  }

  return apiKey
}

type AiCallResult = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Cache-Treffer (OpenAI/Anthropic), die nicht erneut verrechnet werden. */
  cachedPromptTokens?: number
}

async function tryLogTokenUsage(
  admin: SupabaseClient | null,
  userId: string,
  provider: Provider,
  mode: string,
  result: AiCallResult,
) {
  if (!admin) {
    return
  }
  const cachedInputTokens = Math.max(0, Math.floor(Number(result.cachedPromptTokens ?? 0)))
  const billableInputTokens = Math.max(0, result.inputTokens - cachedInputTokens)
  const estimated_cost_usd = estimateAiUsageUsd(
    provider,
    result.model,
    billableInputTokens,
    result.outputTokens,
  )
  const { error } = await admin.from('ai_token_usage').insert({
    user_id: userId,
    provider,
    model: result.model.slice(0, 160),
    mode: mode.slice(0, 64),
    input_tokens: billableInputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: result.outputTokens,
    estimated_cost_usd,
  })
  if (error) {
    console.error('[chat-completion] ai_token_usage insert failed', error.message)
  }
  if (cachedInputTokens > 0) {
    console.log(`[chat-completion] OpenAI prompt cache: ${cachedInputTokens} cached input tokens (${mode})`)
  }
}

/** GPT-5 / o-series: Chat Completions erlauben oft nur die Default-Temperatur — feste Werte wie 0.7 → HTTP 400. */
function openAiUsesDefaultTemperatureOnly(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (m.startsWith('gpt-5')) {
    return true
  }
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
    return true
  }
  return false
}

/**
 * Chat Completions: `reasoning` akzeptieren nicht alle GPT-5-IDs — u. a.
 * `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.4-…` → HTTP 400 «Unknown parameter: 'reasoning'.»
 * (`mini`/`nano` separat, da andere Namensmuster möglich sind.)
 */
function openAiChatModelSupportsReasoningEffortParam(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (!m.startsWith('gpt-5')) {
    return false
  }
  if (m.includes('-mini') || m.includes('mini-')) {
    return false
  }
  if (m.includes('-nano') || m.includes('nano-')) {
    return false
  }
  /* Normales gpt-5.4 (ohne «mini») — gleicher 400er wie bei Mini. */
  if (/^gpt-5\.4(?:-|$)/.test(m)) {
    return false
  }
  return true
}

function attachOpenAiMaxOutputTokens(body: Record<string, unknown>, model: string, maxOut: number): void {
  const n = Math.min(32768, Math.max(16, Math.floor(maxOut)))
  const m = model.toLowerCase()
  if (m.includes('gpt-5') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
    body.max_completion_tokens = n
  } else {
    body.max_tokens = n
  }
}

function countOpenAiVisionImageParts(body: Record<string, unknown>): number {
  const msgs = body.messages
  if (!Array.isArray(msgs)) {
    return 0
  }
  let n = 0
  for (const msg of msgs) {
    const content = (msg as { content?: unknown })?.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const part of content) {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'image_url') {
        n += 1
      }
    }
  }
  return n
}

function openAiChatRequestBody(
  model: string,
  messages: InputMessage[],
  options?: {
    includeReasoningLow?: boolean
    promptCache?: OpenAiPromptCacheOptions
    /** Completion-Obergrenze (Chat Completions: je nach Modell max_completion_tokens oder max_tokens). */
    maxOutputTokens?: number
    /** Client-Feld `visionInlineDataUrl` — Fallback wenn `[BildData]`-Parsing fehlschlägt. */
    visionOverrideUrl?: string | null
  },
): Record<string, unknown> {
  const visionOverride =
    typeof options?.visionOverrideUrl === 'string' &&
    options.visionOverrideUrl.trim().startsWith('data:image/')
      ? resolveVisionUrlFromBody(options.visionOverrideUrl.trim())
      : null
  const lastUserIdx = findLastUserMessageIndex(messages)
  const visionIndices = new Set(findOpenAiVisionUserIndices(messages, visionOverride))
  if (visionOverride && lastUserIdx >= 0) {
    visionIndices.add(lastUserIdx)
  }
  let visionPartsAttached = 0
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((message, idx) => {
      if (message.role !== 'user') {
        return {
          role: message.role,
          content: message.content,
        }
      }
      if (visionIndices.size > 0 && !visionIndices.has(idx)) {
        const stripped = stripVisionAttachmentsFromContent(message.content)
        return {
          role: message.role,
          content: stripped || '[Bild im Chatverlauf]',
        }
      }
      if (!visionIndices.has(idx)) {
        return {
          role: message.role,
          content: message.content,
        }
      }
      const parsed = extractUserVisionFromContent(message.content)
      const imageUrl =
        visionOverride && idx === lastUserIdx
          ? visionOverride
          : parsed.imageDataUrls[0] ?? null
      if (!imageUrl) {
        console.warn('[chat-completion] openAiChatRequestBody: no vision URL for user turn', idx)
        const stripped = stripVisionAttachmentsFromContent(message.content)
        return {
          role: message.role,
          content: stripped || 'Der Nutzer hat ein Bild gesendet, aber es konnte nicht geladen werden.',
        }
      }
      visionPartsAttached += 1
      const parts: OpenAiVisionContentPart[] = [
        {
          type: 'text',
          text: parsed.text.trim() || 'Bitte analysiere dieses Bild.',
        },
        {
          type: 'image_url',
          image_url: { url: imageUrl, detail: 'low' as const },
        },
      ]
      return {
        role: message.role,
        content: parts,
      }
    }),
  }
  if (visionOverride && visionPartsAttached === 0 && lastUserIdx >= 0) {
    const parsed = extractUserVisionFromContent(messages[lastUserIdx]!.content)
    const parts: OpenAiVisionContentPart[] = [
      {
        type: 'text',
        text: parsed.text.trim() || 'Bitte analysiere dieses Bild.',
      },
      {
        type: 'image_url',
        image_url: { url: visionOverride, detail: 'low' },
      },
    ]
    const msgs = body.messages as Array<{ role: string; content: unknown }>
    msgs[lastUserIdx] = { role: 'user', content: parts }
    visionPartsAttached = 1
    console.warn('[chat-completion] openAiChatRequestBody: visionOverride force-attached at', lastUserIdx)
  }
  if (!openAiUsesDefaultTemperatureOnly(model)) {
    body.temperature = 0.7
  }
  /** GPT-5 Standard ist «medium» — weniger Reasoning = schnellere Antworten bei Chat Completions. */
  if (options?.includeReasoningLow && openAiChatModelSupportsReasoningEffortParam(model)) {
    body.reasoning = { effort: 'low' }
  }
  const pc = options?.promptCache
  if (pc?.key) {
    body.prompt_cache_key = pc.key
    if (pc.retention === 'in_memory') {
      body.prompt_cache_retention = 'in_memory'
    } else if (pc.retention === '24h' && openAiSupportsExtendedPromptCache(model)) {
      body.prompt_cache_retention = '24h'
    }
  }
  if (typeof options?.maxOutputTokens === 'number' && Number.isFinite(options.maxOutputTokens)) {
    attachOpenAiMaxOutputTokens(body, model, options.maxOutputTokens)
  }
  return body
}

function parseOpenAiErrorMessage(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as { error?: { message?: string } | string }
    if (typeof parsed.error === 'string') {
      return parsed.error.trim()
    }
    if (typeof parsed.error?.message === 'string') {
      return parsed.error.message.trim()
    }
  } catch {
    /* ignore */
  }
  return ''
}

function formatOpenAiHttpError(status: number, errorText: string): string {
  const apiMsg = parseOpenAiErrorMessage(errorText)
  const lower = `${apiMsg} ${errorText}`.toLowerCase()

  if (status === 429) {
    if (
      lower.includes('insufficient_quota') ||
      lower.includes('billing') ||
      lower.includes('exceeded your current quota')
    ) {
      return (
        'OpenAI-Kontingent aufgebraucht (429). Bitte Guthaben/Billing im OpenAI-Dashboard prüfen oder später erneut versuchen.' +
        (apiMsg ? ` (${apiMsg})` : '')
      )
    }
    return apiMsg
      ? `OpenAI ist gerade überlastet (429): ${apiMsg} Bitte 30–60 Sekunden warten und erneut senden.`
      : 'OpenAI ist gerade überlastet (zu viele Anfragen). Bitte 30–60 Sekunden warten und erneut senden.'
  }

  if (status === 402 || lower.includes('insufficient_quota')) {
    return (
      'OpenAI-Guthaben reicht nicht aus. Bitte Billing im OpenAI-Dashboard prüfen.' +
      (apiMsg ? ` (${apiMsg})` : '')
    )
  }

  if (apiMsg) {
    return `OpenAI Anfrage fehlgeschlagen (${status}): ${apiMsg}`
  }
  return `OpenAI Anfrage fehlgeschlagen (${status}).`
}

function isOpenAiPromptCacheRejection(status: number, errorText: string): boolean {
  if (status !== 400) {
    return false
  }
  const e = errorText.toLowerCase()
  return e.includes('prompt_cache') || e.includes('prompt cache')
}

async function callOpenAi(
  messages: InputMessage[],
  apiKey: string,
  models?: string[],
  promptCache?: OpenAiPromptCacheOptions,
  maxOutputTokens?: number,
  visionOverrideUrl?: string | null,
): Promise<AiCallResult> {
  const modelsToTry =
    Array.isArray(models) && models.length > 0 ? models : DEFAULT_OPENAI_CHAT_MODELS

  for (const model of modelsToTry) {
    const reasoningSteps = openAiChatModelSupportsReasoningEffortParam(model)
      ? ([true, false] as const)
      : ([false] as const)

    for (const includeReasoningLow of reasoningSteps) {
      let activePromptCache: OpenAiPromptCacheOptions | undefined = promptCache
      let strippedPromptCache = false

      while (true) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            openAiChatRequestBody(model, messages, {
              includeReasoningLow,
              promptCache: activePromptCache,
              maxOutputTokens,
              visionOverrideUrl,
            }),
          ),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[chat-completion] OpenAI HTTP error', response.status, errorText.slice(0, 800))
          const errLower = errorText.toLowerCase()

          if (!strippedPromptCache && activePromptCache && isOpenAiPromptCacheRejection(response.status, errorText)) {
            activePromptCache = undefined
            strippedPromptCache = true
            continue
          }

          const reasoningRejected =
            includeReasoningLow &&
            response.status === 400 &&
            (errLower.includes("unknown parameter: 'reasoning'") ||
              errLower.includes('unknown parameter: "reasoning"') ||
              (errLower.includes('reasoning') && errLower.includes('unknown parameter')))

          if (reasoningRejected) {
            break
          }

          const modelUnavailable =
          response.status === 400 &&
          (errorText.includes('model') || errorText.includes('does not exist') || errorText.includes('not found'))

          if (modelUnavailable && model !== modelsToTry[modelsToTry.length - 1]) {
            break
          }

          throw new Error(formatOpenAiHttpError(response.status, errorText))
        }

        const data = (await response.json()) as {
        model?: string
        choices?: Array<{ message?: { content?: string } }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          prompt_tokens_details?: { cached_tokens?: number }
        }
      }
      const content = data.choices?.[0]?.message?.content?.trim()
        if (content) {
          const usedModel = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : model
          const inputTokens = Math.max(0, Math.floor(Number(data.usage?.prompt_tokens ?? 0)))
          const outputTokens = Math.max(0, Math.floor(Number(data.usage?.completion_tokens ?? 0)))
          const cachedPromptTokens = Math.max(
            0,
            Math.floor(Number(data.usage?.prompt_tokens_details?.cached_tokens ?? 0)),
          )
          return {
            text: content,
            model: usedModel,
            inputTokens,
            outputTokens,
            ...(cachedPromptTokens > 0 ? { cachedPromptTokens } : {}),
          }
        }
        break
      }
    }
  }

  throw new Error('OpenAI hat keine Antwort geliefert.')
}

async function* iterateOpenAiSseBytes(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{
  delta?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
  model?: string
}> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      carry += decoder.decode(value, { stream: true })
      while (true) {
        const sep = carry.indexOf('\n\n')
        if (sep === -1) {
          break
        }
        const block = carry.slice(0, sep)
        carry = carry.slice(sep + 2)
        for (const line of block.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            return
          }
          try {
            const json = JSON.parse(data) as Record<string, unknown>
            const model = typeof json.model === 'string' ? json.model : undefined
            const usage = json.usage as
              | {
                  prompt_tokens?: number
                  completion_tokens?: number
                  prompt_tokens_details?: { cached_tokens?: number }
                }
              | undefined
            const choices = json.choices as Array<Record<string, unknown>> | undefined
            const delta = choices?.[0]?.delta as Record<string, unknown> | undefined
            const content = delta?.content
            const deltaText = typeof content === 'string' && content.length > 0 ? content : undefined
            if (model || deltaText || usage) {
              yield { delta: deltaText, usage, model }
            }
          } catch {
            /* unparseable line */
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** SSE an den Browser: `data: {"type":"delta","t":"..."}\n\n` und abschließend `done` oder `error`. */
async function handleOpenAiChatStream(
  userId: string,
  admin: SupabaseClient | null,
  messages: InputMessage[],
  apiKey: string,
  openAiModels: string[],
  promptCache?: OpenAiPromptCacheOptions,
  maxOutputTokens?: number,
  visionOverrideUrl?: string | null,
): Promise<Response> {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  const writeSse = async (obj: unknown) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
  }

  ;(async () => {
    let closed = false
    try {
      const modelsToTry: string[] = [...openAiModels]

      outer: for (const model of modelsToTry) {
        const reasoningSteps = openAiChatModelSupportsReasoningEffortParam(model)
          ? ([true, false] as const)
          : ([false] as const)
        let visionImageParts = 0

        inner: for (const includeReasoningLow of reasoningSteps) {
          let includeUsageFlag = true
          let activePromptCache: OpenAiPromptCacheOptions | undefined = promptCache
          let strippedPromptCache = false

          while (true) {
            const reqBody: Record<string, unknown> = {
              ...openAiChatRequestBody(model, messages, {
                includeReasoningLow,
                promptCache: activePromptCache,
                maxOutputTokens,
                visionOverrideUrl,
              }),
              stream: true,
            }
            if (includeUsageFlag) {
              reqBody.stream_options = { include_usage: true }
            }
            visionImageParts = countOpenAiVisionImageParts(reqBody)
            if (visionImageParts > 0) {
              console.log('[chat-completion] openAi vision request', {
                model,
                imageParts: visionImageParts,
                lastUserIdx: findLastUserMessageIndex(messages),
              })
            } else if (visionOverrideUrl) {
              console.warn('[chat-completion] openAi vision request without image_url parts', {
                model,
                overrideLen:
                  typeof visionOverrideUrl === 'string' ? visionOverrideUrl.trim().length : 0,
              })
            }

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(reqBody),
            })

            if (!res.ok) {
              const errorText = await res.text()
              console.error('[chat-completion] OpenAI stream HTTP error', res.status, errorText.slice(0, 600))
              const errLower = errorText.toLowerCase()

              if (
                includeUsageFlag &&
                res.status === 400 &&
                (errLower.includes('stream_options') ||
                  errLower.includes('include_usage'))
              ) {
                includeUsageFlag = false
                continue
              }

              if (!strippedPromptCache && activePromptCache && isOpenAiPromptCacheRejection(res.status, errorText)) {
                activePromptCache = undefined
                strippedPromptCache = true
                continue
              }

              const reasoningRejected =
                includeReasoningLow &&
                res.status === 400 &&
                (errLower.includes("unknown parameter: 'reasoning'") ||
                  errLower.includes('unknown parameter: "reasoning"') ||
                  (errLower.includes('reasoning') && errLower.includes('unknown parameter')))

              if (reasoningRejected) {
                continue inner
              }

              const modelUnavailable =
                res.status === 400 &&
                (errorText.includes('model') ||
                  errorText.includes('does not exist') ||
                  errorText.includes('not found'))

              if (modelUnavailable && model !== modelsToTry[modelsToTry.length - 1]) {
                continue outer
              }

              await writeSse({
                type: 'error',
                message: formatOpenAiHttpError(res.status, errorText),
              })
              closed = true
              break outer
            }

            if (!res.body) {
              continue inner
            }

            let fullText = ''
            let usedModel = model
            let inputTokens = 0
            let outputTokens = 0
            let cachedPromptTokens = 0

            try {
              for await (const chunk of iterateOpenAiSseBytes(res.body)) {
                if (chunk.model) {
                  usedModel = chunk.model
                }
                if (chunk.delta) {
                  fullText += chunk.delta
                  await writeSse({ type: 'delta', t: chunk.delta })
                }
                if (chunk.usage) {
                  const pt = Math.max(0, Math.floor(Number(chunk.usage.prompt_tokens ?? 0)))
                  const ct = Math.max(0, Math.floor(Number(chunk.usage.completion_tokens ?? 0)))
                  inputTokens = Math.max(inputTokens, pt)
                  outputTokens = Math.max(outputTokens, ct)
                  const cachedThisChunk = Math.max(
                    0,
                    Math.floor(Number(chunk.usage.prompt_tokens_details?.cached_tokens ?? 0)),
                  )
                  /* Mehrere Stream-Chunks können `usage` liefern; fehlt `cached_tokens` in einem späteren Chunk, darf der Hit nicht auf 0 zurückfallen. */
                  cachedPromptTokens = Math.max(cachedPromptTokens, cachedThisChunk)
                }
              }
            } catch (readErr) {
              console.error('[chat-completion] OpenAI stream read error', readErr)
              await writeSse({
                type: 'error',
                message: readErr instanceof Error ? readErr.message : 'Stream Lesefehler',
              })
              closed = true
              break outer
            }

            const trimmed = fullText.trim()
            if (!trimmed) {
              continue inner
            }

            await tryLogTokenUsage(admin, userId, 'openai', 'chat', {
              text: trimmed,
              model: usedModel,
              inputTokens,
              outputTokens,
              ...(cachedPromptTokens > 0 ? { cachedPromptTokens } : {}),
            })
            await writeSse({
              type: 'done',
              model: usedModel,
              inputTokens,
              outputTokens,
              visionDebug: {
                imageParts: visionImageParts,
                overrideLen:
                  typeof visionOverrideUrl === 'string' ? visionOverrideUrl.trim().length : 0,
                overrideResolved: Boolean(
                  typeof visionOverrideUrl === 'string' &&
                    resolveVisionUrlFromBody(visionOverrideUrl.trim()),
                ),
              },
            })
            closed = true
            break outer
          }
        }
      }

      if (!closed) {
        await writeSse({ type: 'error', message: 'OpenAI Streaming lieferte keinen Text.' })
      }
    } catch (e) {
      await writeSse({
        type: 'error',
        message: e instanceof Error ? e.message : 'Unbekannter Streamfehler',
      })
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Anthropic-Calls (wenn `provider: anthropic`): Sonnet (per Secret ANTHROPIC_MODEL überschreibbar).
 * Lernpfad nutzt im Client jetzt `provider: openai` + GPT-5 mini; dieser Pfad bleibt für explizite Claude-Requests.
 */
function anthropicLearnModel(): string {
  const fromEnv = Deno.env.get('ANTHROPIC_MODEL')?.trim()
  return fromEnv || 'claude-sonnet-4-6'
}

type AnthropicCallOptions = {
  maxTokens?: number
  model?: string
}

async function callAnthropic(
  messages: InputMessage[],
  apiKey: string,
  options?: AnthropicCallOptions,
): Promise<AiCallResult> {
  const model = options?.model ?? anthropicLearnModel()
  const max_tokens = options?.maxTokens ?? 4096
  const systemRaw =
    messages.find((message) => message.role === 'system')?.content?.trim() ??
    'Du bist ein hilfreicher Assistent.'
  // Aggressiv: System-Prompt immer als cachebarer Block markieren.
  const system: Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> = [
    { type: 'text', text: systemRaw, cache_control: { type: 'ephemeral' } },
  ]
  const dialog = messages.filter((message) => message.role === 'user' || message.role === 'assistant')
  const lastDynamicStart = Math.max(0, dialog.length - 2)
  let lastUserDialogIdx = -1
  for (let i = dialog.length - 1; i >= 0; i -= 1) {
    if (dialog[i]?.role === 'user') {
      lastUserDialogIdx = i
      break
    }
  }
  const anthropicMessages = dialog.map((message, index) => {
    const shouldCache = index < lastDynamicStart
    if (message.role === 'assistant') {
      if (shouldCache) {
        return {
          role: message.role,
          content: [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' as const } }],
        }
      }
      return {
        role: message.role,
        content: message.content,
      }
    }
    const userContent = buildAnthropicUserMessageContent(
      message.content,
      index === lastUserDialogIdx,
    )
    if (shouldCache && typeof userContent === 'string') {
      return {
        role: message.role,
        content: [{ type: 'text', text: userContent, cache_control: { type: 'ephemeral' as const } }],
      }
    }
    return {
      role: message.role,
      content: userContent,
    }
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Erforderlich, damit Prompt-Caching (cache_control) zuverlässig aktiv ist.
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      messages: anthropicMessages,
      system,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    if (response.status === 429) {
      throw new Error(
        'Claude Rate-Limit erreicht (zu viele Tokens pro Minute). Bitte Anfrage verkürzen oder kurz warten.',
      )
    }
    const hint =
      response.status === 404
        ? ' (Modell-ID unbekannt/retired? Secret ANTHROPIC_MODEL prüfen oder Edge Function deployen.)'
        : ''
    throw new Error(
      `Anthropic Anfrage fehlgeschlagen (${response.status}).${hint}${errBody ? ` ${errBody.slice(0, 400)}` : ''}`,
    )
  }

  const data = (await response.json()) as {
    model?: string
    content?: Array<{ type?: string; text?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  const content = data.content?.find((entry) => entry.type === 'text')?.text?.trim()
  if (!content) {
    throw new Error('Anthropic hat keine Antwort geliefert.')
  }

  const usedModel = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : model
  const inputTokens = Math.max(0, Math.floor(Number(data.usage?.input_tokens ?? 0)))
  const outputTokens = Math.max(0, Math.floor(Number(data.usage?.output_tokens ?? 0)))
  const cachedPromptTokens = Math.max(0, Math.floor(Number(data.usage?.cache_read_input_tokens ?? 0)))
  return {
    text: content,
    model: usedModel,
    inputTokens,
    outputTokens,
    ...(cachedPromptTokens > 0 ? { cachedPromptTokens } : {}),
  }
}

function uniqueAnthropicModelIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    const t = raw.trim()
    if (!t || seen.has(t)) {
      continue
    }
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Reihenfolge für Chat: gewünschtes Modell, dann Opus-Fallback, dann ANTHROPIC_MODEL / Sonnet. */
function buildAnthropicChatModelChain(override: string | null): string[] {
  const fallback = anthropicLearnModel()
  const raw = typeof override === 'string' ? override.trim() : ''
  if (!raw) {
    return [fallback]
  }
  const chain: string[] = [raw]
  const lower = raw.toLowerCase()
  if (lower.includes('opus')) {
    chain.push('claude-opus-4-6')
  }
  chain.push(fallback)
  return uniqueAnthropicModelIds(chain)
}

function isRetryableAnthropicChatModelError(message: string): boolean {
  const m = message.toLowerCase()
  if (m.includes('rate-limit') || m.includes('429') || m.includes('zu viele tokens')) {
    return false
  }
  return (
    m.includes('404') ||
    m.includes('not_found') ||
    m.includes('does not exist') ||
    m.includes('invalid model') ||
    m.includes('model_id') ||
    (m.includes('400') && m.includes('model'))
  )
}

async function callAnthropicFirstSuccessful(
  messages: InputMessage[],
  apiKey: string,
  modelsToTry: string[],
  maxTokens: number,
): Promise<AiCallResult> {
  const chain = uniqueAnthropicModelIds(modelsToTry.length > 0 ? modelsToTry : [anthropicLearnModel()])
  let lastErr: Error | null = null
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!
    try {
      return await callAnthropic(messages, apiKey, { model, maxTokens })
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const last = i === chain.length - 1
      if (last || !isRetryableAnthropicChatModelError(lastErr.message)) {
        throw lastErr
      }
    }
  }
  throw lastErr ?? new Error('Anthropic: Modellkette fehlgeschlagen.')
}

async function evaluateQuizWithAi(
  provider: Provider,
  payload: QuizEvaluationPayload,
  apiKey: string,
  openAiModels: string[],
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ evaluation: QuizEvaluationResult; usage: AiCallResult }> {
  const acceptableAnswers = payload.acceptableAnswers?.length
    ? payload.acceptableAnswers.join(' | ')
    : '(keine)'

  const evaluationMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du bist ein strenger, aber fairer Prüfungs-Korrektor.',
        'Bewerte semantisch, nicht nur exakt wortgleich.',
        'Antworte ausschließlich als JSON Objekt ohne weiteren Text.',
        'Schema: {"isCorrect": boolean, "feedback": string}',
        'feedback kurz halten (max 220 Zeichen), auf Deutsch.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Frage: ${payload.question}`,
        `Erwartete Antwort: ${payload.expectedAnswer}`,
        `Alternative Antworten: ${acceptableAnswers}`,
        `Antwort vom Nutzer: ${payload.userAnswer}`,
      ].join('\n'),
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(evaluationMessages, apiKey, { maxTokens: 512 })
      : await callOpenAi(evaluationMessages, apiKey, openAiModels, openAiPromptCache)

  return { evaluation: parseQuizEvaluationResult(usage.text), usage }
}

function sanitizeGeneratedTitle(raw: string): string {
  const compact = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return ''
  }
  return compact.length > 42 ? compact.slice(0, 42).trim() : compact
}

/** Titel: kurze Ausgabe — Output-Tokens begrenzen (Kosten). */
const GENERATE_TITLE_MAX_OUTPUT_TOKENS = 100
/** Chat-Titel (Instant + Thinking): günstig, kein GPT-5.4-mini aus der Hauptchat-Staffel. */
const GENERATE_TITLE_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o'] as const

/** Smart Instant — Einordnung (JSON). */
const INSTANT_ANALYZE_MAX_OUTPUT_TOKENS = 280
const INSTANT_ANALYZE_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o'] as const

type InstantAnalyzePayloadEdge = {
  clarity: 'clear' | 'partial' | 'vague'
  intent: string
  missing: string[]
  reply_mode: 'ask_only' | 'one_step' | 'short_answer' | 'normal'
  needs_live_web: boolean
  web_query: string
  web_reason: string
}

function clipInstantAnalyzeText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const t = value.trim()
  if (!t) {
    return ''
  }
  return t.length > max ? t.slice(0, max).trim() : t
}

function sanitizeInstantAnalyzePayload(raw: unknown): InstantAnalyzePayloadEdge | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const clarityRaw = typeof o.clarity === 'string' ? o.clarity.trim() : ''
  const clarity =
    clarityRaw === 'clear' || clarityRaw === 'partial' || clarityRaw === 'vague' ? clarityRaw : 'partial'
  const replyRaw = typeof o.reply_mode === 'string' ? o.reply_mode.trim() : ''
  let reply_mode:
    | 'ask_only'
    | 'one_step'
    | 'short_answer'
    | 'normal' =
    replyRaw === 'ask_only' ||
    replyRaw === 'one_step' ||
    replyRaw === 'short_answer' ||
    replyRaw === 'normal'
      ? replyRaw
      : 'normal'
  const intent = clipInstantAnalyzeText(o.intent, 120) || 'Allgemeine Anfrage'
  const missing = Array.isArray(o.missing)
    ? o.missing
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => clipInstantAnalyzeText(entry, 80))
        .filter(Boolean)
        .slice(0, 3)
    : []
  let needs_live_web = o.needs_live_web === true
  let web_query = clipInstantAnalyzeText(o.web_query, 120)
  const web_reason = clipInstantAnalyzeText(o.web_reason, 80)
  if (reply_mode === 'ask_only') {
    needs_live_web = false
    web_query = ''
  }
  if (!needs_live_web) {
    web_query = ''
  }
  if (clarity === 'vague' && reply_mode === 'normal') {
    reply_mode = 'ask_only'
    needs_live_web = false
    web_query = ''
  }
  return {
    clarity,
    intent,
    missing,
    reply_mode,
    needs_live_web,
    web_query,
    web_reason,
  }
}

function parseInstantAnalyzeResult(raw: string): InstantAnalyzePayloadEdge {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Instant-Einordnung konnte nicht als JSON gelesen werden.')
  }
  const parsed = sanitizeInstantAnalyzePayload(JSON.parse(trimmed.slice(start, end + 1)))
  if (!parsed) {
    throw new Error('Instant-Einordnung enthielt kein gültiges JSON.')
  }
  return parsed
}

function sanitizeInstantAnalyzeRequestPayload(value: unknown): { userMessage: string; contextBlock: string } | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const payload = value as Record<string, unknown>
  const userMessage = typeof payload.userMessage === 'string' ? payload.userMessage.trim() : ''
  if (!userMessage) {
    return null
  }
  const contextBlock =
    typeof payload.contextBlock === 'string' ? payload.contextBlock.trim().slice(0, 4000) : ''
  return { userMessage: userMessage.slice(0, 8000), contextBlock }
}

/** Thinking — Aufgabenanalyse (JSON) vor Klärungsrunden. */
const THINKING_ANALYZE_MAX_OUTPUT_TOKENS = 420
const THINKING_ANALYZE_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o'] as const

type ThinkingAnalyzePayloadEdge = {
  task_type:
    | 'server_setup'
    | 'software_setup'
    | 'troubleshooting'
    | 'document_summary'
    | 'process_howto'
    | 'decision_planning'
    | 'general_howto'
    | 'other'
  complexity: 'low' | 'medium' | 'high'
  intent: string
  assumptions: string[]
  risks: string[]
  missing_dimensions: Array<{ id: string; label: string; question_hint: string }>
  clarify_rounds_planned: number
  analysis_summary: string
}

function sanitizeThinkingAnalyzePayload(raw: unknown): ThinkingAnalyzePayloadEdge | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const taskRaw = typeof o.task_type === 'string' ? o.task_type.trim() : ''
  const task_type =
    taskRaw === 'server_setup' ||
    taskRaw === 'software_setup' ||
    taskRaw === 'troubleshooting' ||
    taskRaw === 'document_summary' ||
    taskRaw === 'process_howto' ||
    taskRaw === 'decision_planning' ||
    taskRaw === 'general_howto' ||
    taskRaw === 'other'
      ? taskRaw
      : 'other'
  const complexityRaw = typeof o.complexity === 'string' ? o.complexity.trim() : ''
  const complexity =
    complexityRaw === 'low' || complexityRaw === 'medium' || complexityRaw === 'high'
      ? complexityRaw
      : 'medium'
  const intent = clipInstantAnalyzeText(o.intent, 160) || 'Aufgabe bearbeiten'
  const assumptions = Array.isArray(o.assumptions)
    ? o.assumptions
        .filter((e): e is string => typeof e === 'string')
        .map((e) => clipInstantAnalyzeText(e, 100))
        .filter(Boolean)
        .slice(0, 4)
    : []
  const risks = Array.isArray(o.risks)
    ? o.risks
        .filter((e): e is string => typeof e === 'string')
        .map((e) => clipInstantAnalyzeText(e, 100))
        .filter(Boolean)
        .slice(0, 5)
    : []
  const missing_dimensions = Array.isArray(o.missing_dimensions)
    ? o.missing_dimensions
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .map((e) => ({
          id: clipInstantAnalyzeText(e.id, 40),
          label: clipInstantAnalyzeText(e.label, 80),
          question_hint: clipInstantAnalyzeText(e.question_hint, 120),
        }))
        .filter((e) => e.id && e.label)
        .slice(0, 6)
    : []
  let clarify_rounds_planned =
    typeof o.clarify_rounds_planned === 'number' && Number.isFinite(o.clarify_rounds_planned)
      ? Math.round(o.clarify_rounds_planned)
      : 2
  clarify_rounds_planned = Math.min(4, Math.max(1, clarify_rounds_planned))
  const analysis_summary = clipInstantAnalyzeText(o.analysis_summary, 280) || intent
  return {
    task_type,
    complexity,
    intent,
    assumptions,
    risks,
    missing_dimensions,
    clarify_rounds_planned,
    analysis_summary,
  }
}

function parseThinkingAnalyzeResult(raw: string): ThinkingAnalyzePayloadEdge {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Thinking-Analyse konnte nicht als JSON gelesen werden.')
  }
  const parsed = sanitizeThinkingAnalyzePayload(JSON.parse(trimmed.slice(start, end + 1)))
  if (!parsed) {
    throw new Error('Thinking-Analyse enthielt kein gültiges JSON.')
  }
  return parsed
}

async function thinkingAnalyzeWithAi(
  apiKey: string,
  userMessage: string,
  contextBlock: string,
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ analyze: ThinkingAnalyzePayloadEdge; usage: AiCallResult }> {
  const system = [
    'Du analysierst JEDE Nutzeraufgabe für den Straton-Thinking-Modus (nicht nur Server).',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown).',
    'task_type: server_setup | software_setup | troubleshooting | document_summary | process_howto | decision_planning | general_howto | other.',
    'missing_dimensions: 2-6 themenspezifische Infos die noch fehlen (id, label, question_hint) — immer zur konkreten Frage passend.',
    'clarify_rounds_planned: 1-4 je nach complexity und offenen Dimensionen.',
  ].join('\n')
  const userParts = [
    contextBlock ? `Bisheriger Verlauf (Auszug):\n${contextBlock}\n\n` : '',
    `Aktuelle Nutzeranfrage:\n${userMessage}`,
  ].join('')
  const messages: InputMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userParts.trim() },
  ]
  const usage = await callOpenAi(
    messages,
    apiKey,
    [...THINKING_ANALYZE_OPENAI_MODELS],
    openAiPromptCache,
    THINKING_ANALYZE_MAX_OUTPUT_TOKENS,
  )
  const analyze = parseThinkingAnalyzeResult(usage.text)
  return { analyze, usage }
}

async function instantAnalyzeWithAi(
  apiKey: string,
  userMessage: string,
  contextBlock: string,
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ analyze: InstantAnalyzePayloadEdge; usage: AiCallResult }> {
  const system = [
    'Du ordnest eine Nutzeranfrage für den Straton-Hauptchat (Instant) ein.',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, kein Text davor oder danach).',
    'Felder: clarity ("clear"|"partial"|"vague"), intent (max 120 Zeichen), missing (Array max 3),',
    'reply_mode ("ask_only"|"one_step"|"short_answer"|"normal"), needs_live_web (boolean),',
    'web_query (max 120, nur wenn needs_live_web), web_reason (max 80, nur wenn needs_live_web).',
    'Bei reply_mode "ask_only": needs_live_web false und web_query leer.',
    'Bei vager Anfrage ohne Kernkontext: reply_mode "ask_only".',
    'needs_live_web true bei: Aktienkurs/Ticker, Preise, News, «aktuell/aktuelle/aktuellen/derzeit/derzeitige/heutige/jetzige/gegenwärtig/momentan/neueste»,',
    '«aktuelle Information», «derzeitige Regelung», Delikte/Strafen mit Zeitbezug, Produktversionen, Termine.',
    'Beispiel: «Aktuellste Information zu Raserdelikt in der Schweiz» → needs_live_web true,',
    'web_query «Raserdelikt Schweiz Gesetzeslage aktuell».',
    'needs_live_web false nur ohne Zeitbezug (allgemeine Erklärung, Coding, Mathe, reine Meinung).',
  ].join('\n')
  const userParts = [
    contextBlock ? `Bisheriger Verlauf (Auszug):\n${contextBlock}\n\n` : '',
    `Aktuelle Nutzeranfrage:\n${userMessage}`,
  ].join('')
  const messages: InputMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userParts.trim() },
  ]
  const usage = await callOpenAi(
    messages,
    apiKey,
    [...INSTANT_ANALYZE_OPENAI_MODELS],
    openAiPromptCache,
    INSTANT_ANALYZE_MAX_OUTPUT_TOKENS,
  )
  const analyze = parseInstantAnalyzeResult(usage.text)
  return { analyze, usage }
}

async function generateTitleWithAi(
  provider: Provider,
  sourceMessages: InputMessage[],
  apiKey: string,
  openAiModels: string[],
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ title: string; usage: AiCallResult }> {
  const transcript = sourceMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  const titleMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Erzeuge einen kurzen Chat-Titel auf Deutsch.',
        'Maximal 6 Wörter und maximal 42 Zeichen.',
        'Nur den Titel ausgeben, ohne Anführungszeichen und ohne Satzzeichen am Ende.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: transcript || 'Allgemeiner Chat',
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(titleMessages, apiKey, { maxTokens: GENERATE_TITLE_MAX_OUTPUT_TOKENS })
      : await callOpenAi(
          titleMessages,
          apiKey,
          [...GENERATE_TITLE_OPENAI_MODELS],
          openAiPromptCache,
          GENERATE_TITLE_MAX_OUTPUT_TOKENS,
        )

  const cleaned = sanitizeGeneratedTitle(usage.text)
  if (!cleaned) {
    throw new Error('Titel konnte nicht generiert werden.')
  }
  return { title: cleaned, usage }
}

function sanitizeTopicSuggestions(raw: string): string[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 5)
  } catch {
    return []
  }
}

type FlashcardPayload = {
  question: string
  answer: string
}

type WorksheetPromptPayload = {
  prompt: string
}

function stripLeadingMarkdownCodeFence(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    const firstNl = t.indexOf('\n')
    if (firstNl !== -1) {
      t = t.slice(firstNl + 1)
    }
    const fence = t.lastIndexOf('```')
    if (fence !== -1) {
      t = t.slice(0, fence).trim()
    }
  }
  return t
}

function worksheetPromptFromEntry(o: Record<string, unknown>): string {
  const keys = ['prompt', 'question', 'task', 'text', 'aufgabe', 'content', 'title'] as const
  for (const key of keys) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return ''
}

function parseWorksheetPromptsFromRaw(raw: string): WorksheetPromptPayload[] {
  const trimmed = stripLeadingMarkdownCodeFence(raw.trim())
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const out: WorksheetPromptPayload[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const prompt = worksheetPromptFromEntry(o)
      if (prompt) {
        out.push({ prompt })
      }
    }
    return out.slice(0, 12)
  } catch {
    return []
  }
}

function parseFlashcardsFromRaw(raw: string): FlashcardPayload[] {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const out: FlashcardPayload[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const question = typeof o.question === 'string' ? o.question.trim() : ''
      const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
      if (question && answer) {
        out.push({ question, answer })
      }
    }
    return out.slice(0, 16)
  } catch {
    return []
  }
}

async function generateFlashcardsWithAi(
  provider: Provider,
  chapterOutline: string,
  apiKey: string,
  openAiModels: string[],
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ flashcards: FlashcardPayload[]; usage: AiCallResult }> {
  const outline = chapterOutline.trim()
  if (!outline) {
    throw new Error('Keine Kapiteldaten für Lernkarten.')
  }

  const flashcardMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst Lernkarten (Karteikarten) für Berufsfachschule EFZ — kaufmännischer Bereich (KV-Lehre).',
        'Nutze NUR den mitgelieferten Kapiteltext — erfinde keine neuen Themen.',
        'Antworte ausschließlich mit einem JSON-Array, kein Text davor oder danach.',
        'Schema: [{"question":"kurze Frage","answer":"kurze Antwort (1-3 Sätze)"}]',
        'Lege die Anzahl der Karten selbst fest (mindestens 6, höchstens 16) — nur zu den Schwachstellen/Lernlücken im Text, nicht den ganzen Stoff breit wiederholen.',
        'Auf Deutsch, fachlich korrekt.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Gespeicherte Kapitelinhalte (Auszug):\n\n${outline.slice(0, 28000)}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(flashcardMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(flashcardMessages, apiKey, openAiModels, openAiPromptCache)

  const cards = parseFlashcardsFromRaw(usage.text)
  if (cards.length === 0) {
    throw new Error('Lernkarten konnten nicht aus der KI-Antwort gelesen werden.')
  }
  return { flashcards: cards, usage }
}

async function generateWorksheetWithAi(
  provider: Provider,
  chapterOutline: string,
  apiKey: string,
  openAiModels: string[],
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ prompts: WorksheetPromptPayload[]; usage: AiCallResult }> {
  const outline = chapterOutline.trim()
  if (!outline) {
    throw new Error('Keine Kapiteldaten für Arbeitsblatt.')
  }

  const worksheetMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst ein Arbeitsblatt mit Aufgaben (nur Fragen/Aufgabenstellungen, keine Musterlösung im JSON).',
        'Nutze NUR den mitgelieferten Kapiteltext — erfinde keine neuen Themen.',
        'Antworte ausschließlich mit einem JSON-Array, kein Text davor oder danach.',
        'Schema: [{"prompt":"klare Aufgabenstellung in 1-3 Sätzen"}]',
        'Lege die Anzahl der Aufgaben selbst fest (mindestens 4, höchstens 12) — passend zum Umfang der Schwachstellen im Text.',
        'Auf Deutsch, fachlich korrekt, zum handschriftlichen Bearbeiten geeignet.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Gespeicherte Kapitelinhalte (Auszug):\n\n${outline.slice(0, 28000)}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(worksheetMessages, apiKey, { maxTokens: 4096 })
      : await callOpenAi(worksheetMessages, apiKey, openAiModels, openAiPromptCache)

  const items = parseWorksheetPromptsFromRaw(usage.text)
  if (items.length === 0) {
    throw new Error('Arbeitsblatt konnte nicht aus der KI-Antwort gelesen werden.')
  }
  return { prompts: items, usage }
}

async function generateTopicSuggestionsWithAi(
  provider: Provider,
  topic: string,
  apiKey: string,
  openAiModels: string[],
  openAiPromptCache?: OpenAiPromptCacheOptions,
): Promise<{ suggestions: string[]; usage: AiCallResult }> {
  const suggestionMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du erstellst konkrete Unterthemen für Lernen.',
        'Antworte nur als JSON-Array mit Strings.',
        'Liefere maximal 5 kurze, konkrete Unterthemen auf Deutsch.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Thema: ${topic}`,
    },
  ]

  const usage =
    provider === 'anthropic'
      ? await callAnthropic(suggestionMessages, apiKey, { maxTokens: 1024 })
      : await callOpenAi(suggestionMessages, apiKey, openAiModels, openAiPromptCache)

  const suggestions = sanitizeTopicSuggestions(usage.text)
  if (suggestions.length === 0) {
    throw new Error('Unterthemen konnten nicht generiert werden.')
  }
  return { suggestions, usage }
}

/** Mit `src/features/chat/constants/aiChatMemory.ts` (AI_CHAT_MEMORY_MAX_TOKENS) übereinstimmen. */
const MAX_AI_CHAT_MEMORY_TOKENS = 1000

function estimateAiChatMemoryTokensFromLength(length: number): number {
  return Math.max(1, Math.ceil(length / 4))
}

function clipAiChatMemoryText(raw: string): string {
  const t = raw.trim()
  if (t.length === 0) {
    return t
  }
  if (estimateAiChatMemoryTokensFromLength(t.length) <= MAX_AI_CHAT_MEMORY_TOKENS) {
    return t
  }
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (estimateAiChatMemoryTokensFromLength(mid) <= MAX_AI_CHAT_MEMORY_TOKENS) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return t.slice(0, lo)
}

function stripOuterMarkdownFence(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    const firstNl = t.indexOf('\n')
    if (firstNl !== -1) {
      t = t.slice(firstNl + 1)
    }
    const lastFence = t.lastIndexOf('```')
    if (lastFence !== -1) {
      t = t.slice(0, lastFence)
    }
  }
  return t.trim()
}

function injectAiChatMemoryIntoMessages(messages: InputMessage[], memoryText: string): InputMessage[] {
  const block: InputMessage = {
    role: 'system',
    content: [
      'Langfristiger Nutzerkontext (über Chats gespeichert; vertraulich behandeln):',
      memoryText,
      'Nutze diese Angaben nur, wenn sie zur aktuellen Frage passen; wiederhole sie nicht in jeder Antwort wortwörtlich.',
    ].join('\n\n'),
  }
  if (messages.length > 0 && messages[0].role === 'system') {
    return [messages[0], block, ...messages.slice(1)]
  }
  return [block, ...messages]
}

async function handleMergeAiChatMemory(
  userClient: SupabaseClient,
  admin: SupabaseClient | null,
  userId: string,
  body: unknown,
  apiKey: string,
): Promise<Response> {
  const payload =
    body && typeof body === 'object'
      ? (body as { payload?: unknown }).payload
      : undefined
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const userMessage = typeof p?.userMessage === 'string' ? p.userMessage.trim().slice(0, 12000) : ''
  const assistantMessage =
    typeof p?.assistantMessage === 'string' ? p.assistantMessage.trim().slice(0, 48000) : ''

  if (!userMessage || !assistantMessage) {
    return jsonResponse({ error: 'Ungültige Daten für Speicher-Merge.' }, 400)
  }

  const { data: row, error: rowErr } = await userClient
    .from('profiles')
    .select('ai_chat_memory, ai_chat_memory_enabled')
    .eq('id', userId)
    .maybeSingle()

  if (rowErr) {
    console.error('[chat-completion] merge memory profile read', rowErr.message)
    return jsonResponse({ error: 'Profil konnte nicht gelesen werden.' }, 500)
  }
  if (!row) {
    return jsonResponse({ error: 'Profil nicht gefunden.' }, 404)
  }
  if (row.ai_chat_memory_enabled === false) {
    const stored = typeof row.ai_chat_memory === 'string' ? row.ai_chat_memory : ''
    return jsonResponse({
      skipped: true,
      ai_chat_memory: clipAiChatMemoryText(stored),
    })
  }

  const previousFull = typeof row.ai_chat_memory === 'string' ? row.ai_chat_memory.trim() : ''
  const previous = clipAiChatMemoryText(previousFull)

  const mergeMessages: InputMessage[] = [
    {
      role: 'system',
      content: [
        'Du pflegst eine kurze Merkliste über den Nutzer für einen persönlichen Chat-Assistenten.',
        'Regeln:',
        '- Ausgabe NUR als Stichpunkte auf Deutsch, Zeilen mit «- ».',
        `- Die gesamte Merkliste darf höchstens etwa ${MAX_AI_CHAT_MEMORY_TOKENS} Tokens haben (Schätzung: etwa 4 Zeichen pro Token).`,
        '- Wenn das Limit erreicht wäre: zusammenfassen, Dubletten entfernen, weniger Relevantes / Altes streichen; wichtige und aktuelle Punkte behalten.',
        '- KEINE Passwörter, API-Schlüssel, vollständigen Adressen oder sensible Gesundheitsdetails.',
        '- Nur zuverlässige Infos aus dem Gespräch; nichts erfinden.',
        '- Wenn nichts Neues hinzukommt, gib die bisherigen Notizen fast unverändert zurück.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        previous ? `Bisherige Notizen:\n${previous}` : 'Bisherige Notizen: (leer)',
        '',
        'Neueste Nutzernachricht:',
        userMessage,
        '',
        'Neueste Assistentenantwort:',
        assistantMessage,
      ].join('\n'),
    },
  ]

  const usage = await callOpenAi(mergeMessages, apiKey, ['gpt-5-mini', 'gpt-4o-mini'], undefined)
  await tryLogTokenUsage(admin, userId, 'openai', 'merge_ai_chat_memory', usage)

  const nextMemory = clipAiChatMemoryText(stripOuterMarkdownFence(usage.text))

  const { error: upErr } = await userClient.from('profiles').update({ ai_chat_memory: nextMemory }).eq('id', userId)

  if (upErr) {
    console.error('[chat-completion] merge memory profile write', upErr.message)
    return jsonResponse({ error: 'Speicher konnte nicht gespeichert werden.' }, 500)
  }

  return jsonResponse({ ai_chat_memory: nextMemory })
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
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }

  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungültig.' }, 401)
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin: SupabaseClient | null = serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null

  const cumulativeUsd = await getUserCumulativeEstimatedCostUsd(admin, user.id)
  const openAiModelsFromCost = openAiChatModelsForCumulativeCost(cumulativeUsd)
  const planChatFields = await fetchSubscriptionPlanChatFields(admin, user.id)

  try {
    const body = (await req.json()) as {
      mode?: unknown
      provider?: unknown
      messages?: unknown
      payload?: { messages?: unknown; topic?: unknown } | unknown
      /** Optional: max. Ausgabe-Tokens (v. a. Anthropic Chat / Excel-Spec). */
      maxTokens?: unknown
      /** `true`: nur OpenAI-Hauptchat — SSE (`text/event-stream`) statt JSON. */
      stream?: unknown
      /** Optional: OpenAI-Modellreihenfolge (Chat); sonst Budget-basierte Liste. */
      openAiModels?: unknown
      /** Optional: Claude-Modell-ID für Chat (Composer). */
      anthropicModel?: unknown
      /** OpenAI Prompt Caching: stabiler Key pro Prompt-Prefix (Chat: vom Client). */
      promptCacheKey?: unknown
      /** Optional: `24h` nur wenn das gewählte OpenAI-Modell extended caching unterstützt. */
      promptCacheRetention?: unknown
      /** Nur bei `true`: gespeicherten Nutzer-Kontext für den Hauptchat einfügen (nicht Excel/Lernpfad). */
      includeProfileMemory?: unknown
      /** Thinking-Modus: 1 Guthaben pro Anfrage (`consume_one_thinking_credit`). */
      billingConsumeThinkingCredit?: unknown
      /** Client: Foto-Data-URL für Vision (nicht in DB; iOS-Pfad). */
      visionInlineDataUrl?: unknown
    }
    const openAiModelsOverride = sanitizeOpenAiModelsOverride(body.openAiModels)
    let openAiModels = openAiModelsOverride ?? openAiModelsFromCost
    let anthropicModelChat = sanitizeAnthropicModelOverride(body.anthropicModel)
    let mode = normalizeMode(body.mode)
    const outlinePreview = chapterOutlineFromBody(body.payload)
    // Ohne gültigen mode landet ein Lernkarten-Request sonst im Chat-Zweig (leere messages → 400).
    if (mode === 'chat' && outlinePreview) {
      mode = 'generate_flashcards'
    }

    if (mode === 'merge_ai_chat_memory') {
      const apiKeyMerge = await getProviderApiKey('openai')
      return await handleMergeAiChatMemory(userClient, admin, user.id, body, apiKeyMerge)
    }

    let provider = normalizeProvider(body.provider)
    if (mode === 'learn_setup_topic' || mode === 'learn_entry_quiz' || mode === 'learn_tutor') {
      const learnAiConfig = await fetchActiveLearnAiConfig(admin)
      provider = learnAiConfig.provider
      if (provider === 'openai') {
        openAiModels = [learnAiConfig.model, ...DEFAULT_OPENAI_CHAT_MODELS]
      } else {
        anthropicModelChat = learnAiConfig.model
      }
    }

    if (
      mode === 'chat' &&
      provider === 'openai' &&
      body.includeProfileMemory === true &&
      admin &&
      planChatFields?.chat_allow_model_choice === false
    ) {
      const usedToday = await fetchSubscriptionUsedTokensToday(admin, user.id)
      if (usedToday !== null) {
        const tier = planChatFields?.dailyOpenAiTier ?? DEFAULT_PLAN_DAILY_OPENAI_TIER
        openAiModels = mainChatOpenAiModelsForPlanDailyUsage(usedToday, tier)
      }
    }

    if (
      mode === 'chat' &&
      provider === 'openai' &&
      body.billingConsumeThinkingCredit === true &&
      admin
    ) {
      const usedTodayThink = await fetchSubscriptionUsedTokensToday(admin, user.id)
      if (usedTodayThink !== null) {
        const thinkTier = planChatFields?.thinkingOpenAiTier ?? DEFAULT_PLAN_THINKING_OPENAI_TIER
        openAiModels = mainChatOpenAiModelsForPlanDailyUsage(usedTodayThink, thinkTier)
      }
    }

    const apiKey = await getProviderApiKey(provider)
    const clientPromptCacheKey = sanitizePromptCacheKey(body.promptCacheKey)
    const clientPromptCacheRetention = sanitizePromptCacheRetention(body.promptCacheRetention)

    if (mode === 'evaluate_quiz') {
      const payload = sanitizeQuizEvaluationPayload(body.payload)
      if (!payload) {
        return jsonResponse({ error: 'Ungültige Bewertungsdaten übermittelt.' }, 400)
      }

      const openAiPc = provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest(mode, clientPromptCacheKey, clientPromptCacheRetention)
        : undefined
      const { evaluation, usage } = await evaluateQuizWithAi(
        provider,
        payload,
        apiKey,
        openAiModels,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ evaluation })
    }

    if (mode === 'generate_topic_suggestions') {
      const topic = typeof (body.payload as { topic?: unknown } | undefined)?.topic === 'string'
        ? String((body.payload as { topic?: unknown }).topic).trim()
        : ''
      if (!topic) {
        return jsonResponse({ error: 'Kein gültiges Thema übermittelt.' }, 400)
      }
      const openAiPc = provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest(mode, clientPromptCacheKey, clientPromptCacheRetention)
        : undefined
      const { suggestions, usage } = await generateTopicSuggestionsWithAi(
        provider,
        topic,
        apiKey,
        openAiModels,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ suggestions })
    }

    if (mode === 'generate_flashcards') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext für Lernkarten übermittelt.' }, 400)
      }
      const openAiPc = provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest(mode, clientPromptCacheKey, clientPromptCacheRetention)
        : undefined
      const { flashcards, usage } = await generateFlashcardsWithAi(
        provider,
        outline,
        apiKey,
        openAiModels,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ flashcards })
    }

    if (mode === 'generate_worksheet') {
      const outline = outlinePreview
      if (!outline) {
        return jsonResponse({ error: 'Kein Kapitelkontext für Arbeitsblatt übermittelt.' }, 400)
      }
      const openAiPc = provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest(mode, clientPromptCacheKey, clientPromptCacheRetention)
        : undefined
      const { prompts, usage } = await generateWorksheetWithAi(
        provider,
        outline,
        apiKey,
        openAiModels,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ worksheetItems: prompts })
    }

    const inputMessages =
      mode === 'generate_title'
        ? Array.isArray((body.payload as { messages?: unknown } | undefined)?.messages)
          ? ((body.payload as { messages?: unknown }).messages as unknown[])
          : []
        : Array.isArray(body.messages)
          ? body.messages
          : []

    const messages: InputMessage[] = inputMessages
      .map((message) => {
        const role = typeof message?.role === 'string' ? message.role : 'user'
        const content = typeof message?.content === 'string' ? message.content.trim() : ''
        if (!content) {
          return null
        }
        if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          return null
        }
        return {
          role,
          content,
        } as InputMessage
      })
      .filter((entry): entry is InputMessage => entry !== null)

    if (messages.length === 0) {
      return jsonResponse({ error: 'Keine gültigen Nachrichten übermittelt.' }, 400)
    }

    if (mode === 'generate_title') {
      if (provider === 'openai') {
        openAiModels = [...GENERATE_TITLE_OPENAI_MODELS]
      }
      const openAiPc = provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest(mode, clientPromptCacheKey, clientPromptCacheRetention)
        : undefined
      const { title, usage } = await generateTitleWithAi(provider, messages, apiKey, openAiModels, openAiPc)
      await tryLogTokenUsage(admin, user.id, provider, mode, usage)
      return jsonResponse({ title })
    }

    if (mode === 'instant_analyze') {
      const analyzePayload = sanitizeInstantAnalyzeRequestPayload(body.payload)
      if (!analyzePayload) {
        return jsonResponse({ error: 'Keine gültige Nutzeranfrage für Instant-Einordnung.' }, 400)
      }
      const openAiKey = await getProviderApiKey('openai')
      const openAiPc = resolveOpenAiPromptCacheForRequest(
        'instant_analyze',
        clientPromptCacheKey,
        clientPromptCacheRetention,
      )
      const { analyze, usage } = await instantAnalyzeWithAi(
        openAiKey,
        analyzePayload.userMessage,
        analyzePayload.contextBlock,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, 'openai', mode, usage)
      return jsonResponse({ analyze })
    }

    if (mode === 'thinking_analyze') {
      const analyzePayload = sanitizeInstantAnalyzeRequestPayload(body.payload)
      if (!analyzePayload) {
        return jsonResponse({ error: 'Keine gültige Nutzeranfrage für Thinking-Analyse.' }, 400)
      }
      const openAiKey = await getProviderApiKey('openai')
      const openAiPc = resolveOpenAiPromptCacheForRequest(
        'thinking_analyze',
        clientPromptCacheKey,
        clientPromptCacheRetention,
      )
      const { analyze, usage } = await thinkingAnalyzeWithAi(
        openAiKey,
        analyzePayload.userMessage,
        analyzePayload.contextBlock,
        openAiPc,
      )
      await tryLogTokenUsage(admin, user.id, 'openai', mode, usage)
      return jsonResponse({ analyze })
    }

    const includeProfileMemory = body.includeProfileMemory === true
    let chatMessages = messages
    if (mode === 'chat' && includeProfileMemory) {
      const { data: memRow } = await userClient
        .from('profiles')
        .select('ai_chat_memory, ai_chat_memory_enabled')
        .eq('id', user.id)
        .maybeSingle()
      const enabled = memRow && memRow.ai_chat_memory_enabled !== false
      const memRaw = typeof memRow?.ai_chat_memory === 'string' ? memRow.ai_chat_memory.trim() : ''
      const memText = clipAiChatMemoryText(memRaw)
      if (enabled && memText.length > 0) {
        chatMessages = injectAiChatMemoryIntoMessages(messages, memText)
      }
    }

    if (mode === 'chat') {
      chatMessages = sanitizeInputMessages(
        injectWordExportMarkdownConventionSystemMessage(chatMessages),
      )
    } else {
      chatMessages = sanitizeInputMessages(chatMessages)
    }

    if (mode === 'chat' && body.billingConsumeThinkingCredit === true) {
      const { data: profThink } = await userClient
        .from('profiles')
        .select('is_superadmin')
        .eq('id', user.id)
        .maybeSingle()
      const thinkSuperadmin = profThink?.is_superadmin === true
      if (!thinkSuperadmin) {
        const { error: thinkConsumeErr } = await userClient.rpc('consume_one_thinking_credit')
        if (thinkConsumeErr) {
          const em = String(thinkConsumeErr.message ?? '')
          if (em.includes('THINKING_LIMIT')) {
            return jsonResponse(
              {
                error: 'THINKING_LIMIT',
                message:
                  'Dein Thinking-Guthaben ist aufgebraucht. Es wird täglich (UTC) entsprechend deinem Abo wieder aufgeladen.',
              },
              402,
            )
          }
          return jsonResponse(
            { error: em || 'Thinking-Guthaben konnte nicht gebucht werden.' },
            500,
          )
        }
      }
    }

    const rawMax = body.maxTokens
    const chatMaxTokens =
      typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 64
        ? Math.min(16384, Math.floor(rawMax))
        : undefined

    const visionInlineRaw =
      typeof body.visionInlineDataUrl === 'string' ? body.visionInlineDataUrl.trim() : ''
    const resolvedVisionUrl =
      visionInlineRaw.startsWith('data:image/') ? resolveVisionUrlFromBody(visionInlineRaw) : null
    if (visionInlineRaw.startsWith('data:image/')) {
      console.log('[chat-completion] vision body', {
        rawLen: visionInlineRaw.length,
        resolved: Boolean(resolvedVisionUrl),
        resolvedLen: resolvedVisionUrl?.length ?? 0,
      })
    }
    const chatHasVision =
      mode === 'chat' &&
      (chatMessages.some((m) => m.role === 'user' && messageContentHasVisionPayload(m.content)) ||
        Boolean(resolvedVisionUrl))
    if (chatHasVision) {
      chatMessages = await resolveChatMessagesVisionForOpenAi(
        chatMessages,
        userClient,
        resolvedVisionUrl ?? (visionInlineRaw.startsWith('data:image/') ? visionInlineRaw : null),
        admin,
      )
      if (provider === 'openai') {
        /** Nur echte Vision-Modelle — GPT-5.x antwortet sonst oft «ich sehe kein Bild». */
        openAiModels = ['gpt-4o', 'gpt-4o-mini']
      }
    }

    if (body.stream === true && mode === 'chat' && provider === 'openai') {
      const openAiPc = resolveOpenAiPromptCacheForRequest('chat', clientPromptCacheKey, clientPromptCacheRetention)
      return await handleOpenAiChatStream(
        user.id,
        admin,
        chatMessages,
        apiKey,
        openAiModels,
        openAiPc,
        chatMaxTokens,
        resolvedVisionUrl ?? (visionInlineRaw.startsWith('data:image/') ? visionInlineRaw : null),
      )
    }

    const openAiChatPc =
      provider === 'openai'
        ? resolveOpenAiPromptCacheForRequest('chat', clientPromptCacheKey, clientPromptCacheRetention)
        : undefined

    const chatUsage =
      provider === 'anthropic'
        ? await callAnthropicFirstSuccessful(
            chatMessages,
            apiKey,
            buildAnthropicChatModelChain(anthropicModelChat),
            chatMaxTokens ?? 8192,
          )
        : await callOpenAi(
            chatMessages,
            apiKey,
            openAiModels,
            openAiChatPc,
            chatMaxTokens,
            resolvedVisionUrl ?? (visionInlineRaw.startsWith('data:image/') ? visionInlineRaw : null),
          )

    await tryLogTokenUsage(admin, user.id, provider, mode, chatUsage)

    return jsonResponse({
      assistantMessage: {
        role: 'assistant',
        content: chatUsage.text,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})