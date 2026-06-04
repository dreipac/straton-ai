/** Expliziter Slash-Befehl / Diagramm-Kachel: aktiviert Chart-Spec-Flow. */
export const CHART_EXPORT_COMMAND_MARKER = '[[STRATON_CHART_COMMAND]]'

export function userWantsChartExport(text: string): boolean {
  return text.includes(CHART_EXPORT_COMMAND_MARKER)
}

export function stripChartCommandMarker(text: string): string {
  return text.replace(CHART_EXPORT_COMMAND_MARKER, '').trim()
}

export const CANONICAL_CHART_SPEC_JSON_EXAMPLE = [
  '{',
  '  "version": 1,',
  '  "type": "bar",',
  '  "title": "Umsatz nach Quartal",',
  '  "labels": ["Q1", "Q2", "Q3", "Q4"],',
  '  "datasets": [',
  '    { "label": "2025", "data": [12, 19, 8, 22] }',
  '  ],',
  '  "options": { "unit": "Mio. CHF", "beginAtZero": true }',
  '}',
].join('\n')

export const CHART_EXPORT_INSTRUCTION = [
  'Diagramm (Chart Spec v1 — nur wenn der Nutzer ein Diagramm/Chart/Grafik will):',
  '- Kurzer Einleitungssatz (1–2 Sätze), dann der maschinenlesbare Block.',
  '- Block EXAKT: eine Zeile Start-Marker, nur JSON, eine Zeile End-Marker:',
  '<<<STRATON_CHART_SPEC_JSON>>>',
  '{ ... }',
  '<<<END_STRATON_CHART_SPEC_JSON>>>',
  '',
  'Schema version 1:',
  '- version: immer 1',
  '- type: "bar" | "line" | "pie" | "doughnut"',
  '- title: optional, kurz',
  '- labels: string[] (Kategorien/X-Achse), max. 50 Einträge',
  '- datasets: [{ "label": string, "data": number[] }] — data-Länge MUSS labels.length entsprechen, max. 10 Serien',
  '- options: optional { "stacked": boolean, "unit": string, "beginAtZero": boolean, "locale": "de-CH" }',
  '- pie/doughnut: meist eine Serie; bar/line: mehrere Serien möglich',
  '- Kein ASCII-Diagramm statt JSON; kein Code-Fence innerhalb der Marker.',
  '',
  'Beispiel (Zahlen an Aufgabe anpassen):',
  CANONICAL_CHART_SPEC_JSON_EXAMPLE,
].join('\n')

export const CHART_CHAT_DOCUMENT_JSON_HINT = [
  'Diagramm — Chat-Vorschau (verbindlich):',
  'Ohne den maschinenlesbaren Chart-Spec-Block sieht der Nutzer **kein** Diagramm — nur Text ist falsch.',
  'Der Nutzer will ein interaktives Diagramm im Chat. Du lieferst **Chart-Spec-JSON** — die App rendert es sofort.',
  CHART_EXPORT_INSTRUCTION,
  'VERBOTEN: Nur beschreiben («hier ist das Kreisdiagramm») ohne JSON-Block; «Verbesserungen»-Abschnitt; Rückfrage statt Spec; Quiz.',
].join('\n\n')
