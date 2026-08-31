# Befundbericht — bestehender Systemprompt vs. `straton-chat-architektur.md` v1.2

**Auftrag:** Kapitel 4.6 — Analyse ohne Änderung.
**Stand:** 24. August 2026
**Geprüfter Gegenstand:** der zusammengesetzte Systemprompt des **Hauptchats**, gebaut in
`src/features/chat/services/chat.service.ts:buildGatewayMessages` (Zeilen 671–1215), plus die
Caching-Implementierung in `supabase/functions/chat-completion/`.
**Nicht Gegenstand:** Lernpfad-Prompts (`learn_tutor`, `learn_setup_topic`) und die Gehirn-Agenten
(`src/features/learn/brain/agents/prompts.ts`) — Kapitel 4.6 zielt auf den Chatprompt.

**Es wurde nichts geändert.** Kein Prompttext, keine Reihenfolge, kein Code.

---

## 1. Blockübersicht

Reihenfolge wie in `combinedSystemPrompt` (`chat.service.ts:1140`). Art nach der Tabelle in
Kapitel 4.7.

| # | Block | Quelle | Art | Aktiv wenn |
|---|---|---|---|---|
| 1 | `# Straton AI` — Identität, Stil, Wahrheit, Aufgabentypen, Anhang Quiz-Formate | `DEFAULT_SYSTEM_PROMPTS.interactive_quiz`, überschreibbar über `app_system_prompts` | gemischt: Ton/Sprache + Verhaltensregel + **Ausgabevertrag** (`<<<STRATON_QUIZ_JSON>>>`) | immer |
| 2 | Sicherheit — Geheimnisse im Output | `chatSecretSafety.ts` | Verhaltensregel | immer (ausser Thinking-Cache-Split) |
| 3 | Rechtschreibung — Schweizer Hochdeutsch | `chatSwissOrthography.ts` | Ton und Sprache | dito |
| 4 | `options.systemPrompt` | — | **Altlast**: im Hauptchat nie gesetzt (nur Lernpfad) | nie |
| 5 | Learn-Kapitel-JSON-Supplement | `systemPromptDefaults.ts` | Ausgabevertrag | nur Lernpfad |
| 6–11 | Excel-, Word-, PDF-, Chart-, Diagramm-, PPTX-Hints | `*ExportPrompt.ts` | Ausgabevertrag | pro Anfrage |
| 12 | Arbeitsweise (Hauptchat) | `chatAssistantStyle.ts` | Verhaltensregel | Instant ohne Export |
| 13 | Wahrheit (verbindlich) | `chatTruthAndTone.ts` | Verhaltensregel | Hauptchat |
| 14 | Antwortmodus Comfort **oder** Strict | `chatTruthAndTone.ts` | Ton | Nutzereinstellung |
| 15 | Thinking-Kernel | `thinkingGeminiPromptCache.ts` / `thinkingRichOpenAiKernelEdge.ts` / `chatThinkingInstruction.ts` | Verhaltensregel + Formatvorgabe | Thinking |
| 16 | Antwort-Format (Markdown) inkl. „Feste Format-Verträge" | `chatAssistantStyle.ts` | Formatvorgabe + **Ausgabevertrag** | Instant |
| 17 | Antwort-Stil (Emoji) | `chatAssistantStyle.ts` | Ton | je Modus |
| 18 | Thinking-UI-Reminder | `chatThinkingInstruction.ts` | Formatvorgabe | Thinking |

**Nicht im Systemprompt, sondern im Turn-Kontext der letzten Nutzernachricht**
(`buildPromptCacheDynamicTurnBlocks`, `chatPromptModules.ts:329`; Einbau über
`prependMainChatTurnContextToUserContent`, `chat.service.ts:658`):
Profil-Identität · Datum/Uhrzeit · Bild-Fähigkeit · Produktkontext · Plattform-Guide ·
Web-Grounding · geführte Fehlerdiagnose · How-to-Intake · Nutzer-Einführung · Abo-Verbrauch ·
Instant-Analyze-Briefing · Quiz-Format · Layout-Profil · Coverage-Themen · Websuche-Snippets · Guards.

