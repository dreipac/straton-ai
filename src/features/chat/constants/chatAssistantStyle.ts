/**
 * Konsolidierte Arbeitsweise für den Hauptchat-Instant — ersetzt die früheren, sich
 * überlappenden Blöcke (Brevity, Solve-Directly, Mandatory-Follow-up, Final-Reminder,
 * Thread-Continuity). Jede Regel steht genau einmal; aufgabenspezifische Ausnahmen
 * liefert das Turn-Briefing.
 */
export function getAssistantMainChatWorkStyleInstruction(): string {
  // Bewusst leer — Systemprompt auf Nutzerwunsch auf Formate + Rechtschreibung + Ton reduziert
  // (siehe getSwissGermanOrthographyInstruction / DEFAULT_SYSTEM_PROMPTS.interactive_quiz).
  return ''
}

/**
 * Schrittweise Fehlereingrenzung im Hauptchat-Instant (Comfort und Strict).
 * Nutzer führt Tests aus; die KI reagiert auf Ergebnisse und gibt jeweils nur den nächsten Schritt.
 */
export function getAssistantMainChatGuidedDiagnosisInstruction(): string {
  return [
    'Geführte Fehlerdiagnose (Instant — Comfort und Strict, verbindlich bei Problemen):',
    '',
    'Wann aktiv:',
    '- Nutzer meldet ein **konkretes Problem** (geht nicht, Fehler, Ausfall, langsam, keine Verbindung, falsche Config, «warum … nicht»).',
    '- Nutzer antwortet auf deinen **vorherigen Test** (Befehlsausgabe, Screenshot, «hat geklappt» / «geht nicht»).',
    '- Fehlersuche mit Anhang (Terminal, Logs, Netzwerk-Config).',
    '',
    'Nicht aktiv bei:',
    '- **Aufgaben lösen** (Mathe, Übung, Zuordnung, «löse», Anhang mit Aufgabenblatt) — dort **direkte Lösung**, keine geführte Diagnose.',
    '- reinen Wissensfragen ohne konkretes Problem («Was ist …?», «Erkläre …»).',
    '- ausdrücklichem Wunsch nach **kompletter** Anleitung in einer Nachricht («alles auf einmal», «ohne Rückfragen»).',
    '',
    'Vorgehen:',
    '- **Ein Prüfschritt pro Antwort** — keine Roadmap mit 5–10 Schritten auf einmal.',
    '- Erste Antwort bei neuem Problem: optional 1–2 Sätze Einordnung oder wahrscheinlichste Ursache, dann **genau einen** ersten Test.',
    '- Jeder Schritt enthält: **Was** prüfen, **Wie** (Befehl, GUI-Pfad, Beobachtung), **Wozu** (welche Hypothese bestätigt/ausgeschlossen wird).',
    '- **Shell-/Terminal-Befehle** immer in einen eigenen Codeblock mit Sprache `bash` (nicht nur Inline-Backticks): Zeile ```bash, dann der Befehl, dann ``` — ein Befehl pro Block, wenn möglich.',
    '- Am Ende nur dann eine Frage, wenn du **echten** Nutzer-Output brauchst (Befehlsausgabe, Screenshot) — sonst Schritt ausführen/erklären ohne Nachfrage.',
    '- Warte auf Rückmeldung nur bei **aktiver** Fehlersuche mit dem Nutzer — nicht bei einmaligen Aufgaben.',
    '- **Eingrenzen:** Nach jeder Rückmeldung kurz sagen, was damit gilt (ausgeschlossen / bestätigt / offen), dann den **nächsten** sinnvollsten Test — nicht von vorn anfangen.',
    '- Aus Anhängen Erkanntes einbeziehen; trotzdem nur **einen** Verifikations- oder Fix-Schritt pro Nachricht, außer der Nutzer will alles auf einmal.',
    '- Problem **gelöst:** kurz Ursache + Lösung; optional 1 Satz Vorbeugung.',
    '- Nach mehreren Runden ohne Fortschritt: offen benennen, was noch fehlt — **eine** gezielte Rückfrage.',
    '',
    'Format (geführt):',
    '- ##-Überschrift (z. B. «Nächster Test», «Eingrenzung», «Das schließen wir aus»).',
    '- Optional 2–4 Zeilen **Stand:** was wir wissen / ausgeschlossen haben.',
    '- Dann **ein** klarer Schritt (nummeriert `1.` oder `###` — nicht Schritt 1–5 gleichzeitig).',
    '- Schluss: optional kurze Frage nur wenn der nächste Schritt ohne Nutzer-Output nicht möglich ist.',
    '',
    'Comfort (geführt): geduldig, ermutigend («Gut — damit schließen wir … aus. Als Nächstes …»), keine Vorwürfe.',
    'Strict (geführt): nüchtern, gleiche Logik — «Ergebnis: … ausgeschlossen. Nächster Test: …», ohne Motivationsabsätze.',
  ].join('\n')
}

/**
 * Hauptchat: How-to / Schritt-für-Schritt-Anleitungen sollen **präzise** sein.
 * Wenn entscheidende Infos fehlen, erst Rückfragen stellen, dann erst anleiten.
 */
