import { matchQuizPracticeIntent } from '../utils/quizFormatChoice'
import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import {
  buildDocumentVisibilityTurnBriefing,
  normalizeDocumentIntentUserText,
  userAsksDocumentVisibilityQuestion,
  userMessageWantsDocumentSummary,
} from './documentAttachmentIntent'
import { userWantsSummaryDocumentExport } from './documentExportIntent'
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

const DETAILED_EXPLANATION_RE =
  /\b(ausführlich|detailliert|gründlich|im\s+detail|schritt\s+für\s+schritt|unterschiede?\s+zwischen|vergleich(?:e)?|alles\s+erklären|gut\s+erklären|was\s+sind\s+die\s+unterschiede)\b/i

const COMPLEX_EXPLANATION_TOPIC_RE =
  /\b(unterschied|vergleich|vor-?\s*und\s+nachteil|pro\s+und\s+contra|zusammenhang|ablauf|funktionsweise|architektur|theorie|konzept)\b/i

const QUIZ_GENERATION_VERB_RE =
  /\b(?:erstell|generier|mach|schreib|erzeug|stell\s+.+\s+(?:fragen|quiz)|teste?\s+mich|frag(?:e|en)?\s+mich\s+ab)\b/i

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
  return userMessageWantsDocumentSummary(text, hasDocumentFileAttachment)
}

