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

export type ThinkingAnalyzeResult = {
  task_type: ThinkingTaskType
  complexity: ThinkingComplexity
  intent: string
  assumptions: string[]
  risks: string[]
  missing_dimensions: ThinkingAnalyzeDimension[]
  clarify_rounds_planned: number
  analysis_summary: string
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

const MAX_CLARIFY_ROUNDS = 4

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
  let clarify_rounds_planned =
    typeof o.clarify_rounds_planned === 'number' && Number.isFinite(o.clarify_rounds_planned)
      ? Math.round(o.clarify_rounds_planned)
      : 2
  clarify_rounds_planned = Math.min(MAX_CLARIFY_ROUNDS, Math.max(1, clarify_rounds_planned))
  const analysis_summary = clipText(o.analysis_summary, 280) || intent

  if (missing_dimensions.length === 0 && complexity !== 'low') {
    missing_dimensions = defaultDimensionsForTask(task_type)
  }
  if (complexity === 'low') {
    clarify_rounds_planned = Math.min(clarify_rounds_planned, 1)
  } else if (complexity === 'high') {
    clarify_rounds_planned = Math.max(clarify_rounds_planned, Math.min(3, missing_dimensions.length || 2))
  }

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
  const missing_dimensions =
    complexity === 'low'
      ? defaultDimensionsForTask(task_type).slice(0, 1)
      : defaultDimensionsForTask(task_type)

  const planned =
    complexity === 'low' ? 1 : complexity === 'high' ? Math.min(4, missing_dimensions.length) : 2

  return sanitizeThinkingAnalyzeResult({
    task_type,
    complexity,
    intent: trimmed.slice(0, 160) || 'Aufgabe bearbeiten',
    assumptions: [],
    risks: [],
    missing_dimensions,
    clarify_rounds_planned: planned,
    analysis_summary: `Aufgabe (${task_type}) — zuerst ${planned} Klärungsrunde(n), dann ausführliche Antwort.`,
  })!
}

export function buildThinkingAnalyzeSystemPrompt(): string {
  return [
    'Du analysierst JEDE Nutzeraufgabe für den Straton-Thinking-Modus — nicht nur Server/Linux.',
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown).',
    '',
    'Felder:',
    '- task_type: "server_setup" | "software_setup" | "troubleshooting" | "document_summary" | "process_howto" | "decision_planning" | "general_howto" | "other"',
    '- complexity: "low" | "medium" | "high"',
    '- intent, assumptions[], risks[], missing_dimensions[{id,label,question_hint}], clarify_rounds_planned (1–4), analysis_summary',
    '',
    'Wichtig — missing_dimensions:',
    '- Immer themenspezifisch zur konkreten Nutzerfrage ableiten (2–6 Dimensionen), nicht generisch kopieren.',
    '- Beispiele (nur als Muster — immer anpassen):',
    '  • Server/Webhosting: hosting, stack, domain_ssl, access',
    '  • Excel-Report automatisieren: excel_version, data_source, output_format',
    '  • Umzug WLAN: apartment_size, router_model, isp',
    '  • Bewerbung schreiben: role, experience_level, language_tone',
    '  • Rezept: servings, diet, equipment',
    '- complexity "low": eine enge Frage, 1 Klärungsrunde reicht oft.',
    '- complexity "high": mehrdeutig, viele Abhängigkeiten → 2–4 Runden.',
    '- clarify_rounds_planned ≤ Anzahl sinnvoller offener Dimensionen.',
  ].join('\n')
}

export function buildThinkingAnalyzeBriefingForGateway(
  analyze: ThinkingAnalyzeResult,
  intakeSummary?: string,
): string {
  const lines = [
    'Thinking — Aufgabenanalyse (verbindlich):',
    `Zusammenfassung: ${analyze.analysis_summary}`,
    `Typ: ${analyze.task_type} | Komplexität: ${analyze.complexity}`,
    `Absicht: ${analyze.intent}`,
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
