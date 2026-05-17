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

/** Nur normaler Chat (nicht Lernpfad / nicht Word-Export): kurze Antworten, wenig Output-Tokens. */
export function getAssistantMainChatBrevityInstruction(): string {
  return [
    'Hauptchat — Kurzantworten (verbindlich):',
    'Standard: knapp und direkt. Keine Wiederholung der Nutzerfrage, kein «Gerne», kein Vorwort, keine Zusammenfassung am Ende, wenn nicht nötig.',
    'Zielumfang: in der Regel höchstens etwa 80–180 Wörter (ca. 3–8 Sätze Fließtext) ODER eine kurze Liste mit maximal 5 Punkten — nicht beides ausführlich.',
    'Nur eine ##-Überschrift; keine ###-Unterkapitel, es sei denn der Nutzer verlangt ausdrücklich Tiefe, Schritt-für-Schritt oder ein langes Dokument.',
    'Listen nur bei echten Schritten/Optionen; sonst ein kurzer Absatz.',
    'Ausnahme — ausführlicher werden nur wenn der Nutzer es verlangt (z. B. «ausführlich», «genauer», «erkläre Schritt für Schritt», «alles im Detail»).',
    'Auch im Comfort-Modus: warm, aber kurz; keine langen Motivationsabsätze.',
  ].join('\n')
}

/** Letzte Systemzeile im Hauptchat (nach Formatregeln), damit Kürze nicht überboten wird. */
export function getAssistantMainChatBrevityFinalReminder(): string {
  return [
    'Letzte Priorität für diese Antwort:',
    'Halte dich an die Kurzregeln oben. Wenn die Frage einfach ist: oft genügt ##-Titel plus 2–4 Sätze.',
    'Lieber zu knapp und klar als lang und redundant.',
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
      'Ton warm und ermutigend, aber **kurz** (siehe Kurzregeln).',
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