export function userAsksDocumentTopicQuestion(text: string): boolean {
  const t = normalizeDocumentIntentUserText(text)
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
  const t = normalizeDocumentIntentUserText(userMessage)
  if (!t) {
    return 'standard'
  }
  if (userAsksDocumentVisibilityQuestion(t)) {
    return 'brief'
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
  const t = normalizeDocumentIntentUserText(userMessage)
  if (userMessageRequestsDirectAnswer(t, options?.priorTurns)) {
    return 'mc_solve'
  }
  if (userAsksDocumentVisibilityQuestion(t)) {
    return 'explanation'
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

  if (options?.hasDocumentFileAttachment && userAsksDocumentVisibilityQuestion(userMessage)) {
    next = syncReplyModeWithRoute({
      ...next,
      category: 'chat',
      action: 'answer',
      reply_mode: 'short_answer',
      clarity: 'clear',
      missing: [],
      needs_live_web: false,
      web_query: '',
      task_type: 'explanation',
      explanation_depth: 'brief',
      intent: 'Anhang-Sichtbarkeit bestätigen',
    })
  }

  if (
    wantsSummary &&
    next.task_type !== 'mc_solve' &&
    !userAsksDocumentVisibilityQuestion(userMessage)
  ) {
    next = syncReplyModeWithRoute({
      ...next,
      task_type: 'summary',
      explanation_depth: 'standard',
      clarity: 'clear',
      missing: [],
      reply_mode: next.reply_mode === 'ask_only' ? 'normal' : next.reply_mode,
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
  /**
   * Nur «summary» unterdrückt den Grundsatz «du wählst Tiefe selbst» — das Format ist dort strukturell
   * vorgegeben (vollständige Materialabdeckung), nicht verhandelbar. Bei «explanation» (auch detailed)
   * bleibt der Grundsatz sichtbar, damit das Antwortmodell selbst beurteilt, wie viel Tiefe nötig ist —
   * der explanation_depth-Hinweis ist nur ein Richtwert, keine Vorgabe.
   */
  return analyze.task_type === 'summary'
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
    '- quiz_generate: Nutzer will Quiz/Fragen **erzeugen** («mach ein Quiz», «erstell Fragen zu …») — nicht mc_solve; Ausgabe: `1. Fragentext` + `A)–D)` **pro Frage**, nicht Fragen am Ende.',
    '- summary: **expliziter** Zusammenfassungswunsch («fasse zusammen», «Zusammenfassung», «überblick», «lies/lese den Inhalt», «mach eine Zusammenfassung») — **nicht** «siehst du den Inhalt?» / «kannst du lesen?».',
    '- summary: **gleiche inhaltliche Tiefe** mit oder ohne Wort «ausführlich» — kein Kurz-Überblick, kein Meta-Text.',
    '- summary + [Datei:…] (auch nur «Zusammenfassung» ohne «ausführlich»): **integriertes Lernskript** — alle Themen ausarbeiten, Fragen beantworten, Übungen lösen — **kein** «Aufgabe:/Lösung:»-Format.',
    '- document_coverage_topics: string[] — nur bei task_type summary und [Datei:…] mit Text: 4–20 thematische Pflichtpunkte aus dem Anhang; sonst []',
    '- summary + document (PDF/Word): «ausführliches/zusammenfassendes PDF/Word», «PDF zusammenfassen» → category document, action pdf_generate/word_generate, **task_type summary**.',
    '- explanation + brief: «siehst du den Inhalt?», «kannst du das PDF lesen?», «ist der Anhang da?» → **nur** Sichtbarkeit bestätigen, **kein** summary/mc_solve.',
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
        '- Ohne explizite Formatwahl: **Markdown-Multiple-Choice** (Checkbox-Karten in der App) — nicht beide Formate mischen.',
        '- Pflicht pro Frage: `1. Fragentext`, direkt darunter `A)–D)` je eigene Zeile — **Fragentext über den Optionen derselben Frage**.',
        '- **VERBOTEN:** zuerst alle A–D-Listen, danach alle Fragentexte am Ende.',
        '- Optional max. 1–2 Sätze Einleitung oder `## Fragen` vor der ersten Frage.',
        '- Nur bei explizitem Wunsch «interaktives Quiz»: STRATON_QUIZ_JSON-Block laut System-Prompt.',
      ].join('\n')
    case 'summary':
      return [
        'Aufgabentyp Zusammenfassung (verbindlich — Playbook im Layout-Profil):',
        '- Gilt **immer** bei task_type summary — auch wenn der Nutzer **nicht** «ausführlich» sagt.',
        '- Schulblatt/PDF: **integriertes Lernskript** — Fragen beantworten, Aufgaben inhaltlich ausarbeiten, Lücken füllen — **ohne** «Aufgabe:/Lösung:»-Labels.',
        '- Nicht beschreiben, was das Dokument «deckt/thematisiert» — **Inhalt** aus dem [Datei]-Block liefern.',
        '- Alle Pflicht-Themen aus der Analyze-Checkliste abdecken; ```cards``` mit tone/badges je Hauptthema.',
        '- Keine Informationen erfinden, die nicht im Material stehen.',
        '- Kein `### Verbesserungen`, keine Pflicht-Anpassungsfrage am Schluss.',
      ].join('\n')
    case 'explanation':
    default:
      if (analyze.explanation_depth === 'brief') {
        if (/sichtbar|anhang|lesbar/i.test(analyze.intent)) {
          return buildDocumentVisibilityTurnBriefing()
        }
        return [
          'Aufgabentyp Erklärung — Einschätzung: vermutlich kurz (Richtwert, keine Vorgabe):',
          '- Vorschlag: eine `##`-Überschrift, dann 1–3 klare Sätze oder eine kompakte Liste.',
          '- Entscheide selbst anhand der Frage: Wenn mehr Tiefe nötig ist, antworte ausführlicher statt künstlich kurz zu bleiben.',
          '- Falls kurz passend: keine Kapitel-Zusammenfassung, kein künstliches Aufblähen; Fachbegriffe kurz erklären.',
        ].join('\n')
      }
      if (analyze.explanation_depth === 'detailed') {
        return [
          'Aufgabentyp Erklärung — Einschätzung: vermutlich ausführlich (Richtwert, keine Vorgabe):',
          '- Vorschlag: `##`-Hauptüberschrift, dann Kapitel mit `###` oder nummerierten `## 1. …`-Abschnitten.',
          '- Entscheide selbst anhand der Frage: Wenn eine kürzere Antwort tatsächlich reicht, halte dich kürzer statt künstlich aufzublähen.',
          '- Falls ausführlich passend: **3+ parallele Typen/Arten/Kategorien** → ```cards```; zwischen grösseren Abschnitten `---`; mit Beispielen erklären statt nur Stichwortlisten.',
          '- Bei **mehreren** Aufgaben/Fragen im Text oder Anhang: **alle** vollständig lösen, keine auslassen, nicht nach dem Rest fragen.',
        ].join('\n')
      }
      return [
        'Aufgabentyp Erklärung — Einschätzung: Standardtiefe (Richtwert, keine Vorgabe):',
        '- Vorschlag: `##`-Überschrift, dann passende Tiefe: Absätze, optional kurze Liste oder Tabelle.',
        '- Entscheide selbst anhand der Frage, wie viel Tiefe wirklich nötig ist — einfache Sprache, komplexe Themen in verständliche Schritte gliedern.',
        '- Bei **mehreren** Aufgaben/Fragen im Text oder Anhang: **alle** in dieser Antwort lösen, keine auslassen, nicht nach dem Rest fragen.',
      ].join('\n')
  }
}