---

## 2. Schichtbefund

**Die Kernfrage aus 4.6 — steht weit vorne etwas Flüchtiges? — ist mit Nein zu beantworten.**
Datum, Uhrzeit, Nutzername, Nutzer-Einführung und Credits-/Abo-Stand liegen bereits vollständig im
Turn-Kontext hinter dem Cache-Schnitt, mit ausdrücklichem Kommentar an beiden Stellen
(`chatCurrentDateContext.ts:5`, `chatPromptModules.ts:325`). Der „häufigste Fund" aus 4.7 Schritt 2
existiert hier nicht; Priorität 1 aus 4.8 ist im Wesentlichen schon umgesetzt.

Offen bleiben drei echte Schichtverstösse und eine Kleinigkeit:

**a) Export-Hints stehen in der Mitte.** Blöcke 6–11 sind pro Anfrage bedingt und liegen **vor** den
statischen Blöcken 12–15. Sobald ein Word-, PDF-, Excel-, Chart-, Diagramm- oder PPTX-Export
angefragt wird, ist der gesamte Rumpf dahinter — Arbeitsweise, Wahrheit, Ton, Format, Emoji —
nicht mehr cachebar. Grössenordnung: rund 1000–1300 Tokens pro Export-Turn, die unnötig zum
vollen Preis gehen. Das Verschieben ans Ende ist reine Reihenfolge, kein Wortlaut.

**b) Schicht 1 ist nicht über alle Nutzer identisch.** Der Antwortmodus Comfort/Strict verzweigt an
drei Stellen: Block 14 (eigener Block), Block 16 (`headingRule` — Emoji-Pflicht in Überschriften bei
Comfort, verboten bei Strict) und Block 17. Ab Block 14 gibt es damit zwei Cache-Varianten.
Regel 5.2 („Schicht 1 identisch über alle Nutzer") ist verletzt — aber bewusst und mit nur zwei
Varianten. Das ist eine Feststellung, keine Fehlfunktion.

**c) Das `compact`-Flag** in `getAssistantMarkdownFormattingInstruction` hängt am
`presentationProfileForTurn` und wechselt damit pro Anfrage. Block 16 liegt fast am Ende, der
Schaden ist klein — aber der Schwanz des Systemprompts ist dadurch nie stabil.

**d) Der leere Slot** `options.systemPrompt` (Block 4) sitzt mitten im stabilen Vorspann. Heute
filtert `.filter(Boolean)` ihn weg. Würde er je gefüllt, bräche er alles dahinter.

**Gemini-Besonderheit:** `splitSystemLayers` (`geminiChat.ts:213`) macht **nur die erste**
System-Nachricht cachebar; alle weiteren wandern in den User-Prompt. Im Instant-Hauptchat gibt es
genau eine — passt. Im Thinking mit Cache-Split gibt es zwei bis drei, die zusätzlichen landen
absichtlich ungecacht im User-Teil.

---

## 3. Caching-Zustand (Antwort aus dem Code)

**Ja, Prompt-Caching wird genutzt — auf allen drei Providern, mit drei verschiedenen Mechanismen.**
Die Disziplin ist bereits weit entwickelt: eigene, versionierte Keys pro Workload
(`straton-instant-analyze-v9`, `straton-thinking-draft-v1`, `straton-gen-title-v1`,
`straton-pptx-edit-v1`, …).

### OpenAI — impliziter Präfix-Cache mit Routing-Key

* Client setzt `promptCacheKey` und `promptCacheRetention: '24h'` (`chat.service.ts:1829–1839`).
* Edge löst auf in `resolveOpenAiPromptCacheForRequest` (`index.ts:208`) und schreibt
  `prompt_cache_key` / `prompt_cache_retention` in den Body (`index.ts:1648–1656`).
* Hauptchat-Key: **`straton-main-v7`** (`chat.service.ts:1498`). Das Modell wird zweimal
  angehängt — client­seitig in `mainChatPromptCacheKey` (`chat.service.ts:576`) und edge-seitig in
  `withModelPromptCacheSuffix` (`index.ts:246`). Kein modellübergreifender Treffer, genau wie
  4.5 es verlangt.
