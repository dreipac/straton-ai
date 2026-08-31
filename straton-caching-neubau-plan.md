# Plan: Zuverlässiges Turn-Caching (Analyze + Chat) — IST, SOLL, Verbesserung

Aufbauend auf `straton-optimierung-und-neubau-plan.md`. Enthält die von dir bestätigte Entscheidung
zu Punkt 2 (Haiku) und den Plan zu deinem Cache-Wunsch: ab dem zweiten Turn zuverlässig cachen, über
Analyze **und** Chat, über den ganzen Verlauf — als angehängte, eingefrorene Blöcke statt als
Neuberechnung. Reine Planung, kein Codeeingriff.

---

## A. Intent-Analyze bei fixer Modellwahl → Haiku (entschieden)

**IST:** `wantsInstantAnalyze` (`useChat.ts:1967`) läuft unabhängig davon, ob der Nutzer explizit ein
Modell gewählt hat. Der Analyzer läuft standardmässig auf `GEMINI_MODEL_FLASH_LITE`
(`geminiModels.ts:74`), fällt nur bei deaktiviertem/fehlgeschlagenem Gemini auf die OpenAI-Kette
zurück (`instantAnalyzeWithAi`, `index.ts:3300`). Bei explizitem Claude-Modell bleibt der Chataufruf
korrekt auf Anthropic (`chat.service.ts:1729`) — aber der Analyzer davor bleibt auf Gemini/OpenAI.

**SOLL:** In `instantAnalyzeWithAi` einen dritten Zweig neben Gemini/OpenAI: liegt eine explizite
Anthropic-Modellwahl vor, läuft der Analyzer auf einem günstigen Claude-Modell (Haiku) statt
Gemini/OpenAI. Die Weiche dafür existiert im Client bereits (`pickedModelMeta.provider`) — sie muss
nur bis zum Analyzer-Aufruf durchgereicht werden (heute stoppt sie bei der Routingentscheidung für den
Chataufruf selbst, `chat.service.ts:1729`, und erreicht `instantAnalyzeUserMessage`/den Edge-Aufruf
nicht).

**Verbesserung:** Kein Fremdanbieter-Aufruf mehr pro Turn bei Claude-Chats; alle vom Analyzer
gelieferten Verhaltensfelder (`task_type`, `clarity`, `explanation_depth`, `needs_live_web`) bleiben
erhalten, weil der Aufruf nicht entfällt, nur den Anbieter wechselt. Aufwand: eine Modellkonstante +
ein Zweig, analog zum bestehenden Gemini-Zweig.

---

## B. Turn-Caching als angehängte, eingefrorene Blöcke

### Wie du es dir vorstellst

Jeder Turn hängt einen neuen Block an den bestehenden Verlauf an. Der Block vom letzten Turn wird
nicht mehr angefasst — genau deshalb kann er gecacht werden. Bei einer neuen Session wird nicht der
volle Rohverlauf mitgeschleppt, sondern das, was schon zusammengefasst ist (wie in Kapitel 6.1/6.2 des
Dokuments beschrieben).

### IST — was pro Anbieter tatsächlich passiert

**Anthropic** kommt dem heute strukturell am nächsten, ohne dass es so benannt ist: Der zweite
Breakpoint liegt bei `dialog.length - 2 - 1` (`index.ts:2166`) — „alles ausser den letzten zwei
Nachrichten" ist als Zahl codiert, nicht als benannte Grenze. Wächst der Verlauf um einen Turn, wächst
dieser Index automatisch mit, und Anthropics eigener Cache-Mechanismus (Treffer auf den längsten
bereits gecachten gemeinsamen Anfang) sollte den alten, eingefrorenen Teil turn-über-turn
wiederverwenden — **wenn** die davorliegenden Nachrichten wirklich byte-identisch bleiben. Das ist der
Ansatz, den du beschreibst, nur nicht als eigenständiges Konzept sichtbar, sondern als Nebenprodukt
eines Index-Offsets.

**OpenAI** funktioniert nach demselben Prinzip (impliziter Präfix-Treffer), ohne eigene
Breakpoint-Logik — auch hier gilt: solange die Nachrichtenliste vorne unverändert bleibt, sollte der
Cache turn-über-turn mitwachsen.

