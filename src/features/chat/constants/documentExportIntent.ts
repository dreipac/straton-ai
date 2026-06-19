import type { InstantAnalyzeDocumentAction } from './instantAnalyzeRoute'
import { EXCEL_EXPORT_INSTRUCTION } from './excelExportPrompt'
import type { InstantAnalyzeResult } from './instantAnalyze'
import {
  buildDocumentSummaryPlaybook,
  userMessageWantsDocumentSummary,
} from './documentAttachmentIntent'

/** PDF/Word-Export mit Summary-Tiefe (ausführlich, zusammenfassend, …). */
const DOCUMENT_EXPORT_SUMMARY_RE =
  /\b((?:ausführlich(?:e|es|er)?|zusammenfassend(?:e|es|er)?)\s+(?:pdf|word|docx|dokument)|(?:pdf|word|docx|dokument).{0,48}(?:ausführlich|zusammenfass)|zusammenfassend(?:e|es|er)?\s+(?:pdf|word|docx))\b/i

export function userWantsSummaryDocumentExport(
  text: string,
  hasDocumentFileAttachment = false,
): boolean {
  const t = text.trim()
  if (!t) {
    return false
  }
  if (DOCUMENT_EXPORT_SUMMARY_RE.test(t)) {
    return true
  }
  return userMessageWantsDocumentSummary(t, hasDocumentFileAttachment)
}

export function isSummaryStyleDocumentExport(
  analyze?: Pick<InstantAnalyzeResult, 'category' | 'action' | 'task_type'> | null,
  userMessage?: string,
): boolean {
  if (!analyze || analyze.category !== 'document') {
    return false
  }
  if (analyze.action !== 'pdf_generate' && analyze.action !== 'word_generate') {
    return false
  }
  if (analyze.task_type === 'summary') {
    return true
  }
  const trimmed = (userMessage ?? '').trim()
  return trimmed.length > 0 && userWantsSummaryDocumentExport(trimmed)
}

export function buildDocumentExportSummaryTurnBriefing(): string {
  return [
    buildDocumentSummaryPlaybook(),
    '',
    'Dokument-Export + Zusammenfassung (verbindlich — gleicher Mix wie Chat-Summary):',
    '- Der JSON-Inhalt entspricht der **Chat-Zusammenfassung** (Stoff + gelöste Aufgaben, Fliesstext + Stichpunkte + Tabellen) — nur als `blocks` statt Markdown.',
    '- `title`: z. B. «Zusammenfassung: [Thema]» oder «[Thema]: Ein umfassender Leitfaden».',
    '- **6–12+** Hauptkapitel als `heading` (level 1–2).',
    '- **Rhythmus pro Kapitel (Pflicht — nicht nur ein langer paragraph):**',
    '  1) `paragraph`: 1–2 Einleitungssätze (Fliesstext).',
    '  2) `paragraph`(e): Stichpunkte — **je Punkt ein eigener** `paragraph`-Block mit «• …» am Anfang (kurze parallele Aussagen ohne mehrere Spalten).',
    '  3) `table` NUR wenn der Inhalt wirklich tabellarisch ist: ≥2 Elemente mit ≥2 vergleichbaren Spalten (Vergleiche, Glossar Begriff+Erklärung, Übersichten). Kein 1-Spalten-`table`, keine Zellen mit langem Fliesstext.',
    '- `table`-Anzahl ergibt sich aus dem Inhalt — **keine** erzwungene Mindestzahl; ein Thema ohne echten tabellarischen Inhalt bleibt bei Fliesstext + Stichpunkten.',
    '- VERBOTEN: Jedes Kapitel nur aus **einem** langen Fliesstext-`paragraph` ohne Stichpunkte/Tabelle.',
    '- **Kein** Chat-Markdown statt JSON — der maschinenlesbare JSON-Block ist Pflicht.',
  ].join('\n')
}

const OUTLINE_MIXED_LAYOUT_RULES = [
  '**Layout-Mix — Entscheidung pro Abschnitt nach Inhalt, nicht pauschal (verbindlich):**',
  '- Nicht nur Fliesstext-Wände: pro Hauptkapitel Einleitungs-`paragraph` + passendes Layout für den Rest (Stichpunkte und/oder `table`, je nach Inhalt).',
  '- `table`: nur wenn ≥2 Elemente mit ≥2 vergleichbaren Spalten vorliegen (Specs, Preisstufen, Vergleiche, Glossar Begriff+Erklärung, Zeitpläne). `header: true`.',
  '- Stichpunkte (parallele kurze Aussagen OHNE mehrere Spalten, z. B. Vorteile, Kernpunkte, Merkmale): je Bullet **eigener** `paragraph`-Block («• Kernpunkt …») — dafür **kein** `table`.',
  '- Beispiel: «Vor- und Nachteile von X» → 2-Spalten-`table` (Vorteil | Nachteil) NUR wenn jeder Vorteil einem Nachteil paarweise gegenübersteht; sonst zwei separate Stichpunkt-Abschnitte («Vorteile» / «Nachteile»).',
  '- **Verboten:** `table` mit nur 1 Spalte oder Zeilen mit langem Fliesstext statt kurzen Werten — das ist eine Liste/ein Absatz, keine Tabelle.',
  '- Unterkapitel: `heading` level 2–3 zwischen Fliesstext und Listen.',
].join('\n')

const DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES = [
  '**Summary-Dokument (verbindlich):** Umfang wie ausführliche Instant-Zusammenfassung (8000-Token-Niveau).',
  '- Alle wesentlichen Themen abdecken — nichts Wichtiges weglassen.',
  '- Mindestens 6 Hauptkapitel; **jeweils** Mix aus Fliesstext und Stichpunkten; `table` nur dort, wo der Inhalt tatsächlich tabellarisch ist (siehe Layout-Mix-Regel) — **keine** erzwungenen Tabellen ohne passenden Inhalt.',
  OUTLINE_MIXED_LAYOUT_RULES,
].join('\n')

/** Intent-Routing: eigene Sektion «Dokumente generieren» (category document). */
export function buildInstantAnalyzeDocumentGenerateSection(): string {
  return [
    'Dokumente generieren (category "document" — nur bei explizitem Export-Wunsch):',
    '- Trennung Lesen vs. Erzeugen:',
    '  - `[Datei:…]`-Anhang + «siehst du den Inhalt?», «kannst du lesen?» → category **chat**, action **answer**, task_type **explanation**, explanation_depth **brief** (nur Sichtbarkeit — **kein** summary).',
    '  - `[Datei:…]`-Anhang + «fasse zusammen», «was steht drin», «analysiere» **ohne** «erstelle/exportiere Word/PDF/Excel» → category **chat**, action **answer**.',
    '  - «Word/Docx erstellen», «als Word», /Word → document.**word_generate**.',
    '  - «PDF erstellen», «als PDF», /PDF → document.**pdf_generate**.',
    '  - «Excel/XLSX», «Tabelle exportieren», /Excel → document.**excel_generate**.',
    '- **Summary-PDF/Word:** «ausführliches/zusammenfassendes PDF», «PDF zusammenfassen», «Word mit Zusammenfassung» → document.* **und** task_type **summary**.',
    '- Bei document.*: reply_mode **normal**, needs_live_web **false**, clarity **clear**.',
    '- escalate_model **false** bei einzelnem Export oder Zusammenfassung — nur true bei Multi-Dokument-Vergleich oder komplexem Sheet-Merge.',
    '',
    'Nachgelagerte App: KI liefert Outline-JSON (voller Dokumentinhalt) im Chat; Nutzer klickt «generieren» → Server (.docx / .pdf / .xlsx).',
  ].join('\n')
}

export function buildInstantAnalyzeDocumentExportBriefing(
  action: InstantAnalyzeDocumentAction,
  options?: { summaryStyle?: boolean },
): string {
  const summaryStyle = options?.summaryStyle === true
  const label =
    action === 'word_generate'
      ? 'Word (.docx)'
      : action === 'pdf_generate'
        ? 'PDF'
        : 'Excel (.xlsx)'

  if (action === 'pdf_generate' || action === 'word_generate') {
    const lines = [
      `Dokument-Export (verbindlich — ${label}${summaryStyle ? ', Summary-Tiefe' : ''}):`,
      '- Phase 1 (diese Antwort): **Outline-JSON** im Chat — das ist der **vollständige Dokumentinhalt** für die spätere Datei, nicht nur Stichworte.',
      '- Phase 2: Nutzer klickt «Word/PDF generieren»; die App baut die Datei **1:1** aus dem JSON — alles Wesentliche muss schon im JSON stehen.',
    ]
    if (summaryStyle) {
      lines.push(
        '- **Summary-Modus:** Ausführliche Kapitel-Zusammenfassung im JSON — gleiche Tiefe wie Instant task_type summary (viele Kapitel, Fliesstext, Tabellen).',
      )
    } else {
      lines.push(
        '- **Umfang:** Ausformulierte Absätze, nummerierte Kapitel, Tabellen wo sinnvoll; bei «ausführlich/erweitern/vertiefen» gründlich und vollständig.',
      )
    }
    lines.push(
      '- Optional 1 kurzer Einleitungssatz vor dem JSON-Block; der **Hauptteil** ist das JSON mit echtem Fliesstext in `paragraph`-Blöcken.',
      '- **Verboten:** «Die Datei wurde erstellt», Download-Links erfinden, Lernfragen/Quiz, reine Meta-Gliederung ohne Inhalt.',
    )
    return lines.join('\n')
  }

  return [
    `Dokument-Export (verbindlich — ${label}):`,
    '- Phase 1 (diese Antwort): maschinenlesbares Spec-JSON im Chat. **Keine** Behauptung, die Datei sei schon fertig.',
    '- Phase 2: Nutzer bestätigt in der UI («Excel generieren»); die App erzeugt die Datei serverseitig aus dem JSON.',
    '- Kurzer Einleitungssatz (optional), dann der JSON-Block — **keine** Lernfragen oder Quiz.',
    '- **Verboten:** «Die Datei wurde erstellt», Download-Links erfinden, Lernfragen zum Anhang.',
  ].join('\n')
}

