# Optimierungen Systemprompt/Caching/Intent-Analyze — und Neubauplan Bibliotheks-Visualisierungen

Anschluss an `straton-befundbericht-systemprompt.md`. Dieses Dokument ist eine **Planung**, kein
Codeeingriff — es beantwortet die vier gestellten Fragen und legt einen Umsetzungsplan vor, über den
entschieden werden kann. Es wurde nichts am Prompt oder am Code verändert.

---

## 1. Systemprompt vereinheitlichen — Befund: inhaltlich existiert bereits nur einer

Geprüft in `chat.service.ts`: `combinedSystemPrompt` wird **einmal** gebaut und unverändert an alle
drei Anbieter weitergegeben. Es gibt keine Stelle, an der für OpenAI oder Anthropic unterschiedlicher
Prompttext steht — die einzigen `provider === '...'`-Verzweigungen im Chat-Service betreffen
Retry-Verhalten und Cache-Schlüssel, nicht den Inhalt. Der Wunsch „ein Systemprompt statt zwei" ist
auf Textebene also schon erfüllt.

**Was tatsächlich uneinheitlich ist: die Cache-Mechanik pro Anbieter**, nicht der Text:

| Anbieter | Mechanik | Schnitt |
|---|---|---|
| OpenAI | impliziter Präfix-Cache über `prompt_cache_key` | Ende der System-Nachricht |
| Anthropic | explizite `cache_control`-Marken, max. 4 pro Anfrage | System + Verlauf minus letzte 2 Nachrichten |
| Gemini | expliziter `cachedContents`-Objektspeicher, TTL 24 h | nur die erste System-Nachricht |

Das lässt sich nicht auf „eine Mechanik" reduzieren — jeder Anbieter erzwingt seine eigene. Was sich
reduzieren lässt, ist die **Streuung, mit der die drei Mechaniken aus demselben Blockaufbau gefüttert
werden**. Konkrete, risikoarme Schritte (bauen auf Empfehlung B/H aus dem Befundbericht auf):

1. **Edge-Default-Key-Drift beheben** (`straton-main-v6` in `index.ts:179` vs. `straton-main-v7` im
   Client) — reiner Gleichstand, keine Verhaltensänderung.
2. **Export-Hints ans Ende von Schicht 3/4 verschieben** — einmaliger Cache-Bruch, danach mehr
   Treffer bei Export-Turns.
3. **Neu: Anthropic-Breakpoint von der Schicht-Grenze ableiten, nicht von einem festen Offset.**
   `callAnthropic` setzt den zweiten Breakpoint heute bei `dialog.length - 2 - 1`
   (`index.ts:2166`) — ein Offset vom Ende her. Ändert sich später die Zahl der Turn-Context-Blöcke
   (z. B. durch den Neubau in Kapitel 7.3), muss dieser Offset von Hand nachgezogen werden, sonst
   verschiebt sich der Schnitt unbemerkt. Robuster: den Index aus derselben Schicht-3/4-Grenze
   berechnen, die auch die Turn-Context-Injektion (`prependMainChatTurnContextToUserContent`)
   bestimmt — eine Quelle der Wahrheit für „wo endet Schicht 3" statt zwei unabhängige Zählweisen.
4. **Neu: einen gemeinsamen „Prompt-Epoch" statt drei einzeln gepflegter Versionsstrings.** Heute
   trägt jeder Cache-Key sein eigenes `vN` (`straton-main-v7`, `straton-instant-analyze-v9`,
   `straton-instant-reply-v4`, `straton-pptx-edit-v1` …) — das ist genau der Mechanismus, der zur
   Drift aus Punkt 1 geführt hat. Ein einziger, aus dem Blockinhalt abgeleiteter Kurz-Hash, an alle
   Keys angehängt, sorgt dafür, dass eine Prompt-Änderung automatisch **alle** Anbieter-Keys auf
   einmal weiterschaltet statt einzelne von Hand zu vergessen.

