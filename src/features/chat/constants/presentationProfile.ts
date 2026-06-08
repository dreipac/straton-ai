import type {
  ChatMessage,
  PresentationLayoutMetricsMeta,
  PresentationProfileDebugMeta,
} from '../types'
import type { InstantAnalyzeResult } from './instantAnalyze'
import type { ThinkingAnalyzeResult, ThinkingTaskType } from './thinkingAnalyze'
import { resolveMainChatSystemPromptModules } from './chatPromptModules'
import type { MainChatSystemPromptModules } from './chatPromptModules'
import {
  buildDocumentSummaryPlaybook,
} from './documentAttachmentIntent'
import { stripComposerAttachmentBlocksForRouting } from '../utils/chatRoutingText'
import { parseAssistantRichBlocks } from '../utils/renderAssistantRichContent'

export type PresentationDensity = 'minimal' | 'standard' | 'rich'

export type PresentationLayout =
  | 'narrative'
  | 'structured'
  | 'tabular'
  | 'card_grid'
  | 'stepwise'
  | 'compare'

export type PresentationBlockKind =
  | 'hr'
  | 'table'
  | 'cards'
  | 'definition'
  | 'callout'
  | 'divided_list'
  | 'mcq'

export type PresentationForbidden =
  | 'long_bullets_only'
  | 'follow_up_question'
  | 'tables_only'
  | 'parallel_bullets'
  | 'long_prose'

export type PresentationChapterStyle = 'none' | 'numbered' | 'themed'

export type PresentationProfile = {
  density: PresentationDensity
  layout: PresentationLayout
  compact: boolean
  requiredBlocks: PresentationBlockKind[]
  forbiddenBlocks: PresentationForbidden[]
  chapterStyle: PresentationChapterStyle
  /** Steuert Zusatz-Briefing für Dokument-Zusammenfassungen */
  variant?: 'document_summary'
  /** Kurzbegründung für Admin-Debug */
  reason: string
}

export type PresentationProfileDebug = {
  density: PresentationDensity
  layout: PresentationLayout
  compact: boolean
  chapter_style: PresentationChapterStyle
  required_blocks: PresentationBlockKind[]
  forbidden_blocks: PresentationForbidden[]
  reason: string
}

export type PresentationLayoutMetrics = {
  tables: number
  cards: number
  card_tiles: number
  hr: number
  definitions: number
  callouts: number
  divided_lists: number
  divided_list_items: number
  mcq: number
  headings: number
  lists: number
  paragraphs: number
  code_blocks: number
}

const CARD_GRID_COMPARE_RE =
  /\b(unterschied|vergleich|gegenüber|gegenueber|vs\.?|pro\s+und\s+contra|vor-?\s*und\s+nachteil|alternativen?|optionen?\s+im\s+vergleich)\b/i

const CARD_GRID_MULTI_RE =
  /\bunterschiede?\s+zwischen\b|\b(arten|typen|kategorien|konzepte|modelle)\b.*\b(und|oder)\b/i

/** Parallele Kategorien/Typen (z. B. Steuerarten, Mythen, Kompetenzbereiche). */
const CARD_GRID_CATEGORY_RE =
  /\b(wichtige\s+)?(verschiedene\s+)?\w*(arten|typen)\b|\b(kategorien|formen|varianten|klassen)\b/i

const CARD_GRID_OVERVIEW_RE =
  /\b(übersicht|uebersicht)\b.*\b(arten|typen|kategorien|eigenschaften|merkmale)\b|\b(arten|typen|kategorien)\b.*\b(übersicht|uebersicht|eigenschaften|merkmale)\b/i

const TABULAR_INTENT_RE = /\b(zuordnung|tabelle|einnahme|ausgabe|matrix|spalte|zeile)\b/i

const GLOSSARY_HINT_RE = /\b(glossar|begriffe?|wörter|woerter\s+erklärt|abkürzung)\b/i

