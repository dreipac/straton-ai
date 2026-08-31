export type InstantAnalyzeClarity = 'clear' | 'partial' | 'vague'

export type InstantAnalyzeReplyMode = 'ask_only' | 'one_step' | 'short_answer' | 'normal'

import type {
  InstantAnalyzeDebugMeta,
  PresentationLayoutMetricsMeta,
  PresentationProfileDebugMeta,
} from '../types'
import {
  applyInstantChatTaskTypeHeuristic,
  inferInstantExplanationDepth,
  parseInstantChatTaskType,
  parseInstantExplanationDepth,
  type InstantChatTaskType,
  type InstantExplanationDepth,
} from './chatInstantTaskType'
import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import {
  userAsksDocumentVisibilityQuestion,
  userMessageWantsDocumentSummary,
} from './documentAttachmentIntent'
import {
  userMessageWantsFolderSources,
} from './folderSourceIntent'
import { userMessageSuggestsTableExercise } from './chatTableExerciseInstruction'
import { buildInstantAnalyzeChartBriefing } from './chartExportIntent'
import { buildInstantAnalyzeDiagramBriefing } from './diagramExportIntent'
import {
  buildDocumentExportSummaryTurnBriefing,
  buildInstantAnalyzeDocumentExportBriefing,
} from './documentExportIntent'
import {
  applyRouteHeuristics,
  detectRouteHeuristic,
  parseCategoryActionFields,
  routeFromReplyMode,
  syncReplyModeWithRoute,
  type InstantAnalyzeAction,
  type InstantAnalyzeCategory,
} from './instantAnalyzeRoute'
import {
  extractImageSearchQuery,
  isImageSearchTurnMessage,
  matchImageTopicClarification,
  type ImageSearchPriorTurn,
} from '../utils/imageSearchIntent'
import { resolveDocumentCoverageTopics } from './documentSummaryPlaybook'
import {
  assistantMessageHasGeneratedImage,
  matchImageAttributionQuestion,
  shouldResolveReferencedImageVision,
  userMessageHasUploadedImage,
} from '../utils/referencedImageVision'
import {
  userMessageAsksAboutPriorSubscriptionUsage,
  userMessageRequestsSubscriptionUsage,
} from './chatSubscriptionUsageMarker'
import { assistantGeneratedArtifactContextMarker } from '../utils/generatedArtifactContext'

export type { InstantAnalyzeAction, InstantAnalyzeCategory } from './instantAnalyzeRoute'
export type { InstantChatTaskType, InstantExplanationDepth } from './chatInstantTaskType'

export type InstantAnalyzeInvokeResult = {
  analyze: InstantAnalyzeResult
  source: 'edge' | 'fallback'
  /** KI-Rohwert vor Client-Heuristik (nur bei source edge). */
  analyzeFromAi?: InstantAnalyzeResult
}

