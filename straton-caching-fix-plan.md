# Prompt-Caching-Fix — Befund und Umsetzungsplan (ohne Umsetzung)

Ersetzt den Caching-Teil von `straton-caching-neubau-plan.md` für den jetzt vereinbarten Zuschnitt:
**kein Neubau, kein Gemini** (wird nicht genutzt). Fokus: warum Intent-Analyze nie gecacht wird, warum
beim Hauptchat (Claude) ein grosser Teil ungecacht bleibt, und ob Claude Haiku als Intent-Modell das
löst. Zwei Angaben unten sind gegen die aktuelle Anthropic-/OpenAI-Dokumentation geprüft (WebFetch,
24. August 2026), nicht nur aus dem Code abgeleitet — als solche gekennzeichnet.

**Es wurde nichts umgesetzt.** Alles unter „Plan" wartet auf dein GO.

---

## Befund 1 — Intent-Analyze wird nie gecacht

**Die Cache-Verdrahtung selbst ist korrekt.** `resolveOpenAiPromptCacheForRequest('instant_analyze', …)`
(`index.ts:216`) setzt einen stabilen Key (`straton-instant-analyze-v9-<modell>`) mit 24 h Retention;
der Aufruf in `instantAnalyzeWithAi` bekommt diese Optionen korrekt übergeben (`index.ts:4292–4301`).
Das ist nicht die Ursache.

**Die Ursache ist die Prompt-Grösse.** `INSTANT_ANALYZE_SYSTEM_PROMPT` (`index.ts:2401`) hat ~3'060
Zeichen, grob geschätzt **~750–950 Tokens**. Dazu kommt eine kurze Nutzerfrage und ein kurzer
Kontextblock aus den letzten Turns — realistisch bleibt die Gesamtanfrage häufig **unter der
Mindestgrenze, ab der OpenAI überhaupt erst cacht.**

Geprüft gegen die aktuelle OpenAI-Dokumentation: Caching greift erst **ab ca. 1'024–2'048 Tokens**
(modellabhängig; ältere Modelle brauchen mehr, cachen zusätzlich nur in 128-Token-Schritten). Liegt
die Anfrage darunter, wird sie **stillschweigend ohne Caching verarbeitet — kein Fehler, kein
Hinweis**, genau das Bild, das du beschreibst.

**Konsequenz:** Der Fix liegt nicht im Cache-Key oder der Retention, sondern darin, die Anfrage
zuverlässig über die Mindestgrenze zu heben — oder zu akzeptieren, dass eine so kleine Klassifizierung
für Caching schlicht zu klein ist und Kosten stattdessen über Modellwahl/Output-Länge gesenkt werden,
nicht über Caching.

---

## Befund 2 — Claude Haiku als Intent-Modell löst das Caching-Ziel nicht

Du hattest vorgeschlagen, den Analyzer bei explizitem Claude-Chat auf Haiku statt Gemini/OpenAI zu
routen (sinnvoll gegen den Fremdanbieter-Wechsel, siehe vorheriger Plan). **Gegen Caching geprüft
verschlechtert das die Lage:**

| Modell | Mindestgrenze zum Cachen (aktuelle Anthropic-Doku) |
|---|---|
| Claude Opus 5 / Fable 5 / Mythos 5 | 512 Tokens |
| Claude Sonnet 5 / Sonnet 4.6 / Opus 4.8 / Opus 4.1 / Opus 4 | 1'024 Tokens |
| **Claude Haiku 4.5** | **4'096 Tokens** |

Haiku hat von allen Claude-Modellen die **höchste** Mindestgrenze — mehr als vier Mal so hoch wie
unser geschätzter Analyzer-Prompt. Ein Wechsel zu Haiku würde die „Fremdanbieter"-Beschwerde lösen,
aber die „nie gecacht"-Beschwerde **garantiert nicht beheben** — im Gegenteil, selbst ein zufälliger
Cache-Treffer wird unwahrscheinlicher als heute bei OpenAI.

**Schlussfolgerung:** Haiku und „Intent-Analyze cachen" sind zwei verschiedene Ziele, die sich hier
gegenseitig ausschliessen. Empfehlung unten trennt beide sauber.

