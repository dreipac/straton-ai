/** Slash-Befehl `/PDF` — analog zu Word/Excel. */
export const PDF_EXPORT_COMMAND_MARKER = '[[STRATON_PDF_COMMAND]]'

export const PDF_CHAT_DOCUMENT_BODY_HINT = [
  'PDF-/Dokumentmodus: Du lieferst Inhalt für ein druckbares PDF (Endversion für Leser).',
  'Bevorzugt: nummerierte Überschriften und Absätze mit #### / ##### / ###### (App-Konvention) — kein sichtbares JSON im Chat.',
  'Alternativ: gültiges PdfOutline-JSON in ```json … ``` (`version`: 1, `blocks`: heading mit `level` 1–6, paragraph, table).',
  'Tabellen: GFM-Pipe oder JSON `{"type":"table","header":true,"rows":[["A","B"]]}`.',
  'VERBOTEN: Meta-Erklärungen («In diesem Abschnitt…») — nur konkreter Dokumenttext.',
].join('\n')

export function userWantsPdfExport(text: string): boolean {
  return text.includes(PDF_EXPORT_COMMAND_MARKER)
}

export function stripPdfCommandMarker(text: string): string {
  return text.replace(PDF_EXPORT_COMMAND_MARKER, '').trim()
}
