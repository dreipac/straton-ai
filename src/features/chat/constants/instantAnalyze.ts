export type InstantAnalyzeClarity = 'clear' | 'partial' | 'vague'

export type InstantAnalyzeReplyMode = 'ask_only' | 'one_step' | 'short_answer' | 'normal'

import type { InstantAnalyzeDebugMeta } from '../types'

export type InstantAnalyzeInvokeResult = {
  analyze: InstantAnalyzeResult
  source: 'edge' | 'fallback'
  /** KI-Rohwert vor Client-Heuristik (nur bei source edge). */
  analyzeFromAi?: InstantAnalyzeResult
}

export type InstantAnalyzeResult = {
  clarity: InstantAnalyzeClarity
  intent: string
  missing: string[]
  reply_mode: InstantAnalyzeReplyMode
  needs_live_web: boolean
  web_query: string
  web_reason: string
}

const REPLY_MODES: InstantAnalyzeReplyMode[] = ['ask_only', 'one_step', 'short_answer', 'normal']
const CLARITY_VALUES: InstantAnalyzeClarity[] = ['clear', 'partial', 'vague']

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

function asStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => clipText(entry, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function buildInstantAnalyzeSystemPrompt(): string {
  return [
    'Du ordnest eine Nutzeranfrage für den Straton-Hauptchat (Instant) ein.',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, kein Text davor oder danach).',
    '',
    'Felder:',
    '- clarity: "clear" | "partial" | "vague"',
    '- intent: kurze Beschreibung der Nutzerabsicht (max. 120 Zeichen, Deutsch)',
    '- missing: Array mit max. 3 fehlenden Infos (Strings, je max. 80 Zeichen); leer wenn klar genug',
    '- reply_mode:',
    '  - "ask_only": zu wenig Kontext — kurze Einordnung + genau eine Klärungsfrage im Fliesstext, keine nummerierte Fragenliste, keine Lösungsschritte',
    '  - "one_step": konkretes Problem — ein Prüfschritt / eine klare Kurzantwort',
    '  - "short_answer": einfache Wissens- oder How-to-Frage mit klarer Zielsetzung',
    '  - "normal": Standardantwort mit angemessener Tiefe',
    '- needs_live_web: true wenn aktuelle Web-Fakten nötig sind (Preise, Kurse, News, Gesetzes-/Rechtslage, «aktuellste Information», Entwicklungen, Versionen, Termine)',
    '- web_query: optimierte Suchanfrage auf Deutsch (max. 120 Zeichen), nur wenn needs_live_web true, sonst ""',
    '- web_reason: kurzer Grund (max. 80 Zeichen), nur wenn needs_live_web true, sonst ""',
    '',
    'Regeln:',
    '- Bei clarity "vague" oder fehlendem Kernkontext: reply_mode "ask_only", needs_live_web false, web_query "".',
    '- Bei reply_mode "ask_only": needs_live_web MUSS false sein.',
    '- «Wer bin ich», «wie heisse ich», «kennst du mich», «was weisst du über mich»: reply_mode "short_answer", clarity "partial" — keine ask_only-Fragenliste.',
    '- needs_live_web false bei reinen Erklärungen, Coding-Hilfe ohne Zeitbezug, persönlichen Meinungsfragen, Mathe, allgemeinem Dauerwissen ohne «aktuell/neueste».',
    '- needs_live_web true bei «aktuell», «aktuelle/aktuellen/aktueller/aktuelles», «derzeit/derzeitige», «heute/heutige», «jetzt/jetzige», «gegenwärtig», «momentan», «neueste/neueren», «jüngste», «2025/2026», Gesetzeslage/Rechtslage, Delikte/Strafen «aktuell», Börsenkurs, Ticker (z. B. S.TO), Produktversion, Verfügbarkeit.',
    '- Formulierungen wie «aktuelle Information», «neueste Lage», «derzeitige Regelung», «was gilt jetzt» → needs_live_web true (auch ohne Börsenkurs).',
    '- Beispiel: «aktueller Kurs von Sherritt (S.TO)» → needs_live_web true, web_query «Sherritt S.TO Aktienkurs heute».',
    '- Beispiel: «Aktuellste Information zu Raserdelikt in der Schweiz» → needs_live_web true, web_query «Raserdelikt Schweiz Gesetzeslage aktuell».',
    '- web_query präzise formulieren (Thema + Land/Sprache wenn erkennbar), nicht den Rohtext 1:1 kopieren.',
  ].join('\n')
}