export type InstantAnalyzeResult = {
  category: InstantAnalyzeCategory
  action: InstantAnalyzeAction
  clarity: InstantAnalyzeClarity
  intent: string
  missing: string[]
  reply_mode: InstantAnalyzeReplyMode
  needs_live_web: boolean
  web_query: string
  web_reason: string
  /** Nur true bei Whitelist (Multi-Dokument-Vergleich, komplexe Tabellen-Merge) → Gemini 2.5 Flash. */
  escalate_model?: boolean
  escalate_reason?: string
  /** Lernaufgabe: MC lösen, Quiz erzeugen, Erklärung, Zusammenfassung. */
  task_type: InstantChatTaskType
  /** Tiefe bei task_type explanation. */
  explanation_depth: InstantExplanationDepth
  /** Pflicht-Themen aus dem Anhang — nur bei task_type summary. */
  document_coverage_topics?: string[]
  /** Ordner-Dateien als Quelle laden (nur bei Bedarf, nicht pro Turn). */
  use_folder_sources?: boolean
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
  if (clarity === 'vague' && reply_mode === 'ask_only') {
    reply_mode = 'normal'
    needs_live_web = false
    web_query = ''
  }

  const { category, action } = parseCategoryActionFields(o, reply_mode)

  let escalate_model = o.escalate_model === true
  let escalate_reason = clipText(o.escalate_reason, 80)
  if (escalate_model && !isAllowedEscalateReason(escalate_reason)) {
    escalate_model = false
    escalate_reason = ''
  }
  if (!escalate_model) {
    escalate_reason = ''
  }

  const task_type = parseInstantChatTaskType(o.task_type)
  const explanation_depth =
    task_type === 'explanation'
      ? parseInstantExplanationDepth(o.explanation_depth)
      : 'standard'
  const document_coverage_topics =
    task_type === 'summary' ? asStringArray(o.document_coverage_topics, 20, 100) : []
  const use_folder_sources = o.use_folder_sources === true

  return syncReplyModeWithRoute({
    category,
    action,
    clarity,
    intent,
    missing,
    reply_mode,
    needs_live_web,
    web_query,
    web_reason,
    task_type,
    explanation_depth,
    ...(document_coverage_topics.length > 0 ? { document_coverage_topics } : {}),
    ...(use_folder_sources ? { use_folder_sources: true } : {}),
    ...(escalate_model ? { escalate_model: true, escalate_reason } : {}),
  })
}

export function applyFolderSourcesHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  availableFolderFileNames?: string[],
): InstantAnalyzeResult {
  if (!availableFolderFileNames?.length) {
    return analyze.use_folder_sources ? { ...analyze, use_folder_sources: false } : analyze
  }

  if (!userMessageWantsFolderSources(userMessage, availableFolderFileNames)) {
    if (analyze.use_folder_sources) {
      return { ...analyze, use_folder_sources: false }
    }
    return analyze
  }

  let next: InstantAnalyzeResult = { ...analyze, use_folder_sources: true }
  if (userMessageWantsDocumentSummary(userMessage, true) && next.task_type !== 'summary') {
    next = { ...next, task_type: 'summary' }
  }
  if (userAsksDocumentVisibilityQuestion(userMessage) && next.task_type === 'summary') {
    next = { ...next, task_type: 'explanation', explanation_depth: 'brief' }
  }
  return next
}

export function enrichInstantAnalyzeDocumentCoverage(
  userMessage: string,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  if (analyze.task_type !== 'summary') {
    return analyze
  }
  const topics = resolveDocumentCoverageTopics({
    userMessage,
    analyzeTopics: analyze.document_coverage_topics,
  })
  return topics.length > 0 ? { ...analyze, document_coverage_topics: topics } : analyze
}

const ESCALATE_REASON_WHITELIST_RE =
  /\b(multi|mehrere|vergleich|quervergleich|sheets?|tabellen|merge|zwei\s+pdf|2\s+pdf)\b/i

function isAllowedEscalateReason(reason: string): boolean {
  if (!reason.trim()) {
    return false
  }
  return ESCALATE_REASON_WHITELIST_RE.test(reason)
}

const ESCALATE_COMPARE_REQUEST_RE =
  /\b(vergleich\w*|quervergleich|gegenüberstell\w*|gegenueberstell\w*|abgleich\w*|merge|zusammenführ\w*|zusammenfuehr\w*)\b/i

/**
 * 0 Token — ersetzt das frühere KI-Feld escalate_model: Nur bei explizitem Quervergleich
 * mehrerer Dokumente/Sheets wird das Antwortmodell auf Gemini Flash angehoben.
 */
