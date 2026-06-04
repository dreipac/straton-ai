/** Spiegel von `src/features/chat/constants/chartExportIntent.ts` (Intent + Edge). */

export function buildInstantAnalyzeChartGenerateSection(): string {
  return [
    'Diagramme im Chat (category "chart"):',
    '- «Erstelle Diagramm», Prozentverteilung, Balkendiagramm, «mache das als …» → chart.chart_generate (nicht chat.answer).',
    '- Bild generieren → image.generate; Word/PDF/Excel → document.*.',
    '- chart.*: reply_mode normal, needs_live_web false, escalate_model false.',
    'App: Chart-Spec-JSON → Diagramm-Vorschau im Chat.',
  ].join('\n')
}
