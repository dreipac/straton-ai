import { messageHasVisionPayload } from './mainChatContext'

/** Nutzertext deutet auf Zuordnung / Tabellenübung hin. */
const TABLE_EXERCISE_TEXT_RE =
  /\b(zuordn\w*|einnahme\w*|ausgabe\w*|ankreuz\w*|abhak\w*|tabelle\w*|arbeitsblatt|übung|aufgabe|löse|lösung|kategor\w*|spalte\w*|kästchen|kaestchen|häkchen|haekchen|checkbox|staat\w*|finanz\w*|beispiel\w*\s+zu)\b/i

const SOLVE_EXERCISE_RE =
  /\b(löse|lösung|ausfüllen|ausfuellen|ergänze|ergaenze|markier|ankreuz|zuordn|bearbeit|mache\s+die\s+aufgabe)\b/i

const HEDGING_PHRASES_FORBIDDEN = [
  '«mögliche Zuordnung»',
  '«mögliche Lösung»',
  '«Beispiel-Zuordnung»',
  '«eine mögliche»',
  '«könnte»',
  '«eventuell»',
  '«vielleicht»',
].join(', ')

export function userMessageSuggestsTableExercise(userMessage: string): boolean {
  const t = userMessage.trim()
  if (!t) {
    return false
  }
  return TABLE_EXERCISE_TEXT_RE.test(t) || (SOLVE_EXERCISE_RE.test(t) && t.length <= 280)
}

export function userTurnHasVisionAttachment(
  userContent: string | null | undefined,
  visionInlineDataUrl?: string | null,
): boolean {
  if (typeof visionInlineDataUrl === 'string' && visionInlineDataUrl.startsWith('data:image/')) {
    return true
  }
  return messageHasVisionPayload(typeof userContent === 'string' ? userContent : '')
}

/** Statischer Hauptchat-Block (Vision + Schul-/Zuordnungsaufgaben). */
export function getAssistantTableExerciseInstruction(): string {
  return [
    'Tabellen- und Zuordnungsaufgaben (Hauptchat — verbindlich):',
    '- Siehst du im Bild oder in der Aufgabe eine **Tabelle**, Spalten, Kästchen oder «Einnahme / Ausgabe» (o. ä. Kategorien): gib die **Lösung als Markdown-Tabelle** — **nicht** als Bullet-Liste mit je einem Punkt pro Zeile.',
    '- Spalten und Zeilen orientieren sich am Aufgabenblatt (Beispiele in der gleichen Reihenfolge).',
    '- Bei Ankreuz-/Zuordnungsaufgaben: zwei Spalten mit **✓** in der richtigen Kategorie (z. B. «Einnahme» | «Ausgabe») oder eine Spalte «Zuordnung» mit klarem Wert — kein Fliesstext pro Beispiel.',
    '- Beispiel-Struktur:',
    '| Beispiel | Einnahme | Ausgabe |',
    '| --- | :---: | :---: |',
    '| Bußgeld Geschwindigkeit | ✓ | |',
    '| Soziale Wohlfahrt | | ✓ |',
    '- Maximal 1–2 kurze Einleitungssätze, dann die Tabelle als Kern der Antwort.',
  ].join('\n')
}

/** Klarer Lösungston bei eindeutigen Übungen (nicht bei Recht/News «aktuell»). */
export function getAssistantExerciseSolutionToneInstruction(): string {
  return [
    'Ton bei Übungs- und Zuordnungsaufgaben (verbindlich):',
    '- Bei klarer Schul-, KV- oder Arbeitsblatt-Aufgabe: Formulierung wie eine **Lösung** («Zuordnung», «Lösung», «So ordnest du zu») — nicht wie ein vages Beispiel.',
    `- **Nicht** verwenden: ${HEDGING_PHRASES_FORBIDDEN}, ausser einzelne Zeilen sind im Bild wirklich unleserlich — dann nur diese Zeile benennen.`,
    '- Nach vollständiger Lösungstabelle: höchstens **eine** kurze Nachfrage («Soll ich eine Zeile begründen?») — nicht so wirken, als wäre die Tabelle nur ein Vorschlag.',
    '- Ausnahme: Rechtslage, aktuelle News, Kurse, politische «Stand heute»-Fragen — dort weiter vorsichtig und ggf. Websuche.',
  ].join('\n')
}

export const VISION_TABLE_EXERCISE_TURN_BRIEFING = [
  'Bildanhang (verbindlich für diese Antwort):',
  '- Lies die sichtbare Aufgabe vollständig (Tabellen, Spaltenüberschriften, Kästchen).',
  '- Wenn es eine Zuordnungs- oder Ankreuztabelle ist: **Lösung als Markdown-Tabelle** mit ✓ in den richtigen Spalten — keine Bullet-Liste.',
  '- Formuliere die Zuordnung als **Lösung**, nicht als «mögliche Zuordnung» oder «Beispiel».',
].join('\n')

export const TABLE_EXERCISE_TEXT_TURN_BRIEFING = [
  'Zuordnungs-/Tabellenaufgabe (verbindlich):',
  '- Antwort als **Markdown-Tabelle** (gleiche Struktur wie in der Aufgabe), nicht als Aufzählung.',
  '- Definitiver Lösungston — keine abschwächenden Formulierungen («möglich», «könnte», «Beispiel»).',
].join('\n')

export function shouldApplyTableExerciseTurnBriefing(
  userMessage: string,
  userContent: string | null | undefined,
  visionInlineDataUrl?: string | null,
): boolean {
  const hasVision = userTurnHasVisionAttachment(userContent, visionInlineDataUrl)
  const text = userMessage.trim()
  if (hasVision) {
    return true
  }
  return userMessageSuggestsTableExercise(text)
}
