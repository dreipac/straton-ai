const FILE_BLOCK_RE = /\[Datei:\s*[^\]]+\][\s\S]*?\[\/Datei\]/gi

const MAX_COVERAGE_TOPICS = 20

function clipTopic(value: string, max = 100): string {
  const t = value.replace(/\s+/g, ' ').trim()
  if (!t) {
    return ''
  }
  return t.length > max ? t.slice(0, max).trim() : t
}

function normalizeTopicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:auftrag|aufgabe)\s*\d+\s*[–—:\-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFileBlocksFromUserMessage(userMessage: string): string[] {
  const blocks: string[] = []
  const re = new RegExp(FILE_BLOCK_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(userMessage)) !== null) {
    const block = match[0]
      .replace(/^\[Datei:\s*[^\]]+\]\s*/i, '')
      .replace(/\s*\[\/Datei\]$/i, '')
      .trim()
    if (block) {
      blocks.push(block)
    }
  }
  return blocks
}

function pushTopic(topics: string[], seen: Set<string>, raw: string): void {
  const topic = clipTopic(raw)
  if (!topic) {
    return
  }
  const key = normalizeTopicKey(topic)
  if (!key || key.length < 4 || seen.has(key)) {
    return
  }
  seen.add(key)
  topics.push(topic)
}

/**
 * Phase B — Heuristik: Themen/Aufträge aus `[Datei:…]`-Text extrahieren.
 */
export function extractCoverageTopicsFromAttachmentText(userMessage: string): string[] {
  const blocks = extractFileBlocksFromUserMessage(userMessage)
  if (blocks.length === 0) {
    return []
  }

  const topics: string[] = []
  const seen = new Set<string>()
  const text = blocks.join('\n\n')

  const auftragRe =
    /\b(?:Auftrag|Aufgabe)\s*(\d+)\s*(?:[–—:\-]\s*|\s+)([^\n]{6,120})/gi
  let m: RegExpExecArray | null
  while ((m = auftragRe.exec(text)) !== null) {
    pushTopic(topics, seen, m[2] ?? '')
    if (topics.length >= MAX_COVERAGE_TOPICS) {
      return topics
    }
  }

  const numberedRe = /^\s*(\d{1,2})\.\s+([^\n]{8,120})/gm
  while ((m = numberedRe.exec(text)) !== null) {
    pushTopic(topics, seen, m[2] ?? '')
    if (topics.length >= MAX_COVERAGE_TOPICS) {
      return topics
    }
  }

  const headingRe = /^#{1,3}\s+(.+)$/gm
  while ((m = headingRe.exec(text)) !== null) {
    const title = (m[1] ?? '').replace(/\*+/g, '').trim()
    if (/^(?:inhalt|lernziel|übersicht|zusammenfassung)$/i.test(title)) {
      continue
    }
    pushTopic(topics, seen, title)
    if (topics.length >= MAX_COVERAGE_TOPICS) {
      return topics
    }
  }

  const kapitelRe = /\bKapitel\s*(\d{1,2})\s*[:\-–—]\s*([^\n]{6,120})/gi
  while ((m = kapitelRe.exec(text)) !== null) {
    pushTopic(topics, seen, m[2] ?? '')
    if (topics.length >= MAX_COVERAGE_TOPICS) {
      return topics
    }
  }

  return topics
}

export function mergeCoverageTopics(aiTopics: string[], heuristicTopics: string[]): string[] {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const raw of [...aiTopics, ...heuristicTopics]) {
    const topic = clipTopic(raw)
    if (!topic) {
      continue
    }
    const key = normalizeTopicKey(topic)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(topic)
    if (merged.length >= MAX_COVERAGE_TOPICS) {
      break
    }
  }

  return merged
}

export function resolveDocumentCoverageTopics(params: {
  userMessage?: string | null
  analyzeTopics?: string[] | null
}): string[] {
  const fromAi = params.analyzeTopics ?? []
  const fromFile = params.userMessage
    ? extractCoverageTopicsFromAttachmentText(params.userMessage)
    : []
  return mergeCoverageTopics(fromAi, fromFile)
}

export function buildDocumentSummaryCoverageBriefing(topics: string[]): string {
  if (topics.length === 0) {
    return ''
  }
  return [
    'Zusammenfassung — Pflicht-Themen (Analyze-Checkliste, verbindlich):',
    'Jedes Thema unten muss in der Antwort **inhaltlich vollständig** ausgearbeitet sein (eigenes Kapitel oder eigene Kachel mit ausgefülltem `body`):',
    ...topics.map((topic, index) => `${index + 1}. ${topic}`),
    '- Kein Thema überspringen; keine leere Kachel nur mit `title`.',
    '- Reihenfolge der Themen wie im Material beibehalten, sofern sinnvoll.',
    '- Formulierungen **kompakt** (kurze Sätze, Stichworte) — inhaltliche Vollständigkeit bleibt Pflicht.',
  ].join('\n')
}

/**
 * Phase A — Ein konsolidiertes Playbook statt mehrfacher überlappender Briefings.
 */
