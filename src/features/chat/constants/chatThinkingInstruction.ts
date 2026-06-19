import type { ThinkingTaskType } from './thinkingAnalyze'
import { getSecretSafetyInstruction } from './chatSecretSafety'
import { shouldSuppressThinkingMandatoryFollowUp } from './thinkingTaskRouting'

/** Systemblock nur im Hauptchat, wenn Thinking aktiv (Gemini 3.1 Flash Lite, kein Profil-Speicher). */
export function getChatThinkingWorkflowInstruction(): string {
  return [
    getSecretSafetyInstruction(),
    'Thinking-Modus (Gemini: Analyze immer Standard; Draft/Review/Final nach output_tier Standard vs. Rich):',
    'Persönlicher Kontext kommt aus Profil und Einführung — in Thinking nur den sichtbaren Chatverlauf dieser Unterhaltung nutzen.',
    '',
    'Ablauf (verbindlich):',
    '0) Aufgabenanalyse liegt unter «Thinking — Aufgabenanalyse» (Gemini 3.1 Flash Lite).',
    '1) Klärung nur bei needs_clarification im Analyse-Kontext — selten, max. eine Rückfrage als Clarify-Block.',
    '2) Interner Entwurf + Qualitätsprüfung liegen unter «Thinking — Interner Entwurf» / «Qualitätsprüfung» (Gemini nach output_tier).',
    '3) Diese sichtbare Antwort: finale Bearbeitung mit demselben output_tier (Rich: Zusammenfassungen mit ```cards```).',
    'Kurze Folgenachrichten: direkt weiterbearbeiten, nicht erneut interviewen.',
    'Gesprächsverlauf — Fortsetzung der eigenen letzten Antwort (verbindlich): «Und jetzt?», «nochmal», «mehr», «warum?», «wieso», «und dann?» usw. beziehen sich auf **deine eigene letzte sichtbare Antwort** in diesem Thread — nicht auf ein neues, unklares Thema. Lies den bisherigen Verlauf und baue inhaltlich darauf auf, statt allgemein nachzufragen.',
    '',
    'Wahrheit sowie Comfort/Strict gelten unverändert (Ton).',
    '',
    'Clarify-Block — exakt dieses Muster (Zeilen getrennt):',
    '<<<STRATON_THINKING_CLARIFY>>>',
    '{"prompt":"Frage","options":[{"id":"a","label":"…"}],"round":1,"rounds_total":3,"dimension_id":"hosting","dimension_label":"Hosting","intake_summary":"Kurz was du verstanden hast"}',
    '<<<END_STRATON_THINKING_CLARIFY>>>',
    '',
    'Regeln zum JSON:',
    '- prompt: eine klare Frage zur aktuellen dimension_id (ein Satz).',
    '- options: 2 bis 5 Objekte mit id und label; keine Option „Eigene Antwort“ (die App ergänzt sie).',
    '- round / rounds_total: Fortschritt der Klärung (aus Kontext).',
    '- dimension_id / dimension_label: welche Info du gerade sammelst.',
    '- intake_summary: optional 1 Satz Zusammenfassung für den Nutzer.',
    '- JSON gültig; pro Nachricht nur EIN Clarify-Block.',
  ].join('\n')
}

/** Phase 1 — diese Antwort darf nur die kurze Rückfrage sein. */
export function getChatThinkingMandatoryClarifyTurnInstruction(): string {
  return [
    'Thinking — Phase 1 (diese Antwort — Klärung):',
    'PFLICHT: NUR Klärung — kein ##-Kapitel, keine Schritt-für-Schritt-Anleitung, keine Befehlsfolge.',
    'Wähle die wichtigste noch offene Dimension aus dem Analyse-Kontext.',
    'Optional EIN kurzer Satz, danach AUSSCHLIESSLICH den Clarify-Block mit JSON (inkl. dimension_id, round, rounds_total).',
    'Keine Markdown-Listen mit mehreren Fragen gleichzeitig.',
  ].join('\n')
}

