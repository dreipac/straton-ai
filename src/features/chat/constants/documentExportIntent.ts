import type { InstantAnalyzeDocumentAction } from './instantAnalyzeRoute'
import { EXCEL_EXPORT_INSTRUCTION } from './excelExportPrompt'

/** Intent-Routing: eigene Sektion «Dokumente generieren» (category document). */
export function buildInstantAnalyzeDocumentGenerateSection(): string {
  return [
    'Dokumente generieren (category "document" — nur bei explizitem Export-Wunsch):',
    '- Trennung Lesen vs. Erzeugen:',
    '  - `[Datei:…]`-Anhang + «was siehst du», «fasse zusammen», «was steht drin», «analysiere» **ohne** «erstelle/exportiere Word/PDF/Excel» → category **chat**, action **answer** (nur Inhalt lesen).',
    '  - «Word/Docx erstellen», «als Word», /Word → document.**word_generate**.',
    '  - «PDF erstellen», «als PDF», /PDF → document.**pdf_generate**.',
    '  - «Excel/XLSX», «Tabelle exportieren», /Excel → document.**excel_generate**.',
    '- Bei document.*: reply_mode **normal**, needs_live_web **false**, clarity **clear**.',
    '- escalate_model **false** bei einzelnem Export oder Zusammenfassung — nur true bei Multi-Dokument-Vergleich oder komplexem Sheet-Merge.',
    '',
    'Nachgelagerte App (nicht Intent-JSON): KI liefert **Vorschau** (Outline-JSON im Chat), Nutzer klickt «generieren» → Server-Libraries (.docx / .pdf / .xlsx).',
  ].join('\n')
}

export function buildInstantAnalyzeDocumentExportBriefing(
  action: InstantAnalyzeDocumentAction,
): string {
  const label =
    action === 'word_generate'
      ? 'Word (.docx)'
      : action === 'pdf_generate'
        ? 'PDF'
        : 'Excel (.xlsx)'
  return [
    `Dokument-Export (verbindlich — ${label}):`,
    '- Phase 1 (diese Antwort): **nur Vorschau** — maschinenlesbares Outline-JSON im Chat (siehe Dokument-Export-Regeln). **Keine** Behauptung, die Datei sei schon fertig.',
    '- Phase 2: Nutzer bestätigt in der UI («Word/PDF/Excel generieren»); die App erzeugt die Datei serverseitig aus dem JSON.',
    '- Kurzer Einleitungssatz (1–2 Sätze) erlaubt, dann **sofort** der JSON-Block — kein langer Didaktik-Teil, **keine** Lernfragen oder Quiz.',
    '- **Verboten:** «Die Datei wurde erstellt», Download-Links erfinden, Lernfragen zum Anhang.',
  ].join('\n')
}

export const WORD_SPEC_JSON_START = '<<<STRATON_WORD_SPEC_JSON>>>'
export const WORD_SPEC_JSON_END = '<<<END_STRATON_WORD_SPEC_JSON>>>'

export const PDF_SPEC_JSON_START = '<<<STRATON_PDF_SPEC_JSON>>>'
export const PDF_SPEC_JSON_END = '<<<END_STRATON_PDF_SPEC_JSON>>>'

const OUTLINE_JSON_RULES = [
  'Pflicht: gültiges Outline-JSON (`version`: 1, `blocks`: heading mit `level` 1–6, paragraph, table).',
  'Form: ```json … ``` (ein Block) oder Marker <<<STRATON_WORD_SPEC_JSON>>> / <<<STRATON_PDF_SPEC_JSON>>> … <<<END_…>>>.',
  'Optional `fileName`, `title`. Tabellen: `{"type":"table","header":true,"rows":[["A","B"]]}`.',
  'Markdown ####/##### nur als Fallback — JSON hat Vorrang.',
].join('\n')

export const WORD_CHAT_DOCUMENT_JSON_HINT = [
  'Word-Export — Vorschau-Modus (verbindlich):',
  'Der Nutzer will eine .docx. Du lieferst **Outline-JSON** für die Vorlage — die Datei entsteht erst nach «Word generieren».',
  OUTLINE_JSON_RULES,
  'VERBOTEN: Meta-Anleitungen («In diesem Kapitel…»), Lernfragen, Quiz.',
].join('\n')

export const PDF_CHAT_DOCUMENT_JSON_HINT = [
  'PDF-Export — Vorschau-Modus (verbindlich):',
  'Der Nutzer will eine PDF. Du lieferst **Outline-JSON** (gleiches Schema wie Word) — Erzeugung erst nach «PDF generieren».',
  OUTLINE_JSON_RULES,
  'VERBOTEN: Meta-Erklärungen, Lernfragen.',
].join('\n')

export const EXCEL_CHAT_DOCUMENT_JSON_HINT = [
  'Excel-Export — Vorschau-Modus (verbindlich):',
  'Der Nutzer will eine .xlsx. Du lieferst **Excel-Spec-JSON** — die Datei entsteht erst nach «Excel generieren».',
  '- Kurzer Einleitungssatz (optional), dann der maschinenlesbare Block (Marker <<<STRATON_EXCEL_SPEC_JSON>>>).',
  EXCEL_EXPORT_INSTRUCTION,
].join('\n\n')