/** Mehrere Konzepte/Kategorien nebeneinander → ```cards```-Grid. */
export function detectCardGridIntent(userMessage: string, intent = ''): boolean {
  const text = `${userMessage} ${intent}`.trim()
  if (!text) {
    return false
  }
  if (CARD_GRID_COMPARE_RE.test(text)) {
    return true
  }
  if (CARD_GRID_MULTI_RE.test(text)) {
    return true
  }
  if (CARD_GRID_CATEGORY_RE.test(text)) {
    return true
  }
  if (CARD_GRID_OVERVIEW_RE.test(text)) {
    return true
  }
  const commaParts = text.split(/[,;]/).filter((p) => p.trim().length > 2)
  if (commaParts.length >= 3 && /\b(zwischen|vergleich|unterschied)\b/i.test(text)) {
    return true
  }
  return false
}

/** Reiches Layout-Mix für Modul-/Dokument-Zusammenfassungen — nicht nur Tabellen. */
function richDocumentSummaryProfile(reason: string): PresentationProfile {
  return profile({
    density: 'rich',
    compact: true,
    layout: 'card_grid',
    requiredBlocks: ['hr', 'cards', 'callout', 'definition', 'divided_list', 'table'],
    forbiddenBlocks: [
      'long_bullets_only',
      'follow_up_question',
      'tables_only',
      'parallel_bullets',
      'long_prose',
    ],
    chapterStyle: 'numbered',
    variant: 'document_summary',
    reason,
  })
}

function profile(
  partial: Omit<PresentationProfile, 'compact'> & { compact?: boolean },
): PresentationProfile {
  const density = partial.density
  return {
    ...partial,
    compact: partial.compact ?? density === 'minimal',
  }
}

export function resolveInstantPresentationProfileForMainChatTurn(params: {
  analyze: InstantAnalyzeResult
  userMessage: string
  priorTurns?: ReadonlyArray<Pick<ChatMessage, 'role' | 'content' | 'metadata'>>
  visionInlineDataUrl?: string | null
  webSearchContext?: string
}): PresentationProfile {
  const routingText = stripComposerAttachmentBlocksForRouting(params.userMessage)
  const { modules } = resolveMainChatSystemPromptModules({
    isMainChat: true,
    thinking: false,
    mainChatInstantPrompts: true,
    instantAnalyze: params.analyze,
    routingText,
    lastUserContent: params.userMessage,
    priorTurns: params.priorTurns,
    visionInlineDataUrl: params.visionInlineDataUrl,
    webSearchContext: params.webSearchContext,
  })
  return resolveInstantPresentationProfile({
    analyze: params.analyze,
    userMessage: routingText,
    modules,
  })
}

export function resolveThinkingPresentationProfileForTurn(params: {
  analyze: ThinkingAnalyzeResult
  userMessage: string
  phase?: 'clarify' | 'final'
}): PresentationProfile {
  return resolveThinkingPresentationProfile({
    analyze: params.analyze,
    userMessage: stripComposerAttachmentBlocksForRouting(params.userMessage),
    phase: params.phase,
  })
}