* 24h-Retention nur auf gpt-5/4.1/codex (`openAiSupportsExtendedPromptCache`), sonst Default.
* Fällt ein Modell über die Cache-Parameter, gibt es einen Rückfallpfad ohne sie
  (`isOpenAiPromptCacheRejection`, `index.ts:1714`, angewendet 1740 und 1929).

**Wo liegt der Schnitt:** OpenAI cacht selbst den längsten identischen Präfix (ab 1024 Tokens); der
Code setzt keine Marke. Der effektive Schnitt ist deshalb dort, wo die Anfrage aufhört, identisch zu
sein — **am Ende der System-Nachricht**. Alles Flüchtige liegt bereits dahinter, im Turn-Kontext der
letzten Nutzernachricht. Das entspricht „hinter Schicht 3" aus 5.2, allerdings nur, weil Schicht 2
(Pfadkontext) und Schicht 3 (Gesprächsstand-Zusammenfassung) im Chat noch gar nicht existieren.

### Anthropic — explizite `cache_control`-Marken

* `cache_control: { type: 'ephemeral' }` auf dem System-Block (`index.ts:2143`), Header
  `anthropic-beta: prompt-caching-2024-07-31` (`index.ts:2203`).
* Zweite Marke bei `cacheBreakpointIdx = dialog.length - 3` (`index.ts:2166`), also am letzten
  stabilen Dialog-Eintrag.

**Schnitt:** System-Prompt **plus** Verlauf bis auf die letzten zwei Nachrichten. Zwei Blöcke
statt bisher einer pro Nachricht — der Kommentar an Ort dokumentiert, dass die alte Variante ab dem
vierten Turn am 4-Block-Limit scheiterte (HTTP 400).

### Gemini — expliziter Context Cache über `cachedContents`

* Anlegen/Wiederverwenden in `geminiClient.ts:216–276`, TTL **86 400 s (24 h)**
  (`geminiClient.ts:32`).
* Wiedererkennung über `displayName = <cacheKey>-<sha256(systemInstruction)[0:8]>`
  (`geminiClient.ts:141`), zusätzlich ein Prozess-lokaler Hot-Map-Cache.
* Hauptchat-Instant-Key: **`straton-instant-reply-v4`** (`geminiModels.ts:41`).

**Schnitt:** `splitSystemLayers` — **die erste System-Nachricht** ist die gecachte
`systemInstruction`, alles andere (weitere System-Blöcke, kompletter Verlauf, Turn-Kontext) geht
ungecacht in den User-Prompt.

Zwei Nebenbefunde: der Hash im `displayName` bedeutet, dass **jede Promptvariante** — Comfort,
Strict, jeder Export-Hint, jedes `compact` — eine eigene Cache-Ressource anlegt; Varianten, die sich
nicht wiederholen, zahlen die Anlage umsonst. Und `findReusableCachedContentName` blättert bei
kalter Edge-Instanz die vollständige `cachedContents`-Liste durch — ein Zusatz-Roundtrip pro
Kaltstart, kein Korrektheitsproblem.

### Ein Drift

`OPENAI_PROMPT_CACHE_DEFAULT_CHAT_KEY = 'straton-main-v6'` (`index.ts:179`) behauptet im Kommentar,
mit dem Client identisch zu sein — der Client steht auf `v7`. Greift nur, wenn der Client keinen Key
schickt, was im Chat derzeit nicht vorkommt. Heute harmlos, morgen irreführend.

---

## 4. Widersprüche und Doppelungen

