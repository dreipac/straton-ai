import type { InstantAnalyzeReplyMode, InstantAnalyzeResult } from './instantAnalyze'
import { buildInstantAnalyzeChartGenerateSection } from './chartExportIntent'
import { buildInstantAnalyzeDiagramGenerateSection } from './diagramExportIntent'
import { buildInstantAnalyzeDirectAnswerSection } from './chatDirectAnswerInstruction'
import { buildInstantAnalyzeDocumentGenerateSection } from './documentExportIntent'
import { matchExplicitImageGenerationRequest } from '../utils/imageGenerationIntent'
import { stripImageGenTilePromptPrefix } from './imageGenTile'
import {
  extractImageSearchQuery,
  matchImageSearchRequest,
  matchImageTopicClarification,
  type ImageSearchPriorTurn,
} from '../utils/imageSearchIntent'

export type InstantAnalyzeCategory = 'chat' | 'image' | 'document' | 'chart' | 'diagram'

export type InstantAnalyzeChatAction = 'answer' | 'short_answer' | 'clarify' | 'one_step'
export type InstantAnalyzeImageAction = 'generate' | 'describe' | 'search' | 'reference'
export type InstantAnalyzeDocumentAction =
  | 'word_generate'
  | 'pdf_generate'
  | 'excel_generate'
  | 'pptx_generate'
export type InstantAnalyzeChartAction = 'chart_generate'
export type InstantAnalyzeDiagramAction = 'diagram_generate'

export type InstantAnalyzeAction =
  | InstantAnalyzeChatAction
  | InstantAnalyzeImageAction
  | InstantAnalyzeDocumentAction
  | InstantAnalyzeChartAction
  | InstantAnalyzeDiagramAction

const CHAT_ACTIONS: InstantAnalyzeChatAction[] = ['answer', 'short_answer', 'clarify', 'one_step']
const IMAGE_ACTIONS: InstantAnalyzeImageAction[] = ['generate', 'describe', 'search', 'reference']
const DOCUMENT_ACTIONS: InstantAnalyzeDocumentAction[] = [
  'word_generate',
  'pdf_generate',
  'excel_generate',
  'pptx_generate',
]
const CHART_ACTIONS: InstantAnalyzeChartAction[] = ['chart_generate']
const DIAGRAM_ACTIONS: InstantAnalyzeDiagramAction[] = ['diagram_generate']

const ACTIONS_BY_CATEGORY: Record<InstantAnalyzeCategory, readonly InstantAnalyzeAction[]> = {
  chat: CHAT_ACTIONS,
  image: IMAGE_ACTIONS,
  document: DOCUMENT_ACTIONS,
  chart: CHART_ACTIONS,
  diagram: DIAGRAM_ACTIONS,
}

