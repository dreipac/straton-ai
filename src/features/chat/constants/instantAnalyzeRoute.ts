import type { InstantAnalyzeReplyMode, InstantAnalyzeResult } from './instantAnalyze'
import { matchExplicitImageGenerationRequest } from '../utils/imageGenerationIntent'
import {
  extractImageSearchQuery,
  matchImageSearchRequest,
  matchImageTopicClarification,
  type ImageSearchPriorTurn,
} from '../utils/imageSearchIntent'

export type InstantAnalyzeCategory = 'chat' | 'image' | 'document'

export type InstantAnalyzeChatAction = 'answer' | 'short_answer' | 'clarify' | 'one_step'
export type InstantAnalyzeImageAction = 'generate' | 'describe' | 'search'
export type InstantAnalyzeDocumentAction = 'word_generate' | 'pdf_generate' | 'excel_generate'

export type InstantAnalyzeAction =
  | InstantAnalyzeChatAction
  | InstantAnalyzeImageAction
  | InstantAnalyzeDocumentAction

const CHAT_ACTIONS: InstantAnalyzeChatAction[] = ['answer', 'short_answer', 'clarify', 'one_step']
const IMAGE_ACTIONS: InstantAnalyzeImageAction[] = ['generate', 'describe', 'search']
const DOCUMENT_ACTIONS: InstantAnalyzeDocumentAction[] = [
  'word_generate',
  'pdf_generate',
  'excel_generate',
]

const ACTIONS_BY_CATEGORY: Record<InstantAnalyzeCategory, readonly InstantAnalyzeAction[]> = {
  chat: CHAT_ACTIONS,
  image: IMAGE_ACTIONS,
  document: DOCUMENT_ACTIONS,
}

export function isAllowedCategoryAction(
  category: string,
  action: string,
): category is InstantAnalyzeCategory {
  if (category !== 'chat' && category !== 'image' && category !== 'document') {
    return false
  }
  const cat = category as InstantAnalyzeCategory
  return (ACTIONS_BY_CATEGORY[cat] as readonly string[]).includes(action)
}

export function parseAllowedCategoryAction(
  category: string,
  action: string,
): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } | null {
  if (!isAllowedCategoryAction(category, action)) {
    return null
  }
  return {
    category,
    action: action as InstantAnalyzeAction,
  }
}

export function defaultRoute(): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } {
  return { category: 'chat', action: 'answer' }
}

export function replyModeFromRoute(
  category: InstantAnalyzeCategory,
  action: InstantAnalyzeAction,
): InstantAnalyzeReplyMode {
  if (category === 'chat') {
    if (action === 'clarify') {
      return 'ask_only'
    }
    if (action === 'short_answer') {
      return 'short_answer'
    }
    if (action === 'one_step') {
      return 'one_step'
    }
    return 'normal'
  }
  return 'normal'
}

export function routeFromReplyMode(reply_mode: InstantAnalyzeReplyMode): {
  category: InstantAnalyzeCategory
  action: InstantAnalyzeAction
} {
  switch (reply_mode) {
    case 'ask_only':
      return { category: 'chat', action: 'clarify' }
    case 'short_answer':
      return { category: 'chat', action: 'short_answer' }
    case 'one_step':
      return { category: 'chat', action: 'one_step' }
    default:
      return { category: 'chat', action: 'answer' }
  }
}

export function syncReplyModeWithRoute(result: InstantAnalyzeResult): InstantAnalyzeResult {
  const reply_mode = replyModeFromRoute(result.category, result.action)
  let needs_live_web = result.needs_live_web
  let web_query = result.web_query
  if (result.category !== 'chat' || result.action === 'clarify') {
    needs_live_web = false
    web_query = ''
  }
  if (reply_mode === 'ask_only') {
    needs_live_web = false
    web_query = ''
  }
  return { ...result, reply_mode, needs_live_web, web_query }
}

function normalizeCategoryAction(
  categoryRaw: unknown,
  actionRaw: unknown,
  reply_mode: InstantAnalyzeReplyMode,
): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } {
  const categoryStr = typeof categoryRaw === 'string' ? categoryRaw.trim() : ''
  const actionStr = typeof actionRaw === 'string' ? actionRaw.trim() : ''
  const parsed = parseAllowedCategoryAction(categoryStr, actionStr)
  if (parsed) {
    return parsed
  }
  return routeFromReplyMode(reply_mode)
}

