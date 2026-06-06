import { matchQuizPracticeIntent } from '../utils/quizFormatChoice'
import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import {
  userWantsSummaryDocumentExport,
} from './documentExportIntent'
import type { InstantAnalyzeResult } from './instantAnalyze'
import { syncReplyModeWithRoute } from './instantAnalyzeRoute'

/** Lernaufgabe im Hauptchat-Instant — steuert Antwortstil und Turn-Briefing. */
export type InstantChatTaskType = 'mc_solve' | 'quiz_generate' | 'explanation' | 'summary'

export type InstantExplanationDepth = 'brief' | 'standard' | 'detailed'

export const INSTANT_CHAT_TASK_TYPES: InstantChatTaskType[] = [
  'mc_solve',
  'quiz_generate',
  'explanation',
  'summary',
]

const SUMMARY_REQUEST_RE =
  /\b(fasse\s+zusammen|zusammenfassung|zusammenfassen|überblick|überblicks|stichwortartig|in\s+kapiteln|hauptpunkte\s+im\s+überblick|ausführliche?\s+zusammenfassung|zusammenfass(?:e|en)\s+(?:mir|bitte|das|den|die|zu|von))\b/i

const SUMMARY_TOPIC_REQUEST_RE =
  /\b(mach(?:e)?|erstell(?:e)?|schreib(?:e)?).{0,48}(ausführlich(?:e)?|zusammenfassung|zusammenfass(?:en|e))\b/i

const DETAILED_EXPLANATION_RE =
  /\b(ausführlich|detailliert|gründlich|im\s+detail|schritt\s+für\s+schritt|unterschiede?\s+zwischen|vergleich(?:e)?|alles\s+erklären|gut\s+erklären|was\s+sind\s+die\s+unterschiede)\b/i

const COMPLEX_EXPLANATION_TOPIC_RE =
  /\b(unterschied|vergleich|vor-?\s*und\s+nachteil|pro\s+und\s+contra|zusammenhang|ablauf|funktionsweise|architektur|theorie|konzept)\b/i

const QUIZ_GENERATION_VERB_RE =
  /\b(?:erstell|generier|mach|schreib|erzeug|stell\s+.+\s+(?:fragen|quiz)|teste?\s+mich|frag(?:e|en)?\s+mich\s+ab)\b/i

const FILE_ATTACHMENT_RE = /\[Datei:[^\]]+\][\s\S]*?\[\/Datei\]/i

/** Thema/Inhalt fragen — kein Zusammenfassungsauftrag («fasse zusammen»). */
const DOCUMENT_TOPIC_QUESTION_RE =
  /\b(über\s+was\s+geht|worum\s+geht|was\s+ist\s+das\s+thema|thema\s+(?:des|vom)\s+(?:dokument|pdf|anhang|material|dossier)|was\s+behandelt(?:\s+(?:das|der))?\s*(?:dokument|pdf|anhang|text)?|wofür\s+ist\s+(?:das\s+)?(?:dokument|pdf)|was\s+steht\s+(?:im|in\s+dem)\s+(?:dokument|pdf)|inhalt\s+(?:des|vom)\s+(?:dokument|pdf))\b/i

const SIMPLE_EXPLANATION_RE =
  /^(?:was\s+ist|was\s+sind|wer\s+ist|wann\s+war|wann\s+ist|define|definition)\b/i

export function parseInstantChatTaskType(value: unknown): InstantChatTaskType {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (INSTANT_CHAT_TASK_TYPES.includes(raw as InstantChatTaskType)) {
    return raw as InstantChatTaskType
  }
  return 'explanation'
}

export function parseInstantExplanationDepth(value: unknown): InstantExplanationDepth {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === 'brief' || raw === 'standard' || raw === 'detailed') {
    return raw
  }
  return 'standard'
}

function userWantsQuizGeneration(text: string): boolean {
  const t = text.trim()
  if (!t || !matchQuizPracticeIntent(t)) {
    return false
  }
  return QUIZ_GENERATION_VERB_RE.test(t)
}