export function resolveInstantPresentationProfile(params: {
  analyze: InstantAnalyzeResult
  userMessage?: string
  modules?: Partial<MainChatSystemPromptModules>
}): PresentationProfile {
  const { analyze, modules } = params
  const userMessage = (params.userMessage ?? '').trim()
  const intent = analyze.intent.trim()

  if (analyze.category !== 'chat') {
    return profile({
      density: 'standard',
      layout: 'narrative',
      requiredBlocks: [],
      forbiddenBlocks: [],
      chapterStyle: 'none',
      reason: `Medien-Route (${analyze.category}/${analyze.action}) — kein Chat-Layout`,
    })
  }

  if (
    analyze.task_type === 'mc_solve' ||
    analyze.action === 'short_answer' ||
    analyze.reply_mode === 'short_answer'
  ) {
    return profile({
      density: 'minimal',
      layout: 'tabular',
      requiredBlocks: ['table'],
      forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
      chapterStyle: 'none',
      reason: 'MC / Direktantwort',
    })
  }

  if (analyze.task_type === 'quiz_generate') {
    return profile({
      density: 'standard',
      layout: 'structured',
      requiredBlocks: ['mcq'],
      forbiddenBlocks: ['follow_up_question'],
      chapterStyle: 'themed',
      reason: 'Quiz erzeugen',
    })
  }

  if (modules?.subscriptionUsage) {
    return profile({
      density: 'minimal',
      layout: 'narrative',
      requiredBlocks: [],
      forbiddenBlocks: ['long_bullets_only'],
      chapterStyle: 'none',
      reason: 'Abo-Verbrauch (Marker + Karten-UI)',
    })
  }

  if (modules?.tableExercise || TABULAR_INTENT_RE.test(intent) || TABULAR_INTENT_RE.test(userMessage)) {
    return profile({
      density: 'standard',
      layout: 'tabular',
      requiredBlocks: ['table'],
      forbiddenBlocks: ['long_bullets_only'],
      chapterStyle: 'none',
      reason: 'Tabellen-/Zuordnungsaufgabe',
    })
  }

  if (modules?.guidedDiagnosis || analyze.reply_mode === 'one_step') {
    return profile({
      density: 'standard',
      layout: 'stepwise',
      requiredBlocks: ['callout'],
      forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
      chapterStyle: 'none',
      reason: 'Geführte Fehlerdiagnose / ein Prüfschritt',
    })
  }

  if (analyze.task_type === 'summary') {
    return richDocumentSummaryProfile('Zusammenfassung')
  }

  if (analyze.explanation_depth === 'brief') {
    return profile({
      density: 'minimal',
      layout: 'narrative',
      requiredBlocks: ['definition'],
      forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
      chapterStyle: 'none',
      reason: 'Kurze Erklärung',
    })
  }

  if (analyze.explanation_depth === 'detailed') {
    const useCards = detectCardGridIntent(userMessage, intent)
    return profile({
      density: 'rich',
      layout: useCards ? 'card_grid' : 'structured',
      requiredBlocks: useCards ? ['cards', 'hr'] : ['hr', 'table'],
      forbiddenBlocks: useCards
        ? ['long_bullets_only', 'parallel_bullets']
        : ['long_bullets_only'],
      chapterStyle: 'numbered',
      reason: useCards ? 'Ausführliche Erklärung mit parallelen Kategorien' : 'Ausführliche Erklärung',
    })
  }

  if (detectCardGridIntent(userMessage, intent)) {
    return profile({
      density: 'standard',
      layout: 'card_grid',
      requiredBlocks: ['cards'],
      forbiddenBlocks: ['long_bullets_only', 'parallel_bullets'],
      chapterStyle: 'themed',
      reason: 'Parallele Kategorien / Typen / Vergleich (Intent-Heuristik)',
    })
  }

  if (GLOSSARY_HINT_RE.test(userMessage) || GLOSSARY_HINT_RE.test(intent)) {
    return profile({
      density: 'standard',
      layout: 'tabular',
      requiredBlocks: ['table'],
      forbiddenBlocks: [],
      chapterStyle: 'none',
      reason: 'Glossar / Begriffe',
    })
  }

  const useCards = detectCardGridIntent(userMessage, intent)
  return profile({
    density: 'standard',
    layout: useCards ? 'card_grid' : 'structured',
    requiredBlocks: useCards ? ['cards', 'hr'] : ['hr'],
    forbiddenBlocks: useCards ? ['parallel_bullets'] : [],
    chapterStyle: 'themed',
    reason: useCards ? 'Erklärung mit parallelen Kategorien/Typen' : 'Standard-Erklärung',
  })
}