export function parseCategoryActionFields(
  raw: Record<string, unknown>,
  reply_mode: InstantAnalyzeReplyMode,
): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } {
  return normalizeCategoryAction(raw.category, raw.action, reply_mode)
}

const WORD_EXPORT_TEXT_RE =
  /\b(?:word[\s-]?(?:dokument|datei|export)|docx|als\s+word|in\s+word|nach\s+word)\b/i
const WORD_EXPORT_VERB_RE =
  /\b(?:erstell|generier|exportier|mach|schreib).{0,40}\b(?:word|docx)\b|\b(?:word|docx).{0,40}\b(?:erstell|generier|exportier)\b/i

const PDF_EXPORT_TEXT_RE =
  /\b(?:pdf[\s-]?(?:dokument|datei|export)|als\s+pdf|in\s+pdf|nach\s+pdf)\b/i
const PDF_EXPORT_VERB_RE =
  /\b(?:erstell|generier|exportier|mach).{0,40}\bpdf\b|\bpdf.{0,40}\b(?:erstell|generier|exportier)\b/i

const EXCEL_EXPORT_TEXT_RE =
  /\b(?:excel[\s-]?(?:datei|tabelle|export)|xlsx|spreadsheet|tabelle\s+exportieren)\b/i
const EXCEL_EXPORT_VERB_RE =
  /\b(?:erstell|generier|exportier|mach).{0,40}\b(?:excel|xlsx)\b|\b(?:excel|xlsx).{0,40}\b(?:erstell|generier|exportier)\b/i

const IMAGE_DESCRIBE_RE =
  /\b(?:was\s+siehst|was\s+steht|beschreib|erkläre|erklär|analysier|lies|lesen|erkenn|ocr|inhalt).{0,30}\b(?:bild|foto|screenshot|anhang)\b/i

/** 0 Token — erkennt Dokument-/Bild-Jobs ohne Composer-Tile. */
export function detectRouteHeuristic(
  userMessage: string,
  hasVisionAttachment: boolean,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } | null {
  const t = userMessage.trim()
  if (!t) {
    return null
  }

  if (matchImageTopicClarification(t, priorTurns)) {
    return { category: 'image', action: 'search' }
  }

  if (matchImageSearchRequest(t).kind === 'query') {
    return { category: 'image', action: 'search' }
  }

  const imageMatch = matchExplicitImageGenerationRequest(t)
  if (imageMatch.kind === 'prompt' || imageMatch.kind === 'empty') {
    return { category: 'image', action: 'generate' }
  }

  if (hasVisionAttachment && IMAGE_DESCRIBE_RE.test(t)) {
    return { category: 'image', action: 'describe' }
  }

  if (WORD_EXPORT_TEXT_RE.test(t) || WORD_EXPORT_VERB_RE.test(t)) {
    return { category: 'document', action: 'word_generate' }
  }
  if (PDF_EXPORT_TEXT_RE.test(t) || PDF_EXPORT_VERB_RE.test(t)) {
    return { category: 'document', action: 'pdf_generate' }
  }
  if (EXCEL_EXPORT_TEXT_RE.test(t) || EXCEL_EXPORT_VERB_RE.test(t)) {
    return { category: 'document', action: 'excel_generate' }
  }

  return null
}

export function applyRouteHeuristics(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: { hasVisionAttachment?: boolean; priorTurns?: ReadonlyArray<ImageSearchPriorTurn> },
): InstantAnalyzeResult {
  const hasVision = options?.hasVisionAttachment === true
  let category = analyze.category
  let action = analyze.action

  const detected = detectRouteHeuristic(userMessage, hasVision, options?.priorTurns)
  if (detected) {
    const documentFromAi = category === 'document'
    const imageGenerateFromAi = category === 'image' && action === 'generate'
    const imageSearchFromAi = category === 'image' && action === 'search'
    if (!documentFromAi && !imageGenerateFromAi && !imageSearchFromAi) {
      category = detected.category
      action = detected.action
    } else if (detected.category === 'document') {
      category = detected.category
      action = detected.action
    } else if (detected.category === 'image' && (detected.action === 'generate' || detected.action === 'search')) {
      category = detected.category
      action = detected.action
    }
  }

  if (category === 'image' && action === 'describe' && !hasVision) {
    category = 'chat'
    action = 'answer'
  }

  if (category === 'document' || category === 'image') {
    return syncReplyModeWithRoute({
      ...analyze,
      category,
      action,
      clarity: analyze.clarity === 'vague' ? 'partial' : analyze.clarity,
      missing: [],
      needs_live_web: false,
      web_query: '',
    })
  }

  return syncReplyModeWithRoute({ ...analyze, category, action })
}