export const WORD_SPEC_JSON_START = '<<<STRATON_WORD_SPEC_JSON>>>'
export const WORD_SPEC_JSON_END = '<<<END_STRATON_WORD_SPEC_JSON>>>'

export const PDF_SPEC_JSON_START = '<<<STRATON_PDF_SPEC_JSON>>>'
export const PDF_SPEC_JSON_END = '<<<END_STRATON_PDF_SPEC_JSON>>>'

const OUTLINE_JSON_RULES = [
  'Pflicht: gültiges Outline-JSON (`version`: 1, `blocks`: heading mit `level` 1–6, paragraph, table).',
  'Form: ```json … ``` (ein Block) oder Marker <<<STRATON_WORD_SPEC_JSON>>> / <<<STRATON_PDF_SPEC_JSON>>> … <<<END_…>>>.',
  'Optional `fileName`, `title`. Tabellen: `{"type":"table","header":true,"rows":[["A","B"]]}`.',
  'Markdown ####/##### nur als Fallback — JSON hat Vorrang.',
  'Blocktypen: `heading` = Kapitelüberschrift; `paragraph` = Fliesstext **oder** ein Stichpunkt (je Bullet ein Block); `table` = Tabellen/Glossare.',
].join('\n')

const OUTLINE_JSON_DEPTH_RULES = [
  '**Umfang (verbindlich):** Der JSON-Inhalt ist das fertige Dokument — nicht nur Gliederung.',
  '- Mehrere `heading`-Kapitel (level 1–3) mit **gemischtem** Layout (Fliesstext + Stichpunkte + Tabellen).',
  '- Bei Erweiterung/Vertiefung: neue Abschnitte ergänzen und vorhandenes ausarbeiten.',
  OUTLINE_MIXED_LAYOUT_RULES,
  '- Nichts Wesentliches aus dem Nutzerauftrag oder Anhang weglassen.',
].join('\n')

export function buildWordChatDocumentBodyHint(summaryStyle = false): string {
  const parts = [
    'Word-Export (verbindlich):',
    'Der Nutzer will eine .docx. Du lieferst **Outline-JSON** mit **vollem Dokumentinhalt** — die Datei entsteht erst nach «Word generieren».',
    OUTLINE_JSON_RULES,
    OUTLINE_JSON_DEPTH_RULES,
  ]
  if (summaryStyle) {
    parts.push(DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES)
  } else {
    parts.push(OUTLINE_MIXED_LAYOUT_RULES)
  }
  parts.push('VERBOTEN: Meta-Anleitungen («In diesem Kapitel…»), Lernfragen, Quiz, leere Platzhalter-Kapitel.')
  return parts.join('\n')
}

export function buildPdfChatDocumentBodyHint(summaryStyle = false): string {
  const parts = [
    'PDF-Export (verbindlich):',
    'Der Nutzer will eine PDF. Du lieferst **Outline-JSON** (gleiches Schema wie Word) mit **vollem Dokumentinhalt** — Erzeugung erst nach «PDF generieren».',
    OUTLINE_JSON_RULES,
    OUTLINE_JSON_DEPTH_RULES,
  ]
  if (summaryStyle) {
    parts.push(DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES)
  } else {
    parts.push(OUTLINE_MIXED_LAYOUT_RULES)
  }
  parts.push('VERBOTEN: Meta-Erklärungen («Hier ist die Struktur…»), Lernfragen, reine Überschriften ohne Fliesstext.')
  return parts.join('\n')
}

/** @deprecated Nutze {@link buildWordChatDocumentBodyHint} */
export const WORD_CHAT_DOCUMENT_JSON_HINT = buildWordChatDocumentBodyHint(false)

/** @deprecated Nutze {@link buildPdfChatDocumentBodyHint} */
export const PDF_CHAT_DOCUMENT_JSON_HINT = buildPdfChatDocumentBodyHint(false)

export const EXCEL_CHAT_DOCUMENT_JSON_HINT = [
  'Excel-Export — Vorschau-Modus (verbindlich):',
  'Der Nutzer will eine .xlsx. Du lieferst **Excel-Spec-JSON** — die Datei entsteht erst nach «Excel generieren».',
  '- Kurzer Einleitungssatz (optional), dann der maschinenlesbare Block (Marker <<<STRATON_EXCEL_SPEC_JSON>>>).',
  EXCEL_EXPORT_INSTRUCTION,
].join('\n\n')