export function resolveThinkingPresentationProfile(params: {
  analyze: ThinkingAnalyzeResult
  userMessage?: string
  phase?: 'clarify' | 'final'
}): PresentationProfile {
  const { analyze, phase = 'final' } = params
  const userMessage = (params.userMessage ?? '').trim()
  const intent = analyze.intent.trim()

  if (phase === 'clarify' || analyze.needs_clarification) {
    return profile({
      density: 'minimal',
      layout: 'narrative',
      requiredBlocks: [],
      forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
      chapterStyle: 'none',
      reason: 'Thinking Klärung — nur Rückfrage',
    })
  }

  const taskType = analyze.task_type

  if (userMessage && /\b(antwort|auswahl|mcq|multiple[- ]?choice)\b/i.test(userMessage)) {
    return profile({
      density: 'minimal',
      layout: 'tabular',
      requiredBlocks: ['table'],
      forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
      chapterStyle: 'none',
      reason: 'Thinking MC/Auswahl',
    })
  }

  switch (taskType) {
    case 'document_summary':
      return richDocumentSummaryProfile('Thinking Zusammenfassung')
    case 'decision_planning':
      return profile({
        density: 'standard',
        layout: 'compare',
        requiredBlocks: ['table', 'callout'],
        forbiddenBlocks: ['long_bullets_only'],
        chapterStyle: 'themed',
        reason: 'Thinking Entscheidung',
      })
    case 'server_setup':
    case 'software_setup':
    case 'process_howto':
      return profile({
        density: analyze.complexity === 'high' ? 'rich' : 'standard',
        layout: 'stepwise',
        requiredBlocks: ['hr', 'callout'],
        forbiddenBlocks: ['long_bullets_only'],
        chapterStyle: 'numbered',
        reason: `Thinking ${taskType}`,
      })
    case 'troubleshooting':
      return profile({
        density: 'standard',
        layout: 'stepwise',
        requiredBlocks: ['callout'],
        forbiddenBlocks: ['long_bullets_only', 'follow_up_question'],
        chapterStyle: 'none',
        reason: 'Thinking Fehlerdiagnose',
      })
    default: {
      const useCards = detectCardGridIntent(userMessage, intent)
      const rich = analyze.complexity === 'high'
      return profile({
        density: rich ? 'rich' : 'standard',
        layout: useCards ? 'card_grid' : 'structured',
        requiredBlocks: useCards ? ['cards', 'hr'] : rich ? ['hr', 'table'] : ['hr'],
        forbiddenBlocks: useCards ? ['parallel_bullets'] : [],
        chapterStyle: rich ? 'numbered' : 'themed',
        reason: useCards
          ? 'Thinking Erklärung mit parallelen Kategorien'
          : `Thinking ${taskTypeLabel(taskType)}`,
      })
    }
  }
}

function taskTypeLabel(taskType: ThinkingTaskType): string {
  switch (taskType) {
    case 'general_howto':
      return 'Erklärung'
    case 'other':
      return 'Aufgabe'
    default:
      return taskType
  }
}

export function presentationProfileToDebug(profile: PresentationProfile): PresentationProfileDebug {
  return {
    density: profile.density,
    layout: profile.layout,
    compact: profile.compact,
    chapter_style: profile.chapterStyle,
    required_blocks: [...profile.requiredBlocks],
    forbidden_blocks: [...profile.forbiddenBlocks],
    reason: profile.reason,
  }
}

export function presentationProfileToDebugMeta(profile: PresentationProfile): PresentationProfileDebugMeta {
  const d = presentationProfileToDebug(profile)
  return {
    density: d.density,
    layout: d.layout,
    compact: d.compact,
    chapter_style: d.chapter_style,
    required_blocks: [...d.required_blocks],
    forbidden_blocks: [...d.forbidden_blocks],
    reason: d.reason,
  }
}

export function layoutMetricsToDebugMeta(
  metrics: PresentationLayoutMetrics,
  profile?: PresentationProfile,
): PresentationLayoutMetricsMeta {
  const evaluation = profile ? evaluateLayoutMetricsAgainstProfile(metrics, profile) : null
  return {
    ...metrics,
    ...(evaluation
      ? {
          layout_satisfied: evaluation.satisfied,
          layout_missing: evaluation.missing,
        }
      : {}),
  }
}

