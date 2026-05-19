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

/** Nur Instant-Modus im Hauptchat (nicht Lernpfad / nicht Word-Export / nicht Thinking). */
export function getAssistantMainChatBrevityInstruction(): string {
  return [
    'Hauptchat — Instant-Modus (verbindlicher Umfang):',
    'Standard: ausgewogen und verständlich — weder Telegram-kurz noch Thinking-ausführlich.',
    'Zielumfang: in der Regel etwa 150–350 Wörter (ca. 8–18 Sätze Fließtext) ODER ein strukturierter Aufbau mit kurzem Einleitungsabsatz plus Liste mit 5–8 Punkten — du darfst beides moderat mischen, wenn es die Frage klarer macht.',
    'Eine ##-Überschrift; ###-Unterabschnitte nur wenn das Thema es wirklich braucht (z. B. mehrere klar getrennte Teilaspekte), sonst eher fließend ohne Kapitel-Wand.',
    'Keine Wiederholung der Nutzerfrage, kein langes «Gerne helfe ich…»-Vorwort; optional ein knapper Schluss (1 Satz) mit nächstem Schritt oder Rückfrage.',
    'Ausnahme — deutlich länger nur wenn der Nutzer es verlangt (z. B. «ausführlich», «genauer», «Schritt für Schritt», «alles im Detail») — dann näher an Thinking-Tiefe.',
    'Comfort-Modus: warm und unterstützend, ohne ausufernde Motivationsabsätze; Strict: sachlich, gleicher Umfang.',
  ].join('\n')
}

/** Letzte Systemzeile im Hauptchat (nach Formatregeln), damit der Instant-Umfang nicht überboten wird. */
export function getAssistantMainChatBrevityFinalReminder(): string {
  return [
    'Letzte Priorität für diese Antwort (Instant):',
    'Halte den mittleren Umfang ein: genug Kontext und Struktur, dass die Frage beantwortet ist — ohne Fülltext und ohne absichtliche Kürze.',
    'Einfache Fragen: oft ##-Titel plus 1–2 Absätze (ca. 4–8 Sätze); komplexere Themen dürfen den oberen Bereich des Zielumfangs nutzen.',
  ].join('\n')
}

type ReplyToneOption = 'comfort' | 'strict' | undefined

