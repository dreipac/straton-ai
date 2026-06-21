/**
 * Slash-Befehl `/PowerPoint` (bzw. `/PPT`) setzt diesen Marker — analog zu Word/PDF/Excel.
 */
export const PPTX_EXPORT_COMMAND_MARKER = '[[STRATON_PPTX_COMMAND]]'

export function userWantsPptxExport(text: string): boolean {
  return text.includes(PPTX_EXPORT_COMMAND_MARKER)
}

export function stripPptxCommandMarker(text: string): string {
  return text.replace(PPTX_EXPORT_COMMAND_MARKER, '').trim()
}

/** Maschinenlesbarer Block: HTML statt JSON — Folien als `<section class="slide">`. */
export const PPTX_HTML_START = '<<<STRATON_PPTX_HTML>>>'
export const PPTX_HTML_END = '<<<END_STRATON_PPTX_HTML>>>'

export const PPTX_SLIDE_LAYOUTS = ['title', 'section', 'content', 'table'] as const
export type PptxSlideLayout = (typeof PPTX_SLIDE_LAYOUTS)[number]

const PPTX_HTML_FORMAT_RULES = [
  'Form: Marker <<<STRATON_PPTX_HTML>>> … <<<END_STRATON_PPTX_HTML>>> (oder ```html … ``` als Fallback).',
  'Innerhalb der Marker NUR eine Folge von `<section class="slide" data-layout="…">…</section>` — KEIN `<html>`, `<head>`, `<body>`, kein `<style>`, kein `<script>`.',
  'Erlaubte `data-layout`-Werte (genau diese vier, nichts anderes):',
  '- `title` — Cover-Folie: ein `<h1>`, optional ein `<p class="subtitle">`.',
  '- `section` — Kapitel-Trenner: nur ein `<h1>` (keine weiteren Inhalte).',
  '- `content` — ein `<h2>` plus Mix aus `<p>` (Fliesstext) und `<ul>`/`<ol>` mit `<li>` (Stichpunkte).',
  '- `table` — ein `<h2>` plus genau ein `<table>` mit `<thead>`/`<tbody>`.',
  'Nur diese Tags innerhalb einer Folie erlaubt: `h1`, `h2`, `p`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.',
].join('\n')

const PPTX_DEPTH_RULES = [
  '**Umfang (verbindlich):** 6–16 Folien je nach Thema — genug für eine vollständige Präsentation, ohne unnötige Füll-Folien.',
  '- Erste Folie immer `title` (Titel + optionaler Untertitel).',
  '- Bei mehreren Hauptthemen: vor jedem neuen Thema eine `section`-Trennfolie.',
  '- Pro `content`-Folie: 1 `<h2>` + 3–6 kurze Stichpunkte ODER 2–4 kurze Sätze — keine Wall-of-Text-Folien.',
  '- `table` nur bei echtem mehrdimensionalem Vergleich (≥2 Zeilen, ≥2 Spalten) — sonst `content` mit Liste.',
].join('\n')

const PPTX_FORBIDDEN_RULES = [
  'VERBOTEN:',
  '- Antwort NUR als Fliesstext/Markdown-Gliederung, OHNE den Marker-Block — das ist bei einem PowerPoint-Wunsch IMMER falsch, auch bei kurzen/einfachen Themen.',
  '- Keine `<img>`-Tags oder Bild-Referenzen — Bilder sind in dieser Version nicht unterstützt.',
  '- Kein `style`-Attribut, kein `<style>`, kein freies CSS, keine Farben/Schriftgrössen — das Layout kommt aus einem festen App-Theme.',
  '- Keine leeren Platzhalter-Folien («Folie 3: …» ohne Inhalt).',
  '- Keine Behauptung, die Präsentation sei schon als Datei fertig — die `.pptx` entsteht erst nach Klick auf «PowerPoint generieren».',
].join('\n')

/** Kurzes Referenzbeispiel — Modelle halten das exotische Marker-Format zuverlässiger ein, wenn sie ein Muster sehen statt nur Regeln. */
const PPTX_HTML_EXAMPLE = [
  '<<<STRATON_PPTX_HTML>>>',
  '<section class="slide" data-layout="title"><h1>Klimawandel</h1><p class="subtitle">Ursachen, Folgen, Lösungen</p></section>',
  '<section class="slide" data-layout="section"><h1>Ursachen</h1></section>',
  '<section class="slide" data-layout="content"><h2>Treibhausgase</h2><ul><li>CO2 aus fossilen Brennstoffen</li><li>Methan aus Landwirtschaft</li><li>Abholzung verstärkt den Effekt</li></ul></section>',
  '<section class="slide" data-layout="table"><h2>Temperaturanstieg im Vergleich</h2><table><thead><tr><th>Jahr</th><th>Anstieg (°C)</th></tr></thead><tbody><tr><td>1990</td><td>0.3</td></tr><tr><td>2020</td><td>1.1</td></tr></tbody></table></section>',
  '<<<END_STRATON_PPTX_HTML>>>',
].join('\n')

/**
 * EIN Hint-Baustein für PPTX, identisch in Instant und Thinking verwendet (keine getrennten,
 * sich widersprechenden Varianten — siehe Word/PDF-Bug, der genau daraus entstand).
 */
export function buildPptxChatDocumentHtmlHint(): string {
  return [
    'PowerPoint-Export (verbindlich — IMMER den Marker-Block liefern, keine Ausnahme):',
    'Der Nutzer will eine PowerPoint-Präsentation (.pptx). Du MUSST in DIESER Antwort den vollständigen HTML-Folien-Block liefern — niemals nur ankündigen/beschreiben, was die Präsentation enthalten wird. Die Datei selbst entsteht erst nach Klick auf «PowerPoint generieren», aber der Block mit allen Folien gehört JETZT in deine Antwort.',
    PPTX_HTML_FORMAT_RULES,
    PPTX_DEPTH_RULES,
    PPTX_FORBIDDEN_RULES,
    'Beispiel (Struktur/Marker exakt so übernehmen, Inhalt natürlich an die Anfrage anpassen):',
    PPTX_HTML_EXAMPLE,
    'Optional 1 kurzer Einleitungssatz vor dem Block, danach IMMER der vollständige HTML-Block — sonst nichts ausserhalb der Marker.',
  ].join('\n')
}

export const PPTX_CHAT_DOCUMENT_HTML_HINT = buildPptxChatDocumentHtmlHint()