export function userMessageWantsSummary(text: string, hasDocumentFileAttachment = false): boolean {
  const t = text.trim()
  if (!t) {
    return false
  }
  if (SUMMARY_REQUEST_RE.test(t) || SUMMARY_TOPIC_REQUEST_RE.test(t)) {
    return true
  }
  if (hasDocumentFileAttachment && /\b(fass|zusammenfass|überblick|inhalt|lies|lese|auswert)\b/i.test(t)) {
    return true
  }
  if (FILE_ATTACHMENT_RE.test(t) && /\b(fass|zusammenfass|überblick|inhalt)\b/i.test(t)) {
    return true
  }
  return false
}

export function userAsksDocumentTopicQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) {
    return false
  }
  return DOCUMENT_TOPIC_QUESTION_RE.test(t)
}

export function inferInstantExplanationDepth(
  userMessage: string,
  taskType: InstantChatTaskType,
): InstantExplanationDepth {
  if (taskType !== 'explanation') {
    return 'standard'
  }
  const t = userMessage.trim()
  if (!t) {
    return 'standard'
  }
  if (userAsksDocumentTopicQuestion(t) && !userMessageWantsSummary(t)) {
    return 'brief'
  }
  if (DETAILED_EXPLANATION_RE.test(t)) {
    return 'detailed'
  }
  if (
    COMPLEX_EXPLANATION_TOPIC_RE.test(t) &&
    (t.length > 48 || /\b(und|between|zwischen|vs\.?|gegenüber)\b/i.test(t))
  ) {
    return 'detailed'
  }
  if (SIMPLE_EXPLANATION_RE.test(t) && t.length < 120 && !COMPLEX_EXPLANATION_TOPIC_RE.test(t)) {
    return 'brief'
  }
  return 'standard'
}

export function classifyInstantChatTaskType(
  userMessage: string,
  analyze: Pick<InstantAnalyzeResult, 'category' | 'action' | 'reply_mode'>,
  options?: {
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>
  },
): InstantChatTaskType {
  const t = userMessage.trim()
  if (userMessageRequestsDirectAnswer(t, options?.priorTurns)) {
    return 'mc_solve'
  }
  if (userAsksDocumentTopicQuestion(t) && !userMessageWantsSummary(t, options?.hasDocumentFileAttachment === true)) {
    return 'explanation'
  }
  if (
    analyze.category === 'document' &&
    (analyze.action === 'pdf_generate' || analyze.action === 'word_generate') &&
    userWantsSummaryDocumentExport(t, options?.hasDocumentFileAttachment === true)
  ) {
    return 'summary'
  }
  if (analyze.category !== 'chat') {
    return 'explanation'
  }
  if (userWantsQuizGeneration(t)) {
    return 'quiz_generate'
  }
  if (userMessageWantsSummary(t, options?.hasDocumentFileAttachment === true)) {
    return 'summary'
  }
  if (analyze.action === 'short_answer' && analyze.reply_mode === 'short_answer') {
    return 'mc_solve'
  }
  return 'explanation'
}

export function applyInstantChatTaskTypeHeuristic(
  userMessage: string,
  analyze: InstantAnalyzeResult,
  options?: {
    hasDocumentFileAttachment?: boolean
    priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>
  },
): InstantAnalyzeResult {
  const aiTaskType = parseInstantChatTaskType(analyze.task_type)
  const heuristicTaskType = classifyInstantChatTaskType(userMessage, analyze, options)
  const wantsSummary = userMessageWantsSummary(userMessage, options?.hasDocumentFileAttachment === true)
  const task_type =
    heuristicTaskType === 'mc_solve' ||
    heuristicTaskType === 'quiz_generate' ||
    heuristicTaskType === 'summary'
      ? heuristicTaskType
      : aiTaskType === 'summary' && !wantsSummary
        ? heuristicTaskType
        : aiTaskType !== 'explanation'
          ? aiTaskType
          : heuristicTaskType

  const explanation_depth =
    task_type === 'explanation'
      ? inferInstantExplanationDepth(userMessage, task_type)
      : 'standard'

  let next: InstantAnalyzeResult = {
    ...analyze,
    task_type,
    explanation_depth,
  }

  if (task_type === 'summary') {
    next = syncReplyModeWithRoute({
      ...next,
      reply_mode: next.reply_mode === 'ask_only' ? 'normal' : next.reply_mode,
      clarity: 'clear',
      missing: [],
    })
  }

  if (task_type === 'mc_solve' && next.category === 'chat') {
    next = syncReplyModeWithRoute({
      ...next,
      category: 'chat',
      action: 'short_answer',
      reply_mode: 'short_answer',
      clarity: 'clear',
      missing: [],
    })
  }

  return next
}