---

## Befund 3 — Hauptchat (Claude): warum ein grosser Teil immer ungecacht bleibt

`callAnthropic` (`index.ts:2143`) setzt `cache_control: { type: 'ephemeral' }` **ohne `ttl`-Feld** —
das ist laut aktueller Anthropic-Dokumentation der **Standardwert von 5 Minuten**. Zusätzlich trägt der
Request noch den Header `anthropic-beta: prompt-caching-2024-07-31` (`index.ts:2192`) — dieser Beta-
Header ist laut Anthropic **nicht mehr nötig**, Caching ist seit einiger Zeit GA.

**Was das praktisch bedeutet:** Ein 5-Minuten-Cache überlebt nur, wenn die nächste Anfrage innerhalb
von 5 Minuten kommt. Bei normalem Chattempo — Antwort lesen, nachdenken, tippen — ist das oft genug
**nicht** der Fall. Läuft die Cache-Marke ab, bevor der nächste Turn kommt, wird beim nächsten Aufruf
**neu geschrieben statt gelesen**: Anthropic unterscheidet in der Antwort `cache_read_input_tokens`
(günstig, 0.1× Preis) von `cache_creation_input_tokens` (teurer, 1.25× bei 5 Minuten). Wird ständig neu
geschrieben statt gelesen, bleibt der tatsächlich „billig gelesene" Anteil klein und **wächst nicht
mit der Chatlänge mit** — das erklärt eine über viele Turns hinweg ähnlich aussehende Zahl wie deine
2'277 von 7'000, unabhängig davon, wie weit das Gespräch schon ist.

Geprüft gegen die aktuelle Anthropic-Dokumentation: Es gibt seit einiger Zeit einen **1-Stunden-Cache**,
**GA, ohne Beta-Header**, aktivierbar allein über `"cache_control": { "type": "ephemeral", "ttl": "1h" }`.
Schreiben kostet dabei 2× statt 1.25×, Lesen bleibt bei 0.1×. Bei realer Nutzung (Pausen von Minuten
bis über eine Stunde zwischen Turns) amortisiert sich der höhere Schreibpreis fast immer, sobald der
Eintrag auch nur einmal wiederverwendet wird.

**Wichtig:** Dein Beispiel mit 2'277 von 7'000 Tokens war ein **GPT-Chat**, nicht Claude — Befund 3
betrifft also nicht direkt diese Zahl, bleibt aber ein reales, separates Problem für alle Claude-Chats
und wird unten weiter unter M1/M2 behandelt. Für GPT ist die Ursache eine andere — siehe Befund 4.

**Sekundär, bereits im ursprünglichen Befundbericht dokumentiert und hier nicht neu:** vereinzelte
Schicht-1-Instabilitäten (Export-Hints mitten im Vorspann, Comfort/Strict-Zweig) können den
**System-Anteil** des Caches zusätzlich in Einzelfällen brechen — das betrifft aber einen kleineren
Anteil als das TTL-Problem und ist bereits als Empfehlung B/H erfasst.

---

## Befund 4 — GPT-Chats: der Cache bleibt für immer auf „nur Systemprompt" gedeckelt

Das ist die eigentliche Antwort auf deine Frage, weil dein Beispiel mit GPT war. Ursache ist kein
Anbieter-Detail, sondern ein Konstruktionsfehler im **gemeinsamen** Code, der die Nachrichtenliste für
alle drei Anbieter baut (`buildGatewayMessages`, `chat.service.ts`).

**Was passiert:** Der dynamische Turn-Kontext (heutiges Datum, Profil, Abo-Stand, Instant-Analyze-
Ergebnis, Websuche-Snippets …) wird bei jeder Anfrage in die **jeweils letzte** Nutzernachricht
hinein­geschrieben — und zwar **vorne**:

```
`${MAIN_CHAT_TURN_CONTEXT_HEADER}\n\n${body}\n\n---\n\n${base}`   // base = die echte Nutzerfrage
```