/** Finale sichtbare Antwort (nach Entwurf/Review); task_type steuert Zusatzstruktur. */
export function getChatThinkingFinalAnswerTurnInstruction(
  taskType?: ThinkingTaskType,
  opts?: { suppressMandatoryFollowUp?: boolean; openAiFinal?: boolean },
): string {
  const suppressFollowUp =
    opts?.suppressMandatoryFollowUp === true ||
    shouldSuppressThinkingMandatoryFollowUp(taskType ? { task_type: taskType } : null)
  const openAiFinal = opts?.openAiFinal === true

  const header =
    openAiFinal && taskType === 'document_summary'
      ? 'Thinking — Finale Antwort (gpt-5-mini, Zusammenfassung — sichtbar für den Nutzer):'
      : openAiFinal
        ? 'Thinking — Finale Antwort (gpt-5-mini, kurz — sichtbar für den Nutzer):'
        : 'Thinking — Finale Antwort (Gemini Flash Lite — sichtbar für den Nutzer):'

  const blocks = [
    header,
    'Nutze den internen Entwurf und die Qualitätsprüfung: Lücken schließen, Form und Tiefe verbessern.',
    'KEIN Clarify-Block.',
    openAiFinal && taskType === 'document_summary'
      ? 'NICHT die Kürze des Instant-Modus — vollständige Kapitel-Zusammenfassung.'
      : openAiFinal
        ? 'Kurz und präzise — keine ausführliche Essay-Struktur.'
        : 'NICHT die Kürze des Instant-Modus.',
    openAiFinal && taskType === 'document_summary'
      ? 'Struktur: `## Zusammenfassung` + nummerierte Kapitel; max. 1 Einleitungssatz pro Kapitel, Rest als Kacheln/Listen/Callouts (siehe Playbook).'
      : 'Struktur: nummerierte ##-Kapitel, zwischen Kapiteln `---`, pro Kapitel zuerst 1–2 Sätze Fließtext, dann optional Stichpunkte/Tabellen.',
    'Glossare/Begriffe nur als Tabelle; bei Dokumenten alles Wesentliche aus dem Material.',
    '## Annahmen am Anfang (1–3 Sätze), dann vollständig liefern.',
    getChatThinkingGenericDeliverableInstruction(),
  ]
  if (!suppressFollowUp) {
    blocks.push(getChatThinkingMandatoryFollowUpInstruction())
  }
  if (taskType === 'server_setup' || taskType === 'software_setup') {
    blocks.push(getChatThinkingSetupGuideInstruction())
  } else if (taskType === 'troubleshooting') {
    blocks.push(getChatThinkingTroubleshootingGuideInstruction())
  } else if (taskType === 'decision_planning') {
    blocks.push(getChatThinkingDecisionGuideInstruction())
  } else if (taskType === 'document_summary') {
    blocks.push(getChatThinkingDocumentSummaryInstruction())
  }
  return blocks.join('\n\n')
}

/** Schluss wie Instant: Verbesserungen + eine konkrete Anpassungsfrage. */
export function getChatThinkingMandatoryFollowUpInstruction(): string {
  return [
    'Thinking — Schluss (nach der Hauptlösung):',
    '- Optional `### Verbesserungen`: 1–4 kurze Punkte, was an deiner Antwort noch schärfer wäre.',
    '- Danach **eine** gezielte Anpassungsfrage mit 2–3 konkreten Stellschrauben (nicht «Was möchtest du?»).',
    '- Bei sehr kurzen Mini-Antworten: Schlussblock weglassen.',
    '- **Verboten:** Schluss **vor** der vollständigen Hauptlösung; **verboten:** Interview vor der Lieferung.',
  ].join('\n')
}

export function getChatThinkingGenericDeliverableInstruction(): string {
  return [
    'Thinking — Allgemeine Qualität (jeder task_type):',
    '- Antwort muss zur geklärten Nutzerabsicht passen — nicht ein generisches Server-Tutorial.',
    '- Schrittfolge nur wenn es eine How-to-/Setup-/Prozess-Aufgabe ist.',
    '- Bei Entscheidungen: Optionen vergleichen, Empfehlung mit Begründung.',
    '- Bei Zusammenfassungen: **Inhalt** des Anhangs in eigenen Worten — Stoff ausarbeiten; bei Übungen **Aufgaben lösen**, keine Meta-Liste der Kapitel.',
  ].join('\n')
}