| # | Fund | Stellen | Bewertung |
|---|---|---|---|
| 1 | **Wahrheitsregel doppelt, mit unterschiedlicher Neigung** | Block 1 „Wahrheit (oberste Regel)": *echtes Unwissen ehrlich sagen statt überzeugend zu raten* · Block 13 „Wahrheit (verbindlich)": *Unsicheres kurz als Annahme kennzeichnen und trotzdem antworten* | Der wichtigste Fund. Zwei Blöcke, ~500 Tokens auseinander, regeln dasselbe — einer neigt zum Zurückhalten, einer zum Liefern. Genau das Muster, das nach 4.7 Schritt 4 schwankendes Verhalten erzeugt. |
| 2 | **Stilregel fast wörtlich doppelt** | Block 1 „Direkt, sachlich, klar. Kein Vorgeplänkel … vom Wichtigsten zum Detail" · Block 12 „Direkt zur Sache: kein Vorwort … vom Wichtigsten zum Detail" | Reine Doppelung, kein Widerspruch. Tokens ohne Wirkung. |
| 3 | **MC-Antwortformat dreifach, uneinheitlich** | Block 1 `Antwort: B` (ohne Auszeichnung) · Block 12 `**Antwort: X**` · Block 16 `**Antwort: X**` oder Tabelle mit ✓ · zusätzlich `DIRECT_ANSWER_TURN_BRIEFING` | **Geklärt:** `directAnswerMcq.ts` parst das Format — es ist ein Ausgabevertrag nach 4.7. Aber `ANSWER_LETTER_RE` (Zeile 12–14) hat zwei Alternativen und akzeptiert `**Antwort: B**` *und* blankes `Antwort: B`; danach greifen noch drei Fallbacks (✓-Tabellenzeile, Textabgleich gegen die Optionstexte, Heuristik). Die Dreifachnennung bricht den Client also **nicht**. Damit sinkt der Fund von Risiko auf Tokenersparnis. |
| 4 | **Schweizer Orthografie in drei Formulierungen** | `chatSwissOrthography.ts` · `SWISS_ORTHOGRAPHY_BASE` (`systemPromptDefaults.ts:38`) · `SWISS_GERMAN_ORTHOGRAPHY_RULE` (`index.ts:152`) | Inhaltlich identisch, drei Pflegestellen. |
| 5 | **Secret-Regel in drei Formulierungen** | `chatSecretSafety.ts` · `SECRET_SAFETY_BASE` · `SECRET_SAFETY_RULE` (Edge), plus Regex-Nachbearbeitung `redactSecretsInAiText` | Wie 4. Die Nachbearbeitung ist eine sinnvolle zweite Linie, keine Doppelung. |
| 6 | **Längenregel auf drei Ebenen verteilt** | Block 1 „Tiefe an die Frage anpassen" · Block 12 „Länge adaptiv" · Turn-Briefing „Tiefe-Richtwert: brief/standard/deep" | Gleichgerichtet, aber drei Quellen für eine Regel. |
| 7 | **Rückfragenregel vierfach** | Block 12 · `stepByStepIntakeHardGuard` · Intake-Block · Turn-Briefing „mit benannter Annahme überbrücken" | Übererfüllt statt lückenhaft — ungewöhnlich, aber unschädlich. |
| 8 | **Tabellen-Antwortstil kollidiert mit dem Rationale-Filter** | Block 16 erlaubt als MC-Antwort „`**Antwort: X**` oder kleine Tabelle mit ✓" · `stripDirectAnswerLinesFromRationale` in `directAnswerMcq.ts` entfernt **jede** Pipe-Tabellenzeile aus der Begründung | Wählt das Modell die Tabellenvariante, bleibt die Begründung in der MC-Vorschau leer. Der Prompt bietet eine Option an, die der Client danach wegputzt. |

---

## 5. Abgleich mit den neun Vorschlägen aus Kapitel 4.8

