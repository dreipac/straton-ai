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

export const PPTX_SLIDE_LAYOUTS = [
  'title',
  'section',
  'content',
  'table',
  'stats',
  'twocol',
  'agenda',
  'boxes',
] as const
export type PptxSlideLayout = (typeof PPTX_SLIDE_LAYOUTS)[number]

/**
 * Feste Icon-Whitelist — die KI darf NUR diese Zeichen in `<icon>` verwenden (kein freies Unicode,
 * damit garantiert jedes Icon auf jedem Rechner/PowerPoint korrekt dargestellt wird). Gleiche Liste
 * dupliziert als `ICON_WHITELIST` in `services/pptx-renderer/app.py` (gleiches Muster wie die
 * Farbpaletten — eine Quelle der Wahrheit konzeptionell, zwei Implementierungen).
 */
export const PPTX_ICON_WHITELIST = [
  '🎯', '💡', '📈', '📊', '🔒', '🌍', '🚀', '⚡',
  '🤝', '💰', '✅', '⭐', '🛡', '🧩', '🔄', '📌',
  '⏱', '🧠', '🌱', '🏆', '🔧', '📍', '🔥', '🎓',
] as const

/**
 * Kuratierte Farbpaletten — die KI wählt EINE davon passend zum Thema (kein freies CSS/Hex,
 * damit jede Kombination garantiert gut aussieht). `blue` ist der Fallback für alte, vor diesem
 * Update erzeugte Präsentationen ohne `data-theme`.
 */
export const PPTX_THEME_KEYS = ['blue', 'green', 'violet', 'orange', 'slate'] as const
export type PptxThemeKey = (typeof PPTX_THEME_KEYS)[number]

const PPTX_HTML_FORMAT_RULES = [
  'Form: Marker <<<STRATON_PPTX_HTML>>> … <<<END_STRATON_PPTX_HTML>>> (oder ```html … ``` als Fallback).',
  'Innerhalb der Marker genau EIN `<div data-theme="…">…</div>`, das ALLE Folien umschliesst — keine Folie ausserhalb dieses Divs.',
  'Im Div eine Folge von `<section class="slide" data-layout="…">…</section>` — KEIN `<html>`, `<head>`, `<body>`, kein `<style>`, kein `<script>`.',
  '`data-theme` (genau einmal, am `<div>`-Wrapper) — wähle GENAU EINE Palette passend zum Thema der Präsentation:',
  '- `blue` — Standard/Business/Technik (sicherer Default, wenn nichts besser passt).',
  '- `green` — Natur, Nachhaltigkeit, Gesundheit, Umwelt.',
  '- `violet` — Kreativ, Bildung, Innovation, Forschung.',
  '- `orange` — Marketing, Vertrieb, Energie, etwas Auffälliges.',
  '- `slate` — Finanzen, Recht, sehr formelle/seriöse Themen.',
  'Erlaubte `data-layout`-Werte (genau diese acht, nichts anderes):',
  '- `title` — Cover-Folie: ein `<h1>`, optional ein `<subtitle>`. Einzige Folie mit grossflächigem Akzent-Hintergrund.',
  '- `section` — Kapitel-Trenner: nur ein `<h1>` (keine weiteren Inhalte). Heller Hintergrund, der Titel erscheint als farbige Box — KEIN Cover-Look (der bleibt der `title`-Folie vorbehalten).',
  '- `content` — ein `<h2>` plus Mix aus `<p>` (Fliesstext), `<ul>`/`<ol>` mit `<li>` (Stichpunkte) und optional GENAU EINEM `<callout>` (ein einzelner hervorzuhebender Satz, NICHT für normale Stichpunkte; optional mit einem `<icon>` davor).',
  '- `table` — ein `<h2>` plus genau ein `<table>` mit `<thead>`/`<tbody>`.',
  '- `stats` — ein `<h2>` plus genau ein `<stats>` mit 2–3 `<stat>`-Kindern, jedes `<stat>` enthält genau ein `<statvalue>` (kurze grosse Zahl/Kennzahl, z.B. "87%" oder "120k") und ein `<statlabel>` (kurze Beschriftung darunter), optional ein `<icon>` davor.',
  '- `twocol` — ein `<h2>` (optional) plus genau ein `<columns>` mit genau zwei `<column>`-Kindern, jedes mit eigenem Mix aus `<p>`/`<ul>`/`<ol>`/`<li>` (für echten Vergleich/Gegenüberstellung).',
  '- `agenda` — Inhaltsverzeichnis: ein `<h2>` (z.B. "Agenda") plus genau ein `<agenda>` mit 3–6 `<agendaitem>`-Kindern, jedes `<agendaitem>` enthält genau ein `<agendanum>` (kurzes Kürzel/Nummer deiner Wahl, z.B. "01" oder "I") und ein `<agendatitle>` (Abschnittstitel).',
  '- `boxes` — Vorteile/Schritte/Features als Karten: ein `<h2>` (optional) plus genau ein `<boxes>` mit 2–4 `<box>`-Kindern, jedes `<box>` enthält optional ein `<icon>`, genau ein `<boxtitle>` (kurzer Titel) und optional ein `<boxtext>` (kurzer Beschreibungstext).',
  '`<icon>` (optional, max. EINS pro `<stat>`/`<callout>`/`<box>`) — Inhalt MUSS exakt eines dieser Zeichen sein, sonst nichts: ' +
    PPTX_ICON_WHITELIST.join(' '),
  'Nur diese Tags innerhalb einer Folie erlaubt: `h1`, `h2`, `subtitle`, `p`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `stats`, `stat`, `statvalue`, `statlabel`, `columns`, `column`, `agenda`, `agendaitem`, `agendanum`, `agendatitle`, `callout`, `boxes`, `box`, `boxtitle`, `boxtext`, `icon`.',
].join('\n')

