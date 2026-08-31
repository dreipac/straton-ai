/** Intent-Routing: Kategorie «diagram» für Abläufe, Stammbäume, Skizzen im Chat. */

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