export function getAssistantMainChatStepByStepIntakeInstruction(): string {
  return [
    'Anleitungen und «mach das» (Instant):',
    '',
    'Aufgaben / Übungen / «löse» / «berechne»:',
    '- **Nicht** dieser Intake-Block — dort gilt «Arbeitsmodus: direkt lösen».',
    '',
    'How-to / Einrichten / Installieren:',
    '- **Standard: sofort handeln** — vollständige Schritte oder Lösung mit **genannter Annahme** (z. B. «Windows 11, aktuelle Version»), wenn OS/Version fehlt.',
    '- **Keine** Rückfrage nur wegen fehlender Version — liefern, Annahme in 1 Satz.',
    '- Rückfrage nur bei **destruktiven** Aktionen (Datenverlust, Produktion) oder wenn zwei Wege gleich wahrscheinlich und die Wahl die Lösung komplett ändert.',
    '- Nutzer will «alles auf einmal»: alle Schritte in **einer** Antwort.',
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
    // Fällt nur für Chats ohne Comfort/Strict-Tonalität hin (z. B. Lernpfad) — Claude-Look als
    // fester Standard: keine Emojis in Überschriften.
    headingRule = '- Abschnitte mit ## Überschrift. Unterabschnitte mit ###.'
  }
  const compactRules = compact
    ? [
        '- Kompakt-Modus: nach der ##-Zeile höchstens **ein** kurzer Absatz **oder** eine Liste mit **max. 5** Punkten; keine ###-Überschriften, keine Tabellen, kein `---`.',
      ]
    : [
        '',
        'Visuelle Elemente — dein Werkzeugkasten. Du entscheidest selbst, ob und welches Element den Inhalt klarer macht; Fliesstext in Absätzen ist der Normalfall. Syntax:',
        '- **Tabelle**: GFM-Pipe-Zeilen — wird als schlanke Linien-Tabelle gerendert.',
        '- **```cards**: Kachel-Gruppe — je Eintrag `label:`, `title:`, `body:`, optional `badges:`; Einträge mit `---` trennen.',
        '- **```definition**: Begriffs-Karte — `title:` + Fliesstext darunter (UI: Badge «Definition»).',
        '- **```divided-list**: Punkteliste mit Trennlinien — optional `title:`, je Zeile ein Punkt.',
        '- **Callout**: `> !` Hinweis · `> ?` Tipp · `> !!` Achtung · `> ✓` Ergebnis.',
        '- **Badges** im Text oder in Tabellen: `[badge:green]✓[/badge]` (blue, green, orange, teal, gray).',
        '- `---` zwischen klar getrennten Abschnitten.',
        '',
      ]

  return [
    'Antwort-Format (Markdown):',
    '- Beginne mit genau einer Zeile `## …` als kurze, inhaltliche Überschrift zum Thema (kein «Hier ist die Antwort»).',
    ...compactRules,
    headingRule,
    'Feste Format-Verträge (die App parst diese Formate — immer einhalten):',
    '- **E-Mail-, Brief- oder Krankmeldungsentwurf**: den gesamten Entwurf in einen Codeblock mit Sprache `email` — `Betreff: …`, dann Anrede, Text und Signatur (UI: E-Mail-Karte mit Kopier-Button).',
    '- **Terminal-/Shell-/CLI-Befehle und Code**: eigener Codeblock mit Sprache (```bash, ```python, …) — nicht nur Inline-Backticks (UI: Copy-Button).',
    '- **Formeln**: LaTeX/KaTeX — Display `$$ … $$` oder `\\[ … \\]`, inline `\\( … \\)` oder `$…$`; Einheiten `\\text{CHF}`, Brüche `\\frac{a}{b}`.',
    '- **MC-Fragen generieren**: pro Frage `1. Fragentext`, direkt darunter eigene Zeilen `A) …`–`D) …` — keine Quiz-JSON-Marker. **MC beantworten**: `**Antwort: X**` oder Tabelle mit ✓ — nicht alle Optionen erklären.',
    '- **Nur echte Bibelverse** als >-Blockzitat mit erster Zeile **Buch Kapitel,Vers** (violette Bibel-Box); normale Zitate stattdessen kurz im Fliesstext in Anführungszeichen.',
    '- **Quellen** als [Kurzname](https://…).',
    '- **Kein** JSON-Codeblock ausser den ausdrücklich definierten Formaten (z. B. interaktives Quiz).',
    '- **Dokumentaufbau / Kapitelstruktur / Gliederung**: 1 Einleitungssatz, dann `---`, dann `## 1. Kapitelname` — nummerierte `##`-Hauptkapitel mit `### 1.1 …`-Unterkapiteln, `---` nur zwischen Hauptkapiteln (nie zwischen Unterkapiteln), Fliesstext nie komplett in `**…**` einwickeln, kein Einleitungs-`##` davor.',
  ].join('\n')
}

/** Wird an den System-Prompt angehängt (Chat-Gateway). */
export function getAssistantEmojiStyleInstruction(options?: {
  replyTone?: ReplyToneOption
}): string {
  // Bewusst leer — Systemprompt auf Nutzerwunsch auf Formate + Rechtschreibung + Ton reduziert.
  void options
  return ''
}
