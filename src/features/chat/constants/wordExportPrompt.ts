/**
 * Slash-Befehl `/Word` setzt diesen Marker – analog zu Excel.
 * Word-Körper vs. normaler Chat: `####` Absatz, `#####` Überschrift 1, `######` Überschrift 2;
 * übliche Antworten nutzen `#`–`###` (Details in `wordOutline.ts` / Edge `chat-completion`).
 */
export const WORD_EXPORT_COMMAND_MARKER = '[[STRATON_WORD_COMMAND]]'

/**
 * System-Zusatz für den Hauptchat (OpenAI), wenn der Nutzer /Word gewählt hat.
 * Ziel: fertiger Dokumenttext — keine Didaktik oder „Meta-Anleitung“.
 */
export const WORD_CHAT_DOCUMENT_BODY_HINT = [
  'Word-/Dokumentmodus: Du lieferst den Text so, als käme er direkt in die Word-Vorlage (Endversion für Leser).',
  'VERBOTEN: Einleitungen über das Dokument; Erklärungen, was ein Kapitel «beschreiben soll» oder «hier steht»; Formulierungen wie «In diesem Abschnitt wird…», «Dieses Kapitel dient dazu…», «Beschreiben Sie…», «Hier wird erklärt…».',
  'VERBOTEN: Absätze, die nur Leitfragen oder Platzhalterlisten sind (z. B. nur «Warum? Wer? Was?» ohne konkrete Antworttexte). Schreibe stattdessen klare, vollständige Sätze mit realem Inhalt zum Thema.',
  'VERBOTEN: Extra-Abschnitte wie «Direkt nutzbare Vorlage», Metatabellen oder Trenner mit Platzhaltern nur zur Struktur — schreibe den echten Kapitelinhalt.',
  'Erlaubt: nummerierte Überschriften und Unterpunkte mit #### / ##### / ###### gemäß App-Konvention; darunter Fließtext mit konkretem Fachinhalt (Definitionen, Schritte, Hinweise), nicht nur Stichworte.',
].join('\n')

export function userWantsWordExport(text: string): boolean {
  return text.includes(WORD_EXPORT_COMMAND_MARKER)
}

export function stripWordCommandMarker(text: string): string {
  return text.replace(WORD_EXPORT_COMMAND_MARKER, '').trim()
}
