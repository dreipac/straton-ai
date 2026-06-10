export type ThinkingTaskType =
  | 'server_setup'
  | 'software_setup'
  | 'troubleshooting'
  | 'document_summary'
  | 'process_howto'
  | 'decision_planning'
  | 'general_howto'
  | 'other'

export type ThinkingComplexity = 'low' | 'medium' | 'high'

export type ThinkingAnalyzeDimension = {
  id: string
  label: string
  question_hint: string
}

import type {
  PresentationLayoutMetricsMeta,
  PresentationProfileDebugMeta,
  ThinkingAnalyzeDebugMeta,
} from '../types'
import { getSecretSafetyInstruction } from './chatSecretSafety'
import { resolveDocumentCoverageTopics } from './documentSummaryPlaybook'
import {
  parseThinkingLayoutHint,
  parseThinkingOutputTier,
  type ThinkingLayoutHint,
  type ThinkingOutputTier,
} from './thinkingOutputTier'
import { buildThinkingAnalyzeIntentPromptSection } from './thinkingTaskRouting'

export type { ThinkingLayoutHint, ThinkingOutputTier } from './thinkingOutputTier'

export type ThinkingAnalyzeResult = {
  task_type: ThinkingTaskType
  complexity: ThinkingComplexity
  /** Steuert Gemini-Modell (Standard vs. Rich) in Draft/Review/Final. */
  output_tier: ThinkingOutputTier
  /** Layout-Empfehlung für Draft/Review/Final. */
  layout_hint: ThinkingLayoutHint
  intent: string
  assumptions: string[]
  risks: string[]
  missing_dimensions: ThinkingAnalyzeDimension[]
  /** Nur bei echtem Blocker — sonst sofort Entwurf + finale Antwort. */
  needs_clarification: boolean
  clarify_rounds_planned: number
  analysis_summary: string
  /** Aktuelle Web-Fakten vor Draft/Review/Final nötig (Tavily). */
  needs_live_web: boolean
  web_query: string
  web_reason: string
  /** Pflicht-Themen aus dem Anhang (Analyze + Heuristik) — nur bei document_summary. */
  document_coverage_topics?: string[]
}

const TASK_TYPES: ThinkingTaskType[] = [
  'server_setup',
  'software_setup',
  'troubleshooting',
  'document_summary',
  'process_howto',
  'decision_planning',
  'general_howto',
  'other',
]

const COMPLEXITY_VALUES: ThinkingComplexity[] = ['low', 'medium', 'high']

const MAX_CLARIFY_ROUNDS = 1

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

function sanitizeDimensions(raw: unknown): ThinkingAnalyzeDimension[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: ThinkingAnalyzeDimension[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const o = item as Record<string, unknown>
    const id = clipText(o.id, 40).replace(/\s+/g, '_').toLowerCase()
    const label = clipText(o.label, 80)
    const question_hint = clipText(o.question_hint, 120)
    if (!id || !label || seen.has(id)) {
      continue
    }
    seen.add(id)
    out.push({
      id,
      label,
      question_hint: question_hint || label,
    })
    if (out.length >= 6) {
      break
    }
  }
  return out
}

