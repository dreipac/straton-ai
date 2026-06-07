import { countMcOptionLines, parseMcqQuestionFromUserMessage } from '../utils/directAnswerMcq'
import { matchQuizPracticeIntent } from '../utils/quizFormatChoice'
import { normalizeDocumentIntentUserText, userAsksDocumentVisibilityQuestion } from './documentAttachmentIntent'

/** Nutzer will nur die richtige Option — keine Erklärung, keine Verbesserungen. */
const DIRECT_ANSWER_REQUEST_RE =
  /\b(?:richtige?\s+antwort|korrekte?\s+antwort|welche\s+option|nur\s+(?:die\s+)?antwort|antwort\s+bitte|nur\s+[a-d]\b|option\s+[a-d]\b|correct\s+answer|which\s+(?:of\s+the\s+following|option)|pick\s+the\s+(?:correct|right)|just\s+(?:the\s+)?answer|only\s+(?:the\s+)?answer|answer\s+only|the\s+right\s+answer)\b/i

const DIRECT_ANSWER_SHORT_FOLLOW_UP_RE =
  /^(?:bitte\s+)?(?:die\s+|the\s+)?(?:richtige?|korrekte?|correct|right)\s+antwort|(?:please\s+)?(?:the\s+)?correct\s+answer|nur\s+[a-d]|^[a-d][\s!.?]*$|^(?:antwort|answer)\s*[:.]?\s*[a-d][\s!.?]*$/i

/** Frage mit Auswahloptionen (Zertifizierung, MC-Post, «welche IP ist privat»). */
const MC_QUESTION_CUE_RE =
  /\b(?:which\s+of\s+the\s+following|what\s+does\s+this\s+enable|what\s+is\s+the\s+(?:correct|best)|welche\s+(?:der\s+folgenden|aussage|option|ist|sind)|was\s+(?:ist\s+)?(?:richtig|korrekt)|was\s+ermöglicht|was\s+bezeichnet)\b/i

const MC_PROMPT_WITH_OPTIONS_RE =
  /(?:was\s+ist\s+(?:eine?|ein|der|die)\s+.+|which\s+(?:one|ip|address)\s+is\s+.+|welche\s+(?:ip|adresse)\s+.+)[?:]\s*$/im

const QUIZ_GENERATION_VERB_RE =
  /\b(?:erstell|generier|mach|schreib|erzeug|stell\s+.+\s+(?:fragen|quiz)|teste?\s+mich|frag(?:e|en)?\s+mich\s+ab)\b/i

function priorTurnHadMcQuestion(
  priorTurns: ReadonlyArray<{ role: string; content?: string | null }> | undefined,
): boolean {
  if (!priorTurns?.length) {
    return false
  }
  for (let i = priorTurns.length - 1; i >= 0; i -= 1) {
    const m = priorTurns[i]
    if (m.role !== 'user') {
      continue
    }
    const c = typeof m.content === 'string' ? m.content.trim() : ''
    if (c && countMcOptionLines(c) >= 2) {
      return true
    }
    break
  }
  return false
}

function userWantsQuizGeneration(text: string): boolean {
  const t = text.trim()
  if (!t || !matchQuizPracticeIntent(t)) {
    return false
  }
  return QUIZ_GENERATION_VERB_RE.test(t)
}

/** Nutzer postet MC / will nur die richtige Option (nicht Quiz generieren). */
export function userMessageRequestsDirectAnswer(
  userMessage: string,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  const t = normalizeDocumentIntentUserText(userMessage)
  if (!t) {
    return false
  }
  if (userAsksDocumentVisibilityQuestion(t)) {
    return false
  }
  if (userWantsQuizGeneration(t)) {
    return false
  }
  if (DIRECT_ANSWER_REQUEST_RE.test(t)) {
    return true
  }
  if (t.length <= 96 && DIRECT_ANSWER_SHORT_FOLLOW_UP_RE.test(t)) {
    return true
  }
  if (
    priorTurnHadMcQuestion(priorTurns) &&
    t.length <= 80 &&
    countMcOptionLines(t) === 0 &&
    /\b(?:please|bitte|answer|antwort|nochmal|again)\b/i.test(t)
  ) {
    return true
  }
  const optionCount = countMcOptionLines(t)
  if (optionCount >= 2 && (MC_QUESTION_CUE_RE.test(t) || MC_PROMPT_WITH_OPTIONS_RE.test(t) || optionCount >= 3)) {
    return true
  }
  return false
}

export function userMessageIsDirectAnswerFollowUp(
  userMessage: string,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  const t = userMessage.trim()
  if (!t || t.length > 120) {
    return false
  }
  if (!priorTurnHadMcQuestion(priorTurns)) {
    return false
  }
  return (
    DIRECT_ANSWER_REQUEST_RE.test(t) ||
    DIRECT_ANSWER_SHORT_FOLLOW_UP_RE.test(t) ||
    countMcOptionLines(t) === 0
  )
}

/** User-Nachricht war Direktantwort-Job (Metadata oder Text-Heuristik). */
export function userMessageHadDirectAnswerIntent(
  userMessage: string,
  metadata?: { userDirectAnswerCommand?: boolean } | null,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  if (metadata?.userDirectAnswerCommand === true) {
    return true
  }
  return userMessageRequestsDirectAnswer(userMessage, priorTurns)
}

export function shouldApplyDirectAnswerTurnBriefing(
  userMessage: string,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  return userMessageRequestsDirectAnswer(userMessage, priorTurns)
}