/** Inhaltliche Dokument-Zusammenfassung (nicht «was das PDF enthält»). */
export function getChatThinkingDocumentSummaryInstruction(): string {
  return [
    'Thinking — document_summary (Pflicht bei [Datei:…]-Anhang / Zusammenfassungswunsch):',
    'Lies den vollständigen [Datei:…]…[/Datei]-Block in der Nutzernachricht.',
    'Playbook und Pflicht-Themen stehen im Layout-Profil / Analyze-Checkliste — hier nicht wiederholen.',
    '- Das Analyse-JSON (assumptions/risks) **nicht** als Inhaltsverzeichnis wiedergeben.',
    '- Jedes Pflicht-Thema aus der Checkliste muss inhaltlich vollständig in Kacheln oder Kapiteln erscheinen.',
  ].join('\n')
}

/** Zusatzstruktur für Server-/Software-Setup in Phase 2. */
export function getChatThinkingSetupGuideInstruction(): string {
  return [
    'Thinking — Setup-Anleitungen (server_setup / software_setup):',
    '1) ## Voraussetzungen & Annahmen',
    '2) ## Überblick (Architektur oder Ablauf in einem Satz)',
    '3) ## Schritt für Schritt — je Schritt: Aktion, erwartetes Ergebnis, typischer Fehler',
    '4) ## Prüfen & Testen',
    '5) ## Typische Fehler & Behebung',
    '6) ## Kurz-Checkliste',
  ].join('\n')
}

export function getChatThinkingTroubleshootingGuideInstruction(): string {
  return [
    'Thinking — Fehlerdiagnose (troubleshooting):',
    '1) ## Symptom & wahrscheinlichste Ursachen',
    '2) ## Schrittweise Diagnose (ein Test pro Schritt, Ergebnis einordnen)',
    '3) ## Behebung je nach Befund',
    '4) ## Wenn es weiterhin scheitert',
  ].join('\n')
}

export function getChatThinkingDecisionGuideInstruction(): string {
  return [
    'Thinking — Entscheidung (decision_planning):',
    '1) ## Kriterien (aus Nutzerantworten)',
    '2) ## Optionen im Vergleich (Tabelle wenn sinnvoll)',
    '3) ## Empfehlung mit klarer Begründung',
    '4) ## Nächste Schritte',
  ].join('\n')
}

export function getChatThinkingIntakeClarifyFocusInstruction(params: {
  dimensionLabel: string
  questionHint: string
  round: number
  roundsTotal: number
}): string {
  return [
    'Thinking — Fokus dieser Klärungsrunde:',
    `Dimension: ${params.dimensionLabel}`,
    `Hinweis: ${params.questionHint}`,
    `Runde ${params.round} von ${params.roundsTotal}.`,
  ].join('\n')
}

/**
 * Markdown-Struktur für ausführliche Thinking-Antworten (Zusammenfassungen, Dokumente, Aufgaben).
 */
export function getAssistantThinkingMarkdownInstruction(): string {
  return [
    'Thinking — Antwort-Format (Markdown, ausführlich und lesbar wie ein Lernskript):',
    '',
    'Zusammenfassungen von Dokumenten / Unterlagen (wenn der Nutzer z. B. «fasse zusammen», «Zusammenfassung», «überblick» verlangt oder ein [Datei:…]-Block mitgeliefert wurde):',
    '— Beginne mit `## Zusammenfassung` + kurzem Themennamen (kein «Hier ist…»).',
    '— Direkt darunter ein Satz: «Diese Zusammenfassung basiert auf deinem Dokument.» (oder sinngleich).',
    '— Hauptteile als nummerierte Kapitel: `## 1. …`, `## 2. …`, `## 3. …` (fortlaufend, inhaltlich vollständig).',
    '',
    'Rhythmus pro Hauptkapitel (verbindlich — keine reine Stichpunktwand):',
    '1) Zuerst 1–2 kurze Fließtext-Sätze (vollständige Sätze, kein Stichwort-Fraktionieren).',
    '2) Danach optional **Label:** (fett) + 2–6 Stichpunkte für Details, Fakten, Aufzählungen.',
    '3) Optional ein abschließender Kurzsatz zur Einordnung.',
    '4) Nach jedem Hauptkapitel (ausser dem letzten) eine eigene Zeile mit nur `---` (horizontale Trennlinie).',
  ].join('\n')
}