const PPTX_DEPTH_RULES = [
  '**Umfang (verbindlich):** 6–16 Folien je nach Thema — genug für eine vollständige Präsentation, ohne unnötige Füll-Folien.',
  '- Erste Folie immer `title` (Titel + optionaler Untertitel).',
  '- Bei Präsentationen mit ≥3 klaren Abschnitten/`section`-Trennfolien: direkt nach der `title`-Folie eine `agenda`-Folie mit den kommenden Abschnitten — bei sehr kurzen Präsentationen (<8 Folien) ohne klare Abschnitte NICHT erzwingen.',
  '- Bei mehreren Hauptthemen: vor jedem neuen Thema eine `section`-Trennfolie (passend zu den `agenda`-Punkten, falls vorhanden).',
  '- Pro `content`-Folie: 1 `<h2>` + 3–6 kurze Stichpunkte ODER 2–4 kurze Sätze — keine Wall-of-Text-Folien.',
  '- `<callout>` nur, wenn EIN Punkt auf der Folie wirklich eine optische Hervorhebung verdient (Kernaussage, überraschende Erkenntnis) — nicht auf jeder `content`-Folie, nicht als Ersatz für normale `<li>`-Punkte.',
  '- `table` nur bei echtem mehrdimensionalem Vergleich (≥2 Zeilen, ≥2 Spalten) — sonst `content` mit Liste.',
  '- `stats` nur bei echten, konkreten Kennzahlen aus dem Thema — max. 1–2 `stats`-Folien pro Präsentation, NICHT erzwingen, wenn keine sinnvollen Zahlen vorhanden sind.',
  '- `twocol` nur bei echtem Vergleich/Gegenüberstellung (z.B. Vorher/Nachher, Pro/Contra, A vs. B) — nicht als beliebiger Platzhalter für zwei Listen.',
  '- `boxes` nur bei echten Vorteilen/Schritten/Features (2–4 eigenständige Punkte) — nicht als Ersatz für eine normale `<ul>`-Liste in `content`.',
  '- `<icon>` nur einsetzen, wenn es den Punkt wirklich visuell unterstützt (z.B. 🔒 bei Sicherheit, 🌍 bei Nachhaltigkeit) — nicht auf jedem `<stat>`/`<box>` erzwingen, lieber weglassen als ein unpassendes Icon wählen.',
].join('\n')

