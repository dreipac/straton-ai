/** Intent-Routing: Kategorie «chart» für Diagramme im Chat. */
export function buildInstantAnalyzeChartGenerateSection(): string {
  return [
    'Zahlen-Diagramme im Chat (category "chart" — Einordnung vor der Antwort):',
    '- Balken-/Kreis-/Liniendiagramm, «Chart», Prozent-/Zahlenverteilung, Statistik visualisieren, «als Balkendiagramm» → chart.**chart_generate** (nicht chat.answer).',
    '- Stammbaum, Ablauf, Prozess, Workflow, Mindmap → **diagram**.diagram_generate (nicht chart).',
    '- Folgenachricht «mache das als Balkendiagramm» nach Diagramm-Thema → chart.chart_generate.',
    '- Nicht verwechseln mit «Bild generieren» / Fotorealismus → image.generate.',
    '- Nicht Excel/Word/PDF-Export → document.*.',
    '- Bei chart.*: reply_mode **normal**, needs_live_web **false**, clarity **clear**, escalate_model **false**.',
    '',
    'App: KI liefert Chart-Spec-JSON; die App rendert das Diagramm direkt unter der Antwort.',
  ].join('\n')
}

export function buildInstantAnalyzeChartBriefing(): string {
  return [
    'Diagramm (verbindlich — diese Antwort):',
    '- **Pflicht:** gültiges Chart-Spec-JSON zwischen <<<STRATON_CHART_SPEC_JSON>>> und <<<END_STRATON_CHART_SPEC_JSON>>> (die App rendert das Chart).',
    '- Optional 1–2 Sätze Einleitung **vor** dem JSON-Block — **kein** langer Fliesstext statt Diagramm.',
    '- Nutzer nennt Prozent-/Zahlenwerte (z. B. 20 % Schule): type pie oder bar, labels + datasets.data aus den Werten.',
    '- Folgenachricht «als Balkendiagramm» / «mache das als …»: gleiche Daten aus dem Verlauf, nur type/labels anpassen — wieder JSON liefern.',
    '- **Verboten:** «Verbesserungen»-Abschnitt, Rückfragen statt Chart, Markdown-Tabelle statt JSON, Quiz, «PNG fertig».',
  ].join('\n')
}