| Prio | Vorschlag | Befund | Begründung |
|---|---|---|---|
| 1 | Schichtung, flüchtige Felder nach hinten | **weitgehend abgedeckt** | Datum, Profil, Abo, Einführung liegen bereits im Turn-Kontext; Keys sind versioniert und modellgetrennt. Offen nur 2a–2d. |
| 2 | Längenkalibrierung nach Fragetyp | **teilweise abgedeckt** | Adaptivität ist da (Block 12 + Analyzer-Tiefe), die konkrete Kalibrierung aus 4.3 (Faktenfrage 1–2 Sätze / Anleitung nummeriert / Rechenaufgabe Schritte + Ergebnis) fehlt. |
| 3 | Quellenregeln | **teilweise abgedeckt** | Für die Websuche vollständig vorhanden (`getChatWebSearchGroundingInstruction`: Fundstelle nennen, Unbelegtes benennen, nicht auf Trainingsstand verweisen). Für **Materialauszüge** fehlt das Gegenstück — weil es den Auszugsbetrieb aus 5.3 im Chat noch nicht gibt. Der Chat sieht Dokumente als Anhang bzw. RAG-lite über den Verlauf, nicht als Konzeptgraph-Auszüge mit Seitenbezug. |
| 4 | Rückfragenregel | **abgedeckt** | Siehe 4.7 — eher zu oft geregelt als zu selten. |
| 5 | Signalfeld | **fehlt — und die Grundentscheidung ist im Code invertiert** | Es gibt kein Signalfeld. Gleichzeitig eskaliert `escalate_model` aus dem Instant-Analyzer automatisch von Gemini Flash-Lite auf Flash (`geminiModels.ts:116–118`), und die Tageskontingent-Kette wechselt OpenAI-Modelle nach Verbrauch. Das ist automatische Eskalation, die Kapitel 3.2 ausschliesst. **Produktentscheidung, keine Promptänderung.** |
| 6 | Falsche Voraussetzungen | **fehlt** | Kein Block behandelt einen Fehler in der Frage selbst. |
| 7 | Fachliche Sorgfalt (Einheiten, Rundung, Normen) | **fehlt** | Vorhanden ist nur die LaTeX-Auszeichnung für Einheiten (`\text{CHF}`) — Darstellung, nicht Sorgfalt. |
| 8 | Grenzenblock | **fehlt vollständig** | Weder Krisenhinweis noch 147 noch eine Regel zu sexuellen Inhalten existiert im Chatprompt. Bei der Zielgruppe (KV-Lernende, Berufsfachschule) der einzige offene Punkt, dessen Risiko weder Kosten noch Qualität ist. |
| 9 | Ton und Sprache angleichen | **trifft so nicht zu** | Das Produkt hat ein bewusstes Zwei-Modus-System (Comfort/Strict), das die Architektur nicht kennt. Der Ton aus 4.3 („keine Anbiederung, kein Lob für die Frage") entspricht Strict und widerspricht Comfort („warm, ermutigend, geduldig"). Der Vorschlag wäre nur umsetzbar, indem eine ausgelieferte Nutzereinstellung gestrichen wird. Nebenbefund: die **Du-Form** ist nirgends als Grundregel gesetzt, sie taucht nur bedingt in den Profil- und Einführungs-Blöcken auf. |

---

## 6. Empfehlung, Aufwand und Risiko

Nur für das, was nach Punkt 5 offen ist. Reihenfolge weicht bewusst von 4.8 ab: A steht vorn, weil
es der einzige Punkt ist, dessen Risiko nicht Kosten oder Qualität betrifft.

