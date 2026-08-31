/** Verbindlich für alle Nutzer-sichtbaren deutschen KI-Texte (Chat, Thinking, Lernpfad, Exporte). */
export const SWISS_GERMAN_ORTHOGRAPHY_INSTRUCTION = [
  'Rechtschreibung — Schweizer Hochdeutsch (verbindlich):',
  '- Schreibe durchgängig nach Schweizer Orthografie: **niemals «ß» (Eszett)** — immer **«ss»**.',
  '- Beispiele: Strasse, Grösse, ausser, Fussball, Strassenverkehr, gross/klein (nicht groß), dass (nicht daß).',
  '- Gilt für Fliesstext, Überschriften, Tabellen, Quiz, Word/PDF-Vorschau und deutsche Strings in JSON (intent, Fragen, Erklärungen).',
  '- Zitate oder Eigennamen mit ß unverändert lassen, wenn sie fest so geschrieben sind.',
].join('\n')

export function getSwissGermanOrthographyInstruction(): string {
  return SWISS_GERMAN_ORTHOGRAPHY_INSTRUCTION
}