export function sanitizeInstantAnalyzeResult(raw: unknown): InstantAnalyzeResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const clarityRaw = typeof o.clarity === 'string' ? o.clarity.trim() : ''
  const clarity = CLARITY_VALUES.includes(clarityRaw as InstantAnalyzeClarity)
    ? (clarityRaw as InstantAnalyzeClarity)
    : 'partial'
  const replyRaw = typeof o.reply_mode === 'string' ? o.reply_mode.trim() : ''
  let reply_mode = REPLY_MODES.includes(replyRaw as InstantAnalyzeReplyMode)
    ? (replyRaw as InstantAnalyzeReplyMode)
    : 'normal'
  const intent = clipText(o.intent, 120) || 'Allgemeine Anfrage'
  const missing = asStringArray(o.missing, 3, 80)
  let needs_live_web = o.needs_live_web === true
  let web_query = clipText(o.web_query, 120)
  const web_reason = clipText(o.web_reason, 80)

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

/** Zeit-/Aktualitäts-Signale: aktuell, aktuelle, derzeitige, heutige, … */
const LIVE_WEB_TIME_RE =
  /\b(?:aktuell\w*|aktuelle|aktuellen|aktueller|aktuelles|heut\w*|jetzt\w*|jetzige\w*|derzeit\w*|zurzeit|gegenwärtig\w*|gegenwaertig\w*|momentan\w*|neuest\w*|neuer\w*|jüngst\w*|jungst\w*|gerade|live|currently|latest|recent(?:ly)?|up[\s-]?to[\s-]?date|stand\s*(?:vom|von)?|as\s+of|was\s+gilt\s+jetzt)\b/i
const LIVE_WEB_INFO_RE =
  /\b(?:information\w*|infos|lage|entwicklung\w*|situation|übersicht|uebersicht|überblick|ueberblick|status|update\w*|meldungen|daten|zahlen|werte|stand|version\w*|verfügbarkeit|verfuegbarkeit)\b/i
const LIVE_WEB_LEGAL_RE =
  /\b(gesetz\w*|recht\w*|delikt\w*|straf\w*|verordnung\w*|regelung\w*|rechtslage|bußgeld|busgeld|verkehrs\w*|strafr\w*|tatbestand\w*|raser\w*)\b/i
const LIVE_WEB_MARKET_RE =
  /\b(aktienkurs|börsenkurs|kurs|kursverlauf|preis|wechselkurs|stock\s+price|share\s+price|quote|ticker|aktie|börse|trading|marktkapitalisierung|dividende)\b/i
const LIVE_WEB_NEWS_RE =
  /\b(deal|abkommen|vereinbarung|vertrag|nachrichten|news|meldung|ereignis|entscheidung|ankündigung|gipfel|konflikt|krieg|wahl|gesetz|reform|sanktion)\b/i
const LIVE_WEB_TICKER_RE = /\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b|\([A-Z]{1,5}(?:\.[A-Z]{1,3})?\)/
const LIVE_WEB_DATE_RE =
  /\b(20[2-9]\d)\b|\b\d{1,2}\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(20[2-9]\d)?\b/i

/** «aktuelle Information», «derzeitige Lage», «heutiger Kurs», … */
const LIVE_WEB_CURRENT_PHRASE_RE =
  /\b(?:aktuell\w*|aktuelle|aktuellen|aktueller|aktuelles|derzeit\w*|gegenwärtig\w*|gegenwaertig\w*|momentan\w*|heut\w*|jetzt\w*|jetzige\w*|neuest\w*|jüngst\w*|jungst\w*)\s+(?:information\w*|infos|lage|entwicklung\w*|situation|status|meldungen|nachrichten|news|daten|zahlen|werte|preis\w*|kurs\w*|version\w*|regelung\w*|recht\w*|gesetz\w*|verfügbarkeit|verfuegbarkeit|stand|update\w*)\b/i

