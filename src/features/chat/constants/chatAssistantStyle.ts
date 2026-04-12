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
    'Hauptchat — Kompaktheit mit Qualitaet:',
    'Spare Tokens: keine Wiederholung der Nutzerfrage, keine Fuell- oder Hoeflichkeitsfloskeln, kein Vorwort-Paragraph.',
    'Trotzdem: jeder Satz und jeder Listenpunkt soll fuer sich verstaendlich sein — keine nur Stichworte ohne Kurzkontext.',
    'Lieber eine Zeile mehr mit Klarheit als eine unverstaendliche Minimalantwort.',
    'Umfang: typischerweise eine ##-Ueberschrift plus 4–9 Stichpunkte bei Ratgeber-/Listenfragen; bei sehr einfachen Fragen weniger.',
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
    '- Pflicht: Beginne mit genau einer Zeile `## …` als kurze, inhaltliche Ueberschrift zum Thema (kein «Hier ist die Antwort»).',
    '- Direkt darunter die eigentliche Antwort: bevorzugt eine Liste mit `-` (oder nummeriert `1.` wenn Reihenfolge zaehlt).',
    '- Pro Listenpunkt: zuerst **fetter Begriff oder Kurztitel**, Doppelpunkt, dann ein kurzer Satz oder Satzfragment mit dem Noetigsten — so bleibt es strukturiert und verstaendlich.',
    '- Optional: nach der Liste ein Abschlussatz (Angebot naechster Schritt, Frage an den Nutzer) — maximal ein Satz.',
    '- Keine lange Einleitung vor der ##-Ueberschrift; optional eine Zeile `---` nur wenn zwei inhaltlich getrennte Bloecke noetig sind.',
    '- Tabellen nur wenn sie die Antwort klarer machen (Vergleiche, Uebersichten, kleine Datensaetze): GitHub-Flavored Markdown mit Pipe-Zeilen, z. B. Kopfzeile, dann Trennzeile `| --- | --- |`, dann Datenzeilen.',
    headingRule,
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
      'Pflicht: Bei jeder Markdown-Überschrift ## und ### genau ein Emoji im Titel (siehe Format-Regeln oben).',
      'Im Fliesstext und in Listen: passende Emoji sparsam und natürlich (ungefähr 0–3 pro Absatz wo es passt), keine Emoji-Ketten, keine Zeilen nur aus Emoji.',
      'Bleibe sachlich; Emoji unterstützen die Lesbarkeit, ersetzen aber keine Inhalte.',
    ].join('\n')
  }
  return [
    'Antwort-Stil (Emoji):',
    'Verwende in Antworten keine Emojis, keine Emoticons und keine Unicode-Smileys; nur normaler Fliesstext.',
  ].join('\n')
}
