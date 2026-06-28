/**
 * Feste Word-Formatierung (ein einziges Design, kein Theme-Picker) — **gemeinsame Quelle**
 * für die Chat-Vorschau (CSS, `buildWordPageSrcDoc`) und den Python-Renderer (`app.py`,
 * `build_document`, gespiegelte Konstanten). Bei einer Änderung hier müssen die Python-Werte
 * mitgezogen werden (wie bei `PPTX_PRESET_SPECS` ↔ `PRESET_SPECS`).
 *
 * Vorgabe: Arial überall, Überschrift 1 fett dunkelblau (gross), Überschrift 2 fett dunkelblau
 * (kleiner), Fliesstext 11 pt schwarz. Seite A4 Hochformat.
 */

/** A4 @96dpi (210×297 mm). Native Pixelmasse der Seite — Karte/Modal skalieren wie bei den Folien. */
export const WORD_PAGE_NATIVE_WIDTH = 794
export const WORD_PAGE_NATIVE_HEIGHT = 1123

/** pt → px @96dpi (px = pt · 96/72). Word/LibreOffice rechnen in pt; die Vorschau spiegelt das in px. */
export function ptToPx(pt: number): number {
  return (pt * 96) / 72
}

/** Dunkelblau für Überschrift 1 **und** 2 (identisch, wie gefordert). */
export const WORD_HEADING_COLOR = '#1F4E79'
export const WORD_BODY_COLOR = '#000000'
export const WORD_FONT_FAMILY = 'Arial, sans-serif'
/** Schriftname für python-docx (ohne CSS-Fallback). */
export const WORD_FONT_NAME = 'Arial'

/**
 * Kanonische Masse in **pt** — Single Source of Truth. Vorschau-CSS und python-docx lesen dieselben Werte
 * (Python als gespiegelte Konstanten), damit die Seitenumbrüche der Vorschau dem .docx möglichst nahekommen.
 */
export const WORD_DOC_SPEC = {
  /** Seitenrand rundum in pt (1 Zoll = 72 pt = Word-Standard). */
  marginPt: 72,
  body: { sizePt: 11, lineHeight: 1.15, spaceAfterPt: 8 },
  h1: { sizePt: 16, spaceBeforePt: 16, spaceAfterPt: 4 },
  h2: { sizePt: 13, spaceBeforePt: 10, spaceAfterPt: 2 },
  /** Ebene ≥3: wie Fliesstext, aber fett (Spec definiert nur H1/H2). */
  h3: { sizePt: 11.5, spaceBeforePt: 8, spaceAfterPt: 2 },
  /** Listen: Einzug (hängend) + enger Abstand zwischen den Punkten (nicht der volle Absatz-Abstand). */
  list: { indentPt: 18, itemGapPt: 2, spaceAfterPt: 8 },
  table: { sizePt: 11, cellPadPt: 4 },
} as const

/** Nutzbare Texthöhe einer Seite in px (für die Pagination). */
export const WORD_CONTENT_HEIGHT_PX = WORD_PAGE_NATIVE_HEIGHT - 2 * ptToPx(WORD_DOC_SPEC.marginPt)
/** Nutzbare Textbreite einer Seite in px. */
export const WORD_CONTENT_WIDTH_PX = WORD_PAGE_NATIVE_WIDTH - 2 * ptToPx(WORD_DOC_SPEC.marginPt)

/**
 * Block-Regeln (Überschriften/Fliesstext/Tabellen) unter einem Selektor-Präfix. Wird von der
 * Seiten-CSS (`prefix=''`, bare `h1`/`p`/…) **und** der Mess-CSS der Pagination (`prefix='.wm '`)
 * genutzt → identische Metrik, keine Drift zwischen Vorschau und Umbruch-Berechnung.
 */