**Gemini** tut das **nicht**. `splitSystemLayers` (`geminiChat.ts:213`) cacht ausschliesslich die
allererste System-Nachricht; der gesamte Rest — inklusive des kompletten bisherigen Chatverlaufs —
geht als `supplementalSystem` jedes Mal neu und ungecacht mit. Bei Gemini gibt es also gar keinen
„Block vom letzten Turn", der eingefroren werden könnte — der ganze Verlauf wird bei jeder Anfrage neu
berechnet und neu bezahlt.

**Wo das oben beschriebene Prinzip real bricht — auch bei Anthropic/OpenAI:** Ab 200 Nachrichten
schaltet `selectMainChatMessagesWithRagLite` (`chat.service.ts:514`) um. Diese Auswahl ist
**abfrageabhängig**: sie sucht zur *aktuellen* Frage passende ältere Nachrichten per Wortüberlappung
(`queryTerms` aus der neuesten Nutzernachricht) und nimmt die am besten passenden. Das bedeutet: die
Zusammensetzung des gesendeten Verlaufs ändert sich mit **jeder neuen Frage** — der „alte, unangetastete
Block" aus deiner Beschreibung existiert in langen Chats schlicht nicht, weil praktisch nie zwei Turns
denselben Nachrichten-Ausschnitt bekommen. Das ist der wahrscheinlichste konkrete Grund, warum sich
Caching für dich unzuverlässig anfühlt — nicht Turn 2, sondern jeder Turn ab Nachricht 200.

**Lange-Verlauf-Zusammenfassung (Kapitel 6.1) und chatübergreifender Kontext (6.2) existieren im Code
nicht.** Es gibt keine Tabelle, keine Spalte, keine Funktion, die eine Chat-Zusammenfassung erzeugt
oder speichert — geprüft über `chat_threads`-Migrationen und eine Volltextsuche nach
Zusammenfassungs-Infrastruktur. Was heute „Zusammenfassung" heisst (`isSummaryStyleDocumentExport`,
`shouldRouteSummaryInstantToOpenAi`), ist eine Antwortart, die der Nutzer erhält, wenn er um eine
Zusammenfassung *bittet* — nicht die Verlaufsverdichtung aus 6.1.

### SOLL

**B1 — Anthropic/OpenAI: das Prinzip benennen statt es implizit laufen zu lassen.** Statt
`dialog.length - 2` als Zahl zu berechnen, einen expliziten „eingefrorene Grenze"-Wert führen: der
Index des letzten Turns, der bereits einmal vollständig gesendet wurde. Ändert sich an der Mechanik
wenig, macht sie aber robust gegen künftige Verschiebungen (z. B. durch den Neubau aus Kapitel 7.3, der
neue Turn-Context-Blöcke einführt) und macht sie testbar: „ist Block N-1 exakt das, was letztes Mal als
Block N-1 gesendet wurde" lässt sich damit direkt prüfen.

**B2 — Gemini bekommt einen echten Block-Cache statt nur den ersten System-Satz.** Sobald ein Chat
über die erste Antwort hinausgeht, wird nicht mehr nur `systemParts[0]` gecacht, sondern ein
`cachedContents`-Objekt, das System + bisherigen (bis auf die letzten zwei Nachrichten eingefrorenen)
Verlauf enthält — pro Thread ein Cache-Eintrag, der bei jedem Turn um genau den neu abgeschlossenen
Turn erweitert wird (alter Eintrag verfällt, neuer ersetzt ihn — das ist Geminis Version von „alter
Block bleibt, neuer wird angehängt", weil Gemini keine inkrementellen Präfix-Treffer wie Anthropic/
OpenAI kennt, sondern feste Objekte mit TTL). Das ist der grösste Einzelhebel dieses Plans, weil es der
einzige Anbieter ist, bei dem heute **gar kein** Verlaufscaching stattfindet.