| | Massnahme | Aufwand | Risiko | Berührt |
|---|---|---|---|---|
| **A** | Grenzenblock ergänzen (Krisenhinweis, 147, keine sexuellen Inhalte) | klein — ~10 Zeilen an stabiler Position in Schicht 1 | gering | alle Anfragen im Prompt, ausgelöst nur im seltenen Fall |
| **B** | Export-Hints (Blöcke 6–11) ans Ende der System-Nachricht verschieben | klein — nur Reihenfolge in `chat.service.ts:1140–1163`, kein Wortlaut | keines inhaltlich; einmaliger Cache-Bruch, deshalb Key auf `straton-main-v8` heben | nur Export-Turns; ~1000–1300 Tokens je Turn zurück in den Cache |
| **C** | Wahrheits- und Stil-Doppelung zusammenführen (Punkt 4, Nr. 1–2) | mittel — die Blöcke liegen in zwei Dateien; Block 1 ist über `app_system_prompts` DB-überschreibbar, **Vorprüfung nötig** (siehe Kasten unten) | gering bis mittel | alle Antworten — nach 4.7 Schritt 5 einzeln messen |
| **D** | MC-Antwortformat auf **eine** Schreibweise vereinheitlichen (`**Antwort: X**`), Tabellenvariante aus Block 16 streichen | klein | gering — der Parser akzeptiert beide Schreibweisen, eine Vereinheitlichung *auf* `**Antwort: X**` bricht nichts. Umgekehrt gilt: die Regex nicht anfassen, und keine neue Schreibweise erfinden | MC-Antworten; behebt zugleich Punkt 4 Nr. 8 |
| **E** | Längenkalibrierung nach Fragetyp ergänzen (4.8 Prio 2) | klein — ~6 Zeilen in Block 12 | gering, aber Überschneidung mit der Analyzer-Tiefe möglich → messen | alle Antworten |
| **F** | Falsche Voraussetzungen (Prio 6) und fachliche Sorgfalt (Prio 7) ergänzen | klein — zwei Blöcke à 3–5 Zeilen | gering | Rechen- und Faktenantworten — trotz Verlockung **nacheinander** einführen (4.7 Schritt 5) |
| **G** | Entscheiden statt umsetzen: Signalfeld vs. bestehende Auto-Eskalation · Comfort/Strict vs. Ton aus 4.3 | kein Code, eine Entscheidung | — | betrifft Kapitel 3.2 und 4.8 Prio 9 |
| **H** | Kleinkram: leeren `options.systemPrompt`-Slot aus dem Hauptchat-Vorspann nehmen · Edge-Default-Key `v6` → `v7` angleichen | sehr klein | keines | — |

**Nicht anfassen**, solange es funktioniert — der Client wertet all das aus:
`<<<STRATON_QUIZ_JSON>>>`-Marker · ```email-Codeblock · ```cards / ```definition / ```divided-list ·
`[badge:…]` · Callout-Präfixe `> !` `> ?` `> !!` `> ✓` · LaTeX-Konvention · Bibel-Blockzitat ·
die Export-Hints selbst · die MC-Antwortzeile `**Antwort: X**` · und — überraschend — die Überschrift
`### Verbesserungen` aus Block 12: `stripDirectAnswerLinesFromRationale` schneidet die Begründung
genau dort ab, das optionale Schlusskapitel ist damit selbst Teil des Ausgabevertrags.

---

### Vorprüfung zu C — ist ein DB-Override aktiv?

Der Hauptchat nimmt Block 1 **nicht** aus dem Code, sondern aus dem Kontext:
`useChat.ts:3079/3151` übergibt `getPrompt('interactive_quiz')`, und `mergeSystemPromptsWithDefaults`
(`systemPromptDefaults.ts:118`) lässt eine nicht-leere DB-Zeile den Code-Default schlagen. Existiert ein
Override, verpufft jede Änderung an `systemPromptDefaults.ts`.

Prüfen lässt sich das nur an der Datenbank — im Repo steht es nicht:

```sql
select key, length(content) as laenge, updated_at
from public.app_system_prompts
order by key;
```

Kein `interactive_quiz`-Treffer (oder `content` leer) → der Code-Default gilt, C ist eine reine
Codeänderung. Treffer mit Inhalt → zuerst im Admin-Bereich „KI Anweisungen" entweder
*Standard wiederherstellen* drücken oder die Zusammenführung direkt dort vornehmen.

**Falle in der Admin-UI:** `AdminPage.tsx:1052` befüllt das Textfeld aus dem *zusammengeführten*
Ergebnis. Ein Feld ohne Override sieht dort genauso aus wie eines mit Override — und ein Klick auf
*Speichern* schreibt den bis dahin nur im Code stehenden Standardtext als Override in die DB und
friert ihn ein. Die Tabelle beantwortet die Frage, die Oberfläche nicht.

---

**Was dieser Bericht nicht enthält** (nach 4.6): keine umgeschriebenen Blöcke, keine fertige neue
Fassung, keine Ausgabeverträge zur Diskussion. Die Entscheidung, welche Punkte umgesetzt werden,
liegt beim Produktverantwortlichen.
