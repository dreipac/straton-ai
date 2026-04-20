const STORAGE_KEY = 'straton-chat-assistant-emojis'

export function readAssistantEmojisEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === '0' || raw === 'false') {
    return false
  }
  return true
}

export function writeAssistantEmojisEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}

/** Nur normaler Chat (nicht Lernpfad): wenig Output-Tokens, aber klar lesbar (nicht «Telegramm-Stil»). */
export function getAssistantMainChatBrevityInstruction(): string {
  return [
    'Hauptchat — Kompaktheit mit Qualität:',
    'Spare Tokens: keine Wiederholung der Nutzerfrage, keine Fuell- oder Höflichkeitsfloskeln, kein Vorwort-Paragraph.',
    'Struktur variieren: Erklärungen und Zusammenhänge oft als zusammenhängende Absätze (Fließtext); Listen nur wenn sie wirklich helfen (Schritte, Optionen, kurze Übersichten).',
    'Trotzdem: jeder Satz und — falls du listest — jeder Punkt soll für sich verständlich sein; keine nur Stichworte ohne Kurzkontext.',
    'Lieber eine Zeile mehr mit Klarheit als eine unverständliche Minimalantwort.',
    'Umfang: typischerweise eine ##-Überschrift, danach je nach Frage ein bis zwei Absätze und/oder eine kurze Liste — nicht automatisch immer eine lange Bullet-Liste.',
  ].join('\n')
}

/** Strukturierte Markdown-Antworten (Überschriften, Listen, Quellen). */
export function getAssistantMarkdownFormattingInstruction(): string {
  const emojiTitles = readAssistantEmojisEnabled()
  const headingRule = emojiTitles
    ? '- Jede Überschrift mit ## und ### muss genau ein passendes Emoji unmittelbar nach den Rauten haben (z. B. "## 💡 Titel", "### 📝 Details"). Keine ##- oder ###-Zeile ohne Emoji im Titel.'
    : '- Abschnitte mit ## Überschrift. Unterabschnitte mit ###.'
  return [
    'Antwort-Format (Markdown, gut lesbar und tokenbewusst):',
    '- Pflicht: Beginne mit genau einer Zeile `## …` als kurze, inhaltliche Überschrift zum Thema (kein «Hier ist die Antwort»).',
    '- Direkt darunter: **gemischte Darstellung** — was am sinnvollsten ist. Haeufig: ein oder mehrere **Absätze** (Fließtext) für Erklärung, Einordnung, Argumentation.',
    '- **Listen** (`-` oder nummeriert `1.`): nur wenn es passt — z. B. Reihenfolge-Schritte, mehrere klar getrennte Optionen, Checklisten, oder wenn eine knappe Aufzählung die Lesbarkeit verbessert. **Nicht** jede Antwort als reine Bullet-Liste.',
    '- Du darfst **mischen**: z. B. kurzer Einleitungsabsatz, dann optional eine kurze Liste, dann wieder ein Schlussabsatz — je nach Thema.',
    '- Wenn du listest: pro Punkt optional **fetter Begriff**, Doppelpunkt, kurzer Satz — bleibt übersichtlich.',
    '- Optional: kurzer Abschluss (nächster Schritt oder eine Frage an den Nutzer) — maximal ein Satz.',
    '- Keine lange Einleitung vor der ##-Überschrift; optional eine Zeile `---` nur wenn zwei inhaltlich getrennte Blöcke nötig sind.',
    '- Tabellen nur wenn sie die Antwort klarer machen (Vergleiche, Übersichten, kleine Datensätze): GitHub-Flavored Markdown mit Pipe-Zeilen, z. B. Kopfzeile, dann Trennzeile `| --- | --- |`, dann Datenzeilen.',
    headingRule,
    '- Quellen als [Kurzname](https://…) oder freistehende http(s)-URLs in einer Zeile.',
    '- **Nur echte Bibelverse** in die violette Bibel-Box: Blockzitat mit >, erste Zeile **Buch Kapitel,Vers** (z. B. **Johannes 3,16**), folgende Zeilen mit > den Wortlaut.',
    '- **Normale Zitate** (Autoren, Philosophie, Filme, «ein Zitat zum Thema», usw.): **kein** >-Block wie bei Bibeltext — stattdessen kurzes Zitat im Fließtext mit Anführungszeichen oder kurze eigene Zeile in Anführungszeichen; keine Bibel-Box.',
    '- **E-Mail-, Brief- oder Krankmeldungsentwurf**: den **gesamten** Entwurf in einen Codeblock mit Sprache `email` packen — Zeile 1 nur die Oeffnung ```email, dann `Betreff: …`, dann Fließtext mit Anrede und Signatur, am Ende eigene Zeile ``` zum Schließen. Die UI zeigt das dann **als E-Mail-Karte** mit Kopier-Button.',
    '- Keinen JSON-Code-Block senden, außer interaktives Quiz laut anderen Regeln.',
  ].join('\n')
}

/** Wird an den System-Prompt angehängt (Chat-Gateway). */
export function getAssistantEmojiStyleInstruction(): string {
  if (readAssistantEmojisEnabled()) {
    return [
      'Antwort-Stil (Emoji):',
      'Pflicht: Bei jeder Markdown-Überschrift ## und ### genau ein Emoji im Titel (siehe Format-Regeln oben).',
      'Im Fließtext und in Listen: passende Emoji sparsam und natürlich (ungefähr 0–3 pro Absatz wo es passt), keine Emoji-Ketten, keine Zeilen nur aus Emoji.',
      'Bleibe sachlich; Emoji unterstützen die Lesbarkeit, ersetzen aber keine Inhalte.',
    ].join('\n')
  }
  return [
    'Antwort-Stil (Emoji):',
    'Verwende in Antworten keine Emojis, keine Emoticons und keine Unicode-Smileys; nur normaler Fließtext.',
  ].join('\n')
}