export function sanitizeThinkingAnalyzeResult(raw: unknown): ThinkingAnalyzeResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const taskRaw = typeof o.task_type === 'string' ? o.task_type.trim() : ''
  const task_type = TASK_TYPES.includes(taskRaw as ThinkingTaskType)
    ? (taskRaw as ThinkingTaskType)
    : 'other'
  const complexityRaw = typeof o.complexity === 'string' ? o.complexity.trim() : ''
  const complexity = COMPLEXITY_VALUES.includes(complexityRaw as ThinkingComplexity)
    ? (complexityRaw as ThinkingComplexity)
    : 'medium'
  const intent = clipText(o.intent, 160) || 'Aufgabe bearbeiten'
  const assumptions = asStringArray(o.assumptions, 4, 100)
  const risks = asStringArray(o.risks, 5, 100)
  let missing_dimensions = sanitizeDimensions(o.missing_dimensions)
  let needs_clarification = o.needs_clarification === true
  let clarify_rounds_planned =
    typeof o.clarify_rounds_planned === 'number' && Number.isFinite(o.clarify_rounds_planned)
      ? Math.round(o.clarify_rounds_planned)
      : needs_clarification
        ? 1
        : 0
  clarify_rounds_planned = Math.min(MAX_CLARIFY_ROUNDS, Math.max(0, clarify_rounds_planned))
  const analysis_summary =
    clipText(o.analysis_summary, task_type === 'document_summary' ? 420 : 280) || intent

  let needs_live_web = o.needs_live_web === true
  let web_query = clipText(o.web_query, 120)
  let web_reason = clipText(o.web_reason, 80)
  if (!needs_live_web) {
    web_query = ''
    web_reason = ''
  }

  if (!needs_clarification) {
    missing_dimensions = []
    clarify_rounds_planned = 0
  } else {
    if (missing_dimensions.length === 0) {
      missing_dimensions = defaultDimensionsForTask(task_type).slice(0, 1)
    } else {
      missing_dimensions = missing_dimensions.slice(0, 1)
    }
    clarify_rounds_planned = Math.max(1, Math.min(1, clarify_rounds_planned))
  }

  const document_coverage_topics =
    task_type === 'document_summary'
      ? asStringArray(o.document_coverage_topics, 20, 100)
      : []
  const output_tier = parseThinkingOutputTier(o.output_tier) ?? 'standard'
  const layout_hint =
    parseThinkingLayoutHint(o.layout_hint) ??
    (task_type === 'document_summary' ? 'cards' : 'narrative')

  return {
    task_type,
    complexity,
    output_tier,
    layout_hint,
    intent,
    assumptions,
    risks,
    missing_dimensions,
    needs_clarification,
    clarify_rounds_planned,
    analysis_summary,
    needs_live_web,
    web_query,
    web_reason,
    ...(document_coverage_topics.length > 0 ? { document_coverage_topics } : {}),
  }
}

export function enrichThinkingAnalyzeDocumentCoverage(
  userMessage: string,
  analyze: ThinkingAnalyzeResult,
): ThinkingAnalyzeResult {
  if (analyze.task_type !== 'document_summary') {
    return analyze
  }
  const topics = resolveDocumentCoverageTopics({
    userMessage,
    analyzeTopics: analyze.document_coverage_topics,
  })
  return topics.length > 0 ? { ...analyze, document_coverage_topics: topics } : analyze
}

function defaultDimensionsForTask(taskType: ThinkingTaskType): ThinkingAnalyzeDimension[] {
  switch (taskType) {
    case 'server_setup':
      return [
        { id: 'hosting', label: 'Hosting / Umgebung', question_hint: 'Wo läuft der Server (VPS, eigenes Gerät, Cloud)?' },
        { id: 'stack', label: 'Stack & Inhalt', question_hint: 'Was soll ausgeliefert werden (static, CMS, App)?' },
        { id: 'domain_ssl', label: 'Domain & HTTPS', question_hint: 'Eigene Domain mit HTTPS oder nur IP/Test?' },
        { id: 'access', label: 'Zugriff & Erfahrung', question_hint: 'SSH/sudo vorhanden? Erfahrungslevel?' },
      ]
    case 'software_setup':
      return [
        { id: 'platform', label: 'Plattform / Gerät', question_hint: 'Welches OS, Gerät oder welche Umgebung?' },
        { id: 'goal', label: 'Ziel der Software', question_hint: 'Was soll die Software danach können?' },
        { id: 'constraints', label: 'Rahmen', question_hint: 'Version, Lizenz, bestehende Installation?' },
      ]
    case 'troubleshooting':
      return [
        { id: 'symptom', label: 'Symptom', question_hint: 'Was genau funktioniert nicht?' },
        { id: 'environment', label: 'Umgebung', question_hint: 'OS, Version, seit wann, letzte Änderung?' },
        { id: 'already_tried', label: 'Bereits versucht', question_hint: 'Was hast du schon geprüft oder geändert?' },
      ]
    case 'document_summary':
      return [
        { id: 'material', label: 'Material', question_hint: 'Welches Dokument oder welcher Anhang gilt?' },
        { id: 'focus', label: 'Fokus', question_hint: 'Gesamtüberblick oder bestimmte Aspekte?' },
        { id: 'depth', label: 'Tiefe', question_hint: 'Kurz, standard oder sehr ausführlich?' },
      ]
    case 'process_howto':
      return [
        { id: 'goal', label: 'Ziel', question_hint: 'Was soll am Ende erreicht sein?' },
        { id: 'context', label: 'Ausgangslage', question_hint: 'Was ist schon vorhanden / welche Vorkenntnisse?' },
        { id: 'constraints', label: 'Rahmen', question_hint: 'Zeit, Budget, Tools, Regeln?' },
      ]
    case 'decision_planning':
      return [
        { id: 'options', label: 'Optionen', question_hint: 'Welche Alternativen stehen zur Wahl?' },
        { id: 'criteria', label: 'Kriterien', question_hint: 'Was ist dir am wichtigsten (Preis, Zeit, Qualität)?' },
        { id: 'constraints', label: 'Rahmen', question_hint: 'Harte Grenzen oder No-Gos?' },
      ]
    default:
      return [
        { id: 'goal', label: 'Ziel', question_hint: 'Was soll am Ende erreicht sein?' },
        { id: 'context', label: 'Kontext', question_hint: 'Welche Ausgangslage oder welches Umfeld?' },
        { id: 'constraints', label: 'Rahmen', question_hint: 'Zeit, Erfahrung, Tools, Einschränkungen?' },
      ]
  }
}