**B3 — RAG-lite durch Verlaufsverdichtung nach 6.1 ersetzen.** Statt bei 200 Nachrichten
abfrageabhängig neu auszuwählen: alles vor einem festen, seltenen aktualisierten Fenster (z. B. alle
50 neuen Nachrichten, „in Schüben, nicht laufend" nach 5.2) zu einer sachlichen Zusammenfassung
verdichten — erzeugt nachgelagert von einem günstigen Modell, nicht im Antwortpfad (6.1, analog zum
Lernanker-Muster aus 8.2). Der gesendete Verlauf wird dann: [eingefrorene Zusammenfassung] + [wörtliche
letzte N Nachrichten] — beides stabil zwischen den Aktualisierungs-Schüben, also cachebar, und genau
das „ein Block wird angehängt, der alte bleibt unangetastet"-Prinzip, das du beschreibst, nur jetzt
für lange Chats statt nur für kurze.

**B4 — Neue Session / chatübergreifender Kontext nach 6.2.** Sobald B3 eine Zusammenfassung je Thread
erzeugt, lässt sich dieselbe Zusammenfassung auch als chatübergreifender Kontext laden (6.2) — eine
neue Session bekommt dann die kompakten Zusammenfassungen der relevanten anderen Chats statt gar
keinen oder (schlimmer) den vollen Rohverlauf. Baut direkt auf B3 auf, kein separater Mechanismus.

### Verbesserung gegenüber heute

| | IST | SOLL | Effekt |
|---|---|---|---|
| Anthropic/OpenAI, kurze/mittlere Chats | funktioniert grösstenteils bereits inkrementell, aber unbenannt und ungeprüft | expliziter, testbarer Grenzwert statt Index-Arithmetik | robuster gegen künftige Prompt-Änderungen, kein Verhaltensunterschied heute |
| Gemini | cacht nur den ersten Systemsatz, Verlauf immer voll neu berechnet | Verlauf bis auf die letzten zwei Nachrichten als Cache-Objekt | grösster Einzelposten: Verlaufskosten bei Gemini-Chats sinken ab dem zweiten Turn spürbar, nicht erst bei sehr langen Chats |
| Chats > 200 Nachrichten | RAG-lite wählt pro Frage neu aus → praktisch nie zwei Turns mit demselben gesendeten Ausschnitt → Cache trifft in langen Chats kaum je | fester, in Schüben aktualisierter Ausschnitt (Zusammenfassung + letzte N wörtlich) | genau das, was du als „ab dem zweiten Turn zuverlässig" beschreibst, wird auch in langen Chats wieder wahr |
| Neue Session / andere Chats | keine Zusammenfassungs-Infrastruktur vorhanden | kompakte, wiederverwendbare Zusammenfassung pro Thread, auch für 6.2 nutzbar | Kontext aus anderen Chats wird möglich, ohne bei jeder Session wieder vollen Rohverlauf zu bezahlen |

### Reihenfolge und Risiko

1. **B1** zuerst — sehr klein, kein Verhaltensrisiko, macht den Rest testbar.
2. **B2 (Gemini)** — grösster Kosteneffekt, mittlerer Aufwand (neuer Cache-Objekt-Lebenszyklus pro
   Thread statt nur beim ersten Systemsatz), kein inhaltliches Risiko.
3. **B3 (Verlaufsverdichtung)** — der eigentliche Neubau in diesem Plan: ersetzt ein bestehendes
   Verhalten (RAG-lite) durch ein neues. Nach 4.7 Schritt 5 einzeln einführen und an echten langen
   Chats messen, weil hier — anders als bei A/B1/B2 — auch das *Antwortverhalten* betroffen ist
   (welche alten Inhalte die KI überhaupt noch sieht).
4. **B4 (chatübergreifend)** — erst nach B3, da ohne dessen Zusammenfassungen nichts zu laden wäre.

---

**Was dieser Plan nicht entscheidet:** ob B3 die Zusammenfassungsschwelle bei 50 oder einer anderen
Zahl neuer Nachrichten zieht, und ob 6.2 (chatübergreifender Kontext) tatsächlich gewünscht ist oder
nur die reine Verlaufsverdichtung (B3) für den eigenen Thread. Beides liegt bei dir.