const PPTX_FORBIDDEN_RULES = [
  'VERBOTEN:',
  '- Antwort NUR als Fliesstext/Markdown-Gliederung, OHNE den Marker-Block — das ist bei einem PowerPoint-Wunsch IMMER falsch, auch bei kurzen/einfachen Themen.',
  '- Keine `<img>`-Tags oder Bild-Referenzen — Bilder sind in dieser Version nicht unterstützt.',
  '- Kein `style`-Attribut, kein `<style>`, kein freies CSS, keine Farben/Schriftgrössen — das Layout kommt aus einem festen App-Theme, nur `data-theme` am Wrapper-Div wählt die Palette.',
  '- Keine leeren Platzhalter-Folien («Folie 3: …» ohne Inhalt).',
  '- `stats`/`twocol`/`agenda`/`callout`/`boxes` nicht in jeder Präsentation erzwingen — nur wenn der Inhalt wirklich dazu passt.',
  '- `<icon>` mit einem anderen Zeichen als aus der erlaubten Liste — wird sonst ignoriert/nicht dargestellt.',
  '- Keine Behauptung, die Präsentation sei schon als Datei fertig — die `.pptx` entsteht erst nach Klick auf «PowerPoint generieren».',
].join('\n')

/** Kurzes Referenzbeispiel — Modelle halten das exotische Marker-Format zuverlässiger ein, wenn sie ein Muster sehen statt nur Regeln. */
const PPTX_HTML_EXAMPLE = [
  '<<<STRATON_PPTX_HTML>>>',
  '<div data-theme="green">',
  '<section class="slide" data-layout="title"><h1>Klimawandel</h1><subtitle>Ursachen, Folgen, Lösungen</subtitle></section>',
  '<section class="slide" data-layout="agenda"><h2>Agenda</h2><agenda><agendaitem><agendanum>01</agendanum><agendatitle>Ursachen</agendatitle></agendaitem><agendaitem><agendanum>02</agendanum><agendatitle>Folgen</agendatitle></agendaitem><agendaitem><agendanum>03</agendanum><agendatitle>Lösungen</agendatitle></agendaitem></agenda></section>',
  '<section class="slide" data-layout="section"><h1>Ursachen</h1></section>',
  '<section class="slide" data-layout="content"><h2>Treibhausgase</h2><ul><li>CO2 aus fossilen Brennstoffen</li><li>Methan aus Landwirtschaft</li><li>Abholzung verstärkt den Effekt</li></ul><callout>87% der Emissionen stammen aus fossilen Brennstoffen.</callout></section>',
  '<section class="slide" data-layout="stats"><h2>Globale Erwärmung in Zahlen</h2><stats><stat><statvalue>1.1°C</statvalue><statlabel>Anstieg seit 1990</statlabel></stat><stat><statvalue>87%</statvalue><statlabel>aus fossilen Brennstoffen</statlabel></stat><stat><statvalue>2050</statvalue><statlabel>Zieljahr Netto-Null</statlabel></stat></stats></section>',
  '<section class="slide" data-layout="twocol"><h2>Vorher vs. Nachher</h2><columns><column><h2>Ohne Massnahmen</h2><ul><li>Steigende Meeresspiegel</li><li>Mehr Extremwetter</li></ul></column><column><h2>Mit Massnahmen</h2><ul><li>Stabilere Ökosysteme</li><li>Neue grüne Industrien</li></ul></column></columns></section>',
  '<section class="slide" data-layout="boxes"><h2>Lösungsansätze</h2><boxes><box><icon>🌱</icon><boxtitle>Erneuerbare Energien</boxtitle><boxtext>Ausbau von Solar- und Windkraft</boxtext></box><box><icon>🔄</icon><boxtitle>Kreislaufwirtschaft</boxtitle><boxtext>Weniger Abfall, mehr Recycling</boxtext></box><box><icon>🤝</icon><boxtitle>Internationale Zusammenarbeit</boxtitle><boxtext>Gemeinsame Klimaziele</boxtext></box></boxes></section>',
  '<section class="slide" data-layout="table"><h2>Temperaturanstieg im Vergleich</h2><table><thead><tr><th>Jahr</th><th>Anstieg (°C)</th></tr></thead><tbody><tr><td>1990</td><td>0.3</td></tr><tr><td>2020</td><td>1.1</td></tr></tbody></table></section>',
  '</div>',
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
    'Beispiel (Struktur/Marker exakt so übernehmen, Theme/Inhalt natürlich an die Anfrage anpassen):',
    PPTX_HTML_EXAMPLE,
    'Optional 1 kurzer Einleitungssatz vor dem Block, danach IMMER der vollständige HTML-Block — sonst nichts ausserhalb der Marker.',
  ].join('\n')
}

export const PPTX_CHAT_DOCUMENT_HTML_HINT = buildPptxChatDocumentHtmlHint()