/** Zusatz: Mischformat und Verbote gegen reine Bullet-Listen (Phase 2). */
export function getChatThinkingMixedLayoutInstruction(): string {
  return [
    'Thinking — Layout-Mix (Phase 2, gilt für alle ausführlichen Antworten):',
    '— Grundsatz: Fliesstext bleibt die Basis, auch in ausführlichen Antworten — visuelles Layout (Cards, Tabelle, divided-list) gezielt einsetzen, wenn es Verständnis/Übersicht wirklich verbessert, nicht als Pflichtdekoration für jeden Abschnitt.',
    '— Jeder nummerierte Hauptabschnitt braucht mindestens einen Fließtext-Satz; Stichpunkte nur als Ergänzung, nicht als Ersatz.',
    '— Zwischen Hauptabschnitten `---` setzen (visuelle Trennung).',
    '— Unterkapitel mit `###` wenn das Thema es braucht.',
    '— Vor Listen gern ein **fettes Label** mit Doppelpunkt (z. B. **Kernpunkte:**, **Ziel:**, **Ablauf:**) — Stichpunkte mit **konkreten Fakten**, nicht nur Themenüberschriften.',
    '— **3+ parallele Typen/Arten/Kategorien mit eigenem Inhalt** (mind. ein Satz pro Eintrag): ```cards``` (je Eintrag eine Kachel) — bei reinen Kurz-Stichworten ohne eigenen Erklärsatz reicht eine Liste.',
    '— Vergleiche mit Spaltenwerten: Markdown-Tabelle (| Spalte | Spalte |) — nur wenn echte mehrdimensionale Spaltenvergleiche nötig sind.',
    '— Kernpunkte ohne eigene Typen: ```divided-list`; Leitfragen: ```cards```; Hinweise: `> !` / `> ?` / `> !!` / `> ✓`.',
    '— Prozessabläufe auch als Kurzsatz mit Pfeilen (z. B. «Prämien → Versicherer → Leistungen»).',
    '',
    'Glossar / Begriffe (verbindlich):',
    '— Wenn Fachbegriffe, Abkürzungen oder «Wörter erklärt» vorkommen (eigener Abschnitt «Glossar», «Begriffe», «Wichtige Begriffe» oder eingestreut): **immer als Markdown-Tabelle**, nie als reine Bullet-Liste.',
    '— Standard-Spalten: `| Begriff | Erklärung |` oder `| Wort | Bedeutung |` (Kopfzeile + `| --- | --- |`).',
    '— Pro Zeile ein Begriff; Erklärung in 1–3 klaren Sätzen (nicht nur ein Stichwort).',
    '— Alle relevanten Begriffe aus dem Material aufnehmen, nicht nur eine Auswahl.',
    '',
    'VERBOTEN in Phase 2:',
    '— Das gesamte Dokument nur aus `-`-Listen ohne Fließtext-Absätze.',
    '— Drei gleiche Blöcke «nur Bullets unter Überschrift» hintereinander — variiere: Satz + ```cards```, ```divided-list`, Tabelle, ###-Unterkapitel.',
    '— Inhaltsreiche Typen/Arten/Kategorien (mit eigenem Erklärsatz) als `-`-Liste statt ```cards```.',
    '— Schulblatt nur **beschreiben** («enthält Übungen zu…») statt **inhaltlich ausarbeiten**.',
    '— «Aufgabe:» / «Lösung:» / «Musterlösung» als Struktur — stattdessen **Lernskript** mit Themenüberschriften.',
    '— Leere Platzhalter oder Meta-Sätze («In diesem Abschnitt…», «Das Dossier deckt…»).',
    '— Glossar/Begriffserklärungen als Bullet-Liste statt Tabelle.',
    '— **Deckt:** nur mit ausformulierten Fakten — nie als reine Themenliste ohne Erklärung.',
  ].join('\n')
}