export function applyEscalateModelHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: { availableFolderFileNames?: string[] },
): InstantAnalyzeResult {
  if (analyze.escalate_model) {
    return analyze
  }
  if (!ESCALATE_COMPARE_REQUEST_RE.test(userMessage)) {
    return analyze
  }
  const attachmentCount = (userMessage.match(/\[Datei:/gi) ?? []).length
  const folderFileCount = options?.availableFolderFileNames?.length ?? 0
  if (attachmentCount < 2 && folderFileCount < 2) {
    return analyze
  }
  return { ...analyze, escalate_model: true, escalate_reason: 'Vergleich mehrerer Dokumente' }
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
  if (userMessageRequestsSubscriptionUsage(trimmed)) {
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

const CONVERSATIONAL_FOLLOW_UP_PHRASE_RE =
  /^(?:und\s+)?(?:jetzt|nochmal|erneut|noch\s+einmal|weiter|dann|also|warum|wieso|weshalb|wie\s+so|mehr(?:\s+dazu)?|genau|präzise|bitte|noch|gleich|auch|stimmt\s+das|wirklich|ok|okay|ja|nein|danke|super|gut|verstanden|klar)\s*\??\.?$/i

const NEW_TOPIC_STARTER_RE =
  /^(?:erstelle|generiere|zeichne|schreibe|mach\s+mir|wie\s+richte|wie\s+installier|was\s+ist|erkläre|erklär|beschreib|hilf\s+mir\s+bei|ich\s+brauch)/i

/** Kurze Nachricht als Fortsetzung der letzten Assistenten-Antwort (nicht «fehlender Kontext»). */
export function isConversationalFollowUp(
  userMessage: string,
  priorTurns: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  const t = userMessage.trim()
  if (!t || t.length > 96) {
    return false
  }
  if (isImageSearchTurnMessage(t) || matchImageTopicClarification(t, priorTurns as ImageSearchPriorTurn[])) {
    return false
  }
  const lastAssistant = [...priorTurns].reverse().find((m) => m.role === 'assistant')
  if (!lastAssistant?.content?.trim()) {
    return false
  }
  if (CONVERSATIONAL_FOLLOW_UP_PHRASE_RE.test(t)) {
    return true
  }
  if (t.length <= 32 && !NEW_TOPIC_STARTER_RE.test(t)) {
    return true
  }
  return false
}

export const CONVERSATIONAL_FOLLOW_UP_TURN_BRIEFING =
  'Folgenachricht (verbindlich): Die Nutzer-Nachricht knüpft an deine **letzte Antwort** an. Zuerst darauf eingehen (z. B. bei «und jetzt?» nach Uhrzeit: neue Uhrzeit nennen). **Nicht** so antworten, als fehle jeder Kontext («Was möchtest du erreichen?»).'

/** Folgenachrichten nicht als ask_only / vague behandeln. */
export function applyConversationalFollowUpHeuristic(
  userMessage: string,
  priorTurns: ReadonlyArray<{ role: string; content?: string | null }> | undefined,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  /** Respektiert eine bereits konkrete (nicht-chat) LLM-Einordnung — kein Zurückzwingen auf chat.*. */
  if (analyze.category !== 'chat') {
    return analyze
  }
  const mediaRoute = detectRouteHeuristic(userMessage, false, priorTurns as ImageSearchPriorTurn[] | undefined, false)
  if (mediaRoute?.category === 'chart' || mediaRoute?.category === 'diagram') {
    return analyze
  }
  if (!priorTurns?.length || !isConversationalFollowUp(userMessage, priorTurns)) {
    return analyze
  }
  const reply_mode = analyze.reply_mode === 'ask_only' ? 'short_answer' : analyze.reply_mode
  const route = routeFromReplyMode(reply_mode)
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    intent: analyze.intent.trim() || 'Bezug auf vorherige Antwort',
  })
}

const TASK_SOLVE_REQUEST_RE =
  /\b(löse|lösung|aufgabe|übung|berechn|ermittl|bestimm|ausrechn|nachweis|beweis|zeichne|skizzier|formulier|mach(?:e)?\s+(?:die|das)\s+aufgabe|hilf\s+mir\s+bei)\b/i

/** Aufgaben/Übungen: direkt answer/normal, nicht clarify. */
export function applyTaskSolveHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  hasVisionAttachment = false,
): InstantAnalyzeResult {
  if (analyze.category !== 'chat') {
    return analyze
  }
  const t = userMessage.trim()
  if (!t && !hasVisionAttachment) {
    return analyze
  }
  if (
    !hasVisionAttachment &&
    !TASK_SOLVE_REQUEST_RE.test(t) &&
    !userMessageSuggestsTableExercise(t)
  ) {
    return analyze
  }
  const route = routeFromReplyMode('normal')
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    category: 'chat',
    action: 'answer',
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
  })
}

