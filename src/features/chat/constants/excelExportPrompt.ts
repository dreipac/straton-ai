/**
 * Bei relevanten Änderungen an den Excel-Spez-Regeln erhöhen — invalidiert Client-Cache für Sonnet-Specs.
 */
export const EXCEL_SPEC_CACHE_EPOCH = '1'

/** Expliziter Slash-Befehl aus der UI: Nur dann wird der Excel-Flow aktiviert. */
export const EXCEL_EXPORT_COMMAND_MARKER = '[[STRATON_EXCEL_COMMAND]]'

/** Erkennung: Excel-Export soll nur über Claude Sonnet (Separataufruf) laufen, nicht über OpenAI. */
export function userWantsExcelExport(text: string): boolean {
  return text.includes(EXCEL_EXPORT_COMMAND_MARKER)
}

/** Marker aus Sichttext entfernen, bevor Nachricht gespeichert/angezeigt wird. */
export function stripExcelCommandMarker(text: string): string {
  return text.replace(EXCEL_EXPORT_COMMAND_MARKER, '').trim()
}

/**
 * Nur für OpenAI-Hauptchat: Nutzer will Excel — kurze Antwort, KEIN JSON im gleichen Aufruf.
 */
export const EXCEL_CHAT_SHORT_REPLY_HINT = [
  'Der Nutzer hat eine Excel-Datei (.xlsx), Tabellenkalkulation oder strukturierte Tabelle mit Formeln angefragt.',
  'Antworte nur kurz und freundlich auf Deutsch (ein bis wenige Sätze), z. B. dass du die Tabelle vorbereitest.',
  'Schreibe keinen maschinenlesbaren Block, kein JSON und keine <<<STRATON_...>>> Marker — der technische Teil wird separat erzeugt.',
].join('\n')

/**
 * Festes Referenz-JSON für Sonnet (Mehrblätter: Daten + Diagramme).
 * Wichtig: charts auf «Diagramme» mit sourceSheet = exakter Name des Datenblatts.
 */
export const CANONICAL_EXCEL_SPEC_JSON_EXAMPLE = [
  '{',
  '  "version": 1,',
  '  "fileName": "Marketinganalyse.xlsx",',
  '  "sheets": [',
  '    {',
  '      "name": "Daten",',
  '      "rows": [',
  '        [{"t":"v","value":"Kanal"},{"t":"v","value":"Anmeldungen"},{"t":"v","value":"Kosten"}],',
  '        [{"t":"v","value":"Social Media"},{"t":"v","value":320},{"t":"v","value":4800}],',
  '        [{"t":"v","value":"E-Mail"},{"t":"v","value":210},{"t":"v","value":1500}]',
  '      ]',
  '    },',
  '    {',
  '      "name": "Diagramme",',
  '      "rows": [',
  '        [{"t":"v","value":"Hinweis: Diagramme nutzen Daten aus Blatt «Daten» (sourceSheet)."}]',
  '      ],',
  '      "charts": [',
  '        {',
  '          "type": "column",',
  '          "title": "Anmeldungen pro Kanal",',
  '          "sourceSheet": "Daten",',
  '          "categoriesRange": "A2:A3",',
  '          "valuesRange": "B2:B3",',
  '          "anchorCol": 0,',
  '          "anchorRow": 2',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
].join('\n')

/**
 * Wird nur noch vom Sonnet-Spezifikations-Aufruf verwendet (nicht im OpenAI-Chat).
 * Die KI liefert bei Excel-Aufgaben maschinenlesbares JSON zwischen festen Markern.
 */