Der Kontext-Block steht **vor** der eigentlichen Nutzerfrage, die Nutzerfrage selbst kommt **zuletzt**.
Gespeichert in der Datenbank (`chat.persistence.ts:createChatMessage`, aufgerufen mit dem rohen
`userContent`) wird nur die reine Nutzerfrage — **ohne** den Kontext-Block. Das ist beabsichtigt, sonst
stünde veraltetes „heutiges Datum" für immer im Verlauf.

**Das Problem:** Wird dieselbe Nachricht einen Turn später erneut als Verlaufs­eintrag mitgeschickt (sie
ist jetzt nicht mehr die letzte), fehlt der Kontext-Block — es wird nur noch die reine Frage gesendet.
Weil der Kontext-Block beim ersten Mal **vorne** stand, ist „reine Frage" **kein Präfix** von „Kontext +
Frage", sondern ein **Suffix**. Für ein Präfix-basiertes Caching (das OpenAI ausschliesslich nutzt, ohne
die expliziten Ausschluss-Marken, die Anthropic hat) heisst das: **ab genau dieser Nachricht stimmt kein
einziges Byte mehr mit dem überein, was jemals zuvor gecacht wurde.** Und das passiert bei **jeder**
Nutzernachricht, weil jede einmal „die letzte" war und dabei diesen Kontext-Block vorangestellt bekam.

**Ergebnis:** Der Cache kann strukturell nie über den Systemprompt hinauswachsen — nicht bei Turn 2,
nicht bei Turn 20. Genau das erklärt „immer nur ~2'277 von 7'000 Tokens", unabhängig von der
Chatlänge: 2'277 ist praktisch der Systemprompt (Schicht 1–3), der Rest bricht bei der ersten
Nutzernachricht ab, weil sie beim einzigen Mal, als sie „aktuell" war, in anderer Reihenfolge
gesendet wurde als jedes Mal danach.

**Warum Claude davon (grösstenteils) verschont bleibt:** `callAnthropic` schliesst die letzten zwei
Nachrichten ohnehin explizit vom Caching aus (Befund 3). Eine Nachricht wird dort also nie in ihrer
kontextbehafteten Form gecacht — erst einen Turn später, wenn sie schon „abgekühlt" und wieder in
reiner Form da ist, wird sie zum ersten Mal cachebar. Das ist reiner Zufall der Konstruktion, kein
bewusster Schutz, aber es erklärt, warum dir das bei Claude nicht in derselben Schärfe aufgefallen ist.

**Der Fix ist eine Umkehrung der Reihenfolge, keine neue Mechanik:** Steht die echte Nutzerfrage
**zuerst** und der Kontext-Block **danach** (`${base}\n\n---\n\n${header}\n\n${body}`), ist die reine
Frage ab dann tatsächlich ein Präfix dessen, was gesendet wurde — künftige Turns, die nur die reine
Frage replayen, matchen dann korrekt bis zu diesem Punkt, und der Cache kann turn-über-turn wachsen.

**Trade-off, ehrlich benannt:** Heute steht die Nutzerfrage bewusst **zuletzt**, vermutlich damit das
Modell sie unmittelbar vor der Antwort „frisch im Kopf" hat (Rezenz-Effekt). Nach der Umkehrung stünde
stattdessen der Systemkontext zuletzt. Das ist in RAG-ähnlichen Systemen ebenfalls gängig (Beleg direkt
vor der Antwort), aber nicht automatisch neutral für die Antwortqualität — nach 4.7 Schritt 5 einzeln
an echten Chats prüfen, nicht ungetestet mit M1 bündeln.

---

## Plan — Massnahmen (nach Risiko geordnet, wartet auf dein GO)