export function buildDocumentSummaryPlaybook(): string {
  return [
    'Dokument-Zusammenfassung — Playbook (verbindlich, Lern-/Prüfungsziel):',
    '',
    'Inhaltliche Lieferung:',
    '- Liefere **Wissen, Fakten und Ergebnisse** aus dem Anhang — nicht beschreiben, **was das Dokument enthält**.',
    '- **VERBOTEN:** «Das Blatt/PDF/Dossier deckt/enthält/thematisiert/listet/beschreibt…», «Im Material geht es um…» ohne inhaltliche Ausarbeitung.',
    '- **VERBOTEN:** Kapitel, die nur **Themen oder Aufgabennummern** aufzählen (z. B. «Aufgaben 1–6 zu Steuern») ohne konkrete Lösung.',
    '- Schul-Material / Arbeitsblatt: **integriertes Lernskript** — alle Themen, Fragen und Übungen **inhaltlich ausgearbeitet**.',
    '- **Inhalt ja, Form nein:** Fragen beantworten, Lücken füllen, Rechenwege liefern — **ohne** «Aufgabe:», «Lösung:», «Musterlösung», «Aufgabenstellung:».',
    '- Kapitelüberschriften thematisch: `## Kindesverhältnis (ZGB)` — **nicht** `## Aufgabe 15` / `## Auftrag 5`.',
    '- Mathe: Rechenweg bis Ergebnis; offene Fragen: ausformulierte Antwort — nicht «der Schüler soll…».',
    '- Reiner Lesetext: Konzepte in **eigenen Worten** ausarbeiten — kein Inhaltsverzeichnis.',
    '',
    'Dichte — kompakt (alle Themen, wenig Fliesstext):',
    '- **Vollständigkeit ja, Wortzahl nein:** Jedes Pflicht-Thema abdecken — aber **knapp** formulieren wie Lernkarten, nicht wie Essay.',
    '- Pro Kachel `body`: **max. 2 kurze Sätze** ODER **2–4 eigene Zeilen** (je Zeile max. 12 Wörter) — **jeder Punkt = neue Zeile** im `body`-Feld, z. B. `**Ziel:** …` dann Zeilenumbruch `**Funktion:** …`.',
    '- **VERBOTEN:** mehrere Punkte in **einer** Zeile mit `·`, `;` oder `/` verketten — das wirkt kaputt in der UI.',
    '- **VERBOTEN:** Absätze >40 Wörter, Schachtelsätze, Wiederholungen, «im Wesentlichen geht es darum…».',
    '- **3+ Fakten** zum gleichen Thema → ```divided-list``` statt einem langen `body`-Absatz.',
    '- Kapitel-Einleitung: **max. 1 Halbsatz** (z. B. «Kurz: Steuerpflicht bei Kantonwechsel.») — kein zweiter Erklärabsatz.',
    '',
    'Visuelles Format (kompakt + farbig):',
    '- Beginne mit `## Zusammenfassung: [Thema]` + «Diese Zusammenfassung basiert auf deinem Dokument.»',
    '- Hauptteile: `## 1. …`, `## 2. …` — danach sofort Kacheln/Listen/Callouts.',
    '- Zwischen **jedem** Hauptthema eine eigene Zeile `---`.',
    '- **Jedes Thema** → ```cards``` mit `tone` (Farbe) und optional `badges` (Schlagwörter):',
    '  ```cards',
    '  tone: blue',
    '  label: Steuerrecht',
    '  title: Wegzug innerhalb der Schweiz',
    '  body: Wohnsitz am 31.12. bestimmt Kanton',
    '  Quellensteuer endet mit Abmeldung',
    '  badges: teal: Kantonwechsel | orange: Frist',
    '  ---',
    '  tone: green',
    '  label: Praxis',
    '  title: Was du beachten musst',
    '  body: Meldung beim neuen Kanton. Alte Steuerrechnung noch offen? → Zahlungsfrist prüfen.',
    '  badges: green: Checkliste',
    '  ```',
    '- `tone:` blue | teal | green | orange | purple | indigo — **abwechseln** pro Kachel.',
    '- `badges:` 1–3 kurze Tags mit Farbe (`blue: … | green: …`) — z. B. Frist, Gesetz, Praxis, Rechenweg.',
    '- `label:` kurz und als Kategorie (Steuerrecht, Praxis, Definition, Lösung) — UI rendert farbig.',
    '- In `body:` **niemals** «Aufgabe:»/«Lösung:» — nur kompakter Inhalt.',
    '- Lückentext → eine Kachel, body = ausgefüllter Text in **einem** Satz wenn möglich.',
    '- **3+ parallele Typen/Arten** → je Typ eine Kachel mit eigenem `tone`.',
    '- Glossar → Tabelle; Merksatz → `> !` / Tipp → `> ?` / Warnung → `> !!` (je **1** kurzer Satz).',
    '',
    'Qualitätsregeln (harte Prüfung):',
    '- Jede Kachel: `body` **ausgefüllt und kompakt** — nie nur `title`; nie leer; nie Riesenabsatz.',
    '- **VERBOTEN:** «nachschlagen», «in Statistiken», «typischerweise» ohne konkreten Inhalt aus dem Material.',
    '- **VERBOTEN:** unvollständige Abschnitte (Frage ohne Antwort, Lückentext ohne Ende, Callout mitten im Wort).',
    '- Zahlen, Beispiele und Begriffe aus dem Anhang **übernehmen** — nichts erfinden.',
    '- Kein leeres Kapitel am Ende; kein `### Verbesserungen`, keine Schluss-Anpassungsfrage.',
    '- `## Annahmen` (falls nötig): höchstens 1–3 Sätze — kein Kapitelverzeichnis.',
  ].join('\n')
}
