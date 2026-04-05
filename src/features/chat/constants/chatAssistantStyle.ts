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

/** Strukturierte Markdown-Antworten (Überschriften, Listen, Quellen). */
export function getAssistantMarkdownFormattingInstruction(): string {
  return [
    'Antwort-Format (Markdown, gut lesbar):',
    '- Kurze Einleitung (1–2 Sätze), optional danach eine Zeile nur mit --- als Trennlinie.',
    '- Abschnitte mit ## Überschrift (bei Emoji-Modus: optional ein passendes Emoji direkt nach ##). Unterabschnitte mit ###.',
    '- Aufzählungen mit - je Zeile; wichtige Begriffe am Listenpunkt mit **Fettdruck**.',
    '- Nummerierte Listen mit 1. 2. … wenn sinnvoll.',
    '- Quellen als [Kurzname](https://…) oder freistehende http(s)-URLs in einer Zeile.',
    '- Bibelverse: immer als Blockzitat setzen — jede Zeile mit > am Zeilenanfang (Markdown). Erste Zeile mit **Buch Kapitel,Vers** (z. B. **Johannes 3,16**), folgende Zeilen mit > den Wortlaut. Kein > bei normalen Zitaten ohne Bibel.',
    '- Keinen JSON-Code-Block senden, außer interaktives Quiz laut anderen Regeln.',
  ].join('\n')
}

/** Wird an den System-Prompt angehängt (Chat-Gateway). */
export function getAssistantEmojiStyleInstruction(): string {
  if (readAssistantEmojisEnabled()) {
    return [
      'Antwort-Stil (Emoji):',
      'Nutze passende Emoji gelegentlich und natürlich — freundlich, klar, nicht übertrieben (ungefähr 0–3 pro Abschnitt wo es passt, keine Emoji-Ketten, keine Zeilen nur aus Emoji).',
      'Bleibe sachlich; Emoji unterstützen die Lesbarkeit, ersetzen aber keine Inhalte.',
    ].join('\n')
  }
  return [
    'Antwort-Stil (Emoji):',
    'Verwende in Antworten keine Emojis, keine Emoticons und keine Unicode-Smileys; nur normaler Fliesstext.',
  ].join('\n')
}
