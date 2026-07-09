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
    '- Antworte mit **vollständig strukturiertem Text** im Chat: `### 1. Kapitel` für Hauptkapitel, `#### 1.1 Unterkapitel` für Unterkapitel, `---` zwischen Hauptkapiteln, Fliesstext, Stichpunkte, Tabellen.',
    '- **6–12+** Hauptkapitel. Keine `##`-Headings, kein Fliesstext in `**...**` einwickeln, kein JSON, keine Spec-Blöcke.',
    '- **Rhythmus pro Kapitel:** Einleitungssatz + Stichpunkte («- Punkt …») + Tabelle nur wenn tabellarisch sinnvoll.',
    '- `table` (GFM) NUR bei ≥2 Elementen mit ≥2 vergleichbaren Spalten.',
    '- Letzter Satz (natürliche Frage): «Soll ich das als Word-/PDF-Datei für dich exportieren?»',
    '- VERBOTEN: JSON-Blöcke, <<<STRATON_...>>>-Marker, nur Stichpunkte ohne Einleitung.',
  ].join('\n')
}

const OUTLINE_MIXED_LAYOUT_RULES = [
  '**Layout-Mix — professionelles Dokument, nicht nur Stichpunkte (verbindlich):**',
  '- **Fliesstext zuerst:** Jedes Kapitel beginnt mit **2–4 ausformulierten Sätzen** echter Prosa (kein Bullet, kein Doppelpunkt-Label). Stichpunkte sind die Ausnahme für echte Aufzählungen, nicht der Standard.',
  '- **Verboten: ganze Kapitel als Bullet-Wand.** Wenn ein Abschnitt nur aus «- »-Zeilen besteht, in Fliesstext umschreiben oder als Tabelle strukturieren.',
  '- **Echte Aufzählung** (parallele kurze Punkte: Merkmale, Schritte, Beispiele): aufeinanderfolgende Zeilen, **jede beginnt mit «- »** (Bindestrich + Leerzeichen). Diese werden zu einer echten Word-Liste mit Aufzählungszeichen und Einzug. Pro Liste mind. 2 Punkte; lieber 3–6 knappe Punkte als ein langer Bullet.',
  '- **Unterüberschriften als `#### Titel`** (eigene Zeile, **ohne** abschliessenden Doppelpunkt) — NICHT «Kernpunkte:» / «Lichtreaktionen:» als normale Textzeile. Gilt für jede Zwischenüberschrift innerhalb eines Kapitels.',
  '- **Fett** (`**…**`) für Schlüsselbegriffe und Lead-ins («**Definition:** …», «**Wichtig:** …»), sparsam und gezielt.',
  '- `table`: nur wenn ≥2 Elemente mit ≥2 vergleichbaren Spalten vorliegen (Specs, Werte, Vergleiche, Glossar Begriff+Erklärung, Zeitpläne). `header: true`. Tatsächliche tabellarische Daten gehören in eine Tabelle, nicht in Bullets.',
  '- Beispiel: «Vor- und Nachteile von X» → 2-Spalten-`table` (Vorteil | Nachteil) NUR wenn jeder Vorteil einem Nachteil paarweise gegenübersteht; sonst zwei separate Stichpunkt-Listen («**Vorteile**» / «**Nachteile**»).',
  '- Auch Schritt-für-Schritt-Abläufe als «- »-Liste schreiben — **nicht** «1.»/«2.» am Zeilenanfang (das wird als Überschrift interpretiert).',
  '- **Verboten:** `table` mit nur 1 Spalte oder Zeilen mit langem Fliesstext statt kurzen Werten; Doppelpunkt-Labels als Pseudo-Überschriften; jeder einzelne Satz als eigener Bullet.',
].join('\n')

const DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES = [
  '**Summary-Dokument (verbindlich):** Umfang wie ausführliche Instant-Zusammenfassung (8000-Token-Niveau).',
  '- Alle wesentlichen Themen abdecken — nichts Wichtiges weglassen.',
  '- Mindestens 6 Hauptkapitel; **jeweils** Mix aus Fliesstext und Stichpunkten; `table` nur dort, wo der Inhalt tatsächlich tabellarisch ist (siehe Layout-Mix-Regel) — **keine** erzwungenen Tabellen ohne passenden Inhalt.',
  OUTLINE_MIXED_LAYOUT_RULES,
].join('\n')

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
        : action === 'pptx_generate'
          ? 'PowerPoint (.pptx)'
          : 'Excel (.xlsx)'

  if (action === 'pptx_generate') {
    return [
      `Dokument-Export (verbindlich — ${label}):`,
      '- Phase 1 (diese Antwort): HTML-Folien im Chat (siehe PowerPoint-Export-Regeln). **Keine** Behauptung, die Datei sei schon fertig.',
      '- Phase 2: Nutzer klickt «PowerPoint generieren»; die App baut die `.pptx` serverseitig aus dem HTML.',
    ].join('\n')
  }

  if (action === 'pdf_generate' || action === 'word_generate') {
    const lines = [
      `Dokument-Export (verbindlich — ${label}${summaryStyle ? ', Summary-Tiefe' : ''}):`,
      '- Phase 1 (diese Antwort): **vollständig strukturiertes Dokument** im Chat — `### 1. Kapitel` für Hauptkapitel, `#### 1.1 Unterkapitel` für Unterkapitel, `---` zwischen Hauptkapiteln. Kein JSON, keine `##`-Headings, kein Fliesstext in `**...**` einwickeln.',
      '- Phase 2: Nutzer klickt «Word/PDF generieren»; die App baut die Datei aus dem Markdown.',
    ]
    if (summaryStyle) {
      lines.push(
        '- **Summary-Modus:** Ausführliche Kapitel-Zusammenfassung — gleiche Tiefe wie Instant task_type summary (viele Kapitel, Fliesstext, Tabellen).',
      )
    } else {
      lines.push(
        '- **Umfang:** Ausformulierte Absätze, `### N. Kapitel`-Überschriften, Tabellen wo sinnvoll; bei «ausführlich/erweitern/vertiefen» gründlich und vollständig.',
      )
    }
    lines.push(
      '- Letzter Satz (natürliche Frage): «Soll ich das als Word-/PDF-Datei für dich exportieren?»',
      '- **Verboten:** JSON-Blöcke, <<<STRATON_...>>>-Marker, «Die Datei wurde erstellt», Download-Links erfinden, Lernfragen.',
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

const MARKDOWN_DOCUMENT_RULES = [
  'Format (verbindlich — VERBOTEN: `> Blockquote`, Fliesstext in `**...**` einwickeln, kein JSON, keine Marker):',
  'Hier ist eine professionelle Kapitelstruktur für [Thema]:',
  '',
  '---',
  '',
  '### 1. Kapitelname',
  'Einleitender Fliesstext über das Kapitel — 2–4 vollständige Sätze, die den Inhalt erklären (NIE in **...** einwickeln).',
  '',
  '#### Unterüberschrift (ohne Doppelpunkt)',
  'Weiterer Fliesstext, dann bei Bedarf eine echte Aufzählung:',
  '- erster Punkt',
  '- zweiter Punkt',
  '- dritter Punkt',
  '---',
  '### 2. Nächstes Kapitel',
  'Fliesstext … bei vergleichbaren Daten eine Markdown-Tabelle (| Spalte | Spalte |).',
  '---',
  'Regel: Beginne IMMER mit 1 Einleitungssatz + `---` + `### 1. …`. `---` nur nach LETZTEM Inhalt eines Hauptkapitels, NIE zwischen Unterkapiteln. Aufzählungen IMMER als aufeinanderfolgende «- »-Zeilen (werden zu echten Word-Listen).',
].join('\n')

const MARKDOWN_DEPTH_RULES = [
  '**Umfang (verbindlich):** Vollständiger Dokumentinhalt — nicht nur Stichwortgliederung.',
  '- Jedes Hauptkapitel mit beschreibendem Fliesstext; Unterkapitel wo sinnvoll.',
  '- Bei Erweiterung/Vertiefung: neue Abschnitte ergänzen und vorhandenes ausarbeiten.',
  OUTLINE_MIXED_LAYOUT_RULES,
  '- Nichts Wesentliches aus dem Nutzerauftrag oder Anhang weglassen.',
].join('\n')

export function buildWordChatDocumentBodyHint(summaryStyle = false): string {
  const parts = [
    'Word-Export (verbindlich):',
    'Antworte mit vollständigem, schön lesbarem Markdown-Dokument im Chat — der Nutzer sieht den Inhalt zuerst, die .docx-Datei entsteht erst nach Klick auf «Word generieren».',
    MARKDOWN_DOCUMENT_RULES,
    MARKDOWN_DEPTH_RULES,
  ]
  if (summaryStyle) {
    parts.push(DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES)
  } else {
    parts.push(OUTLINE_MIXED_LAYOUT_RULES)
  }
  parts.push(
    'Letzter Satz (verbindlich, natürliche Frage — kein UI-Verweis): «Soll ich das als Word-Datei für dich exportieren?»',
    'VERBOTEN: `##`-Headings, Fliesstext in `**...**` einwickeln, JSON-Blöcke, <<<STRATON_...>>>-Marker, Meta-Anleitungen, Lernfragen, leere Platzhalter-Kapitel.',
  )
  return parts.join('\n')
}

export function buildPdfChatDocumentBodyHint(summaryStyle = false): string {
  const parts = [
    'PDF-Export (verbindlich):',
    'Antworte mit vollständigem, schön lesbarem Markdown-Dokument im Chat — der Nutzer sieht den Inhalt zuerst, die .pdf-Datei entsteht erst nach Klick auf «PDF generieren».',
    MARKDOWN_DOCUMENT_RULES,
    MARKDOWN_DEPTH_RULES,
  ]
  if (summaryStyle) {
    parts.push(DOCUMENT_EXPORT_SUMMARY_OUTLINE_RULES)
  } else {
    parts.push(OUTLINE_MIXED_LAYOUT_RULES)
  }
  parts.push(
    'Letzter Satz (verbindlich, natürliche Frage — kein UI-Verweis): «Soll ich das als PDF-Datei für dich exportieren?»',
    'VERBOTEN: `##`-Headings, Fliesstext in `**...**` einwickeln, JSON-Blöcke, <<<STRATON_...>>>-Marker, Meta-Erklärungen, Lernfragen, reine Überschriften ohne Inhalt.',
  )
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
