/**
 * Slash-Befehl `/Word` setzt diesen Marker – analog zu Excel.
 * Word-Körper vs. normaler Chat: `####` Absatz, `#####` Überschrift 1, `######` Überschrift 2;
 * übliche Antworten nutzen `#`–`###` (Details in `wordOutline.ts` / Edge `chat-completion`).
 */
export const WORD_EXPORT_COMMAND_MARKER = '[[STRATON_WORD_COMMAND]]'

export { WORD_CHAT_DOCUMENT_JSON_HINT as WORD_CHAT_DOCUMENT_BODY_HINT } from './documentExportIntent'

export function userWantsWordExport(text: string): boolean {
  return text.includes(WORD_EXPORT_COMMAND_MARKER)
}

export function stripWordCommandMarker(text: string): string {
  return text.replace(WORD_EXPORT_COMMAND_MARKER, '').trim()
}
