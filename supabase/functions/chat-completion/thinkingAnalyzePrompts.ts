/** Intent-Regeln für Thinking-Analyse (Edge — spiegelt Client `thinkingTaskRouting.ts`). */
export function buildThinkingAnalyzeIntentPromptSection(): string {
  return [
    'Intent & task_type (verbindlich):',
    '- MC/Auswahlfrage mit Optionen (A/B/C …) → task_type general_howto, needs_clarification false (finale Antwort: kurz, OpenAI).',
    '- [Datei:…] oder Bild + zusammenfassen/fassen/überblick → document_summary, needs_clarification false (finale Antwort: OpenAI gpt-5-mini).',
    '- Server/Linux/VPS/SSL → server_setup; Software installieren → software_setup; Fehler/debug → troubleshooting.',
    '- Vergleich/Entscheidung → decision_planning; How-to/Ablauf → process_howto; offene Erklärung → general_howto.',
    '- «Quiz/Fragen erzeugen» → general_howto (kein MC lösen).',
    '',
    'Medien:',
    '- Bild-Anhang + beschreiben/lesen/OCR → document_summary, needs_clarification false.',
    '- Word/PDF/Excel-Export → clientseitig separat; hier nur inhaltliche Aufgabe.',
  ].join('\n')
}

export function buildThinkingAnalyzeSystemPromptBase(modelLabel: string): string {
  return [
    `Du analysierst JEDE Nutzeraufgabe für den Straton-Thinking-Modus (${modelLabel}).`,
    'Antworte ausschließlich mit einem JSON-Objekt (kein Markdown).',
    'task_type: server_setup | software_setup | troubleshooting | document_summary | process_howto | decision_planning | general_howto | other.',
    'output_tier: standard | rich — document_summary immer rich; complexity high → rich; MC/kurz → standard.',
    'layout_hint: cards | stepwise | tabular | narrative — document_summary → cards; Setup/How-to → stepwise; MC/Vergleich → tabular.',
    'needs_clarification: true NUR bei echtem Blocker (sehr selten); sonst false mit missing_dimensions [] und clarify_rounds_planned 0.',
    'Bei needs_clarification true: genau 1 missing_dimension, clarify_rounds_planned 1.',
    buildThinkingAnalyzeIntentPromptSection(),
    'Bei [Datei:…]-Anhang mit Text: task_type document_summary; analysis_summary = inhaltlicher Kern (Fakten/Themen aus dem Anhang), nicht nur «Nutzer will PDF zusammenfassen».',
    'assumptions[] bei document_summary: nur echte Lücken im Material, kein Kapitelverzeichnis.',
    '',
    'needs_live_web: true bei aktuellen Web-Fakten (Kurse, News, Gesetze, «aktuell», Versionen).',
    'web_query (max 120, nur wenn needs_live_web), web_reason (max 80, nur wenn needs_live_web).',
    'needs_live_web false bei reiner [Datei:…]-Zusammenfassung ohne Live-Fakten, Coding, Mathe ohne Zeitbezug.',
  ].join('\n')
}
