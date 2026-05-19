/** Sichtbarer Nutzertext zum Kopieren (ohne Datei-/Bild-Anhänge-Marker). */
export function extractUserMessageCopyText(content: string): string {
  return content
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