Aufwand für 1–4: klein, kein inhaltlicher Eingriff, gehört in dieselbe Änderung wie Empfehlung B/H.

---

## 2. Intent-Analyze und der Modellwechsel bei Claude

**Befund aus dem Code:** `wantsInstantAnalyze` (`useChat.ts:1967`) prüft Feature-Flag, Thinking-Modus
und Anhänge — **nicht**, ob der Nutzer bereits explizit ein Antwortmodell gewählt hat. Der eigentliche
Antwortaufruf respektiert die Wahl korrekt: `mainProvider` in `chat.service.ts:1729` nimmt
`pickedModelMeta.provider`, sobald eine explizite Wahl vorliegt, und schlägt damit jeden Sonderweg
(Summary-Routing, PPTX, Kategorie-Routing). **Der Analyzer-Aufruf davor aber nicht** — er läuft immer.

Sein Standardmodell ist `GEMINI_MODEL_FLASH_LITE` (`geminiModels.ts:74`), er fällt nur auf die
OpenAI-Kette (`gpt-5-mini`, `index.ts:2391`) zurück, wenn Gemini-Instant deaktiviert ist oder der
Aufruf transient fehlschlägt. Ist Gemini-Instant in eurer Umgebung aus, läuft bei **jeder** Nachricht
in einem Claude-Chat tatsächlich: OpenAI-Analyze-Aufruf → Anthropic-Chat-Aufruf — zwei fremde
Anbieter pro Turn, exakt das von dir beschriebene Muster.

**Ist das ein Cache-„Bruch"?** Mechanisch nicht — OpenAIs Analyzer-Cache und Anthropics Chat-Cache
sind zwei getrennte Konten, jedes kann für sich turn-über-turn treffen. Was tatsächlich passiert, ist
genau das, was Kapitel 4.5 für diesen Fall schon vorsieht: „Kein Komplexitätshinweis. […] Wer bewusst
ein Modell gewählt hat, will keine Empfehlung für ein anderes." Der Analyzer läuft heute trotzdem
unbedingt weiter — nicht weil er falsch routet (das tut er nicht), sondern weil er bei expliziter
Modellwahl laut Architektur gar nicht nötig wäre.

**Drei Lösungswege, von rein architekturtreu bis pragmatisch:**