/** Strukturierte Markdown-Antworten (Überschriften, Listen, Quellen). */
export function getAssistantMarkdownFormattingInstruction(options?: {
  replyTone?: ReplyToneOption
  /** Hauptchat: kompaktes Layout, weniger Absätze/Unterüberschriften. */
  compact?: boolean
}): string {
  const replyTone = options?.replyTone
  const compact = options?.compact === true
  let headingRule: string
  if (replyTone === 'strict') {
    headingRule =
      '- Überschriften mit ## und ### ohne Emojis; knapp und sachlich (Strict-Modus).'
  } else if (replyTone === 'comfort') {
    headingRule =
      '- Jede Überschrift mit ## und ### muss genau ein passendes Emoji unmittelbar nach den Rauten haben (z. B. "## 💡 Titel", "### 📝 Details"). Keine ##- oder ###-Zeile ohne Emoji im Titel.'
  } else {
    const emojiTitles = readAssistantEmojisEnabled()
    headingRule = emojiTitles
      ? '- Jede Überschrift mit ## und ### muss genau ein passendes Emoji unmittelbar nach den Rauten haben (z. B. "## 💡 Titel", "### 📝 Details"). Keine ##- oder ###-Zeile ohne Emoji im Titel.'
      : '- Abschnitte mit ## Überschrift. Unterabschnitte mit ###.'
  }
  const compactRules = compact
    ? [
        '- Kompakt-Modus: nach der ##-Zeile höchstens **ein** kurzer Absatz **oder** eine Liste mit **max. 5** Punkten — keine langen Mischformen.',
        '- Keine ###-Überschriften, keine Tabellen, kein `---`, kein zweiter inhaltlicher Block.',
      ]
    : [
        '- Direkt darunter: **gemischte Darstellung** — was am sinnvollsten ist. Haeufig: ein oder mehrere **Absätze** (Fließtext) für Erklärung, Einordnung, Argumentation.',
        '- **Listen** (`-` oder nummeriert `1.`): nur wenn es passt — z. B. Reihenfolge-Schritte, mehrere klar getrennte Optionen, Checklisten, oder wenn eine knappe Aufzählung die Lesbarkeit verbessert. **Nicht** jede Antwort als reine Bullet-Liste.',
        '- Du darfst **mischen**: z. B. kurzer Einleitungsabsatz, dann optional eine kurze Liste, dann wieder ein Schlussabsatz — je nach Thema.',
        '- Wenn du listest: pro Punkt optional **fetter Begriff**, Doppelpunkt, kurzer Satz — bleibt übersichtlich.',
        '- Optional: kurzer Abschluss (nächster Schritt oder eine Frage an den Nutzer) — maximal ein Satz.',
        '- Keine lange Einleitung vor der ##-Überschrift; optional eine Zeile `---` nur wenn zwei inhaltlich getrennte Blöcke nötig sind.',
        '- Tabellen nur wenn sie die Antwort klarer machen (Vergleiche, Übersichten, kleine Datensätze): GitHub-Flavored Markdown mit Pipe-Zeilen, z. B. Kopfzeile, dann Trennzeile `| --- | --- |`, dann Datenzeilen.',
      ]

  return [
    compact
      ? 'Antwort-Format (Markdown, kurz und lesbar):'
      : 'Antwort-Format (Markdown, gut lesbar und tokenbewusst):',
    '- Pflicht: Beginne mit genau einer Zeile `## …` als kurze, inhaltliche Überschrift zum Thema (kein «Hier ist die Antwort»).',
    ...compactRules,
    headingRule,
    '- Quellen als [Kurzname](https://…) oder freistehende http(s)-URLs in einer Zeile.',
    '- **Nur echte Bibelverse** in die violette Bibel-Box: Blockzitat mit >, erste Zeile **Buch Kapitel,Vers** (z. B. **Johannes 3,16**), folgende Zeilen mit > den Wortlaut.',
    '- **Normale Zitate** (Autoren, Philosophie, Filme, «ein Zitat zum Thema», usw.): **kein** >-Block wie bei Bibeltext — stattdessen kurzes Zitat im Fließtext mit Anführungszeichen oder kurze eigene Zeile in Anführungszeichen; keine Bibel-Box.',
    '- **E-Mail-, Brief- oder Krankmeldungsentwurf**: den **gesamten** Entwurf in einen Codeblock mit Sprache `email` packen — Zeile 1 nur die Oeffnung ```email, dann `Betreff: …`, dann Fließtext mit Anrede und Signatur, am Ende eigene Zeile ``` zum Schließen. Die UI zeigt das dann **als E-Mail-Karte** mit Kopier-Button.',
    '- Keinen JSON-Code-Block senden, außer interaktives Quiz laut anderen Regeln.',
  ].join('\n')
}

/** Wird an den System-Prompt angehängt (Chat-Gateway). */
export function getAssistantEmojiStyleInstruction(options?: {
  replyTone?: ReplyToneOption
}): string {
  const replyTone = options?.replyTone
  if (replyTone === 'strict') {
    return [
      'Antwort-Stil (Strict):',
      'Keine Emojis in Überschriften; im Fließtext höchstens sehr selten ein Emoji, nur wenn es ohne Mehrdeutigkeit hilft.',
      'Keine Emoji-Ketten; keine Zeilen nur aus Symbolen.',
    ].join('\n')
  }
  if (replyTone === 'comfort') {
    return [
      'Antwort-Stil (Comfort):',
      'Ton warm und ermutigend, im **mittleren Umfang** (siehe Instant-Regeln oben).',
      'Emoji: genau eines in der ##-Überschrift; im Fließtext höchstens 0–1, nur wenn es ohne Mehrdeutigkeit passt — keine Emoji-Ketten.',
    ].join('\n')
  }
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
