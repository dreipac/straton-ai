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

export const VISION_TABLE_EXERCISE_TURN_BRIEFING = [
  'Bildanhang (verbindlich für diese Antwort):',
  '- Lies die sichtbare Aufgabe vollständig (Tabellen, Spaltenüberschriften, Kästchen).',
  '- Zuordnungs- oder Ankreuztabelle: **Lösung als Markdown-Tabelle** in der Struktur des Aufgabenblatts, ✓ in den richtigen Spalten — keine Bullet-Liste.',
  `- Definitiver Lösungston — nicht ${HEDGING_PHRASES_FORBIDDEN}; nur wirklich unleserliche Zeilen als solche benennen.`,
].join('\n')

export const TABLE_EXERCISE_TEXT_TURN_BRIEFING = [
  'Zuordnungs-/Tabellenaufgabe (verbindlich):',
  '- Antwort als **Markdown-Tabelle** (gleiche Struktur und Reihenfolge wie in der Aufgabe, ✓ in der richtigen Kategorie), nicht als Aufzählung.',
  `- Definitiver Lösungston — nicht ${HEDGING_PHRASES_FORBIDDEN}.`,
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