export function shouldSuppressInstantBrevityForAnalyze(
  analyze: Pick<InstantAnalyzeResult, 'task_type' | 'explanation_depth'> | undefined,
): boolean {
  if (!analyze) {
    return false
  }
  if (analyze.task_type === 'summary') {
    return true
  }
  if (analyze.task_type === 'explanation' && analyze.explanation_depth === 'detailed') {
    return true
  }
  return false
}

export function shouldSuppressInstantMandatoryFollowUpForAnalyze(
  analyze: Pick<InstantAnalyzeResult, 'task_type' | 'explanation_depth'> | undefined,
): boolean {
  if (!analyze) {
    return false
  }
  if (analyze.task_type === 'summary' || analyze.task_type === 'mc_solve') {
    return true
  }
  if (analyze.task_type === 'explanation' && analyze.explanation_depth === 'detailed') {
    return true
  }
  return false
}

export function shouldSuppressInstantSolveDirectlyForAnalyze(
  analyze: Pick<InstantAnalyzeResult, 'task_type' | 'explanation_depth'> | undefined,
): boolean {
  if (!analyze) {
    return false
  }
  if (analyze.task_type === 'summary') {
    return true
  }
  if (analyze.task_type === 'explanation') {
    return true
  }
  return false
}

/** Summary-Instant: OpenAI gpt-5-mini statt Gemini (Experiment). */
export function shouldRouteSummaryInstantToOpenAi(
  analyze?: Pick<InstantAnalyzeResult, 'task_type'> | null,
  thinking = false,
): boolean {
  return !thinking && analyze?.task_type === 'summary'
}

/** Für Instant-Analyze-Systemprompt (Client + Edge-Text spiegeln). */
export function buildInstantAnalyzeTaskTypePromptSection(): string {
  return [
    '- task_type: "mc_solve" | "quiz_generate" | "explanation" | "summary"',
    '- explanation_depth: "brief" | "standard" | "detailed" (nur wenn task_type "explanation")',
    '',
    'task_type — Regeln:',
    '- mc_solve: Nutzer postet MC/Auswahlfrage mit Optionen oder will nur die richtige Antwort → reply_mode short_answer.',
    '- quiz_generate: Nutzer will Quiz/Fragen **erzeugen** («mach ein Quiz», «erstell Fragen zu …») — nicht mc_solve.',
    '- summary: «fasse zusammen», «Zusammenfassung», «überblick», «ausführliche Zusammenfassung zu …», [Datei:…] + zusammenfassen → reply_mode normal, clarity clear.',
    '- summary + document (PDF/Word): «ausführliches/zusammenfassendes PDF/Word», «PDF zusammenfassen» → category document, action pdf_generate/word_generate, **task_type summary**.',
    '- explanation: offene Fragen, Erklären, Vergleiche, How-to — auch «über was geht es im Dokument?» / Thema-Fragen **ohne** Zusammenfassungswunsch (task_type explanation, depth brief).',
    '',
    'explanation_depth:',
    '- brief: einfache Definition/Kurzfrage (z. B. «was ist BIOS» ohne «ausführlich»).',
    '- detailed: «ausführlich», «detailliert», «Unterschiede zwischen …», komplexe Themen mit mehreren Aspekten.',
    '- standard: alles andere bei explanation.',
  ].join('\n')
}

