/** Spiegel von `src/features/chat/constants/documentExportIntent.ts` (Intent + Edge). */

export function buildInstantAnalyzeDocumentGenerateSection(): string {
  return [
    'Dokumente generieren (category "document" — nur bei explizitem Export-Wunsch):',
    '- Trennung Lesen vs. Erzeugen:',
    '  - `[Datei:…]`-Anhang + Lesen/Zusammenfassen **ohne** Export-Wunsch → category **chat**, action **answer**.',
    '  - Word/Docx erstellen → document.**word_generate**.',
    '  - PDF erstellen → document.**pdf_generate**.',
    '  - Excel/XLSX exportieren → document.**excel_generate**.',
    '  - «PowerPoint», «PPTX», «Präsentation», «Folien erstellen» → document.**pptx_generate**.',
    '- Summary-PDF/Word: «ausführliches/zusammenfassendes PDF», task_type **summary** + document.*.',
    '- Bei document.*: reply_mode **normal**, needs_live_web **false**.',
    '- escalate_model **false** bei einzelnem Export — nur true bei Multi-Dokument-Vergleich oder Sheet-Merge.',
    '',
    'App: KI liefert Outline-JSON (Word/PDF), Spec-JSON (Excel) oder HTML-Folien (PowerPoint) im Chat; Nutzer klickt «generieren» → Libraries (.docx/.pdf/.xlsx/.pptx).',
  ].join('\n')
}
