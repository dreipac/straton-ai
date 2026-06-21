/** Spiegel von `src/features/chat/constants/diagramExportIntent.ts` (Intent + Edge). */

export function buildInstantAnalyzeDiagramGenerateSection(): string {
  return [
    'Struktur-Diagramme im Chat (category "diagram"):',
    '- Stammbaum, Ablauf, Prozess, Workflow, Flussdiagramm, Mindmap, Organigramm → diagram.diagram_generate (nicht chat.answer).',
    '- «Mache/Erstelle ein Diagramm» ohne genannten Typ, ohne Zahlen/Prozente/Statistik → ebenfalls diagram.diagram_generate (nicht chat.answer).',
    '- Zahlen/Balken/Kreis/Prozent → chart.chart_generate.',
    '- diagram.*: reply_mode normal, needs_live_web false, escalate_model false.',
    'App: Mermaid-Quelltext → Diagramm-Vorschau im Chat.',
  ].join('\n')
}