const LIVE_WEB_PRICE_STAND_RE =
  /\b(?:was\s+kostet|wie\s+hoch|wie\s+steht|wie\s+viel\s+kostet|was\s+ist\s+(?:der|die|das)\s+(?:aktuelle\w*|neuest\w*|derzeitige\w*|heutige\w*|jetzige\w*))\b/i

const LIVE_WEB_SUPERLATIVE_INFO_RE =
  /\b(?:aktuell\w*|neuest\w*|jüngst\w*|jungst\w*|derzeit\w*|heut\w*|jetzige\w*)\s+(?:information|infos|lage|entwicklung|meldungen|nachrichten|daten|status|stand|preis|kurs|version|regelung|recht|gesetz)\b/i

/** 0 Token — erkennt offensichtliche Live-Fakten-Anfragen (Kurse, News, Rechtslage, «aktuell»). */
export function detectLiveWebHeuristic(userMessage: string): {
  needs: boolean
  webQuery: string
  hasLegalCue: boolean
  hasMarketCue: boolean
} {
  const trimmed = userMessage.trim()
  if (!trimmed) {
    return { needs: false, webQuery: '', hasLegalCue: false, hasMarketCue: false }
  }
  const lower = trimmed.toLowerCase()
  const hasTimeCue = LIVE_WEB_TIME_RE.test(trimmed)
  const hasInfoCue = LIVE_WEB_INFO_RE.test(lower)
  const hasLegalCue = LIVE_WEB_LEGAL_RE.test(lower)
  const hasMarketCue = LIVE_WEB_MARKET_RE.test(trimmed)
  const hasNewsCue = LIVE_WEB_NEWS_RE.test(lower)
  const hasRecentDate = LIVE_WEB_DATE_RE.test(trimmed)
  const tickerMatch = trimmed.match(/\(([A-Z]{1,5}(?:\.[A-Z]{1,3})?)\)/) ?? trimmed.match(LIVE_WEB_TICKER_RE)
  const ticker = tickerMatch?.[1] ?? tickerMatch?.[0] ?? ''

  const needs =
    (hasTimeCue && (hasMarketCue || hasNewsCue || hasInfoCue || hasLegalCue || Boolean(ticker))) ||
    (hasMarketCue && Boolean(ticker)) ||
    (hasNewsCue && (hasTimeCue || hasRecentDate)) ||
    LIVE_WEB_CURRENT_PHRASE_RE.test(lower) ||
    LIVE_WEB_PRICE_STAND_RE.test(lower) ||
    LIVE_WEB_SUPERLATIVE_INFO_RE.test(lower) ||
    (/\b(?:derzeit|zurzeit|momentan|gegenwärtig|gegenwaertig|currently|latest)\b/i.test(lower) &&
      (hasInfoCue || hasNewsCue || hasLegalCue || hasMarketCue))

  if (!needs) {
    return { needs: false, webQuery: '', hasLegalCue, hasMarketCue }
  }

  const webQuery = trimmed.replace(/\?+$/, '').slice(0, 120)

  return {
    needs: true,
    webQuery: webQuery.trim() || trimmed.slice(0, 120),
    hasLegalCue,
    hasMarketCue,
  }
}

/** Erzwingt Tavily, wenn Nutzertext klar Live-Fakten verlangt (auch wenn Mini-Einordnung «nein» sagt). */
const IDENTITY_OR_ACCOUNT_META_RE =
  /\b(wer\s+bin\s+ich|wie\s+hei[sß](?:e|t)?\s+ich|kennst\s+du\s+mich|was\s+wei[sß]t\s+du\s+(?:über\s+)?mich|mein\s+name|identit[aä]t)\b/i

/** Meta-/Identitätsfragen nicht als ask_only mit Fragenliste behandeln. */
export function applyIdentityQuestionHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  if (!IDENTITY_OR_ACCOUNT_META_RE.test(userMessage.trim())) {
    return analyze
  }
  return {
    ...analyze,
    clarity: 'partial',
    reply_mode: 'short_answer',
    missing: [],
    needs_live_web: false,
    web_query: '',
  }
}

