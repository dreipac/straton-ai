/**
 * Eigene, abhängigkeitsfreie Datei (kein Import aus `renderAssistantRichContent.tsx`): sowohl
 * `assistantRichContentHtml.ts` (ganze Nachricht kopieren) als auch `ChatTableCopyButton.tsx`
 * (eine einzelne Tabelle kopieren, gerendert VON `renderAssistantRichContent.tsx`) brauchen diese
 * Funktionen — ein Import von dort direkt hätte einen Zirkelbezug ergeben.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Eine echte `<table>` statt sichtbarer `|`-Zeichen. `border`/`cellpadding` als Attribute (nicht
 * nur CSS), weil "Einfügen als Text/HTML" in Word/Outlook öfter Inline-Attribute übernimmt als
 * eine externe/eingebettete Stylesheet-Regel.
 */
export function buildTableClipboardHtml(rows: string[][]): string {
  const [header, ...bodyRows] = rows
  if (!header?.length) {
    return ''
  }
  const theadHtml = `<thead><tr>${header
    .map((cell) => `<th style="border:1px solid #999;padding:4px 8px;text-align:left;">${escapeHtml(cell)}</th>`)
    .join('')}</tr></thead>`
  const tbodyHtml =
    bodyRows.length > 0
      ? `<tbody>${bodyRows
          .map(
            (row) =>
              `<tr>${row
                .map((cell) => `<td style="border:1px solid #999;padding:4px 8px;">${escapeHtml(cell)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody>`
      : ''
  return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;">${theadHtml}${tbodyHtml}</table>`
}

/** Klartext-Fallback für eine einzelne Tabelle: Tab-getrennt (Excel/Word verstehen das als Spalten). */
export function buildTableClipboardPlainText(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n')
}