| | Ansatz | Aufwand | Wirkung |
|---|---|---|---|
| **G1** | Analyzer bei expliziter Modellwahl ganz weglassen (wörtlich nach 4.5) | klein an der Gate-Bedingung, aber **Vorprüfung nötig**: `buildInstantAnalyzeBriefingInstruction` liefert nicht nur Routing (`escalate_model`), sondern auch Verhaltenssignale (`task_type`, `clarity`, `explanation_depth`, `needs_live_web`). Diese gehen mit weg — Feld-für-Feld-Audit nötig, welche davon Routing sind (entfällt zurecht) und welche Antwortqualität steuern (würde ersatzlos fehlen) | grösste Kostenersparnis, aber Qualitätsrisiko ungeprüft |
| **G2 (Empfehlung)** | Bei explizitem Anthropic-Modell den Analyzer auf ein günstiges Anthropic-Modell (z. B. Haiku) statt Gemini/OpenAI routen | klein — ein Modellkonstante + ein Zweig in `instantAnalyzeWithAi` analog zum bestehenden Gemini-Zweig | behält alle Verhaltensfelder, beseitigt den Fremdanbieter-Wechsel, jeder Turn bleibt „ein Anbieter für Analyze, ein Anbieter für Antwort", beides vorhersehbar cachebar |
| **G3** | Analyzer bei expliziter Wahl durch die bereits vorhandene Heuristik ersetzen (`applyInstantAnalyzeHeuristics`, `fallbackInstantAnalyzeResult`) statt eines LLM-Aufrufs | mittel — erst prüfen, ob die Heuristik alle heute genutzten Felder abdeckt | entspricht Kapitel 3.3 wörtlich („kein separater Klassifikatoraufruf"), grösster struktureller Umbau der drei |

**Empfehlung:** G2 zuerst — kleine, klar begrenzte Änderung, kein Verhaltensverlust, behebt genau das
von dir beschriebene Symptom. G1/G3 danach, wenn die Feldanalyse zeigt, dass sie sich lohnen — sie
sind grössere Eingriffe in einen Ausgabevertrag-nahen Mechanismus (der Analyzer speist Turn-Context,
der wiederum Antwortverhalten steuert) und sollten einzeln eingeführt und gemessen werden (4.7
Schritt 5).

---

## 3. Neubau-Plan: Bibliotheks-Visualisierungen (Kapitel 7.3)

Das Dokument nennt dies ausdrücklich den **einzigen echten Neubau** — alles andere ist Migration von
Prompttext. Bestandsaufnahme, was heute schon existiert und was fehlt:

| Typ (nach 7.3) | Heutiger Stand | Abweichung vom Grundprinzip |
|---|---|---|
| **Datendiagramm** | `chartExportPrompt.ts` — Chart-Spec-JSON (`type/labels/datasets/options`), App rendert | **keine** — ist bereits datenbasiert, nur ohne gemeinsamen Umschlag und ohne Prüfregel-Abgleich |
| **Ablauf-/Strukturdiagramm** | `diagramExportPrompt.ts` — das Modell liefert **fertigen Mermaid-Quelltext**, `DiagramSpecPreview.tsx` reicht ihn 1:1 an `mermaid.js` weiter | **verstösst gegen das Grundprinzip**: „Das Modell gibt niemals fertigen Grafikcode aus." Mermaid-Syntax ist Code. Grösster Umbauposten. |
| **Vergleichstabelle** | existiert nicht als eigener visueller Typ — nur Markdown-Pipe-Tabelle im Fliesstext | fehlt komplett |
| **Zeitachse** | existiert nicht | fehlt komplett |

Zusätzlich fehlt anbieterunabhängig: der **gemeinsame Umschlag** (Typ/Titel/Daten/Fussnote), die
**Prüfregel** als tatsächliche Datenvalidierung (heute nur als Prompt-Bitte „VERBOTEN: erfinden"), und
der **Fehlerfall** als Client-Verhalten (keine Grafik statt Fehlermeldung).

### Reihenfolge (nach Doc-Empfehlung, mit Begründung pro Schritt)

**Phase 0 — Umschlag festlegen, bevor der erste Typ gebaut wird** (Doc: „wird vor dem ersten Typ
festgelegt, nicht danach"):

```
{ "type": "comparison_table" | "flow_diagram" | "data_chart" | "timeline",
  "title": string,
  "data": <typspezifisch>,
  "footnote"?: string }
```

Ein Marker-Paar für alle vier Typen, z. B. `<<<STRATON_VISUAL_JSON>>> … <<<END_STRATON_VISUAL_JSON>>>`.
Die bestehenden Marker (`STRATON_CHART_SPEC_JSON`, `STRATON_MERMAID_DIAGRAM`) bleiben während der
Migration parallel gültig (Rückfallplan nach 4.7) und werden erst entfernt, wenn der jeweilige Typ im
neuen Umschlag an echten Chats geprüft ist.

**Phase 1 — Vergleichstabelle.** Laut Doc der einfachste Zeichner und häufigste Anlass, geringstes
Fehlerrisiko. Rein additiv, kein bestehender Code wird ersetzt. Datenschema: `{ columns: string[],
rows: string[][] }`. **Zweck dieser Phase:** Umschlag, Prüfregel und Fehlerfall-Verhalten technisch an
einem risikoarmen Typ etablieren, bevor der grosse Umbau in Phase 2 folgt.

**Phase 2 — Ablauf-/Strukturdiagramm.** Höchster Lernwert in der ICT-Domäne, aber der eigentliche
Neubau: das Modell liefert Knoten (`id`, `label`) und gerichtete Kanten (`from`, `to`, `label?`) als
Daten; **die App generiert daraus selbst den Mermaid-Quelltext** und reicht den an `mermaid.js`
weiter. `mermaid.js` bleibt damit als reine Zeichenbibliothek erhalten — nur die Quelle des
Mermaid-Textes wechselt vom Modell zur App, womit das Grundprinzip erfüllt ist, ohne die
Rendering-Lib zu ersetzen. Löst nebenbei ein bislang nicht benanntes Risiko: das Modell erzeugt heute
Mermaid-Freitext inklusive Knotenlabels direkt aus Nutzereingaben — ein Injection-Vektor in die
Diagramm-Syntax, den ein datenbasierter Zwischenschritt automatisch schliesst. Der alte Pfad
(`diagramExportPrompt.ts` unverändert) bleibt per Konfiguration erreichbar, bis der neue geprüft ist.

**Phase 3 — Datendiagramm.** Kleinster Aufwand der vier, weil schon datenbasiert: bestehende
Chart-Spec in den gemeinsamen Umschlag heben (dünne Adapterschicht, `chartExportPrompt.ts` bleibt
inhaltlich fast unverändert), Fussnote/Quellenangabe und Prüfregel-Abgleich ergänzen.

**Phase 4 — Zeitachse.** Seltenster Anlass laut Doc, dafür einfachstes neues Schema (`{ points: [{
date: string, label: string }] }`), analog zu Phase 1.

### Cross-cutting, unabhängig von der Reihenfolge

- **Prüfregel als echte Validierung, nicht nur als Prompt-Bitte.** Die „wichtigste Auflage" aus 7.3 —
  Werte/Beschriftungen gegen Antworttext und ggf. Belegstelle abgleichen — braucht einen
  Post-Processing-Schritt im Client. Ohne ihn ist die Regel nur eine Bitte an das Modell, genau das
  Risiko, das 7.3 als Vertrauensproblem markiert.
- **Fehlerfall als stilles Verhalten.** Bei ungültigen/unvollständigen Daten: keine Grafik, keine
  Fehlermeldung, Antworttext bleibt stehen. Heute nur als „VERBOTEN"-Zeile im Prompt vorhanden, nicht
  als Client-Logik.
- **Auto-Trigger („nur wenn die Antwort ohnehin Struktur enthält") ist ein separater
  Verhaltensentscheid** und keine Voraussetzung für Phase 1 — kann On-Request bleiben (wie heute),
  bis sich der neue Umschlag bewährt hat.
- **Schicht-1-Zusatz erst anpassen, wenn mindestens Typ 1 technisch steht.** Sonst kündigt der Prompt
  eine Fähigkeit an, die die App noch nicht hat — sinngemäss dieselbe Warnung wie in 4.5 für Modelle
  ohne die beschriebene Fähigkeit.

### Verhältnis zu den anderen drei Punkten

Unabhängige Arbeitsströme, keine Reihenfolge zwingend — mit einer Ausnahme: der „Prompt-Epoch"-Fix aus
Punkt 1 sollte **vor** Phase 0 des Neubaus stehen, weil Phase 0 sowieso neue Prompt-Blöcke einführt
und damit ohnehin einen Cache-Bruch auslöst — ein guter, ohnehin unvermeidbarer Zeitpunkt, die
Versionierung gleich für alle drei Anbieter auf einmal zu bereinigen statt zweimal hintereinander
Cache-Brüche zu verursachen.

---

**Entscheidungen, die dieses Dokument nicht trifft:** G1 vs. G2 vs. G3 bei Punkt 2, sowie ob der
Auto-Trigger aus 7.3 später eingeführt wird. Beides liegt beim Produktverantwortlichen.