function classifyThinkingTaskType(lower: string): ThinkingTaskType {
  if (/\b(server|vps|webserver|nginx|apache|ssl|certbot|hosting|ubuntu|debian|linux[\s-]?server)\b/i.test(lower)) {
    return 'server_setup'
  }
  if (/\b(installier|einricht|konfigur|setup|aktivier|deaktivier).*\b(app|programm|software|tool|plugin|extension)\b/i.test(lower)) {
    return 'software_setup'
  }
  if (/\b(fehler|funktioniert nicht|kaputt|debug|abstürz|crash|timeout|geht nicht)\b/i.test(lower)) {
    return 'troubleshooting'
  }
  if (/\b(zusammenfass|fass.*zusammen|dokument|pdf|anhang|transkript)\b/i.test(lower)) {
    return 'document_summary'
  }
  if (/\b(vergleich|entscheid|welche[s]?\s+.+\s+ist besser|soll ich)\b/i.test(lower)) {
    return 'decision_planning'
  }
  if (/\b(wie\s+(mache|richte|baue|erstell|kann ich)|schritt|anleitung|tutorial|plan)\b/i.test(lower)) {
    return 'process_howto'
  }
  return 'general_howto'
}

function estimateThinkingComplexity(trimmed: string, taskType: ThinkingTaskType): ThinkingComplexity {
  if (trimmed.length < 22 && !/\b(und|mit|für)\b/i.test(trimmed)) {
    return 'low'
  }
  if (
    taskType === 'server_setup' ||
    taskType === 'troubleshooting' ||
    (taskType === 'process_howto' && trimmed.length > 50) ||
    trimmed.length > 100
  ) {
    return 'high'
  }
  return 'medium'
}

