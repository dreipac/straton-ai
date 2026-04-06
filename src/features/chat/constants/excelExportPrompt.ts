/** Erkennung: Excel-Export soll nur ueber Claude Sonnet (Separataufruf) laufen, nicht ueber OpenAI. */
export function userWantsExcelExport(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\bexcel\b/.test(t) ||
    /\bxlsx\b/.test(t) ||
    /\b\.xlsx\b/.test(t) ||
    /\btabellenkalkulation\b/.test(t) ||
    /\bspreadsheet\b/.test(t) ||
    (/\btabelle\b/.test(t) && /\b(formel|formeln|excel|xlsx|kalkulation|zelle)\b/.test(t))
  )
}

/**
 * Nur fuer OpenAI-Hauptchat: Nutzer will Excel — kurze Antwort, KEIN JSON im gleichen Aufruf.
 */
export const EXCEL_CHAT_SHORT_REPLY_HINT = [
  'Der Nutzer hat eine Excel-Datei (.xlsx), Tabellenkalkulation oder strukturierte Tabelle mit Formeln angefragt.',
  'Antworte nur kurz und freundlich auf Deutsch (ein bis wenige Saetze), z. B. dass du die Tabelle vorbereitest.',
  'Schreibe keinen maschinenlesbaren Block, kein JSON und keine <<<STRATON_...>>> Marker — der technische Teil wird separat erzeugt.',
].join('\n')

/**
 * Wird nur noch vom Sonnet-Spezifikations-Aufruf verwendet (nicht im OpenAI-Chat).
 * Die KI liefert bei Excel-Aufgaben maschinenlesbares JSON zwischen festen Markern.
 */
export const EXCEL_EXPORT_INSTRUCTION = [
  'Excel-Export (nur wenn der Nutzer eine Excel-Datei, .xlsx, Tabellenkalkulation oder strukturierte Tabelle mit Formeln will):',
  '- Antworte zuerst kurz in normalem Text (ein bis wenige Saetze), dann den maschinenlesbaren Block.',
  '- Der Block muss EXAKT so aussehen (eine Zeile Start-Marker, dann nur JSON, dann End-Marker):',
  '<<<STRATON_EXCEL_SPEC_JSON>>>',
  '{ ... }',
  '<<<END_STRATON_EXCEL_SPEC_JSON>>>',
  'JSON-Schema version 1:',
  '- version: immer 1',
  '- fileName: Dateiname endend auf .xlsx (nur Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich)',
  '- sheets: Array von Bloettern, jedes mit name (kurz) und rows als 2D-Array: jede ZEILE ist ein Array von Zellen.',
  '- Beispiel eine Spalte A mit drei Zeilen: "rows": [ [{"t":"v","value":1}], [{"t":"v","value":2}], [{"t":"f","formula":"=SUMME(A1:A2)"}] ]',
  '- FALSCH (wird nicht akzeptiert): eine flache Liste [ {"t":"v",...}, {"t":"v",...} ] ohne innere Arrays — jede Datenzeile braucht [ ... ] um die Zellen.',
  '- Zelle als Objekt: { "t": "v", "value": ... } oder { "t": "f", "formula": "=SUMME(A1:A50)" }',
  '- Formeln in deutscher Excel-Notation: Funktionsnamen deutsch (z.B. SUMME, WENN), Trennzeichen Strichpunkt (;), Bereiche z.B. A1:B2. Beginne jede Formel mit =',
  '- NIEMALS ein @ vor dem Funktionsnamen setzen (falsch: =@SUMME(...); richtig: =SUMME(...)). Das @ fuehrt in Excel oft zu #NAME?',
  '- Maximal 100 Spalten pro Zeile, keine leeren Platzhalter-Zeilen nur zum Fuellen — nutze null fuer leere Zellen wo noetig',
  '- Keine Code-Fences um den JSON-Block; kein Text innerhalb der Marker',
].join('\n')

/**
 * Nur fuer Claude Sonnet (Separataufruf): ausschliesslich Excel-Spezifikation.
 */
export function buildExcelSpecSonnetSystemPrompt(): string {
  return [
    'Du erzeugst ausschliesslich die maschinenlesbare Excel-Spezifikation nach den folgenden Regeln.',
    'Sprache der sichtbaren Zelltexte: Deutsch wo sinnvoll.',
    'Optional ein sehr kurzer Satz davor, dann sofort der Block. Keine Code-Fences. Keine Wiederholung der Nutzerfrage als Fliesstext.',
    EXCEL_EXPORT_INSTRUCTION,
  ].join('\n\n')
}
