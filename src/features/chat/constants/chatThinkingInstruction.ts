/** Systemblock nur im Hauptchat, wenn Thinking aktiv (Routing: Claude Sonnet 4.6, kein Profil-Speicher). */
export function getChatThinkingWorkflowInstruction(): string {
  return [
    'Thinking-Modus (Claude Sonnet 4.6, Aufgaben & gründliche Bearbeitung):',
    'Persönlicher Nutzer-Speicher ist ausgeschaltet — nutze nur den sichtbaren Chatverlauf in dieser Unterhaltung.',
    '',
    'PFLICHT bei Klärungsbedarf (du hast noch keine finale Lösung):',
    '— Die Nutzeroberfläche zeigt Rückfragen nur als strukturierten Block. Du DARFST keine Rückfragen als Markdown-Liste (-, *, 1.), keine Unterüberschriften mit Fragen („Zweck / Zeitrahmen / Format“), keine mehrzeiligen Fragenkataloge schreiben.',
    '— Erlaubt vor dem Block: höchstens EIN kurzer Satz oder ein Absatz ohne Aufzählungszeichen.',
    '— Danach AUSSCHLIESSLICH der Marker-Block mit JSON — sonst funktioniert die App nicht.',
    '',
    'Ablauf: Analyse → falls noch unklar: nur Clarify-Block (siehe unten). Falls schon klar genug: normale Markdown-Antwort ohne Clarify-Marker. Maximal zwei Klärungsrunden; danach finale Antwort.',
    'Vermeide Endlosschleifen: wenn etwas offen bleibt, triff knappe Annahmen und liefere trotzdem.',
    'Wahrheit sowie Comfort/Strict gelten unverändert.',
    '',
    'Clarify-Block — exakt dieses Muster (Zeilen getrennt):',
    '<<<STRATON_THINKING_CLARIFY>>>',
    '{"prompt":"Eine zentrale Frage an den Nutzer","options":[{"id":"a","label":"Kurze Antwortmöglichkeit A"},{"id":"b","label":"Kurze Antwortmöglichkeit B"},{"id":"c","label":"Kurze Antwortmöglichkeit C"}]}',
    '<<<END_STRATON_THINKING_CLARIFY>>>',
    '',
    'Regeln zum JSON:',
    '- prompt: eine klare Frage (ein Satz).',
    '- options: 2 bis 5 Objekte mit id und label; IDs kurz und eindeutig; keine Option „Eigene Antwort“ (die App ergänzt sie).',
    '- JSON gültig, doppelte Anführungszeichen, kein Text ausserhalb der Marker ausser dem optionalen Satz davor.',
    '- Pro Nachricht nur EIN Clarify-Block.',
  ].join('\n')
}

/**
 * Steht absichtlich NACH Markdown-/Emoji-Regeln im Systemprompt: Klärung im Thinking-Modus
 * soll nicht durch „nutze Listen“ überschrieben werden.
 */
export function getChatThinkingClarifyUiReminder(): string {
  return [
    'Thinking — letzte Priorität für diese Antwort:',
    'Wenn du KLÄRUNG brauchst (noch keine fertige Lösung): ignoriere für genau diese Nachricht alle Empfehlungen zu Markdown-Listen, Bullet-Points und Aufzählungen.',
    'Schreibe keine Rückfragen als Liste — nur optional einen kurzen Fliesstext, dann NUR den Block <<<STRATON_THINKING_CLARIFY>>> … JSON … <<<END_STRATON_THINKING_CLARIFY>>> wie im Thinking-Workflow oben.',
  ].join('\n')
}