export function getChatThinkingDetailDepthInstruction(): string {
  return [
    'Thinking — Umfang & Vollständigkeit (an Material anpassen; gilt in Phase 2):',
    '— Grundsatz: bei ausführlichen Aufgaben, Zusammenfassungen und «alles erklären» **nichts Wesentliches weglassen** — lieber vollständig als gekürzt.',
    '— Alle im Material genannten Themen, Unterthemen, Termine, Aufgaben, Personen/Rollen und definierten Begriffe mitnehmen, sofern zum Auftrag gehören.',
    '— Kein «… und weitere», kein bewusstes Ausblenden von Kapiteln «aus Platzgründen».',
    '— Sehr kleines Material (unter ca. 2 500 Zeichen Anhang): 3–5 nummerierte Hauptabschnitte; je Abschnitt Satz + optional Bullets, dazwischen `---`.',
    '— Mittleres Material (ca. 2 500–12 000 Zeichen): 6–10 Hauptabschnitte mit ###-Unterthemen, Tabellen wo sinnvoll, durchgehend Mischformat.',
    '— Grosses Material (über ca. 12 000 Zeichen): 10–18+ nummerierte Hauptabschnitte; **jedes wichtige Thema** des Dokuments abdecken, nicht oberflächlich zusammenfassen.',
    '— Allgemeine Aufgaben ohne Dokument: so viele Abschnitte wie nötig, Schritt-für-Schritt wo passend.',
    '— Wenn der Nutzer «Ausführlich» wählt oder viel Anhang mitliefert: maximale inhaltliche Abdeckung — Glossar als Tabelle, alle Abschnitte des Quelltexts berücksichtigen.',
    '— Wenn der Nutzer «Standard» oder «3–5 Abschnitte» wählt: trotzdem pro Abschnitt Fließtext + optional Stichpunkte; inhaltlich nichts Wichtiges aus dem Dokument streichen.',
  ].join('\n')
}

export function getChatThinkingEmojiStyleInstruction(): string {
  return [
    'Thinking — Stil:',
    'Keine Emojis in Überschriften (## / ###), auch nicht im Comfort-Modus.',
    'Im Fließtext höchstens sehr sparsam, wenn es ohne Mehrdeutigkeit hilft.',
  ].join('\n')
}

/** Thinking + /Word: Word-Konvention, Tabellen, ausführlicher Dokumentinhalt. */
export function getChatThinkingWordDocumentInstruction(): string {
  return [
    'Thinking — Word-Dokument (/Word, Vorschau für späteres .docx):',
    'Der Nutzer will ein **fertiges Word-Dokument** (kein Chat-Tutorial). **Kein Clarify-Block** — liefere in **dieser** Antwort direkt den vollständigen Dokumentinhalt (eine Runde).',
    '',
    'Struktur im Dokumentkörper (nicht normales Chat-#):',
    '- `##### ` = Überschrift 1',
    '- `###### ` = Überschrift 2',
    '- `#### ` = Absatz/Fließtext',
    'Fortsetzungszeilen ohne Präfix gehören zum letzten `####`-Absatz.',
    '',
    'Glossar/Begriffe im Word-Dokument: immer als Tabelle (`type: "table"` oder GFM), Spalten z. B. Begriff | Erklärung — nie nur Stichwortliste.',
    '',
    'Tabelle vs. Stichpunkte (Entscheidung nach Inhalt, nicht pauschal):',
    '- `table` NUR wenn ≥2 Elemente mit ≥2 vergleichbaren Spalten vorliegen (Vergleiche, Kennzahlen, Glossar Begriff+Erklärung, Übersichten).',
    '- Parallele kurze Aussagen ohne mehrere Spalten (Vorteile, Kernpunkte, Merkmale): Stichpunktliste — **kein** `table` dafür.',
    '- **Verboten:** `table` mit nur 1 Spalte oder Zeilen mit langem Fliesstext statt kurzen Werten — das ist eine Liste/ein Absatz, keine Tabelle.',
    '- Entweder GFM im Fließtext unter einem `####`-Absatz:',
    '  | Spalte A | Spalte B |',
    '  | --- | --- |',
    '  | Wert | Wert |',
    '- Oder im optionalen WordOutline-JSON-Block `type: "table"` mit `rows` (string[][]) und optional `"header": true`.',
    '  Beispiel: `{"type":"table","header":true,"rows":[["Kriterium","Wert"],["A","1"]]}`.',
    '',
    'Optional zusätzlich gültiges WordOutline-JSON in ```json … ``` (`version`: 1, `blocks`: heading, paragraph, table).',
    'VERBOTEN: Meta-Anleitungen («In diesem Kapitel beschreiben Sie…»); leere Platzhalter; nur Stichwortlisten ohne Sätze.',
    'Vollständiger Dokumentinhalt mit echten Absätzen und Tabellen in einer Antwort — kein <<<STRATON_THINKING_CLARIFY>>>.',
  ].join('\n')
}