export function fallbackThinkingAnalyzeResult(userMessage: string): ThinkingAnalyzeResult {
  const trimmed = userMessage.trim()
  const task_type = classifyThinkingTaskType(trimmed.toLowerCase())
  const complexity = estimateThinkingComplexity(trimmed, task_type)
  const vague = trimmed.length < 18 && !/\[Datei:/i.test(trimmed)
  const needs_clarification = vague

  return sanitizeThinkingAnalyzeResult({
    task_type,
    complexity,
    intent: trimmed.slice(0, 160) || 'Aufgabe bearbeiten',
    assumptions: [],
    risks: [],
    missing_dimensions: needs_clarification ? defaultDimensionsForTask(task_type).slice(0, 1) : [],
    needs_clarification,
    clarify_rounds_planned: needs_clarification ? 1 : 0,
    analysis_summary: needs_clarification
      ? `Aufgabe (${task_type}) — eine Klärungsfrage, dann ausführliche Antwort.`
      : `Aufgabe (${task_type}) — direkt ausführliche Antwort mit Annahmen.`,
  })!
}

export function buildThinkingAnalyzeSystemPrompt(): string {
  return [
    getSecretSafetyInstruction(),
    'Du analysierst JEDE Nutzeraufgabe für den Straton-Thinking-Modus (Gemini 3.1 Flash Lite; Draft/Review/Final nach output_tier).',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown).',
    '',
    'Felder:',
    '- task_type: "server_setup" | "software_setup" | "troubleshooting" | "document_summary" | "process_howto" | "decision_planning" | "general_howto" | "other"',
    '- complexity: "low" | "medium" | "high"',
    '- output_tier: "standard" | "rich" — document_summary immer rich; complexity high → rich; MC/kurz → standard.',
    '- layout_hint: "cards" | "stepwise" | "tabular" | "narrative" — document_summary → cards; Setup/How-to → stepwise; MC/Vergleich → tabular.',
    '- intent, assumptions[], risks[], needs_clarification (boolean), missing_dimensions[{id,label,question_hint}], clarify_rounds_planned (0 oder 1), analysis_summary',
    '- document_coverage_topics: string[] — nur bei task_type document_summary und [Datei:…] mit Text: 4–20 **thematische** Pflichtpunkte aus dem Anhang (Kurztitel je Thema, nicht nur «Aufgabe 5»); sonst []',
    '- needs_live_web: true wenn aktuelle Web-Fakten nötig (Preise, Kurse, News, Gesetzes-/Rechtslage, «aktuell», Versionen, Termine)',
    '- web_query: optimierte Suchanfrage auf Deutsch (max. 120 Zeichen), nur wenn needs_live_web true, sonst ""',
    '- web_reason: kurzer Grund (max. 80 Zeichen), nur wenn needs_live_web true, sonst ""',
    '',
    'needs_live_web:',
    '- true bei «aktuell», «neueste», Kurs/Preis/News, Gesetzeslage mit Zeitbezug, Verfügbarkeit/Version heute.',
    '- false bei Coding, Mathe, Server-Setup-Anleitung ohne Zeitbezug, reiner [Datei:…]-Inhalt ohne Live-Fakten, Straton-Verbrauch/Limits/Guthaben (auch «aktuell»).',
    '- Bei needs_clarification true: needs_live_web darf true bleiben (Websuche erst nach Klärung).',
    '',
    buildThinkingAnalyzeIntentPromptSection(),
    '',
    'needs_clarification — sehr selten true:',
    '- true NUR bei echtem Blocker: Produktion/Datenverlust ohne Kontext, zwei gleich wertige Wege, oder Anfrage völlig unklar (<15 Zeichen ohne Material).',
    '- false in den allermeisten Fällen — auch bei Server-Setup, How-tos, Dokumenten mit Anhang; dann Annahmen nutzen.',
    '- Bei needs_clarification false: missing_dimensions [] und clarify_rounds_planned 0.',
    '- Bei needs_clarification true: genau 1 Dimension in missing_dimensions, clarify_rounds_planned 1.',
    '',
    'document_summary + [Datei:…]-Block mit Text:',
    '- analysis_summary: **inhaltlicher Kern** in 2–4 Sätzen (konkrete Themen, Fakten, Ziele aus dem Anhang) — **nicht** «Nutzer will PDF zusammenfassen».',
    '- Bei Arbeitsblatt/Übungen im Anhang: analysis_summary = **integriertes Lernskript** (Themen ausgearbeitet), nicht «Aufgabe/Lösung-Format».',
    '- assumptions[]: nur echte Lücken (z. B. fehlende Seiten), **nicht** eine Aufzählung der Dokumentkapitel.',
    '- document_coverage_topics: alle wesentlichen Themen/Aufträge/Kapitel aus dem Anhang — Reihenfolge beibehalten, je Eintrag ein kurzer thematischer Titel.',
  ].join('\n')
}

