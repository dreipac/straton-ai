/** Intent-Routing: Kategorie «diagram» für Abläufe, Stammbäume, Skizzen im Chat. */

export function buildInstantAnalyzeDiagramGenerateSection(): string {
  return [
    'Struktur-Diagramme im Chat (category "diagram" — Einordnung vor der Antwort):',
    '- Stammbaum, Familienbaum, Genealogie → diagram.**diagram_generate** (nicht chat.answer).',
    '- Ablauf, Prozess, Workflow, Flussdiagramm, Entscheidungsbaum, Organigramm, Mindmap, Sequenz → diagram.diagram_generate.',
    '- «Skizze des Ablaufs», «als Übersicht darstellen», «Schritte visualisieren» (ohne Zahlen/Prozente) → diagram.diagram_generate.',
    '- «Mache/Erstelle/Zeichne ein Diagramm» **ohne** genannten Typ und **ohne** Zahlen/Prozente/Statistik → ebenfalls diagram.diagram_generate (Standard: passendes Mermaid-Flowchart/Mindmap zum besprochenen Thema) — **nicht** chat.answer.',
    '- **Nicht** diagram: Balken-/Kreis-/Liniendiagramm mit Zahlen, Prozentverteilung, Statistik → chart.chart_generate.',
    '- Bei diagram.*: reply_mode **normal**, needs_live_web **false**, clarity **clear**, escalate_model **false**.',
    'App: KI liefert Mermaid-Quelltext; die App rendert die Grafik direkt unter der Antwort.',
  ].join('\n')
}

export function buildInstantAnalyzeDiagramBriefing(): string {
  return [
    'Struktur-Diagramm (verbindlich — diese Antwort):',
    '- **Pflicht:** gültiger Mermaid-Quelltext zwischen <<<STRATON_MERMAID_DIAGRAM>>> und <<<END_STRATON_MERMAID_DIAGRAM>>> (die App rendert die Grafik).',
    '- Optional 1–2 Sätze Einleitung **vor** dem Block — **kein** langer Fliesstext statt Grafik.',
    '- **Stammbaum:** flowchart TD (oder TB) — Personen als Knoten, Eltern → Kinder; Geschwister nebeneinander.',
    '- **Ablauf/Prozess:** flowchart TD/LR mit klaren Schritten; optional Entscheidungen als Rauten {Ja/Nein}.',
    '- **Akteure/Zeit:** sequenceDiagram wenn sinnvoll.',
    '- **Überblick:** mindmap oder flowchart — kurze Knotenlabels, Deutsch, ss statt ß.',
    '- Keine ```mermaid-Fences **innerhalb** der Marker; kein ASCII-Kunst statt Mermaid.',
    '- **Verboten:** «Verbesserungen»-Abschnitt, Rückfragen statt Diagramm, Chart-JSON, Quiz.',
  ].join('\n')
}
