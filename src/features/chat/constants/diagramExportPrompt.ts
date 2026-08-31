/** Expliziter Slash-Befehl / Skizzen-Kachel: aktiviert Mermaid-Diagramm-Flow. */
export const DIAGRAM_EXPORT_COMMAND_MARKER = '[[STRATON_DIAGRAM_COMMAND]]'

export function userWantsDiagramExport(text: string): boolean {
  return text.includes(DIAGRAM_EXPORT_COMMAND_MARKER)
}

export function stripDiagramCommandMarker(text: string): string {
  return text.replace(DIAGRAM_EXPORT_COMMAND_MARKER, '').trim()
}

export const CANONICAL_MERMAID_STAMMBAUM_EXAMPLE = [
  'flowchart TD',
  '    grossvater[Grossvater Hans] --> vater[Vater Peter]',
  '    grossmutter[Grossmutter Anna] --> vater',
  '    vater --> kind[Kind Maria]',
  '    vater --> kind2[Kind Tom]',
].join('\n')

export const CANONICAL_MERMAID_ABLAUF_EXAMPLE = [
  'flowchart LR',
  '    A[Anfrage] --> B{Prüfung}',
  '    B -->|Ja| C[Bearbeitung]',
  '    B -->|Nein| D[Ablehnung]',
  '    C --> E[Abschluss]',
].join('\n')

export const DIAGRAM_EXPORT_INSTRUCTION = [
  'Struktur-Diagramm (Mermaid — nur wenn der Nutzer Ablauf/Stammbaum/Skizze will):',
  '- Kurzer Einleitungssatz (1–2 Sätze), dann der maschinenlesbare Block.',
  '- Block EXAKT: eine Zeile Start-Marker, nur Mermaid-Quelltext, eine Zeile End-Marker:',
  '<<<STRATON_MERMAID_DIAGRAM>>>',
  'flowchart TD',
  '    ...',
  '<<<END_STRATON_MERMAID_DIAGRAM>>>',
  '',
  'Erlaubte Diagrammtypen: flowchart/graph, sequenceDiagram, mindmap, stateDiagram, erDiagram, journey, timeline.',
  '- Kein ```mermaid-Fence innerhalb der Marker.',
  '- Knotenlabels kurz, Deutsch, ss statt ß.',
  '',
  'Beispiel Stammbaum:',
  CANONICAL_MERMAID_STAMMBAUM_EXAMPLE,
  '',
  'Beispiel Ablauf:',
  CANONICAL_MERMAID_ABLAUF_EXAMPLE,
].join('\n')

export const DIAGRAM_CHAT_DOCUMENT_JSON_HINT = [
  'Struktur-Diagramm — Chat-Vorschau (verbindlich):',
  'Ohne den Mermaid-Block sieht der Nutzer **keine** Grafik — nur Text ist falsch.',
  'Der Nutzer will ein Ablauf-, Stammbaum- oder Übersichtsdiagramm im Chat. Du lieferst **Mermaid-Quelltext** — die App rendert es sofort.',
  DIAGRAM_EXPORT_INSTRUCTION,
  'VERBOTEN: Nur beschreiben («hier ist der Stammbaum») ohne Mermaid-Block; «Verbesserungen»-Abschnitt; Rückfrage statt Spec; Chart-JSON.',
].join('\n\n')