/** «Siehst du den Inhalt?» + Anhang — kurze Bestätigung, kein Summary/Quiz. */
export function applyDocumentVisibilityHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  hasDocumentFileAttachment = false,
): InstantAnalyzeResult {
  if (!hasDocumentFileAttachment || !userAsksDocumentVisibilityQuestion(userMessage)) {
    return analyze
  }
  return syncReplyModeWithRoute({
    ...analyze,
    category: 'chat',
    action: 'answer',
    reply_mode: 'short_answer',
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    web_reason: '',
    task_type: 'explanation',
    explanation_depth: 'brief',
    intent: 'Anhang-Sichtbarkeit bestätigen',
  })
}

/** MC / Zertifizierung / «nur die Antwort» → short_answer, nicht Erklär-Essay. */
export function applyDirectAnswerHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): InstantAnalyzeResult {
  if (userAsksDocumentVisibilityQuestion(userMessage)) {
    return analyze
  }
  if (analyze.category === 'document' || analyze.category === 'chart' || analyze.category === 'diagram') {
    return analyze
  }
  if (analyze.category === 'image' && analyze.action !== 'describe') {
    return analyze
  }
  if (!userMessageRequestsDirectAnswer(userMessage, priorTurns)) {
    return analyze
  }
  const route = routeFromReplyMode('short_answer')
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    category: 'chat',
    action: 'short_answer',
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    web_reason: '',
    intent:
      analyze.intent.trim() && analyze.intent !== 'Allgemeine Anfrage'
        ? analyze.intent
        : 'Multiple-Choice beantworten',
  })
}

/** Tabellen-/Zuordnungsübungen: normal beantworten, nicht ask_only. */
export function applyTableExerciseHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  hasVisionAttachment = false,
): InstantAnalyzeResult {
  /** Respektiert eine bereits konkrete (nicht-chat) LLM-Einordnung — kein Zurückzwingen auf chat.*. */
  if (analyze.category !== 'chat') {
    return analyze
  }
  const t = userMessage.trim()
  if (!hasVisionAttachment && !userMessageSuggestsTableExercise(t)) {
    return analyze
  }
  const reply_mode = analyze.reply_mode === 'ask_only' ? 'normal' : analyze.reply_mode
  const route = routeFromReplyMode(reply_mode)
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    intent:
      analyze.intent.trim() && analyze.intent !== 'Allgemeine Anfrage'
        ? analyze.intent
        : hasVisionAttachment
          ? 'Zuordnung/Tabelle aus Bild'
          : 'Zuordnungs- oder Tabellenaufgabe',
  })
}

export function applyIdentityQuestionHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  /** Respektiert eine bereits konkrete (nicht-chat) LLM-Einordnung — kein Zurückzwingen auf chat.*. */
  if (analyze.category !== 'chat') {
    return analyze
  }
  if (!IDENTITY_OR_ACCOUNT_META_RE.test(userMessage.trim())) {
    return analyze
  }
  const route = routeFromReplyMode('short_answer')
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    clarity: 'partial',
    missing: [],
    needs_live_web: false,
    web_query: '',
  })
}

/** Straton-Abo-Verbrauch — «aktuell» bezieht sich auf Konto-Daten, nicht Tavily. */
export function applySubscriptionUsageHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): InstantAnalyzeResult {
  /** Respektiert eine bereits konkrete (nicht-chat) LLM-Einordnung — kein Zurückzwingen auf chat.*. */
  if (analyze.category !== 'chat') {
    return analyze
  }
  if (!userMessageAsksAboutPriorSubscriptionUsage(userMessage, priorTurns)) {
    return analyze
  }
  const route = routeFromReplyMode('short_answer')
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    web_reason: '',
    intent: analyze.intent.trim() || 'Straton-Abo-Verbrauch',
  })
}