export function applyLiveWebHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  const h = detectLiveWebHeuristic(userMessage)
  if (!h.needs) {
    return analyze
  }
  return {
    ...analyze,
    clarity: analyze.clarity === 'vague' ? 'clear' : analyze.clarity,
    needs_live_web: true,
    web_query: analyze.web_query.trim() || h.webQuery,
    web_reason:
      analyze.web_reason.trim() ||
      (h.hasLegalCue && !h.hasMarketCue
        ? 'Aktuelle Rechtslage / Gesetzesinfos'
        : 'Aktuelle Fakten (z. B. Kurs, Preis, News)'),
    reply_mode: analyze.reply_mode === 'ask_only' ? 'short_answer' : analyze.reply_mode,
  }
}

export function fallbackInstantAnalyzeResult(userMessage: string): InstantAnalyzeResult {
  const trimmed = userMessage.trim()
  const vague = trimmed.length < 12 || /^(hilfe|help|hi|hallo|hey|ok|ja|nein)[\s!.?]*$/i.test(trimmed)
  const base: InstantAnalyzeResult = {
    clarity: vague ? 'vague' : 'partial',
    intent: trimmed.slice(0, 120) || 'Allgemeine Anfrage',
    missing: [],
    reply_mode: vague ? 'ask_only' : 'normal',
    needs_live_web: false,
    web_query: '',
    web_reason: '',
  }
  return applyIdentityQuestionHeuristic(trimmed, applyLiveWebHeuristic(trimmed, base))
}

export function buildInstantAnalyzeBriefingInstruction(analyze: InstantAnalyzeResult): string {
  const lines = [
    'Smart Instant — Einordnung (verbindlich für diese Antwort):',
    `Klarheit: ${analyze.clarity}`,
    `Nutzerabsicht: ${analyze.intent}`,
    `Antwortmodus: ${analyze.reply_mode}`,
  ]
  if (analyze.missing.length > 0) {
    lines.push(`Fehlende Infos: ${analyze.missing.join('; ')}`)
  }
  if (analyze.reply_mode === 'ask_only') {
    lines.push(
      'Kurz einordnen, was fehlt; dann **genau eine** Klärungsfrage im Fliesstext — **keine** nummerierte Liste (`1.` `2.` …), keine Schrittfolge, keine erfundenen Fakten.',
    )
  } else if (analyze.reply_mode === 'one_step') {
    lines.push('Ein klarer Prüfschritt oder eine fokussierte Kurzlösung — nicht alles auf einmal.')
  } else if (analyze.reply_mode === 'short_answer') {
    lines.push('Kompakte Antwort — Definition oder kurzes How-to ohne unnötige Ausführung.')
  }
  if (analyze.web_reason && analyze.needs_live_web) {
    lines.push(`Web-Kontext-Grund: ${analyze.web_reason}`)
  }
  return lines.join('\n')
}

export function buildInstantAnalyzeDebugMeta(params: {
  invoke: InstantAnalyzeInvokeResult
  autoWebPlanned: boolean
  autoWebRan: boolean
}): InstantAnalyzeDebugMeta {
  const { invoke, autoWebPlanned, autoWebRan } = params
  const fromAi = invoke.analyzeFromAi ?? invoke.analyze
  const final = invoke.analyze
  const heuristicApplied =
    invoke.source === 'edge' &&
    Boolean(invoke.analyzeFromAi) &&
    (invoke.analyzeFromAi!.needs_live_web !== final.needs_live_web ||
      invoke.analyzeFromAi!.web_query !== final.web_query ||
      invoke.analyzeFromAi!.reply_mode !== final.reply_mode)

  return {
    source: invoke.source,
    clarity: final.clarity,
    intent: final.intent,
    missing: [...final.missing],
    reply_mode: final.reply_mode,
    needs_live_web_from_ai: fromAi.needs_live_web,
    needs_live_web_final: final.needs_live_web,
    heuristic_applied: heuristicApplied,
    web_query: final.web_query,
    web_reason: final.web_reason,
    auto_web_planned: autoWebPlanned,
    auto_web_ran: autoWebRan,
  }
}

export function formatInstantAnalyzeContextLines(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  return turns
    .slice(-6)
    .map((t) => {
      const label = t.role === 'user' ? 'Nutzer' : 'Assistent'
      const body = t.content
        .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild]')
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, '[Bild]')
        .trim()
      const clipped = body.length > 500 ? `${body.slice(0, 500)}…` : body
      return `${label}: ${clipped}`
    })
    .join('\n')
}