| | Massnahme | Löst | Aufwand | Risiko |
|---|---|---|---|---|
| **M1** | `ttl: '1h'` in beide `cache_control`-Blöcke in `callAnthropic` ergänzen (System + Dialog-Breakpoint) | Befund 3 — der grösste Hebel, wirkt auf jeden Claude-Chat-Turn | sehr klein — zwei Feldergänzungen, GA, kein neuer Beta-Header nötig | keines inhaltlich; Schreibkosten pro Cache-Erneuerung steigen von 1.25× auf 2×, amortisiert sich fast immer |
| **M2** | Veralteten Header `anthropic-beta: prompt-caching-2024-07-31` entfernen | Aufräumen, kein funktionaler Effekt laut aktueller Doku | trivial | keines |
| **M3** | `INSTANT_ANALYZE_SYSTEM_PROMPT` gezielt auf sicher über ~1'200–1'500 Tokens anheben (zusätzliche stabile Klarstellungen/Beispiele), **Modell bleibt OpenAI** | Befund 1 — macht Intent-Analyze überhaupt erst cachebar | klein bis mittel — Prompt-Inhalt ändert sich, Wirkung auf Klassifizierungsqualität einzeln prüfen (4.7 Schritt 5) | gering, aber Verhaltensänderung am Analyzer — einzeln messen, nicht mit M1 bündeln |
| **M4** | Claude Haiku für Intent-Analyze bei explizitem Claude-Chat einsetzen (deine ursprüngliche Idee) — **mit korrigierter Erwartung**: Zweck ist Anbieter-Konsistenz und Latenz, **nicht** Kostenersparnis über Caching (Befund 2) | die „Fremdanbieter pro Turn"-Beschwerde, nicht die Caching-Beschwerde | klein — ein Modellzweig analog zum bestehenden Gemini-Zweig in `instantAnalyzeWithAi` | gering |
| **M5** | Vorher/Nachher messen statt annehmen: `cache_read_input_tokens`/`cache_creation_input_tokens` (Anthropic) bzw. `usage.prompt_tokens_details.cached_tokens` (OpenAI) für Analyze und Hauptchat loggen | bestätigt Befund 1, 3 und 4 empirisch, statt sich auf die Schätzung hier zu verlassen | klein — Logging existiert teilweise schon (`tryLogTokenUsage`), nur die Cache-Felder ergänzen | keines |
| **M6** | `prependMainChatTurnContextToUserContent` umdrehen: echte Nutzerfrage zuerst, Kontext-Block danach (`chat.service.ts:660`) | Befund 4 — der eigentliche Deckel bei GPT-Chats, wirkt auf **alle** Anbieter gleichzeitig, weil die Funktion gemeinsam genutzt wird | klein — eine Template-Umkehrung an einer Stelle | gering, aber Antwortqualität einzeln prüfen (Rezenz-Trade-off, siehe Befund 4) — **nicht** mit M1/M3 bündeln |

### Empfohlene Reihenfolge

1. **M5 zuerst, kurz** — falls möglich vor jeder Änderung eine Messung, damit „2'277 von 7'000" ein
   bestätigter Ausgangswert statt eine Beobachtung ist.
2. **M6** — grösster Hebel für genau das beobachtete GPT-Problem, betrifft aber die Antwortreihenfolge
   und muss deshalb einzeln an echten Chats gemessen werden (4.7 Schritt 5), bevor etwas anderes
   draufgesetzt wird.
3. **M1 + M2** — kleinster Aufwand, grösster Effekt für Claude, kein Verhaltensrisiko. Danach erneut
   messen (M5): der Anteil aus `cache_read_input_tokens` sollte turn-über-turn spürbar wachsen statt
   konstant zu bleiben.
4. **M3** — danach, einzeln eingeführt und an echten Analyzer-Antworten gegen die heutige
   Klassifizierungsqualität geprüft (4.7 Schritt 5), weil hier tatsächlich Prompt-Inhalt wächst.
5. **M4** — unabhängig von 1–4, sobald klar ist, dass dir die Anbieter-Konsistenz den Aufwand wert ist,
   wissend dass sie kein Caching-Gewinn ist.

---

**Was dieses Dokument nicht entscheidet:** ob M3 überhaupt gewünscht ist (Alternative: Intent-Analyze
bewusst ungecacht lassen und die Kosten stattdessen über Modellwahl/Output-Länge senken), und ob M4
trotz Befund 2 gewünscht wird. Sag mir dein GO, dann setze ich um — geplant ist erst M1+M2 als erster
Schritt, wenn du nicht anders willst.