export function applyLiveWebHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
): InstantAnalyzeResult {
  const h = detectLiveWebHeuristic(userMessage)
  if (!h.needs) {
    return analyze
  }
  /** Respektiert eine bereits konkrete (nicht-chat) LLM-Einordnung — kein Zurückzwingen auf chat.*. */
  if (analyze.category !== 'chat') {
    return analyze
  }
  const reply_mode = analyze.reply_mode === 'ask_only' ? 'short_answer' : analyze.reply_mode
  const route = routeFromReplyMode(reply_mode)
  return syncReplyModeWithRoute({
    ...analyze,
    ...route,
    clarity: analyze.clarity === 'vague' ? 'clear' : analyze.clarity,
    needs_live_web: true,
    web_query: analyze.web_query.trim() || h.webQuery,
    web_reason:
      analyze.web_reason.trim() ||
      (h.hasLegalCue && !h.hasMarketCue
        ? 'Aktuelle Rechtslage / Gesetzesinfos'
        : 'Aktuelle Fakten (z. B. Kurs, Preis, News)'),
  })
}

export function fallbackInstantAnalyzeResult(
  userMessage: string,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): InstantAnalyzeResult {
  const trimmed = userMessage.trim()
  const vague =
    trimmed.length < 12 || /^(hilfe|help|hi|hallo|hey|ok|ja|nein)[\s!.?]*$/i.test(trimmed)
  const reply_mode: InstantAnalyzeReplyMode = 'normal'
  const route = routeFromReplyMode(reply_mode)
  const base: InstantAnalyzeResult = syncReplyModeWithRoute({
    category: route.category,
    action: route.action,
    clarity: vague ? 'vague' : 'partial',
    intent: trimmed.slice(0, 120) || 'Allgemeine Anfrage',
    missing: [],
    reply_mode,
    needs_live_web: false,
    web_query: '',
    web_reason: '',
    task_type: 'explanation',
    explanation_depth: inferInstantExplanationDepth(trimmed, 'explanation'),
  })
  let result = applyIdentityQuestionHeuristic(trimmed, applyLiveWebHeuristic(trimmed, base))
  result = applyConversationalFollowUpHeuristic(trimmed, priorTurns, result)
  const prior = priorTurns as ImageSearchPriorTurn[] | undefined
  result = applyRouteHeuristics(trimmed, syncReplyModeWithRoute({ ...result, ...routeFromReplyMode(result.reply_mode) }), {
    hasVisionAttachment: false,
    hasDocumentFileAttachment: false,
    priorTurns: prior,
  })
  result = applyImageSearchContextHeuristic(trimmed, result, prior)
  return result
}