export function buildInstantTaskTypeTurnBriefing(analyze: InstantAnalyzeResult): string {
  switch (analyze.task_type) {
    case 'mc_solve':
      return [
        'Aufgabentyp MC lösen (verbindlich):',
        '- **Antwort zuerst:** `**Antwort: X**` oder kleine Tabelle mit ✓ — kein langer Essay.',
        '- Höchstens 1–2 Sätze Begründung danach.',
        '- Kein `### Verbesserungen`, keine Schluss-Anpassungsfrage.',
      ].join('\n')
    case 'quiz_generate':
      return [
        'Aufgabentyp Quiz erzeugen (verbindlich):',
        '- Wenn «Gewähltes Quiz-Format» im System-Prompt steht: **nur dieses** Format.',
        '- Ohne Formatwahl: kurz beide Optionen nennen (Markdown-MC vs. interaktives Quiz) — nicht beides mischen.',
        '- MC: `1. Frage`, darunter `A) …` `B) …` usw.; interaktives Quiz: STRATON_QUIZ_JSON-Block laut System-Prompt.',
      ].join('\n')
    case 'summary':
      return [
        'Aufgabentyp Zusammenfassung (verbindlich):',
        '- Beginne mit `## Zusammenfassung: [Thema]` — kein «Gerne helfe ich…».',
        '- Hauptteile als nummerierte Kapitel: `## 1. …`, `## 2. …` — **gesamten** Inhalt abdecken, nichts Wichtiges weglassen.',
        '- Rhythmus pro Kapitel: 1–2 Fließtext-Sätze → optional **Label:** + Stichpunkte → optional Tabelle → danach `---` (ausser beim letzten Kapitel).',
        '- Ausführlich, aber einfach und verständlich; logische Reihenfolge beibehalten.',
        '- Keine Informationen erfinden, die nicht im Material stehen.',
        '- **Kein** `### Verbesserungen`, **keine** Anpassungsfrage am Schluss — optional 1 kurzer Satz wie «Hast du Fragen zu einem Kapitel?».',
      ].join('\n')
    case 'explanation':
    default:
      if (analyze.explanation_depth === 'brief') {
        return [
          'Aufgabentyp Erklärung — kurz (verbindlich):',
          '- Eine `##`-Überschrift, dann 1–3 klare Sätze oder eine kompakte Liste.',
          '- **Keine** Kapitel-Zusammenfassung (`## 1. …`, `## Zusammenfassung:`) — nur die gefragte Info liefern.',
          '- Kein künstliches Aufblähen; Fachbegriffe kurz erklären.',
          '- Optional 1 freundlicher Satz am Schluss — kein `### Verbesserungen`.',
        ].join('\n')
      }
      if (analyze.explanation_depth === 'detailed') {
        return [
          'Aufgabentyp Erklärung — ausführlich (verbindlich):',
          '- `##`-Hauptüberschrift, dann Kapitel mit `###` oder nummerierten `## 1. …`-Abschnitten.',
          '- Gemischter Aufbau: Fliesstext + Stichpunkte + Tabellen/Vergleiche + Codeblöcke wenn hilfreich.',
          '- Zwischen grösseren Abschnitten `---` für klare Trennung.',
          '- Gründlich erklären, mit Beispielen — nicht nur Stichwortlisten.',
          '- Kein `### Verbesserungen`, keine Pflicht-Rückfrage am Schluss.',
        ].join('\n')
      }
      return [
        'Aufgabentyp Erklärung — Standard (verbindlich):',
        '- `##`-Überschrift, dann passende Tiefe: Absätze, optional kurze Liste oder Tabelle.',
        '- Einfache Sprache; komplexe Themen in verständliche Schritte gliedern.',
        '- Schluss optional: 1 kurzer Satz — kein langes Vorwort.',
      ].join('\n')
  }
}
