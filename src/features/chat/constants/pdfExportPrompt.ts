/** Slash-Befehl `/PDF` — analog zu Word/Excel. */
export const PDF_EXPORT_COMMAND_MARKER = '[[STRATON_PDF_COMMAND]]'

export { PDF_CHAT_DOCUMENT_JSON_HINT as PDF_CHAT_DOCUMENT_BODY_HINT } from './documentExportIntent'

export function userWantsPdfExport(text: string): boolean {
  return text.includes(PDF_EXPORT_COMMAND_MARKER)
}

export function stripPdfCommandMarker(text: string): string {
  return text.replace(PDF_EXPORT_COMMAND_MARKER, '').trim()
}
