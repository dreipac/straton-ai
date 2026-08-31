import { stripSectionRefBlock } from './assistantSectionReply'
import { stripChartSpecBlock } from '../chart/chartSpec'
import { stripDiagramSpecBlock } from '../diagram/diagramSpec'
import { stripExcelSpecBlock } from '../excel/excelSpec'
import { stripGeneratedImageModelFooter } from './markdownInline'
import { stripThinkingClarifyMarkersForDisplay } from './thinkingClarify'

/** Sichtbarer Nutzertext zum Kopieren (ohne Datei-/Bild-Anhänge-Marker). */
export function extractUserMessageCopyText(content: string): string {
  return stripSectionRefBlock(content)
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/g, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/g, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Markdown-Überschriften (# … ######) für Klartext-Kopie entfernen, Titeltext bleibt. */
function stripMarkdownHeadingMarkers(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, '')
}

/** Assistentenantwort zum Kopieren (ohne Excel-Spec, Clarify-JSON, Modell-Footer). */
export function extractAssistantMessageCopyText(content: string): string {
  return stripMarkdownHeadingMarkers(
    stripThinkingClarifyMarkersForDisplay(
      stripGeneratedImageModelFooter(
        stripDiagramSpecBlock(stripChartSpecBlock(stripExcelSpecBlock(content))),
      ),
    ),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