export function isAllowedCategoryAction(
  category: string,
  action: string,
): category is InstantAnalyzeCategory {
  if (
    category !== 'chat' &&
    category !== 'image' &&
    category !== 'document' &&
    category !== 'chart' &&
    category !== 'diagram'
  ) {
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

const PPTX_EXPORT_TEXT_RE =
  /\b(?:power[\s-]?point|pptx?|präsentation|praesentation|folien|slides?[\s-]?deck)\b/i
const PPTX_EXPORT_VERB_RE =
  /\b(?:erstell|generier|exportier|mach|bau).{0,40}\b(?:powerpoint|pptx?|präsentation|praesentation|folien|slides)\b|\b(?:powerpoint|pptx?|präsentation|praesentation|folien|slides).{0,40}\b(?:erstell|generier|exportier)\b/i

const NUMERIC_CHART_TEXT_RE =
  /\b(?:balkendiagramm|liniendiagramm|kreisdiagramm|tortendiagramm|donutdiagramm|säulendiagramm|chart|grafik|visualisier(?:e|en|ung)|prozent|statistik|datenvisualisierung)\b/i
const CHART_EXPORT_VERB_RE =
  /\b(?:erstell|generier|zeichne|mach|visualisier).{0,40}\b(?:balkendiagramm|liniendiagramm|kreisdiagramm|chart|grafik)\b|\b(?:balkendiagramm|liniendiagramm|kreisdiagramm|chart|grafik).{0,40}\b(?:erstell|generier|zeichne)\b/i
/** Folgenachricht nach Diagramm-Wunsch: «mache das als Balkendiagramm». */
const CHART_REFINEMENT_RE =
  /\b(?:als|statt)\s+(?:ein(?:en|e|em)?\s+)?(?:balken|linien|kreis|torten|säulen|donut)?\s*(?:diagramm|chart)\b|\b(?:mach(?:e)?|zeig(?:e)?|stell(?:e)?)\s+(?:das|es)\s+als\b/i

const DIAGRAM_STRUCTURE_TEXT_RE =
  /\b(?:stammbaum|familienbaum|genealogie|ablauf(?:diagramm|plan|skizze)?|prozess(?:diagramm|ablauf)?|workflow|flussdiagramm|flowchart|organigramm|mindmap|gedankenkarte|entscheidungsbaum|sequenzdiagramm|zustandsdiagramm|übersichts(?:grafik|diagramm)|schritte?\s+(?:als|in)\s+(?:skizze|übersicht|grafik)|skizze\s+(?:des|vom|vom)\s+ablauf)\b/i
const DIAGRAM_EXPORT_VERB_RE =
  /\b(?:erstell|generier|zeichne|skizzier|darstell|visualisier|mach).{0,40}\b(?:stammbaum|familienbaum|ablauf|prozess|workflow|flussdiagramm|organigramm|mindmap|sequenzdiagramm)\b|\b(?:stammbaum|familienbaum|ablauf|prozess|workflow|flussdiagramm|organigramm|mindmap).{0,40}\b(?:erstell|generier|zeichne|skizzier)\b/i
const DIAGRAM_SKETCH_RE =
  /\b(?:skizze|überblick)\b/i
/** Generisches «mache/erstelle ein Diagramm» ohne genannten Typ (kein Stammbaum/Ablauf/…) — Default: Struktur-Diagramm statt Chart. */
const DIAGRAM_GENERIC_VERB_RE =
  /\b(?:erstell|generier|zeichne|skizzier|darstell|brauch|mach)\w*\b.{0,30}\bdiagramm\b|\bdiagramm\b.{0,30}\b(?:erstell|generier|zeichne|brauch|mach)\w*\b/i
const NUMERIC_DATA_HINT_RE = /\b(?:prozent|zahl|daten|statistik|umsatz|verteilung|anteil)\b/i

const IMAGE_DESCRIBE_RE =
  /\b(?:was\s+siehst|was\s+steht|beschreib|erkläre|erklär|analysier|lies|lesen|erkenn|ocr|inhalt).{0,30}\b(?:bild|foto|screenshot|anhang)\b/i

const IMAGE_DESCRIBE_WHO_WHAT_RE =
  /\b(wer|was|welche[rs]?)\s+(?:ist|sind|zeigt|steht).{0,40}\b(?:bild|foto)\b/i

/** Frage zum Inhalt eines `[Datei:…]`-Anhangs — kein PDF/Word-Export. */
const DOCUMENT_ATTACHMENT_READ_RE =
  /\b(?:was\s+siehst|was\s+steht|was\s+ist|was\s+bedeutet|beschreib|erkläre|erklär|analysier|lies|lesen|fass(?:e)?\s+zusammen|zusammenfass(?:ung)?|inhalt|überblick|ueberblick|auswert|fragen?\s+zum|zum\s+(?:dokument|anhang|pdf))\b/i

/** User-Nachricht war Diagramm-Job (Metadata oder Text-Heuristik). */
export function userMessageRequestsChart(
  userMessage: string,
  metadata?: { userChartCommand?: boolean } | null,
): boolean {
  if (metadata?.userChartCommand === true) {
    return true
  }
  const t = userMessage.trim()
  if (!t) {
    return false
  }
  const detected = detectRouteHeuristic(t, false, undefined, false)
  return detected?.category === 'chart' && detected.action === 'chart_generate'
}

/** User-Nachricht war Struktur-Diagramm-Job (Stammbaum, Ablauf, …). */
export function userMessageRequestsDiagram(
  userMessage: string,
  metadata?: { userDiagramCommand?: boolean } | null,
): boolean {
  if (metadata?.userDiagramCommand === true) {
    return true
  }
  const t = userMessage.trim()
  if (!t) {
    return false
  }
  const detected = detectRouteHeuristic(t, false, undefined, false)
  return detected?.category === 'diagram' && detected.action === 'diagram_generate'
}

export function userRequestsDocumentExport(userMessage: string): boolean {
  const t = userMessage.trim()
  if (!t) {
    return false
  }
  return (
    PDF_EXPORT_TEXT_RE.test(t) ||
    PDF_EXPORT_VERB_RE.test(t) ||
    WORD_EXPORT_TEXT_RE.test(t) ||
    WORD_EXPORT_VERB_RE.test(t) ||
    EXCEL_EXPORT_TEXT_RE.test(t) ||
    EXCEL_EXPORT_VERB_RE.test(t) ||
    PPTX_EXPORT_TEXT_RE.test(t) ||
    PPTX_EXPORT_VERB_RE.test(t)
  )
}

/** 0 Token — erkennt Dokument-/Bild-Jobs ohne Composer-Tile. */
export function detectRouteHeuristic(
  userMessage: string,
  hasVisionAttachment: boolean,
  priorTurns?: ReadonlyArray<ImageSearchPriorTurn>,
  hasDocumentFileAttachment = false,
): { category: InstantAnalyzeCategory; action: InstantAnalyzeAction } | null {
  const t = userMessage.trim()
  if (!t && !hasDocumentFileAttachment) {
    return null
  }

  if (hasDocumentFileAttachment && DOCUMENT_ATTACHMENT_READ_RE.test(t)) {
    return { category: 'chat', action: 'answer' }
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

  if (hasVisionAttachment && (IMAGE_DESCRIBE_RE.test(t) || IMAGE_DESCRIBE_WHO_WHAT_RE.test(t))) {
    return { category: 'image', action: 'describe' }
  }

  if (hasDocumentFileAttachment && !userRequestsDocumentExport(t)) {
    return { category: 'chat', action: 'answer' }
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
  if (PPTX_EXPORT_TEXT_RE.test(t) || PPTX_EXPORT_VERB_RE.test(t)) {
    return { category: 'document', action: 'pptx_generate' }
  }
  if (
    DIAGRAM_STRUCTURE_TEXT_RE.test(t) ||
    DIAGRAM_EXPORT_VERB_RE.test(t) ||
    (DIAGRAM_SKETCH_RE.test(t) && !NUMERIC_DATA_HINT_RE.test(t)) ||
    (DIAGRAM_GENERIC_VERB_RE.test(t) && !NUMERIC_DATA_HINT_RE.test(t))
  ) {
    return { category: 'diagram', action: 'diagram_generate' }
  }
  if (NUMERIC_CHART_TEXT_RE.test(t) || CHART_EXPORT_VERB_RE.test(t) || CHART_REFINEMENT_RE.test(t)) {
    return { category: 'chart', action: 'chart_generate' }
  }

  return null
}

export function applyRouteHeuristics(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: {
    hasVisionAttachment?: boolean
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<ImageSearchPriorTurn>
  },
): InstantAnalyzeResult {
  const hasVision = options?.hasVisionAttachment === true
  const hasDocFile = options?.hasDocumentFileAttachment === true
  let category = analyze.category
  let action = analyze.action

  if (hasDocFile && category === 'document' && !userRequestsDocumentExport(userMessage)) {
    category = 'chat'
    action = 'answer'
  }

  const detected = detectRouteHeuristic(
    userMessage,
    hasVision,
    options?.priorTurns,
    hasDocFile,
  )
  if (detected) {
    const documentFromAi = category === 'document'
    const chartFromAi = category === 'chart'
    const diagramFromAi = category === 'diagram'
    const imageGenerateFromAi = category === 'image' && action === 'generate'
    const imageSearchFromAi = category === 'image' && action === 'search'
    if (!documentFromAi && !chartFromAi && !diagramFromAi && !imageGenerateFromAi && !imageSearchFromAi) {
      category = detected.category
      action = detected.action
    } else if (detected.category === 'document') {
      category = detected.category
      action = detected.action
    } else if (detected.category === 'chart') {
      category = detected.category
      action = detected.action
    } else if (detected.category === 'diagram') {
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

  if (category === 'document' || category === 'chart' || category === 'diagram' || category === 'image') {
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
  wantsPptx: boolean
  wantsChart: boolean
  wantsDiagram: boolean
  imageGenPrompt: string | null
  imageGenEmpty: boolean
  imageSearchQuery: string | null
  /** Frage zum Bild im Verlauf — Vision aus Storage nachladen, dann Hauptchat. */
  loadReferencedImageVision: boolean
}

/** Router nach Analyze — nur wenn kein Composer-Tile/Regex-Pfad aktiv (Regel A). */
export function resolveInstantRouteOverrides(
  analyze: InstantAnalyzeResult,
  userMessage: string,
  options: {
    composerRouteLocked: boolean
    priorTurns?: ReadonlyArray<ImageSearchPriorTurn>
    hasDocumentFileAttachment?: boolean
  },
): InstantRouteOverrides {
  const none: InstantRouteOverrides = {
    wantsWord: false,
    wantsPdf: false,
    wantsExcel: false,
    wantsPptx: false,
    wantsChart: false,
    wantsDiagram: false,
    imageGenPrompt: null,
    imageGenEmpty: false,
    imageSearchQuery: null,
    loadReferencedImageVision: false,
  }
  if (options.composerRouteLocked) {
    return none
  }

  const { category, action } = analyze

  if (
    options.hasDocumentFileAttachment &&
    category === 'document' &&
    !userRequestsDocumentExport(userMessage)
  ) {
    return none
  }

  if (category === 'document') {
    return {
      ...none,
      wantsWord: action === 'word_generate',
      wantsPdf: action === 'pdf_generate',
      wantsExcel: action === 'excel_generate',
      wantsPptx: action === 'pptx_generate',
    }
  }

  if (category === 'chart' && action === 'chart_generate') {
    return { ...none, wantsChart: true }
  }

  if (category === 'diagram' && action === 'diagram_generate') {
    return { ...none, wantsDiagram: true }
  }

  if (category === 'image' && action === 'search') {
    const query = extractImageSearchQuery(userMessage.trim(), analyze.intent, options.priorTurns)
    if (!query) {
      return none
    }
    return { ...none, imageSearchQuery: query }
  }

  if (category === 'image' && action === 'reference') {
    return { ...none, loadReferencedImageVision: true }
  }

  if (category === 'image' && action === 'describe') {
    return { ...none, loadReferencedImageVision: true }
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

/** Nur Fallback, wenn Instant-Analyze keine Bildgenerierung erkannt hat (0 Token vor Analyze). */
export function resolveHeuristicImageGenFallback(userMessage: string): Pick<
  InstantRouteOverrides,
  'imageGenPrompt' | 'imageGenEmpty'
> {
  const none = { imageGenPrompt: null, imageGenEmpty: false }
  const match = matchExplicitImageGenerationRequest(userMessage.trim())
  if (match.kind === 'empty') {
    return { ...none, imageGenEmpty: true }
  }
  if (match.kind === 'prompt') {
    return { imageGenPrompt: stripImageGenTilePromptPrefix(match.prompt), imageGenEmpty: false }
  }
  return none
}

export function buildInstantAnalyzeRoutePromptSection(): string {
  return [
    'Routing (verbindlich):',
    '- category: "chat" | "image" | "document" | "chart" | "diagram"',
    '- action (nur passend zur category):',
    '  - chat: "answer" | "short_answer" | "clarify" | "one_step"',
    '  - image: "generate" | "describe" | "search" | "reference"',
    '  - document: "word_generate" | "pdf_generate" | "excel_generate" | "pptx_generate"',
    '  - chart: "chart_generate"',
    '  - diagram: "diagram_generate"',
    '',
    buildInstantAnalyzeDocumentGenerateSection(),
    '',
    buildInstantAnalyzeChartGenerateSection(),
    '',
    buildInstantAnalyzeDiagramGenerateSection(),
    '',
    buildInstantAnalyzeDirectAnswerSection(),
    '',
    'Zuordnung (chat / image):',
    '- Normale Fragen, Erklärungen, Code, Mathe, Fehlersuche → chat (answer / one_step / short_answer / clarify).',
    '- «zeige/such/finde Foto/Bild von …» (reale Person/Sache/Ort) → image.search — **nicht** generate.',
    '- «generiere/erstelle/zeichne/male … Bild» → image.generate.',
    '- Anhang + «was siehst du / beschreibe das Bild» ohne Neuerstellung → image.describe.',
    '- **Verlauf:** Assistent hat zuvor ein Bild generiert/gezeigt; Nutzer fragt danach («wer ist das auf dem Bild», «was siehst du», «dein Bild») **ohne** neuen Anhang → image.reference (nicht generate, nicht search).',
    '- **Herkunft:** «wer hat das Bild gemacht/erstellt/generiert» nach Straton-Generierung → chat.answer (short_answer): **Straton/KI** in diesem Chat — **kein** image.reference, keine Vision nach externem Fotografen.',
    '- image.reference: App lädt das Verlaufsbild für Vision; du beschreibst den **sichtbaren** Inhalt — nie «ich kann keine Bilder sehen».',
    '- Aufgabe/Übung/lösen/berechnen/Zuordnung/Bild-Aufgabe → chat.answer (direkt lösen, nicht clarify).',
    '- Multiple-Choice mit Optionen (Zertifizierung, «which of the following», «richtige Antwort») → chat.short_answer — nicht chat.answer/normal.',
    '- Unklar: chat.answer mit Annahme — chat.clarify nur wenn wirklich nicht lösbar.',
    '- Kurze Folgen («und jetzt?», «mehr») mit Verlauf → chat.short_answer.',
    '- Folgenachricht mit «ihm/der/die», «zeige noch Bilder», «ich meine den Schauspieler» nach Fotosuche → image.search; Suchbegriff aus Verlauf (nicht «ihm» wörtlich).',
    '- Bei document.*, image.generate oder image.search: needs_live_web false.',
  ].join('\n')
}
