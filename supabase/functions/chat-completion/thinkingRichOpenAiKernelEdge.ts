/**
 * Spiegel von src/features/chat/constants/thinkingOpenAiPromptCache.ts (Kernel-Teil).
 * Bei Änderungen an Client-Kernel auch hier synchronisieren.
 */
import { buildDocumentSummaryPlaybookEdge } from './documentSummaryPlaybookEdge.ts'

const SECRET_SAFETY_INSTRUCTION = [
  'Sicherheit — Geheimnisse im Output (höchste Priorität, strikt verbindlich):',
  '- Gib NIEMALS echte Passwörter, API-Keys, Access-Tokens, Private Keys, Client-Secrets, Connection Strings, Bearer-Tokens oder andere Secrets im Klartext aus.',
  '- Gilt auch bei Sicherheitschecks, Audits, Dokumentation, Tabellen, Code, JSON, YAML, .env-Beispielen und Checklisten — kein «nur einmal zeigen», kein «als Beispiel» mit echtem Wert.',
  '- Enthält die Nutzereingabe einen Secret-Wert: wiederhole ihn NICHT. Verwende IMMER Platzhalter wie ********, [REDACTED], <API_KEY>, <PASSWORT> oder «(ausgeblendet)».',
  '- Du darfst Secret-Typen, Risiken und sichere Praktiken erklären (Rotation, Vault, Umgebungsvariablen), aber nie den konkreten Wert aus Eingabe oder Kontext übernehmen.',
  '- Bei mehreren Secrets: jeden Wert einzeln maskieren; niemals «der Key lautet …» mit Klartext.',
].join('\n')

const SWISS_GERMAN_ORTHOGRAPHY_INSTRUCTION = [
  'Rechtschreibung — Schweizer Hochdeutsch (verbindlich):',
  '- Schreibe durchgängig nach Schweizer Orthografie: **niemals «ß» (Eszett)** — immer **«ss»**.',
  '- Beispiele: Strasse, Grösse, ausser, Fussball, Strassenverkehr, gross/klein (nicht groß), dass (nicht daß).',
  '- Gilt für Fließtext, Überschriften, Tabellen, Quiz, Word/PDF-Vorschau und deutsche Strings in JSON (intent, Fragen, Erklärungen).',
  '- Zitate oder Eigennamen mit ß unverändert lassen, wenn sie fest so geschrieben sind.',
].join('\n')

const CHAT_THINKING_WORKFLOW_INSTRUCTION = [
  SECRET_SAFETY_INSTRUCTION,
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

/**
 * Cards-/Layout-Vorgaben fuer die sichtbare Antwort liegen jetzt ausschliesslich in der
 * Reply-eigenen Quelle (src/features/chat/constants/thinkingOpenAiPromptCache.ts via
 * buildThinkingGeminiRichTierPrompt) — Draft/Review (dieser Kernel) brauchen sie nicht mehr.
 */

/**
 * Kernel fuer Draft + Review (OpenAI Rich-Tier) — bewusst OHNE Cards-/Layout-Pflicht.
 * Das Sichtformat (Cards/Tabellen/divided-list) entscheidet erst Reply anhand des fertigen
 * Inhalts (eigener Kernel in src/features/chat/constants/thinkingOpenAiPromptCache.ts) —
 * Draft/Review brauchen nur inhaltliche Vollstaendigkeit, kein Format-Pre-Commit.
 */
export function buildThinkingRichOpenAiCachedKernelEdge(): string {
  return [
    SECRET_SAFETY_INSTRUCTION,
    SWISS_GERMAN_ORTHOGRAPHY_INSTRUCTION,
    CHAT_THINKING_WORKFLOW_INSTRUCTION,
    [
      'Thinking — Stil:',
      'Keine Emojis in Überschriften (## / ###), auch nicht im Comfort-Modus.',
      'Im Fließtext höchstens sehr sparsam, wenn es ohne Mehrdeutigkeit hilft.',
    ].join('\n'),
    [
      'Thinking — Rich-Tier (Zusammenfassungen & komplexe Aufgaben), inhaltliche Vollständigkeit:',
      '- Vollständige, inhaltlich ausgearbeitete Lösung — kein «Dossier deckt/thematisiert…» ohne Substanz.',
      '- Schulblatt: integriertes Lernskript — Themen ausarbeiten, Fragen beantworten; kein Aufgabe:/Lösung:-Format.',
      '- Jedes Pflicht-Thema aus document_coverage_topics abdecken.',
    ].join('\n'),
    buildDocumentSummaryPlaybookEdge(),
  ].join('\n\n')
}

export function buildThinkingRichOpenAiDraftStepPromptEdge(): string {
  return [
    'Thinking — interner Entwurf (Nutzer sieht ihn nicht).',
    'Vollständige inhaltliche Lösung; grob ##-Kapitel und `---` zwischen Hauptteilen.',
    'Reiner Inhalt — keine Formatierungsvorgaben (Cards/Tabellen entscheidet erst die finale Antwort).',
    'Bei [Datei:…]: Inhalt aus dem Dateiblock ausarbeiten — nicht «das Dossier deckt…».',
    'Kein Clarify-Block, keine Anpassungsfrage. Nur Entwurf-Markdown.',
  ].join('\n')
}

export function buildThinkingRichOpenAiReviewStepPromptEdge(): string {
  return [
    'Thinking — internes Review (nur JSON).',
    'Du prüfst einen internen Thinking-Entwurf gegen Nutzeranfrage und Aufgabenanalyse.',
    'Antworte ausschließlich mit JSON: fits_intent (boolean), gaps (string[]), rewrite_hints (string), summary (string), needs_live_web (boolean), web_query (string, max 120, nur wenn needs_live_web), web_reason (string, max 80, nur wenn needs_live_web).',
    'Rich/document_summary — fits_intent false wenn:',
    '- nur Meta («deckt/thematisiert/listet») ohne Fakten aus dem Anhang.',
    '- wesentliche Inhalte/Themen aus der Aufgabe fehlen.',
    '- bei 3+ parallelen Themen/Kategorien mit eigenem Inhalt: rewrite_hints soll empfehlen, die finale Antwort als ```cards```/```divided-list``` zu strukturieren (der Entwurf selbst muss das nicht sein).',
    'fits_intent false bei leerem/generischem Entwurf oder fehlender Kernantwort.',
    'fits_intent false bei abgeschnittenem Text oder «Aufgabe:/Lösung:»-Format statt Lernskript.',
    'needs_live_web true, wenn der Entwurf auf Fakten beruht, die sich ändern können (Preise, Kurse, News, Versionen, Verfügbarkeit, konkrete Produkte/Modelle) und du dir nicht sicher bist, ob dein Wissen aktuell/korrekt ist — auch wenn die Aufgabenanalyse das nicht erkannt hat.',
  ].join('\n')
}