export const EXCEL_EXPORT_INSTRUCTION = [
  'Excel-Export (nur wenn der Nutzer eine Excel-Datei, .xlsx, Tabellenkalkulation oder strukturierte Tabelle mit Formeln will):',
  '- Antworte zuerst kurz in normalem Text (ein bis wenige Sätze), dann den maschinenlesbaren Block.',
  '- Der Block muss EXAKT so aussehen (eine Zeile Start-Marker, dann nur JSON, dann End-Marker):',
  '<<<STRATON_EXCEL_SPEC_JSON>>>',
  '{ ... }',
  '<<<END_STRATON_EXCEL_SPEC_JSON>>>',
  '',
  'FESTE STRUKTUR (empfohlen, besonders bei Datenblatt + Diagrammblatt):',
  '- Orientiere dich an diesem Muster (Zeilen/Zahlen an Aufgabe anpassen; JSON gueltig halten):',
  CANONICAL_EXCEL_SPEC_JSON_EXAMPLE,
  '',
  'Regeln version 1:',
  '- version: immer 1',
  '- fileName: endet auf .xlsx (nur Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich)',
  '- sheets: Array von Blättern. Reihenfolge: zuerst «Daten» (alle Tabellen), optional zweites Blatt «Diagramme».',
  '- Jedes Blatt: "name", "rows" (2D-Array). Optional "charts" nur wo Diagramme hingehören.',
  '- ZWEI-BLATT-MUSTER: Alle Zahltabellen im ersten Blatt. Im Blatt «Diagramme»: kurze Hinweis-Zeile in rows + "charts". Jedes Chart MUSS "sourceSheet" setzen (exakt gleicher String wie das Datenblatt-"name", z.B. "Daten"). categoriesRange und valuesRange nur A1 auf DEM Datenblatt (z.B. "A2:A6", "D2:D6"), ohne =, optional mit Präfix Daten! wird auch akzeptiert.',
  '- EIN-BLATT: Daten und "charts" im selben Blatt: kein sourceSheet nötig; Bereiche beziehen sich auf dieses Blatt.',
  '- rows: jede ZEILE ist ein Array von Zellen. FALSCH: flache Liste [ {"t":"v"}, ... ] ohne innere Zeilen-Arrays.',
  '- Zelle: { "t": "v", "value": ... } oder { "t": "f", "formula": "=SUMME(A1:A50)" }',
  '- Formeln deutsch: SUMME, WENN, Strichpunkt (;) als Argument-Trenner, kein @ vor Funktionen.',
  '- Hervorhebung (wichtig): In SPALTEN neben der Tabelle soll die «nicht gewählte» Zeile LEEER sein, nicht #NV. Nutze im else-Zweig von WENN einen leeren Text: =WENN(B5=MAX($B$5:$B$9);B5;"") — NICHT NV() oder leer lassen durch NA(): NV/NA erscheint in deutschsprachigem Excel als #NV und wirkt wie ein Fehler.',
  '- NV()/NA() nur verwenden, wenn ausdrücklich eine Hilfsreihe für Diagramme ohne Werte in den anderen Zeilen gewünscht ist — nicht für normale Hervorhebungs-Zeilen unter der Tabelle.',
  '- charts (max. 8 pro Blatt): type column|bar|line; Pflicht categoriesRange, valuesRange; optional title, seriesName, anchorCol, anchorRow. Aliase: categoryRange, dataRange, xRange, yRange.',
  '- Maximal 100 Spalten pro Zeile; null für leere Zellen.',
  '- Kein Text und keine Code-Fences innerhalb der Marker; JSON nach dem Start-Marker nur ein Objekt.',
].join('\n')

/**
 * Nur für Claude Sonnet (Separataufruf): ausschließlich Excel-Spezifikation.
 */
export function buildExcelSpecSonnetSystemPrompt(): string {
  return [
    'Du erzeugst ausschließlich die maschinenlesbare Excel-Spezifikation nach den folgenden Regeln.',
    'Wenn Diagramme gewünscht sind: halte dich eng an die feste Zwei-Blatt-Struktur (Daten + Diagramme mit sourceSheet) aus den Regeln — das verhindert beschädigte .xlsx.',
    'Sprache der sichtbaren Zelltexte: Deutsch wo sinnvoll.',
    'Optional ein sehr kurzer Satz davor, dann sofort der Block. Keine Code-Fences. Keine Wiederholung der Nutzerfrage als Fließtext.',
    EXCEL_EXPORT_INSTRUCTION,
  ].join('\n\n')
}