/** Für Instant-Analyze-Systemprompt: Layout/Aufbau erkennen (nicht nur Stichwörter). */
export function buildInstantAnalyzeDirectAnswerSection(): string {
  return [
    'Direktantwort / Multiple-Choice — **Aufbau der Nachricht** lesen (verbindlich):',
    '- Unterscheide **Erklärfrage** vs **Auswahlfrage** anhand des **Layouts**, nicht nur am ersten Satz.',
    '- **Auswahlfrage** (→ chat.short_answer, reply_mode short_answer, intent z. B. «Richtige Option wählen»):',
    '  • Zeile(n) mit Frage (oft `?` oder `:` am Ende), **darunter 2–6 Kandidaten** als nächste Zeilen.',
    '  • Optionen als `- …`, `A) …`, `1. …` **oder nackte Zeilen** (IP-Adressen, Kurzwerte, Begriffe ohne Bullet).',
    '  • Auch wenn die Frage «was ist …» lautet: **mit Optionsliste = Auswahl**, nicht Fachvortrag.',
    '- Beispiel Auswahlfrage (short_answer, **kein** normal/Erklärblock):',
    '  «was ist eine private IP Adresse:',
    '  192.168.16.0/24',
    '  169.165.10.1',
    '  88.33.93.16»',
    '  → Nutzer will wissen **welche Zeile** passt — nicht die Definition von RFC 1918.',
    '- Weitere Signale: «which of the following», «richtige Antwort», Zertifizierungsstil, «welche Option».',
    '- **Keine** Direktantwort: «mach/erstelle ein Quiz», «generiere Fragen» → Quiz erstellen (chat.answer).',
    '- **Keine** Direktantwort: «was ist X?» **ohne** Kandidatenliste darunter → Erklärung (chat.answer / short_answer je nach Tiefe).',
  ].join('\n')
}

/** Strukturhinweis an die Analyze-KI, wenn der Client den MC-Aufbau erkannt hat. */
export function buildInstantAnalyzeStructuralHintForUserMessage(userMessage: string): string | null {
  const mc = parseMcqQuestionFromUserMessage(userMessage)
  if (!mc) {
    return null
  }
  const optionSummary = mc.options.map((o) => `${o.letter}) ${o.text}`).join('; ')
  return [
    '[Struktur erkannt: Auswahlfrage — Nutzer will die richtige Option, keine Unterrichtseinheit]',
    `Frage: ${mc.prompt}`,
    `Optionen (${mc.options.length}): ${optionSummary}`,
    'Einordnung: category chat, action short_answer, reply_mode short_answer, clarity clear.',
    '',
  ].join('\n')
}

export function buildInstantAnalyzeDirectAnswerBriefing(): string {
  return [
    'Direktantwort (verbindlich):',
    '- Nutzer will die **richtige Option** — nicht eine Unterrichtseinheit.',
    '- **Zuerst** Antwort nennen (`**Antwort: D**` oder Tabelle mit ✓), höchstens 1–2 Sätze Begründung danach.',
    '- **Verboten:** `### Verbesserungen`, Schlussfrage, alle Optionen durchgehen.',
    '- Sprache wie die Nutzerfrage.',
  ].join('\n')
}

export const DIRECT_ANSWER_TURN_BRIEFING = [
  'Multiple-Choice / Direktantwort (verbindlich für diesen Turn):',
  '- Der Nutzer will die **richtige Antwort** — keine ausführliche Erklärung, kein Essay.',
  '- **Pflicht:** Erste Zeile exakt `**Antwort: X**` (X = A–D) — die App markiert die Option grün.',
  '- **Format (eine Variante wählen):**',
  '  1) Erste Zeile: `**Antwort: D**` — [Kurztext der Option]',
  '  2) Oder Markdown-Tabelle:',
  '     | Option | Inhalt | Richtig |',
  '     | D | … | ✓ |',
  '- Optional **danach** höchstens 1–2 Sätze Begründung — nicht davor.',
  '- **Verboten:** `### Verbesserungen`, Anpassungsfrage am Ende, lange Facheinleitung.',
  '- **Verboten:** alle Optionen A–D einzeln erklären, wenn nur eine richtig ist.',
  '- Antwortsprache = Sprache der Nutzerfrage (Englisch → Englisch).',
].join('\n')

export const DIRECT_ANSWER_FOLLOW_UP_BRIEFING = [
  'Direktantwort — Folgenachricht (verbindlich):',
  '- Nutzer will **nur** die richtige Option — keine Wiederholung der vorherigen Erklärung.',
  '- Eine Zeile: `**Antwort: X**` — [Optionstext] — fertig.',
  '- Keine Verbesserungen, keine Rückfrage.',
].join('\n')

export const DIRECT_ANSWER_HARD_GUARD = [
  'Harter Guard (Direktantwort):',
  '- Gib jetzt **keine** `### Verbesserungen` und **keine** Anpassungsfrage am Schluss.',
  '- Die Antwort (Buchstabe/✓) steht in den **ersten** 1–2 Zeilen.',
].join('\n')

/** Statischer Hauptchat-Hinweis (Ausnahme zu MandatoryFollowUp). */
export function getAssistantDirectAnswerInstruction(): string {
  return [
    'Direktantwort / Multiple-Choice beantworten (Hauptchat — Ausnahme):',
    '- Wenn der Nutzer eine Auswahlfrage mit Optionen stellt oder nur die richtige Antwort will:',
    '  **Antwort zuerst** (Buchstabe oder Tabelle mit ✓), höchstens 1–2 Sätze Begründung.',
    '- Dann **kein** `### Verbesserungen`, **keine** Schlussfrage, **kein** langer Erklärblock.',
    '- Gilt nicht bei «mach ein Quiz» / Fragen generieren — dort Quiz-Regeln.',
  ].join('\n')
}
