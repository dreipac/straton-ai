/** Nutzerwahl vor Quiz-/MC-Generierung (wird in message.metadata gespeichert). */
export type QuizFormatChoice = 'markdown_mcq' | 'interactive'

export function matchQuizPracticeIntent(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 4) {
    return false
  }

  const patterns: RegExp[] = [
    /\bquiz\b/,
    /\bquizzes\b/,
    /multiple[\s-]*choice/,
    /\bmc[\s-]?(fragen|aufgaben|test|quiz)\b/,
    /\bauswahlfragen\b/,
    /\bübungsfragen\b/,
    /\bverständnisfragen\b/,
    /\bprüfungsfragen\b/,
    /\bteste?\s+mich\b/,
    /\bfrag(e|en)?\s+mich\s+ab\b/,
    /\bwissenstest\b/,
    /\beinstiegstest\b/,
    /\binteraktives?\s+quiz\b/,
    /\bfragen\s+(zu|über|dazu|darüber|hierzu)\b/,
    /\b(mach|erstelle|schreib(e)?)\s+.{0,80}(fragen|quiz)\b/,
    /\b(geschichte|text|inhalt|thema|kapitel).{0,60}(fragen|quiz|multiple)\b/,
    /\b(fragen|quiz|multiple).{0,60}(geschichte|dazu|daraus|dazu)\b/,
  ]

  return patterns.some((re) => re.test(t))
}

/** Nutzer hat das Format schon im Text genannt — kein Auswahl-Dialog nötig. */
export function detectExplicitQuizFormatInText(text: string): QuizFormatChoice | null {
  const t = text.trim().toLowerCase()
  if (!t) {
    return null
  }

  const wantsInteractive =
    /\binteraktives?\s+quiz\b/.test(t) ||
    /\bfreitext\b/.test(t) ||
    /\bfrei[\s-]?text\b/.test(t) ||
    /\btexteingabe\b/.test(t) ||
    /\bmit\s+(ki[\s-]?)?bewertung\b/.test(t) ||
    /\bantwort\s+eingeben\b/.test(t)

  const wantsMarkdownMcq =
    /\bmultiple[\s-]*choice\b/.test(t) ||
    /\bmc[\s-]?(fragen|quiz)\b/.test(t) ||
    /\bauswahlfragen\b/.test(t) ||
    /\bcheckbox\b/.test(t) ||
    /\ba\/b\/c\/d\b/.test(t)

  if (wantsInteractive && !wantsMarkdownMcq) {
    return 'interactive'
  }
  if (wantsMarkdownMcq && !wantsInteractive) {
    return 'markdown_mcq'
  }
  return null
}

export type QuizFormatPromptContext = {
  wantsWord: boolean
  wantsPdf?: boolean
  wantsExcel: boolean
  wantsChart?: boolean
  wantsImageGen: boolean
  thinkingMode: boolean
}

export function shouldPromptQuizFormatChoice(
  text: string,
  context: QuizFormatPromptContext,
): boolean {
  if (
    context.wantsWord ||
    context.wantsPdf ||
    context.wantsExcel ||
    context.wantsChart ||
    context.wantsImageGen ||
    context.thinkingMode
  ) {
    return false
  }
  if (!matchQuizPracticeIntent(text)) {
    return false
  }
  return detectExplicitQuizFormatInText(text) === null
}

export function getQuizFormatGenerationInstruction(choice: QuizFormatChoice): string {
  if (choice === 'markdown_mcq') {
    return [
      'Gewähltes Quiz-Format (verbindlich für diese Anfrage): **Multiple-Choice im Chat**.',
      'Liefere den gewünschten Inhalt (z. B. Geschichte, Erklärung) und danach Fragen als Markdown.',
      'Pflicht-Struktur pro Frage (exakt so, damit die UI Checkboxen rendert):',
      '- Eine eigene Zeile: `1. Fragentext` (bei mehreren Fragen fortlaufend nummerieren: 1., 2., 3., …).',
      '- Direkt darunter je **eine Zeile pro Option**: `A) …`, `B) …`, `C) …`, `D) …` (mind. 2 Optionen) — nicht in einen Absatz quetschen.',
      '- Optional Überschrift `## Fragen` oder Zeile `Fragen:` vor der ersten Frage.',
      'Kein Quiz-JSON, keine Marker <<<STRATON_QUIZ_JSON>>>, kein Hinweis «sag mach ein Quiz».',
    ].join('\n')
  }

  return [
    'Gewähltes Quiz-Format (verbindlich für diese Anfrage): **Interaktives Quiz (Freitext)**.',
    'Kurzer Einleitungstext, danach genau ein Block:',
    '<<<STRATON_QUIZ_JSON>>>',
    '{"title":"...","questions":[{"id":"q1","prompt":"...","expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"exact","hint":"...","explanation":"..."}]}',
    '<<<END_STRATON_QUIZ_JSON>>>',
    'Mindestens 3 Fragen; Freitext-Antworten mit expectedAnswer / acceptableAnswers.',
  ].join('\n')
}

export const QUIZ_FORMAT_CHOICE_LABELS: Record<
  QuizFormatChoice,
  { title: string; description: string }
> = {
  markdown_mcq: {
    title: 'Multiple Choice (Chat)',
    description: 'Fragen mit A–D und Checkboxen in der Antwort — zum Ankreuzen, ohne Bewertung.',
  },
  interactive: {
    title: 'Interaktiv (Freitext)',
    description: 'Quiz mit Eingabefeld; die KI prüft deine Antworten.',
  },
}