function wordBlockRules(prefix: string): string {
  const s = WORD_DOC_SPEC
  return [
    `${prefix}h1{font-family:${WORD_FONT_FAMILY};font-weight:700;color:${WORD_HEADING_COLOR};`,
    `font-size:${ptToPx(s.h1.sizePt)}px;line-height:1.2;`,
    `margin:${ptToPx(s.h1.spaceBeforePt)}px 0 ${ptToPx(s.h1.spaceAfterPt)}px;}`,
    `${prefix}h2{font-family:${WORD_FONT_FAMILY};font-weight:700;color:${WORD_HEADING_COLOR};`,
    `font-size:${ptToPx(s.h2.sizePt)}px;line-height:1.2;`,
    `margin:${ptToPx(s.h2.spaceBeforePt)}px 0 ${ptToPx(s.h2.spaceAfterPt)}px;}`,
    `${prefix}h3{font-family:${WORD_FONT_FAMILY};font-weight:700;color:${WORD_BODY_COLOR};`,
    `font-size:${ptToPx(s.h3.sizePt)}px;line-height:1.2;`,
    `margin:${ptToPx(s.h3.spaceBeforePt)}px 0 ${ptToPx(s.h3.spaceAfterPt)}px;}`,
    `${prefix}p{margin:0 0 ${ptToPx(s.body.spaceAfterPt)}px;white-space:pre-wrap;overflow-wrap:break-word;}`,
    // Listen: hängender Einzug, Aufzählungszeichen/Nummer aussen, enger Abstand zwischen den Punkten
    `${prefix}ul,${prefix}ol{margin:0 0 ${ptToPx(s.list.spaceAfterPt)}px;padding-left:${ptToPx(s.list.indentPt)}px;}`,
    `${prefix}li{margin:0 0 ${ptToPx(s.list.itemGapPt)}px;padding-left:4px;overflow-wrap:break-word;}`,
    `${prefix}li:last-child{margin-bottom:0;}`,
    `${prefix}ul{list-style:disc;}`,
    `${prefix}ol{list-style:decimal;}`,
    `${prefix}table{width:100%;border-collapse:collapse;margin:0 0 ${ptToPx(s.body.spaceAfterPt)}px;`,
    `font-size:${ptToPx(s.table.sizePt)}px;}`,
    `${prefix}th,${prefix}td{border:1px solid #888;padding:${ptToPx(s.table.cellPadPt)}px ${ptToPx(s.table.cellPadPt + 2)}px;`,
    'text-align:left;vertical-align:top;overflow-wrap:break-word;}',
    `${prefix}th{font-weight:700;background:#f1f4f8;}`,
    `${prefix}strong{font-weight:700;}`,
  ].join('')
}

/**
 * CSS für das Seiten-`srcDoc`. Eine Seite = 794×1123 px mit Rand als Padding; der Inhalt fliesst
 * im nutzbaren Bereich. Gleiche Schrift-/Abstandsmetrik wie {@link WORD_DOC_SPEC}.
 */
export function buildWordPageCss(): string {
  const s = WORD_DOC_SPEC
  return [
    '*{margin:0;padding:0;box-sizing:border-box;}',
    `html,body{width:${WORD_PAGE_NATIVE_WIDTH}px;height:${WORD_PAGE_NATIVE_HEIGHT}px;}`,
    `body{background:#ffffff;font-family:${WORD_FONT_FAMILY};color:${WORD_BODY_COLOR};`,
    `font-size:${ptToPx(s.body.sizePt)}px;line-height:${s.body.lineHeight};`,
    `padding:${ptToPx(s.marginPt)}px;overflow:hidden;-webkit-font-smoothing:antialiased;}`,
    // erste Überschrift/erster Absatz ohne oberen Abstand (Seitenanfang)
    'body>*:first-child{margin-top:0;}',
    wordBlockRules(''),
  ].join('')
}

/**
 * CSS für den unsichtbaren Mess-Host der Pagination. `scope` = Klassen-Selektor des Hosts
 * (z. B. `.wm`); Breite = nutzbare Textbreite, Höhe frei, gleiche Metrik wie die Seite.
 */
export function buildWordMeasureCss(scope: string): string {
  const s = WORD_DOC_SPEC
  return [
    `${scope}{position:absolute;left:-99999px;top:0;visibility:hidden;`,
    `width:${WORD_CONTENT_WIDTH_PX}px;background:#fff;font-family:${WORD_FONT_FAMILY};`,
    `color:${WORD_BODY_COLOR};font-size:${ptToPx(s.body.sizePt)}px;line-height:${s.body.lineHeight};}`,
    `${scope}>*:first-child{margin-top:0;}`,
    wordBlockRules(`${scope} `),
  ].join('')
}