const BLOCK_KIND_LABELS: Record<PresentationBlockKind, string> = {
  hr: 'Trennlinien (`---`) zwischen Hauptabschnitten',
  table: 'Markdown-Tabelle (GFM `| … |`) — nur Glossar/Parameter/Registry',
  cards: 'Konzept-Karten (Codeblock ```cards` mit label/title/body)',
  definition: 'Definition-Karte (`### Erklärung …` oder ```definition`)',
  callout:
    'Callout (`> !` Hinweis, `> ?` Tipp, `> !!` Achtung, `> ✓` Ergebnis) — nicht nur fette Label-Zeile',
  divided_list:
    'Aufzählung mit Trennlinien (```divided-list` mit `-` Zeilen) für Kernpunkte/Kompetenzen/Leitfragen-Kurzliste',
  mcq: 'Multiple-Choice (`1. Frage` + `A)–D)` je Zeile)',
}

const LAYOUT_HINTS: Record<PresentationLayout, string> = {
  narrative: 'Fließtext-first: kurze Absätze, Listen nur ergänzend.',
  structured: 'Gemischt: ##-Kapitel, Absätze, Listen und Tabellen abwechseln.',
  tabular: 'Tabellen bevorzugen für Daten, Zuordnungen und Vergleiche.',
  card_grid: 'Mehrere Konzepte als ```cards```-Block (Karten durch `---` trennen).',
  stepwise: 'Ein klarer Schritt pro Abschnitt; Shell-Befehle in ```bash```.',
  compare: 'Optionen in Tabelle vergleichen, Empfehlung als Callout oder Absatz.',
}

const FORBIDDEN_HINTS: Record<PresentationForbidden, string> = {
  long_bullets_only: 'Keine reine Stichpunktwand ohne Fließtext-Absätze.',
  follow_up_question: 'Kein `### Verbesserungen` und keine Schluss-Anpassungsfrage.',
  tables_only:
    'Nicht jedes Kapitel als Tabelle — Tabellen nur für Glossar, Parameter, Registry-Listen, Vergleiche.',
  parallel_bullets:
    'Keine `-`-Bullet-Liste für 3+ parallele Typen/Arten/Kategorien — stattdessen ```cards``` (je Eintrag eine Kachel) oder ```divided-list```.',
  long_prose:
    'Keine Fliesstext-Wände — max. 1 Einleitungssatz pro Kapitel, Rest nur Kacheln/```divided-list```/Callouts/`---`.',
}

function buildDocumentSummaryVisualMixBriefing(): string {
  return [
    'Zusammenfassung — visueller Mix (zusätzlich, kompakt + farbig):',
    '- **Jedes Kapitel anders strukturieren** — nicht 4× gleiches Muster.',
    '- **3+ parallele Typen/Arten/Kategorien** → ```cards``` mit `tone` + `badges`, **kurze** body-Zeilen:',
    '  ```cards',
    '  tone: teal',
    '  label: Einkommensteuer',
    '  title: Natürliche Personen',
    '  body: Erwerbs- und Kapitalerträge; progressiv.',
    '  badges: blue: Personensteuer',
    '  ---',
    '  tone: orange',
    '  label: MwSt',
    '  title: Konsumsteuer',
    '  body: Auf Waren & Dienstleistungen; Vorsteuerabzug möglich.',
    '  badges: orange: Umsatz',
    '  ```',
    '- **Leitfragen / Reflexion mit Antwort:** ```cards``` (je Frage eine Karte mit label/title/body).',
    '- **4–8 gleichwertige Fakten ohne eigene Typen** (Kernpunkte, Kompetenzen): ```divided-list` — nicht normale `-` Liste:',
    '  ```divided-list',
    '  title: Kernpunkte',
    '  - **Scheidungsquote:** ca. 43 % …',
    '  - **Güterstand:** Errungenschaftsbeteiligung …',
    '  ```',
    '- **Lernziel / Merksatz:** `> ! …` · **Tipp:** `> ? …` · **Warnung:** `> !! …` · **Ergebnis:** `> ✓ …`',
    '- **Einzelbegriff** (z. B. NDP, Dual-Stack): `### Erklärung zu NDP` + 2–3 Sätze (UI = Definition-Karte).',
    '- **Tabellen nur** für: Glossar (| Begriff | Erklärung |), ausfüllbare Parameter, Registry-Listen (RIPE, APNIC …).',
    '- **VERBOTEN:** Steuerarten/Typen/Arten als `-`-Liste; Leitfragen nur als Bullets; jedes Kapitel als Tabelle wenn Karten passen.',
    '- Pro langer Zusammenfassung: **mindestens 2** ```cards```-Blöcke oder **1 Block mit 3+ Kacheln**.',
    '- Zwischen nummerierten Hauptkapiteln `---`.',
  ].join('\n')
}

