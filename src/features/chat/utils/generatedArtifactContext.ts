import { PDF_SPEC_JSON_START, WORD_SPEC_JSON_START } from '../constants/documentExportIntent'
import { STRATON_CHART_SPEC_START } from '../chart/chartSpec'
import { STRATON_MERMAID_DIAGRAM_START } from '../diagram/diagramSpec'
import { STRATON_EXCEL_SPEC_START } from '../excel/excelSpec'

/**
 * Ersetzt den rohen Spec-JSON-Block einer zuvor generierten Datei (Word/PDF/Excel/Chart/Diagramm)
 * im Analyze-Kontext durch eine kurze Markierung. Sonst hält der grosse JSON-Block den
 * Klassifikator fälschlich in derselben Kategorie für unabhängige Folgefragen — analog zur
 * bestehenden `[Straton hat zuvor ein Bild generiert …]`-Markierung für Bilder.
 */
export function assistantGeneratedArtifactContextMarker(content: string): string | null {
  if (content.includes(WORD_SPEC_JSON_START)) {
    return '[Straton hat zuvor ein Word-Dokument generiert — category document nur, wenn die aktuelle Nachricht selbst ein neues/weiteres Dokument oder eine Änderung daran verlangt]'
  }
  if (content.includes(PDF_SPEC_JSON_START)) {
    return '[Straton hat zuvor ein PDF generiert — category document nur, wenn die aktuelle Nachricht selbst ein neues/weiteres Dokument oder eine Änderung daran verlangt]'
  }
  if (content.includes(STRATON_EXCEL_SPEC_START)) {
    return '[Straton hat zuvor eine Excel-Tabelle generiert — category document nur, wenn die aktuelle Nachricht selbst einen neuen/weiteren Export verlangt]'
  }
  if (content.includes(STRATON_CHART_SPEC_START)) {
    return '[Straton hat zuvor ein Chart generiert — category chart nur, wenn die aktuelle Nachricht selbst ein neues Chart verlangt]'
  }
  if (content.includes(STRATON_MERMAID_DIAGRAM_START)) {
    return '[Straton hat zuvor ein Strukturdiagramm generiert — category diagram nur, wenn die aktuelle Nachricht selbst ein neues Diagramm verlangt]'
  }
  return null
}