export function applyInstantAnalyzeHeuristics(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: {
    priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>
    hasVisionAttachment?: boolean
    hasDocumentFileAttachment?: boolean
    availableFolderFileNames?: string[]
    precomputedDetection?: { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } | null
  },
): InstantAnalyzeResult {
  let result = applyLiveWebHeuristic(userMessage, analyze)
  result = applySubscriptionUsageHeuristic(userMessage, result, options?.priorTurns)
  result = applyIdentityQuestionHeuristic(userMessage, result)
  result = applyTableExerciseHeuristic(userMessage, result, options?.hasVisionAttachment === true)
  result = applyConversationalFollowUpHeuristic(userMessage, options?.priorTurns, result)
  result = applyTaskSolveHeuristic(userMessage, result, options?.hasVisionAttachment === true)
  result = applyImageSearchContextHeuristic(
    userMessage,
    result,
    options?.priorTurns as ImageSearchPriorTurn[] | undefined,
  )
  result = applyGeneratedImageReferenceHeuristic(
    userMessage,
    result,
    options?.priorTurns,
    options?.hasVisionAttachment === true,
  )
  result = applyGeneratedImageAttributionHeuristic(
    userMessage,
    result,
    options?.priorTurns,
    options?.hasVisionAttachment === true,
  )
  /** Zuletzt: Regex-Routing (Diagramm/Word/PDF/Excel/Bild) schlägt Mini-Einordnung + Folgenachrichten. */
  result = applyRouteHeuristics(userMessage, result, {
    hasVisionAttachment: options?.hasVisionAttachment === true,
    hasDocumentFileAttachment: options?.hasDocumentFileAttachment === true,
    priorTurns: options?.priorTurns as ImageSearchPriorTurn[] | undefined,
    ...(options !== undefined && 'precomputedDetection' in options
      ? { precomputedDetection: options.precomputedDetection }
      : {}),
  })
  result = applyDocumentVisibilityHeuristic(
    userMessage,
    result,
    options?.hasDocumentFileAttachment === true,
  )
  result = applyDirectAnswerHeuristic(userMessage, result, options?.priorTurns)
  result = applyInstantChatTaskTypeHeuristic(userMessage, result, {
    hasDocumentFileAttachment: options?.hasDocumentFileAttachment,
    priorTurns: options?.priorTurns,
  })
  result = enrichInstantAnalyzeDocumentCoverage(userMessage, result)
  result = applyFolderSourcesHeuristic(userMessage, result, options?.availableFolderFileNames)
  result = applyEscalateModelHeuristic(userMessage, result, {
    ...(options?.availableFolderFileNames
      ? { availableFolderFileNames: options.availableFolderFileNames }
      : {}),
  })
  result = applySubscriptionUsageHeuristic(userMessage, result, options?.priorTurns)
  return result
}

/** «Wer hat das Bild gemacht?» — Verlaufswissen, keine Vision nach externem Urheber. */
export function applyGeneratedImageAttributionHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
  hasNewVisionAttachment = false,
): InstantAnalyzeResult {
  if (!matchImageAttributionQuestion(userMessage) || hasNewVisionAttachment) {
    return analyze
  }
  const prior = priorTurns ?? []
  const hasGen = prior.some((m) => assistantMessageHasGeneratedImage(m))
  const hasUpload = prior.some((m) => userMessageHasUploadedImage(m))
  if (!hasGen && !hasUpload) {
    return analyze
  }

  return syncReplyModeWithRoute({
    ...analyze,
    category: 'chat',
    action: 'answer',
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    intent:
      analyze.intent.trim() ||
      (hasGen ? 'Herkunft des Straton-generierten Bilds' : 'Herkunft des hochgeladenen Bilds'),
    reply_mode: 'short_answer',
  })
}

/** Nach KI-Einordnung: Bezug auf generiertes/hochgeladenes Bild im Verlauf (mit Kontext). */
export function applyGeneratedImageReferenceHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
  hasNewVisionAttachment = false,
): InstantAnalyzeResult {
  const prior = priorTurns ?? []
  if (
    /\b(?:generier|erstell|zeichne|male|draw|create|generate)\b/i.test(userMessage) &&
    /\b(?:bild|foto|image)\b/i.test(userMessage)
  ) {
    return analyze
  }
  const hasImageInThread = prior.some(
    (m) =>
      (m.role === 'assistant' && assistantMessageHasGeneratedImage(m)) ||
      (m.role === 'user' &&
        typeof m.content === 'string' &&
        (m.content.includes('[BildData:') || m.content.includes('@chat-media:'))),
  )
  if (!hasImageInThread) {
    return analyze
  }

  if (analyze.category === 'image' && analyze.action === 'reference') {
    return syncReplyModeWithRoute({
      ...analyze,
      clarity: 'clear',
      missing: [],
      needs_live_web: false,
      web_query: '',
      intent: analyze.intent.trim() || 'Bezug auf Bild im Chatverlauf',
    })
  }

  if (hasNewVisionAttachment) {
    return analyze
  }

  if (matchImageAttributionQuestion(userMessage)) {
    return analyze
  }

  if (analyze.category === 'image' && (analyze.action === 'generate' || analyze.action === 'search')) {
    return analyze
  }

  const shouldReference =
    shouldResolveReferencedImageVision(userMessage, prior) ||
    (analyze.category === 'image' && analyze.action === 'describe') ||
    (analyze.category === 'chat' &&
      /\b(?:bild|foto)\b/i.test(userMessage) &&
      prior.some((m) => m.role === 'assistant' && assistantMessageHasGeneratedImage(m)))

  if (!shouldReference) {
    return analyze
  }

  return syncReplyModeWithRoute({
    ...analyze,
    category: 'image',
    action: 'reference',
    clarity: 'clear',
    missing: [],
    needs_live_web: false,
    web_query: '',
    intent: analyze.intent.trim() || 'Bezug auf Bild im Chatverlauf',
  })
}