export function buildPresentationLayoutBriefing(profile: PresentationProfile): string {
  const lines = [
    'Layout-Profil (verbindlich für diese Antwort):',
    `- Dichte: ${profile.density}${profile.compact ? ' (kompakt)' : ''}`,
    `- Layout: ${profile.layout} — ${LAYOUT_HINTS[profile.layout]}`,
  ]

  if (profile.chapterStyle === 'numbered') {
    lines.push('- Kapitel: nummerierte `## 1. …`, `## 2. …` mit inhaltlicher Ausarbeitung.')
  } else if (profile.chapterStyle === 'themed') {
    lines.push('- Kapitel: thematische `##`-Überschriften; optional `###` für Unterpunkte.')
  } else {
    lines.push('- Kapitel: höchstens eine `##`-Überschrift — keine Kapitelwand.')
  }

  if (profile.requiredBlocks.length > 0) {
    lines.push('- Pflicht-Elemente:')
    for (const kind of profile.requiredBlocks) {
      lines.push(`  - ${BLOCK_KIND_LABELS[kind]}`)
    }
  }

  if (profile.forbiddenBlocks.length > 0) {
    lines.push('- Verboten:')
    for (const kind of profile.forbiddenBlocks) {
      lines.push(`  - ${FORBIDDEN_HINTS[kind]}`)
    }
  }

  if (profile.variant === 'document_summary') {
    lines.push(buildDocumentSummaryPlaybook())
    lines.push(buildDocumentSummaryVisualMixBriefing())
  } else if (profile.layout === 'structured' || profile.layout === 'stepwise') {
    lines.push(
      '- Rhythmus pro Abschnitt: 1–2 Fließtext-Sätze → Karten/Callout/Definition/Tabelle **abwechseln** — nicht nur Bullets.',
    )
  }

  return lines.join('\n')
}

export type RichContentBlockKind =
  | 'hr'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'ul'
  | 'ol'
  | 'blockquote'
  | 'code'
  | 'emailDraft'
  | 'table'
  | 'cards'
  | 'callout'
  | 'dividedList'
  | 'definition'
  | 'mcq'
  | 'math'

type MetricsBlock =
  | { type: RichContentBlockKind }
  | { type: 'cards'; cards: ReadonlyArray<unknown> }
  | { type: 'dividedList'; items: ReadonlyArray<unknown> }

export function computeLayoutMetricsFromAssistantContent(content: string): PresentationLayoutMetrics {
  return computeLayoutMetricsFromBlocks(parseAssistantRichBlocks(content))
}

