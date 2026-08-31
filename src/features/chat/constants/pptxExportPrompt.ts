/**
 * Slash-Befehl `/PowerPoint` (bzw. `/PPT`) setzt diesen Marker — analog zu Word/PDF/Excel.
 */
export const PPTX_EXPORT_COMMAND_MARKER = '[[STRATON_PPTX_COMMAND]]'

/**
 * Editier-Box in der Folien-Vorschau setzt diesen Marker statt des normalen Export-Markers —
 * löst dieselbe Routing-Erkennung aus (`wantsPptx`), signalisiert aber zusätzlich "das ist eine
 * Änderung an einer bestehenden Präsentation, kein Neuauftrag" (siehe `userWantsPptxEdit`).
 */
export const PPTX_EDIT_COMMAND_MARKER = '[[STRATON_PPTX_EDIT_COMMAND]]'

export function userWantsPptxExport(text: string): boolean {
  return text.includes(PPTX_EXPORT_COMMAND_MARKER) || text.includes(PPTX_EDIT_COMMAND_MARKER)
}

export function userWantsPptxEdit(text: string): boolean {
  return text.includes(PPTX_EDIT_COMMAND_MARKER)
}

export function stripPptxCommandMarker(text: string): string {
  return text.replace(PPTX_EXPORT_COMMAND_MARKER, '').replace(PPTX_EDIT_COMMAND_MARKER, '').trim()
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
 * Update erzeugte Präsentationen ohne `data-theme`. Dieselben 10 Keys sind zusätzlich als
 * Element-Override (`data-color`/`data-textcolor`, siehe unten) wählbar — unabhängig vom
 * Deck-Theme, für gezielte farbliche Hervorhebung einzelner Elemente.
 */
export const PPTX_THEME_KEYS = [
  'blue',
  'green',
  'violet',
  'orange',
  'slate',
  'red',
  'pink',
  'teal',
  'amber',
  'indigo',
] as const
export type PptxThemeKey = (typeof PPTX_THEME_KEYS)[number]

/**
 * Deck-Design — der NUTZER wählt eines über das Preset-Auswahl-Modal vor der Generierung, NICHT
 * die KI (anders als `PPTX_THEME_KEYS`, das weiterhin frei von der KI für Element-Akzente gewählt
 * wird). Jedes Preset ist ein eigenständiges, kuratiertes Design (Farbe + Typografie + Eckenstil +
 * Titel-Behandlung), keine reine Farbvariante — siehe `PPTX_PRESET_SPECS` in `pptxOutline.ts`.
 * Präsentationen ohne `preset` (vor diesem Feature erzeugt) bleiben unverändert auf dem alten,
 * KI-gewählten `theme`-System.
 */
export const PPTX_PRESET_KEYS = ['tech', 'soft', 'professional', 'bold', 'minimal'] as const
export type PptxPresetKey = (typeof PPTX_PRESET_KEYS)[number]

/** Anzeige-Texte fürs Preset-Auswahl-Modal (`PptxPresetPickerModal.tsx`) — Farben kommen separat aus `PPTX_PRESET_SPECS` (`pptxOutline.ts`). */
export const PPTX_PRESET_DISPLAY: Record<PptxPresetKey, { label: string; description: string }> = {
  tech: { label: 'Tech', description: 'Dunkel, Blau/Cyan — Produkt, SaaS, Software' },
  soft: { label: 'Soft', description: 'Pastell, freundlich — Lifestyle, Bildung, HR' },
  professional: { label: 'Professional', description: 'Navy/Slate, seriös — Finanzen, Beratung, Recht' },
  bold: { label: 'Bold', description: 'Kräftige Farben — Kreativ, Marketing, Pitch' },
  minimal: { label: 'Minimal', description: 'Schwarz/Weiss, editorial — Reduziert, Premium' },
}

/** Eckenrundung einzelner Karten-Elemente (`data-radius`) — feste Stufen, kein Pixel-Wert vom Modell. */
export const PPTX_RADIUS_KEYS = ['none', 'sm', 'md', 'lg', 'full'] as const
export type PptxRadiusKey = (typeof PPTX_RADIUS_KEYS)[number]

/** Schriftgrösse relativ zur normalen Grösse des jeweiligen Tags (`data-size`). */
export const PPTX_SIZE_KEYS = ['sm', 'md', 'lg', 'xl'] as const
export type PptxSizeKey = (typeof PPTX_SIZE_KEYS)[number]

/** Horizontale Ausrichtung (`data-align`). */
export const PPTX_ALIGN_KEYS = ['left', 'center', 'right'] as const
export type PptxAlignKey = (typeof PPTX_ALIGN_KEYS)[number]

/** Vertikale Position innerhalb des verfügbaren Folienbereichs (`data-valign`). */
export const PPTX_VALIGN_KEYS = ['top', 'middle', 'bottom'] as const
export type PptxValignKey = (typeof PPTX_VALIGN_KEYS)[number]

/** Einzig gültiger Wert für die Auszeichnungs-Attribute (`data-bold`/`data-italic`/`data-underline`) — Attribut weglassen = aus. */
export const PPTX_BOOL_ATTR_VALUE = 'true'

/**
 * Bei vom Nutzer gewähltem Preset (Preset-Modal vor der Generierung) MUSS die KI exakt diesen
 * Wert setzen — die freie 10-Paletten-Wahl entfällt dann (Design ist vorgegeben, nicht mehr KI-
 * Entscheidung). Ohne Preset (Fallback/alte Aufrufpfade) bleibt die bisherige freie Wahl bestehen.
 */
function buildPptxThemeWrapperRule(preset?: PptxPresetKey): string {
  if (preset) {
    return `\`data-theme\` (genau einmal, am \`<div>\`-Wrapper) — MUSS exakt \`${preset}\` sein (Design ist vom Nutzer fest vorgegeben, nicht frei wählbar). Verwende IMMER genau diesen Wert, nie einen der zehn Paletten-Namen.`
  }
  return [
    '`data-theme` (genau einmal, am `<div>`-Wrapper) — wähle GENAU EINE Palette passend zum Thema der Präsentation:',
    '- `blue` — Standard/Business/Technik (sicherer Default, wenn nichts besser passt).',
    '- `green` — Natur, Nachhaltigkeit, Gesundheit, Umwelt.',
    '- `violet` — Kreativ, Bildung, Innovation, Forschung.',
    '- `orange` — Marketing, Vertrieb, Energie, etwas Auffälliges.',
    '- `slate` — Finanzen, Recht, sehr formelle/seriöse Themen.',
    '- `red` — Dringlichkeit, Gesundheit/Notfall, Warnungen, kräftige Marken.',
    '- `pink` — Lifestyle, Mode, Beauty, verspielte Themen.',
    '- `teal` — Tech/SaaS, Beratung, frisch-moderne Themen.',
    '- `amber` — Energie, Bau/Industrie, Optimismus, warme Marken.',
    '- `indigo` — Wissenschaft, Forschung, seriös-moderne Tech-Themen.',
  ].join('\n')
}

function buildPptxHtmlFormatRules(preset?: PptxPresetKey): string {
  return [
  'Form: Marker <<<STRATON_PPTX_HTML>>> … <<<END_STRATON_PPTX_HTML>>> (oder ```html … ``` als Fallback).',
  'Innerhalb der Marker genau EIN `<div data-theme="…">…</div>`, das ALLE Folien umschliesst — keine Folie ausserhalb dieses Divs.',
  'Im Div eine Folge von `<section class="slide" data-layout="…">…</section>` — KEIN `<html>`, `<head>`, `<body>`, kein `<style>`, kein `<script>`.',
  buildPptxThemeWrapperRule(preset),
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
}

/**
 * Optionale Design-Attribute (`data-*`) — geschlossene Wertelisten, KEIN freies CSS/Hex/Pixel.
 * Wird vom Sanitizer (`pptxOutline.ts`, `ALLOWED_ELEMENT_STYLE_ATTRS`) strikt validiert: jede
 * andere Tag/Attribut/Wert-Kombination wird kommentarlos verworfen (Fallback = aktuelles Standard-
 * Aussehen). Nutze diese Attribute nur, wenn der Nutzer das wirklich verlangt — nicht von selbst
 * auf jedem Element, der Standard-Look ist bereits gut gestaltet.
 */
const PPTX_DESIGN_ATTRIBUTE_RULES = [
  'Optionale Design-Attribute (nur diese, nur auf den genannten Tags, sonst nichts):',
  `- \`data-textcolor="…"\` auf \`h1\`/\`h2\`/\`subtitle\`/\`p\`/\`li\`/\`boxtitle\`/\`boxtext\`/\`statvalue\`/\`statlabel\`/\`agendatitle\` — eine der 10 Paletten-Farben (${PPTX_THEME_KEYS.join(', ')}), überschreibt NUR die Textfarbe dieses einen Elements.`,
  `- \`data-size="…"\` auf denselben Text-Tags — Schriftgrösse relativ zur normalen Grösse: ${PPTX_SIZE_KEYS.join(', ')} (\`md\` entspricht der normalen Grösse, daher meist weglassen).`,
  '- `data-bold="true"` / `data-italic="true"` / `data-underline="true"` auf denselben Text-Tags — Auszeichnung an/aus (Attribut weglassen = aus, kein anderer Wert gültig).',
  `- \`data-align="…"\` auf denselben Text-Tags ODER auf \`box\`/\`stat\`/\`callout\`/\`column\`/\`agendaitem\` — horizontale Ausrichtung: ${PPTX_ALIGN_KEYS.join(', ')}.`,
  `- \`data-color="…"\` auf \`box\`/\`stat\`/\`callout\`/\`column\`/\`agendaitem\` ODER auf dem \`<h1>\` einer \`title\`-Folie (zeigt Titel+Untertitel als farbige Box statt freiem Text) — eine der 10 Paletten-Farben, überschreibt NUR die Hintergrund-/Akzentfarbe dieses einen Elements (unabhängig vom Deck-Theme). Auf \`<h1>\` einer \`section\`-Folie ohne Wirkung (die hat bereits ihre eigene feste Akzent-Box).`,
  `- \`data-radius="…"\` auf denselben Karten-Tags inkl. einem geboxten \`<h1>\` — Eckenrundung: ${PPTX_RADIUS_KEYS.join(', ')}.`,
  `- \`data-valign="…"\` auf \`box\`/\`stat\`/\`column\` ODER auf den Gruppen-Containern \`stats\`/\`boxes\`/\`agenda\`/\`columns\` ODER direkt auf dem \`<section>\`-Tag einer \`title\`-/\`section\`-Folie (vertikale Position des gesamten Titels/Trenners auf der Folie) — vertikale Position: ${PPTX_VALIGN_KEYS.join(', ')} (bei Karten ist \`top\` der Standard, bei \`title\`/\`section\` ist \`middle\` der Standard, daher meist weglassen).`,
  '- Niemals Hex-Farben, Pixel-Werte, Schriftarten oder ein anderes Attribut/Tag verwenden — nur exakt diese Wertelisten.',
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
  '- Kein `style`-Attribut, kein `<style>`, kein freies CSS, keine Hex-Farben/Pixel-Werte/Schriftarten — nur die oben gelisteten `data-*`-Attribute mit ihren festen Wertelisten sind erlaubt, sonst kein Attribut.',
  '- Keine leeren Platzhalter-Folien («Folie 3: …» ohne Inhalt).',
  '- `stats`/`twocol`/`agenda`/`callout`/`boxes` nicht in jeder Präsentation erzwingen — nur wenn der Inhalt wirklich dazu passt.',
  '- `<icon>` mit einem anderen Zeichen als aus der erlaubten Liste — wird sonst ignoriert/nicht dargestellt.',
  '- Keine Behauptung, die Präsentation sei schon als Datei fertig — die `.pptx` entsteht erst nach Klick auf «PowerPoint generieren».',
].join('\n')

/** Kurzes Referenzbeispiel — Modelle halten das exotische Marker-Format zuverlässiger ein, wenn sie ein Muster sehen statt nur Regeln. `data-theme` im Beispiel spiegelt das gewählte Preset (falls vorhanden), damit es nicht der "MUSS exakt …"-Regel widerspricht. */
function buildPptxHtmlExample(preset?: PptxPresetKey): string {
  const themeAttr: string = preset ?? 'green'
  return [
    '<<<STRATON_PPTX_HTML>>>',
    `<div data-theme="${themeAttr}">`,
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
}

/**
 * EIN Hint-Baustein für PPTX, identisch in Instant und Thinking verwendet (keine getrennten,
 * sich widersprechenden Varianten — siehe Word/PDF-Bug, der genau daraus entstand). `preset`
 * gesetzt (Normalfall seit dem Preset-Modal) → KI MUSS exakt dieses Design setzen, keine freie
 * Palettenwahl mehr. Ohne `preset` (Fallback, z.B. wenn die Heuristik des Compose-Gates eine
 * Anfrage nicht synchron erkannt hat) bleibt die alte freie Wahl bestehen.
 */
export function buildPptxChatDocumentHtmlHint(preset?: PptxPresetKey): string {
  return [
    'PowerPoint-Export (verbindlich — IMMER den Marker-Block liefern, keine Ausnahme):',
    'Der Nutzer will eine PowerPoint-Präsentation (.pptx). Du MUSST in DIESER Antwort den vollständigen HTML-Folien-Block liefern — niemals nur ankündigen/beschreiben, was die Präsentation enthalten wird. Die Datei selbst entsteht erst nach Klick auf «PowerPoint generieren», aber der Block mit allen Folien gehört JETZT in deine Antwort.',
    buildPptxHtmlFormatRules(preset),
    PPTX_DESIGN_ATTRIBUTE_RULES,
    PPTX_DEPTH_RULES,
    PPTX_FORBIDDEN_RULES,
    'Beispiel (Struktur/Marker exakt so übernehmen, Theme/Inhalt natürlich an die Anfrage anpassen):',
    buildPptxHtmlExample(preset),
    'Optional 1 kurzer Einleitungssatz vor dem Block, danach IMMER der vollständige HTML-Block — sonst nichts ausserhalb der Marker.',
  ].join('\n')
}

export const PPTX_CHAT_DOCUMENT_HTML_HINT = buildPptxChatDocumentHtmlHint()

/**
 * Editier-Block: gezielte Änderungen an einer BESTEHENDEN Präsentation — KEIN voller Foliensatz.
 * Wird zusätzlich zu {@link PPTX_CHAT_DOCUMENT_HTML_HINT} eingeblendet (das Modell muss weiterhin
 * das Folien-Schema kennen, um gültiges Ersatz-HTML zu schreiben), nur wenn die Editier-Box in
 * der Vorschau genutzt wurde. Der aktuelle Foliensatz wird separat als Turn-Kontext mitgegeben
 * (nummeriert, siehe `buildPptxEditContextBlock` in `pptxOutline.ts`).
 */
export const PPTX_PATCH_START = '<<<STRATON_PPTX_PATCH>>>'
export const PPTX_PATCH_END = '<<<END_STRATON_PPTX_PATCH>>>'

const PPTX_PATCH_OPERATIONS = [
  `\`[[THEME:palette]]\` — wechselt die Akzentfarbe der GESAMTEN Präsentation (eine der 10 Paletten: ${PPTX_THEME_KEYS.join(', ')}). Keine Folie wird dabei neu geschrieben.`,
  '`[[REPLACE:N]]` gefolgt von genau einem `<section class="slide" data-layout="…">…</section>` — ersetzt Folie Nummer N (1-basiert, gemäss der nummerierten Liste im Kontext) komplett durch diese neue Folie.',
  '`[[INSERT_AFTER:N]]` gefolgt von genau einem `<section>…</section>` — fügt eine neue Folie direkt NACH Folie N ein. `N=0` fügt am Anfang ein (vor Folie 1).',
  '`[[INSERT_BEFORE:N]]` gefolgt von genau einem `<section>…</section>` — fügt eine neue Folie direkt VOR Folie N ein.',
  '`[[DELETE:N]]` (ohne Folge-HTML) — entfernt Folie N ersatzlos.',
].join('\n')

const PPTX_PATCH_EXAMPLE = [
  '<<<STRATON_PPTX_PATCH>>>',
  '[[REPLACE:1]]',
  '<section class="slide" data-layout="title" data-valign="top"><h1 data-color="orange" data-radius="lg">Klimawandel</h1><subtitle>Ursachen, Folgen, Lösungen</subtitle></section>',
  '[[REPLACE:3]]',
  '<section class="slide" data-layout="content"><h2 data-textcolor="green">Treibhausgase</h2><ul><li>CO2 aus fossilen Brennstoffen</li><li>Methan aus Landwirtschaft</li></ul><callout data-color="green" data-radius="full">87% der Emissionen stammen aus fossilen Brennstoffen.</callout></section>',
  '[[DELETE:6]]',
  '<<<END_STRATON_PPTX_PATCH>>>',
].join('\n')

const PPTX_EDIT_UNSUPPORTED_RULE = [
  'Manche Wünsche liegen ausserhalb der festen Wertelisten (siehe Design-Attribute oben) — z.B. eine exakte Pixel-Position, eine freie Hex-Farbe, ein Farbverlauf, eine andere Schriftart, oder ein Layout-Element, das es nicht gibt.',
  'In diesem Fall gib KEINEN Patch-Block aus — auch keinen unvollständigen oder "ungefähr passenden". Antworte statt dessen normal mit 1–2 Sätzen: was genau nicht unterstützt wird, und wenn möglich ein Vorschlag für die nächstliegende unterstützte Alternative aus den festen Listen.',
].join('\n')

function buildPptxEditChatHint(): string {
  return [
    'PowerPoint-Änderung an einer BESTEHENDEN Präsentation (verbindlich):',
    'Der Nutzer möchte NICHT eine neue Präsentation, sondern gezielte Änderungen an der oben im Kontext mitgegebenen, bereits vorhandenen Präsentation. Gib NIEMALS den vollständigen Foliensatz erneut aus — das verschwendet Zeit und Tokens und riskiert, dass unveränderte Folien versehentlich anders formuliert werden.',
    `Antworte stattdessen AUSSCHLIESSLICH mit einem Patch-Block: ${PPTX_PATCH_START} … ${PPTX_PATCH_END}, der NUR die tatsächlich betroffenen Operationen enthält:`,
    PPTX_PATCH_OPERATIONS,
    'Folien-Nummern (N) beziehen sich immer auf die ORIGINAL-Nummerierung der aktuellen Präsentation aus dem Kontext — nicht auf das Ergebnis nach vorherigen Operationen im selben Patch.',
    'Neues/ersetztes Folien-HTML folgt exakt demselben Schema/denselben Tags/Layouts wie bei einer Neugenerierung (siehe oben) — nur eben einzeln pro Operation statt als ganzes Deck.',
    'Betrifft die Änderung wirklich JEDE Folie (z.B. "komplett neues Design für jede Folie"), darfst du für jede Folie eine eigene `[[REPLACE:N]]`-Operation schreiben — aber NIE einen vollständigen `<<<STRATON_PPTX_HTML>>>`-Block als Ersatz für den Patch.',
    'Für Design-Wünsche an EINZELNEN Elementen (Position, Textfarbe, Eckenradius, Schriftgrösse, Fett/Kursiv/Unterstrichen) nutze die `data-*`-Attribute aus den Design-Attribut-Regeln oben direkt im Ersatz-HTML der betroffenen Folie(n) — weiterhin nur `[[REPLACE:N]]` für genau diese Folie(n), nicht das ganze Deck.',
    PPTX_EDIT_UNSUPPORTED_RULE,
    'Optional 1 kurzer Bestätigungssatz vor dem Patch-Block (z.B. "Ich habe die Akzentfarbe auf Grün geändert."), danach NICHTS ausserhalb der Marker.',
    'Beispiel:',
    PPTX_PATCH_EXAMPLE,
  ].join('\n')
}

export const PPTX_EDIT_CHAT_HINT = buildPptxEditChatHint()

/**
 * Text-only-Editier-Block für NEUE (Preset-basierte) Decks — ersetzt {@link PPTX_EDIT_CHAT_HINT}
 * für diese Decks (siehe Dispatch in `chat.service.ts`/`useChat.ts`, anhand `slides[0]?.preset`).
 * Erlaubt NUR Text ändern/hinzufügen/entfernen, NIE Design/Layout/Theme/Foliengliederung — diese
 * laufen stattdessen über den Button «Design ändern» (kein Chat, kein KI-Aufruf). Nutzt denselben
 * Patch-Marker (`PPTX_PATCH_START`/`PPTX_PATCH_END`) wie das alte System, aber eine eigene, enger
 * gefasste Operationssyntax (siehe `parsePptxTextPatchFromContent`/`applyPptxTextOnlyPatchToSlides`
 * in `pptxOutline.ts`).
 */
const PPTX_TEXT_PATCH_OPERATIONS = [
  '`[[SET_TEXT slide=N tag=TAG occurrence=K]]` gefolgt vom neuen Text (reiner Text, kein HTML) — ersetzt den Text des K-ten `TAG`-Elements auf Folie N (1-basiert; `occurrence` weglassen = 1). Erlaubte `TAG`-Werte: `h1`, `h2`, `subtitle`, `p`, `li`, `statvalue`, `statlabel`, `boxtitle`, `boxtext`, `agendatitle`, `agendanum`, `td`, `th`.',
  '`[[ADD_ITEM slide=N container=CONTAINER occurrence=K]]` gefolgt von GENAU EINEM neuen Element desselben Aufbaus wie die bestehenden Kinder von `CONTAINER` (z.B. `<li>Neuer Punkt</li>` für `ul`/`ol`, `<stat><statvalue>…</statvalue><statlabel>…</statlabel></stat>` für `stats`, `<box><boxtitle>…</boxtitle><boxtext>…</boxtext></box>` für `boxes`, `<agendaitem><agendanum>…</agendanum><agendatitle>…</agendatitle></agendaitem>` für `agenda`) — fügt es als letztes Kind in den K-ten `CONTAINER` auf Folie N ein (`occurrence` weglassen = 1). Erlaubte `CONTAINER`-Werte: `ul`, `ol`, `stats`, `boxes`, `agenda`.',
  '`[[DELETE_ITEM slide=N container=CONTAINER item=K]]` (ohne Folge-Inhalt) — entfernt das K-te Kind-Element des `CONTAINER` auf Folie N ersatzlos.',
].join('\n')

const PPTX_TEXT_PATCH_EXAMPLE = [
  '<<<STRATON_PPTX_PATCH>>>',
  '[[SET_TEXT slide=3 tag=li occurrence=2]]',
  'Methan aus Landwirtschaft und Viehzucht',
  '[[ADD_ITEM slide=3 container=ul]]',
  '<li>Lachgas aus Düngemitteln</li>',
  '[[DELETE_ITEM slide=5 container=boxes item=2]]',
  '<<<END_STRATON_PPTX_PATCH>>>',
].join('\n')

const PPTX_TEXT_EDIT_UNSUPPORTED_RULE = [
  'Design-/Struktur-Wünsche (Farbe, Theme, Schriftart, neue/gelöschte Folien, Layout-Wechsel, neue `data-*`-Attribute, Verschieben von Folien) sind über den Chat NICHT möglich — diese Präsentation nutzt ein festes Design (Preset).',
  'Bei einem solchen Wunsch gib KEINEN Patch-Block aus. Antworte stattdessen freundlich in 1 Satz, dass Design-Änderungen über den Button «Design ändern» in der Folien-Vorschau laufen, nicht über den Chat.',
].join('\n')

function buildPptxTextOnlyEditChatHint(): string {
  return [
    'PowerPoint-Änderung an einer BESTEHENDEN Präsentation — NUR TEXT (verbindlich):',
    'Diese Präsentation wurde mit einem festen Design-Preset erzeugt. Du darfst AUSSCHLIESSLICH Text ändern, hinzufügen oder entfernen — niemals Design, Layout, Theme oder die Foliengliederung selbst.',
    `Antworte AUSSCHLIESSLICH mit einem Patch-Block: ${PPTX_PATCH_START} … ${PPTX_PATCH_END}, der NUR die tatsächlich betroffenen Operationen enthält:`,
    PPTX_TEXT_PATCH_OPERATIONS,
    'Folien-Nummern (N) beziehen sich immer auf die ORIGINAL-Nummerierung der aktuellen Präsentation aus dem Kontext.',
    PPTX_TEXT_EDIT_UNSUPPORTED_RULE,
    'Optional 1 kurzer Bestätigungssatz vor dem Patch-Block, danach NICHTS ausserhalb der Marker.',
    'Beispiel:',
    PPTX_TEXT_PATCH_EXAMPLE,
  ].join('\n')
}

export const PPTX_EDIT_CHAT_HINT_TEXT_ONLY = buildPptxTextOnlyEditChatHint()