/**
 * Kompaktes Turn-Briefing: Einordnung + höchstens ein aufgabenspezifischer Block.
 * MC-/Quiz-/Visibility-/Tabellen-Briefings kommen aus `buildGatewayMessages`
 * (dort genau einmal) — hier nicht duplizieren.
 */
export function buildInstantAnalyzeBriefingInstruction(analyze: InstantAnalyzeResult): string {
  const depthHint =
    analyze.task_type === 'explanation' ? ` (Tiefe-Richtwert: ${analyze.explanation_depth})` : ''
  const lines = [
    `Einordnung dieser Anfrage — Kategorie/Aktion verbindlich fürs Routing, Tiefe und Form wählst du selbst: Kategorie ${analyze.category}, Aktion ${analyze.action}, Aufgabentyp ${analyze.task_type}${depthHint}.`,
    `Nutzerabsicht: ${analyze.intent}`,
  ]
  if (analyze.missing.length > 0) {
    lines.push(`Fehlende Infos (mit benannter Annahme überbrücken): ${analyze.missing.join('; ')}`)
  }
  if (analyze.needs_live_web && analyze.web_reason) {
    lines.push(`Web-Kontext-Grund: ${analyze.web_reason}`)
  }

  const isDocumentSummaryExport =
    analyze.category === 'document' &&
    (analyze.action === 'pdf_generate' || analyze.action === 'word_generate') &&
    analyze.task_type === 'summary'

  if (analyze.category === 'document') {
    const docAction =
      analyze.action === 'word_generate' ||
      analyze.action === 'pdf_generate' ||
      analyze.action === 'excel_generate' ||
      analyze.action === 'pptx_generate'
        ? analyze.action
        : 'word_generate'
    if (isDocumentSummaryExport) {
      lines.push(buildDocumentExportSummaryTurnBriefing())
    }
    lines.push(
      buildInstantAnalyzeDocumentExportBriefing(docAction, { summaryStyle: isDocumentSummaryExport }),
    )
  } else if (analyze.category === 'chart') {
    lines.push(buildInstantAnalyzeChartBriefing())
  } else if (analyze.category === 'diagram') {
    lines.push(buildInstantAnalyzeDiagramBriefing())
  } else if (analyze.category === 'image' && analyze.action === 'search') {
    lines.push(
      'Unsplash-Fotosuche — die App zeigt bis zu 4 Fotos mit Beschreibung und Quelle; kein generiertes Bild.',
    )
  } else if (analyze.category === 'image' && analyze.action === 'reference') {
    lines.push(
      'Bezug auf ein Bild aus dem Chatverlauf — dir wird das Bild als Vision mitgeschickt: Inhalt beschreiben/auswerten; **nicht** behaupten, du könntest keine Bilder sehen.',
    )
  } else if (analyze.task_type === 'summary') {
    lines.push(
      'Zusammenfassung: alle Themen inhaltlich ausarbeiten (Fragen beantworten, Übungen lösen) in thematischen `##`-Kapiteln — kein «Aufgabe:/Lösung:»-Format, kein Meta («das Dokument behandelt …»); Details im Playbook dieses Turns.',
    )
  }
  return lines.join('\n')
}