export function buildThinkingAnalyzeBriefingForGateway(
  analyze: ThinkingAnalyzeResult,
  intakeSummary?: string,
): string {
  const lines = [
    'Thinking — Aufgabenanalyse (verbindlich):',
    `Zusammenfassung: ${analyze.analysis_summary}`,
    `Kategorie (task_type): ${analyze.task_type} — steuert Entwurf, Review und finale Struktur.`,
    `Komplexität: ${analyze.complexity}`,
    `Output-Tier: ${analyze.output_tier}`,
    `Layout-Hinweis: ${analyze.layout_hint}`,
    `Absicht: ${analyze.intent}`,
    `Klärung vor Lieferung: ${analyze.needs_clarification ? 'ja (max. 1 Runde)' : 'nein — direkt liefern'}`,
  ]
  if (analyze.assumptions.length > 0) {
    lines.push(`Annahmen (falls Nutzer schweigt): ${analyze.assumptions.join('; ')}`)
  }
  if (analyze.risks.length > 0) {
    lines.push(`Risiken beachten: ${analyze.risks.join('; ')}`)
  }
  const open = analyze.missing_dimensions.map((d) => d.label).join(', ')
  if (open) {
    lines.push(`Noch zu klären (Dimensionen): ${open}`)
  }
  if (intakeSummary?.trim()) {
    lines.push(`Bereits vom Nutzer bestätigt:\n${intakeSummary.trim()}`)
  }
  if (analyze.task_type === 'document_summary' || analyze.layout_hint === 'cards') {
    lines.push(
      'Lieferung Phase 2/3: **Lernzusammenfassung** mit ```cards```/```divided-list``` — alle Themen inhaltlich; **kein** «Aufgabe:/Lösung:»-Format. Keine Meta-Beschreibung («das Dossier deckt…»).',
    )
  }
  if (analyze.layout_hint === 'stepwise') {
    lines.push('Layout: nummerierte ##-Kapitel, Schritt für Schritt — zwischen Hauptteilen `---`.')
  }
  if (analyze.layout_hint === 'tabular') {
    lines.push('Layout: präzise Antwort/Tabelle zuerst — kein Essay.')
  }
  return lines.join('\n')
}

export function formatThinkingAnalyzeContextLines(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  return turns
    .slice(-8)
    .map((t) => {
      const label = t.role === 'user' ? 'Nutzer' : 'Assistent'
      const body = t.content
        .replace(/<<<STRATON_THINKING_CLARIFY>>>[\s\S]*?<<<END_STRATON_THINKING_CLARIFY>>>/g, '[Rückfrage]')
        .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '[Bild]')
        .trim()
      const clipped = body.length > 600 ? `${body.slice(0, 600)}…` : body
      return `${label}: ${clipped}`
    })
    .join('\n')
}

export const THINKING_MAX_CLARIFY_ROUNDS = MAX_CLARIFY_ROUNDS

export type ThinkingAnalyzeInvokeResult = {
  analyze: ThinkingAnalyzeResult
  source: 'edge' | 'fallback'
  analyzeFromAi?: ThinkingAnalyzeResult
}

export function buildThinkingAnalyzeDebugMeta(params: {
  invoke: ThinkingAnalyzeInvokeResult
  presentationProfile?: PresentationProfileDebugMeta
  layoutMetrics?: PresentationLayoutMetricsMeta
}): ThinkingAnalyzeDebugMeta {
  const { invoke } = params
  const fromAi = invoke.analyzeFromAi ?? invoke.analyze
  const final = invoke.analyze
  const heuristicApplied =
    invoke.source === 'edge' &&
    Boolean(invoke.analyzeFromAi) &&
    (invoke.analyzeFromAi!.needs_clarification !== final.needs_clarification ||
      invoke.analyzeFromAi!.clarify_rounds_planned !== final.clarify_rounds_planned ||
      invoke.analyzeFromAi!.task_type !== final.task_type ||
      invoke.analyzeFromAi!.needs_live_web !== final.needs_live_web ||
      invoke.analyzeFromAi!.web_query !== final.web_query)

  return {
    source: invoke.source,
    task_type: final.task_type,
    complexity: final.complexity,
    intent: final.intent,
    needs_clarification_from_ai: fromAi.needs_clarification,
    needs_clarification_final: final.needs_clarification,
    clarify_rounds_planned_final: final.clarify_rounds_planned,
    needs_live_web_from_ai: fromAi.needs_live_web,
    needs_live_web_final: final.needs_live_web,
    web_query: final.web_query,
    web_reason: final.web_reason,
    heuristic_applied: heuristicApplied,
    analysis_summary: final.analysis_summary,
    ...(final.document_coverage_topics?.length
      ? { document_coverage_topics: [...final.document_coverage_topics] }
      : {}),
    ...(params.presentationProfile ? { presentation_profile: params.presentationProfile } : {}),
    ...(params.layoutMetrics ? { layout_metrics: params.layoutMetrics } : {}),
  }
}
