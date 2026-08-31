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