export function buildInstantAnalyzeDebugMeta(params: {
  invoke: InstantAnalyzeInvokeResult
  autoWebPlanned: boolean
  autoWebRan: boolean
  presentationProfile?: PresentationProfileDebugMeta
  layoutMetrics?: PresentationLayoutMetricsMeta
}): InstantAnalyzeDebugMeta {
  const { invoke, autoWebPlanned, autoWebRan } = params
  const fromAi = invoke.analyzeFromAi ?? invoke.analyze
  const final = invoke.analyze
  const fromAiRoute = invoke.analyzeFromAi
  const heuristicApplied =
    invoke.source === 'edge' &&
    Boolean(fromAiRoute) &&
    (fromAiRoute!.needs_live_web !== final.needs_live_web ||
      fromAiRoute!.web_query !== final.web_query ||
      fromAiRoute!.reply_mode !== final.reply_mode ||
      fromAiRoute!.category !== final.category ||
      fromAiRoute!.action !== final.action ||
      fromAiRoute!.task_type !== final.task_type ||
      fromAiRoute!.explanation_depth !== final.explanation_depth)

  return {
    source: invoke.source,
    category: final.category,
    action: final.action,
    category_from_ai: fromAiRoute?.category ?? final.category,
    action_from_ai: fromAiRoute?.action ?? final.action,
    task_type: final.task_type,
    task_type_from_ai: fromAiRoute?.task_type ?? final.task_type,
    explanation_depth: final.explanation_depth,
    explanation_depth_from_ai: fromAiRoute?.explanation_depth ?? final.explanation_depth,
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
    ...(final.document_coverage_topics?.length
      ? { document_coverage_topics: [...final.document_coverage_topics] }
      : {}),
    ...(params.presentationProfile ? { presentation_profile: params.presentationProfile } : {}),
    ...(params.layoutMetrics ? { layout_metrics: params.layoutMetrics } : {}),
  }
}

export function formatInstantAnalyzeContextLines(
  turns: Array<{ role: 'user' | 'assistant'; content: string; unsplashQuery?: string }>,
): string {
  return turns
    .slice(-8)
    .map((t) => {
      const label = t.role === 'user' ? 'Nutzer' : 'Assistent'
      const artifactMarker =
        t.role === 'assistant' ? assistantGeneratedArtifactContextMarker(t.content) : null
      const body = (
        artifactMarker ??
        t.content
          .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild]')
          .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, '[Bild]')
      ).trim()
      const clipped = artifactMarker ?? (body.length > 900 ? `${body.slice(0, 900)}…` : body)
      const topic =
        t.unsplashQuery?.trim() && t.role === 'assistant'
          ? ` [Thema Fotosuche: «${t.unsplashQuery.trim()}»]`
          : ''
      const generated =
        t.role === 'assistant' && assistantMessageHasGeneratedImage(t)
          ? ' [Straton hat zuvor ein Bild generiert — Nutzer kann sich darauf beziehen]'
          : ''
      return `${label}${topic}${generated}: ${clipped}`
    })
    .join('\n')
}

/** Suchbegriff + Routing nach Kontext (Pronomen, Klarstellung, «The Rock»). */
export function applyImageSearchContextHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
): InstantAnalyzeResult {
  const prior = priorTurns ?? []
  const wantsSearch =
    (analyze.category === 'image' && analyze.action === 'search') ||
    isImageSearchTurnMessage(userMessage) ||
    matchImageTopicClarification(userMessage, prior)

  if (!wantsSearch) {
    return analyze
  }

  const resolved = extractImageSearchQuery(userMessage, analyze.intent, prior)
  if (!resolved.trim()) {
    return analyze
  }

  return syncReplyModeWithRoute({
    ...analyze,
    category: 'image',
    action: 'search',
    clarity: 'clear',
    intent: resolved,
    missing: [],
    needs_live_web: false,
    web_query: '',
  })
}