export function computeLayoutMetricsFromBlocks(
  blocks: ReadonlyArray<MetricsBlock>,
): PresentationLayoutMetrics {
  const metrics: PresentationLayoutMetrics = {
    tables: 0,
    cards: 0,
    card_tiles: 0,
    hr: 0,
    definitions: 0,
    callouts: 0,
    divided_lists: 0,
    divided_list_items: 0,
    mcq: 0,
    headings: 0,
    lists: 0,
    paragraphs: 0,
    code_blocks: 0,
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'table':
        metrics.tables += 1
        break
      case 'cards':
        metrics.cards += 1
        if ('cards' in block && Array.isArray(block.cards)) {
          metrics.card_tiles += block.cards.length
        }
        break
      case 'hr':
        metrics.hr += 1
        break
      case 'definition':
        metrics.definitions += 1
        break
      case 'callout':
        metrics.callouts += 1
        break
      case 'dividedList':
        metrics.divided_lists += 1
        if ('items' in block && Array.isArray(block.items)) {
          metrics.divided_list_items += block.items.length
        }
        break
      case 'mcq':
        metrics.mcq += 1
        break
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        metrics.headings += 1
        break
      case 'ul':
      case 'ol':
        metrics.lists += 1
        break
      case 'p':
        metrics.paragraphs += 1
        break
      case 'code':
      case 'emailDraft':
        metrics.code_blocks += 1
        break
      default:
        break
    }
  }

  return metrics
}

export function formatLayoutMetricsSummary(metrics: PresentationLayoutMetrics): string {
  const parts: string[] = []
  if (metrics.tables) parts.push(`${metrics.tables} Tab.`)
  if (metrics.cards) parts.push(`${metrics.cards} Karten-Blöcke`)
  if (metrics.card_tiles) parts.push(`${metrics.card_tiles} Kacheln`)
  if (metrics.hr) parts.push(`${metrics.hr} Trennlinien`)
  if (metrics.definitions) parts.push(`${metrics.definitions} Definitionen`)
  if (metrics.callouts) parts.push(`${metrics.callouts} Callouts`)
  if (metrics.divided_lists) {
    parts.push(
      `${metrics.divided_lists} Listen${metrics.divided_list_items ? ` (${metrics.divided_list_items} Punkte)` : ''}`,
    )
  }
  if (metrics.mcq) parts.push(`${metrics.mcq} MCQ`)
  if (metrics.headings) parts.push(`${metrics.headings} Überschriften`)
  if (metrics.lists) parts.push(`${metrics.lists} Listen`)
  if (metrics.paragraphs) parts.push(`${metrics.paragraphs} Absätze`)
  if (metrics.code_blocks) parts.push(`${metrics.code_blocks} Code`)
  return parts.length > 0 ? parts.join(' · ') : 'keine strukturierten Blöcke'
}

export function evaluateLayoutMetricsAgainstProfile(
  metrics: PresentationLayoutMetrics,
  profile: PresentationProfile,
): { satisfied: string[]; missing: string[] } {
  const satisfied: string[] = []
  const missing: string[] = []

  const has = {
    hr: metrics.hr > 0,
    table: metrics.tables > 0,
    cards: metrics.cards > 0,
    definition: metrics.definitions > 0,
    callout: metrics.callouts > 0,
    divided_list: metrics.divided_lists > 0,
    mcq: metrics.mcq > 0,
  }

  for (const kind of profile.requiredBlocks) {
    if (has[kind]) {
      satisfied.push(kind)
    } else {
      missing.push(kind)
    }
  }

  if (
    profile.forbiddenBlocks.includes('long_bullets_only') &&
    metrics.lists > 0 &&
    metrics.paragraphs === 0 &&
    metrics.headings <= 1
  ) {
    missing.push('long_bullets_only')
  }

  if (
    profile.forbiddenBlocks.includes('tables_only') &&
    metrics.tables >= 2 &&
    metrics.cards === 0 &&
    metrics.callouts === 0 &&
    metrics.definitions === 0 &&
    metrics.divided_lists === 0
  ) {
    missing.push('tables_only')
  }

  if (
    profile.forbiddenBlocks.includes('parallel_bullets') &&
    metrics.lists > 0 &&
    metrics.card_tiles < 3
  ) {
    missing.push('parallel_bullets')
  }

  if (
    profile.forbiddenBlocks.includes('long_prose') &&
    metrics.paragraphs >= 6 &&
    metrics.card_tiles < metrics.paragraphs
  ) {
    missing.push('long_prose')
  }

  return { satisfied, missing }
}