export type InstantRouteOverrides = {
  wantsWord: boolean
  wantsPdf: boolean
  wantsExcel: boolean
  imageGenPrompt: string | null
  imageGenEmpty: boolean
  imageSearchQuery: string | null
}

/** Router nach Analyze — nur wenn kein Composer-Tile/Regex-Pfad aktiv (Regel A). */
export function resolveInstantRouteOverrides(
  analyze: InstantAnalyzeResult,
  userMessage: string,
  options: { composerRouteLocked: boolean; priorTurns?: ReadonlyArray<ImageSearchPriorTurn> },
): InstantRouteOverrides {
  const none: InstantRouteOverrides = {
    wantsWord: false,
    wantsPdf: false,
    wantsExcel: false,
    imageGenPrompt: null,
    imageGenEmpty: false,
    imageSearchQuery: null,
  }
  if (options.composerRouteLocked) {
    return none
  }

  const { category, action } = analyze

  if (category === 'document') {
    return {
      ...none,
      wantsWord: action === 'word_generate',
      wantsPdf: action === 'pdf_generate',
      wantsExcel: action === 'excel_generate',
    }
  }

  if (category === 'image' && action === 'search') {
    const query = extractImageSearchQuery(userMessage.trim(), analyze.intent, options.priorTurns)
    if (!query) {
      return none
    }
    return { ...none, imageSearchQuery: query }
  }

  if (category === 'image' && action === 'generate') {
    const match = matchExplicitImageGenerationRequest(userMessage.trim())
    if (match.kind === 'empty') {
      return { ...none, imageGenEmpty: true }
    }
    if (match.kind === 'prompt') {
      return { ...none, imageGenPrompt: match.prompt }
    }
    const fallback = userMessage.trim()
    if (!fallback) {
      return { ...none, imageGenEmpty: true }
    }
    return { ...none, imageGenPrompt: fallback }
  }

  return none
}

export function buildInstantAnalyzeRoutePromptSection(): string {
  return [
    'Routing (verbindlich):',
    '- category: "chat" | "image" | "document"',
    '- action (nur passend zur category):',
    '  - chat: "answer" | "short_answer" | "clarify" | "one_step"',
    '  - image: "generate" | "describe" | "search"',
    '  - document: "word_generate" | "pdf_generate" | "excel_generate"',
    '',
    'Zuordnung:',
    '- Normale Fragen, Erklärungen, Code, Mathe, Fehlersuche → chat (answer / one_step / short_answer / clarify).',
    '- «zeige/such/finde Foto/Bild von …» (reale Person/Sache/Ort) → image.search — **nicht** generate.',
    '- «generiere/erstelle/zeichne/male … Bild» → image.generate.',
    '- Anhang + «was siehst du / beschreibe das Bild» ohne Neuerstellung → image.describe.',
    '- «Word/Docx erstellen/exportieren» → document.word_generate.',
    '- «PDF erstellen/exportieren» → document.pdf_generate.',
    '- «Excel/XLSX/Tabelle exportieren» → document.excel_generate.',
    '- Aufgabe/Übung/lösen/berechnen/Zuordnung/Bild-Aufgabe → chat.answer (direkt lösen, nicht clarify).',
    '- Unklar: chat.answer mit Annahme — chat.clarify nur wenn wirklich nicht lösbar.',
    '- Kurze Folgen («und jetzt?», «mehr») mit Verlauf → chat.short_answer.',
    '- Folgenachricht mit «ihm/der/die», «zeige noch Bilder», «ich meine den Schauspieler» nach Fotosuche → image.search; Suchbegriff aus Verlauf (nicht «ihm» wörtlich).',
    '- Bei document.*, image.generate oder image.search: needs_live_web false.',
  ].join('\n')
}
