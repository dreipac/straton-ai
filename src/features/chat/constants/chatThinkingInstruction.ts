/** Systemblock nur im Hauptchat, wenn Thinking aktiv (Routing: GPT-5.4, kein Profil-Speicher). */
export function getChatThinkingWorkflowInstruction(): string {
  return [
    'Thinking-Modus (GPT-5.4, Aufgaben & gründliche Bearbeitung):',
    'Persönlicher Nutzer-Speicher ist ausgeschaltet — nutze nur den sichtbaren Chatverlauf in dieser Unterhaltung.',
    '',
    'Zwei-Phasen-Ablauf (verbindlich pro Nutzerauftrag):',
    '1) Kurze Klärung: genau EINE Rückfrage als Clarify-Block (siehe unten) — noch keine ausführliche Lösung/Zusammenfassung.',
    '2) Ausführliche Antwort: erst nach der Nutzerantwort auf die Rückfrage — vollständig strukturiert (Formatregeln).',
    'Jede neue Nutzeraufgabe startet wieder bei Phase 1.',
    '',
    'Wahrheit sowie Comfort/Strict gelten unverändert (Ton).',
    '',
    'Clarify-Block — exakt dieses Muster (Zeilen getrennt):',
    '<<<STRATON_THINKING_CLARIFY>>>',
    '{"prompt":"Eine zentrale Frage an den Nutzer","options":[{"id":"a","label":"Kurze Antwortmöglichkeit A"},{"id":"b","label":"Kurze Antwortmöglichkeit B"},{"id":"c","label":"Kurze Antwortmöglichkeit C"}]}',
    '<<<END_STRATON_THINKING_CLARIFY>>>',
    '',
    'Regeln zum JSON:',
    '- prompt: eine klare, kurze Frage (ein Satz).',
    '- options: 2 bis 5 Objekte mit id und label; IDs kurz und eindeutig; keine Option „Eigene Antwort“ (die App ergänzt sie).',
    '- Bei Detailtiefe-Fragen: Labels z. B. «Kurz», «Standard — Fließtext + Stichpunkte», «Ausführlich» (nicht nur «3–5 Bullets»).',
    '- JSON gültig, doppelte Anführungszeichen, kein Text ausserhalb der Marker ausser dem optionalen Satz davor.',
    '- Pro Nachricht nur EIN Clarify-Block.',
  ].join('\n')
}

/** Phase 1 — diese Antwort darf nur die kurze Rückfrage sein. */
export function getChatThinkingMandatoryClarifyTurnInstruction(): string {
  return [
    'Thinking — Phase 1 (diese Antwort):',
    'PFLICHT: Du lieferst NUR die kurze Klärung — kein ##-Kapitel, keine Zusammenfassung, keine ausführliche Lösung.',
    'Optional höchstens EIN kurzer Satz ohne Aufzählung, danach AUSSCHLIESSLICH den Clarify-Block mit JSON.',
    'Die Nutzeroberfläche zeigt Rückfragen nur über diesen Block. Keine Markdown-Listen mit Fragen.',
  ].join('\n')
}

/** Phase 2 — nach Nutzerantwort auf die Rückfrage. */
export function getChatThinkingFinalAnswerTurnInstruction(): string {
  return [
    'Thinking — Phase 2 (diese Antwort):',
    'Der Nutzer hat deine Rückfrage beantwortet. Jetzt die vollständige, ausführliche Antwort liefern.',
    'KEIN Clarify-Block in dieser Nachricht. NICHT die Umfangsregeln des Instant-Modus.',
    'Struktur: nummerierte ##-Kapitel, zwischen Kapiteln `---`, pro Kapitel zuerst 1–2 Sätze Fließtext, dann optional Stichpunkte/Tabellen.',
    'Glossare/Begriffe nur als Tabelle; bei ausführlicher Bearbeitung alles Relevante aus dem Material mitnehmen.',
    'Offene Kleinigkeiten: knappe Annahmen nennen und trotzdem liefern.',
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
    '— Jeder nummerierte Hauptabschnitt braucht mindestens einen Fließtext-Satz; Stichpunkte nur als Ergänzung, nicht als Ersatz.',
    '— Zwischen Hauptabschnitten `---` setzen (visuelle Trennung).',
    '— Unterkapitel mit `###` wenn das Thema es braucht.',
    '— Vor Listen gern ein **fettes Label** mit Doppelpunkt (z. B. **Deckt:**, **Ziel:**, **Ablauf:**).',
    '— Vergleiche und Typen-Übersichten als Markdown-Tabelle (| Spalte | Spalte |) mit `| --- | --- |`.',
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
    '— Drei gleiche Blöcke «nur 3 Bullets unter Überschrift» hintereinander — variiere: Satz + Bullets, Tabelle, zwei Sätze, ###-Unterkapitel.',
    '— Leere Platzhalter oder Meta-Sätze («In diesem Abschnitt…»).',
    '— Glossar/Begriffserklärungen als Bullet-Liste statt Tabelle.',
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

/** Thinking + /Word: Word-Konvention, Tabellen, ausführlicher Dokumentinhalt (GPT-5.4). */
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
    'Tabellen (verbindlich wenn Vergleiche, Kennzahlen, Übersichten, Glossar sinnvoll):',
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
    'Bei Zusammenfassungswunsch in Phase 2: Format «Zusammenfassung» — Mischung Fließtext, Stichpunkte, `---` zwischen Kapiteln; alle wesentlichen Inhalte des Anhangs mitnehmen.',
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
