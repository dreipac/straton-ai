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

/** Strukturhinweis an die Analyze-KI, wenn der Client Quiz-Generierung erkannt hat. */
export function buildInstantAnalyzeQuizGenerateStructuralHint(userMessage: string): string | null {
  if (!matchQuizPracticeIntent(userMessage)) {
    return null
  }
  const explicit = detectExplicitQuizFormatInText(userMessage)
  return [
    '[Struktur erkannt: Nutzer will Quiz / Übungsfragen erzeugen]',
    explicit === 'interactive'
      ? 'Gewünschtes Format: interaktives Quiz mit STRATON_QUIZ_JSON-Block (Freitext, keine A–D-Checkboxen).'
      : [
          'Gewünschtes Format: Markdown-Multiple-Choice — **jede Frage braucht einen Fragentext direkt über den Optionen**.',
          'Pflicht pro Frage: `1. Fragentext`, darunter `A) …` `B) …` `C) …` `D) …` je eigene Zeile.',
          'Nicht nur A–D-Listen ohne Frage und **nicht** alle Fragentexte gesammelt am Ende.',
        ].join(' '),
    'Einordnung: category chat, action answer, task_type quiz_generate, reply_mode normal.',
    '',
  ].join('\n')
}

/** Gemeinsame MC-Strukturregeln — ein Briefing, kein Widerspruch zwischen System- und Turn-Prompt. */
export const MARKDOWN_MCQ_STRUCTURE_RULES = [
  'Pflicht-Struktur pro Frage (exakt so — die App rendert Checkbox-Karten):',
  '- Optional **ein** kurzer Einleitungssatz (ohne `1.` — kein Fragentext), dann **sofort** `1. Fragentext` + Optionen.',
  '- Einleitung **niemals** nummerieren und **nicht** direkt über `A)–D)` setzen.',
  '- **Pro Frage ein Block:** `1. Fragentext` → direkt darunter `A) …` `B) …` `C) …` `D) …` (mind. 2 Optionen, je **eigene Zeile**).',
  '- Danach `2. Nächster Fragentext` → wieder `A) …` `B) …` … — fortlaufend nummerieren.',
  '- Fragentext **über** den Optionen **derselben** Frage — **nicht** zuerst alle A–D-Listen und **nicht** alle Fragentexte gesammelt am Ende.',
  '- Kein Quiz-JSON, keine Marker, keine A) B) C) D) in einem Absatz.',
].join('\n')

export const QUIZ_GENERATE_MARKDOWN_MCQ_TURN_BRIEFING = [
  'Quiz erzeugen — Multiple-Choice-Karten (verbindlich):',
  MARKDOWN_MCQ_STRUCTURE_RULES,
].join('\n')

export function getQuizFormatGenerationInstruction(choice: QuizFormatChoice): string {
  if (choice === 'markdown_mcq') {
    return [
      'Gewähltes Quiz-Format (verbindlich für diese Anfrage): **Multiple-Choice im Chat**.',
      MARKDOWN_MCQ_STRUCTURE_RULES,
      'Kein Hinweis «sag mach ein Quiz» — direkt die Fragen liefern.',
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