const FILE_BLOCK_RE = /\[Datei:\s*([^\]]+)\]\s*([\s\S]*?)\[\/Datei\]/gi

/**
 * Dynamischer Material-Hinweis an die Nutzernachricht (nicht Systemprompt) — stabiler Prefix für Prompt-Caching.
 */
export function buildThinkingDocumentUserContextBlock(userContent: string): string {
  const trimmed = userContent.trim()
  if (!trimmed) {
    return ''
  }

  let attachmentChars = 0
  const fileNames: string[] = []
  for (const match of trimmed.matchAll(FILE_BLOCK_RE)) {
    const name = match[1]?.trim()
    if (name) {
      fileNames.push(name)
    }
    attachmentChars += (match[2] ?? '').trim().length
  }

  const totalChars = attachmentChars > 0 ? attachmentChars : trimmed.length
  if (totalChars < 800 && fileNames.length === 0) {
    return ''
  }

  const approxPages = Math.max(1, Math.round(totalChars / 2500))
  let depthLine: string
  if (totalChars < 2500) {
    depthLine = 'Zieltiefe in Phase 2: 3–5 nummerierte Hauptabschnitte.'
  } else if (totalChars < 12000) {
    depthLine = 'Zieltiefe in Phase 2: 6–10 nummerierte Hauptabschnitte mit Unterpunkten und Tabellen wo passend.'
  } else {
    depthLine =
      'Zieltiefe in Phase 2: 10–18+ nummerierte Hauptabschnitte — Material ist umfangreich; alle wesentlichen Themen abdecken.'
  }

  const filesLine =
    fileNames.length > 0
      ? `Quelldatei(en): ${fileNames.slice(0, 5).join(', ')}${fileNames.length > 5 ? ' …' : ''}.`
      : ''

  return [
    '---',
    '[Straton Thinking — Materialkontext für Phase 2]',
    `Geschätzter Umfang: ca. ${totalChars.toLocaleString('de-DE')} Zeichen (~${approxPages} Seiten).`,
    filesLine,
    depthLine,
    'Bei Zusammenfassungswunsch in Phase 2: **Inhalt** aus dem [Datei]-Block wiedergeben (Fakten/Ziele/Begriffe) — keine Meta-Liste «das Dokument enthält Kapitel über …».',
    'Begriffe/Glossar in Phase 2: immer als Tabelle (| Begriff | Erklärung |), vollständig aus dem Material.',
    '---',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Steht absichtlich NACH Markdown-/Emoji-Regeln im Systemprompt: Klärung in Phase 1
 * soll nicht durch «nutze Listen» überschrieben werden.
 */
export function getChatThinkingClarifyUiReminder(): string {
  return [
    'Thinking — letzte Priorität für diese Antwort (Phase 1):',
    'Ignoriere Empfehlungen zu Markdown-Listen und ausführlichen ##-Kapiteln.',
    'Nur optional ein kurzer Fliesstext, dann NUR <<<STRATON_THINKING_CLARIFY>>> … JSON … <<<END_STRATON_THINKING_CLARIFY>>>.',
  ].join('\n')
}

export function getChatThinkingFinalAnswerUiReminder(): string {
  return [
    'Thinking — letzte Priorität für diese Antwort (Phase 2):',
    'Ausführliche Antwort: vollständig (nichts Wichtiges weglassen), ##-Kapitel, `---` zwischen Kapiteln, Glossar nur als Tabelle. Kein Clarify-Block.',
  ].join('\n')
}
