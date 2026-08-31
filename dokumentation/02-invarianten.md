# 2 — Die zwoelf Invarianten und wo sie durchgesetzt werden

Kapitel 1 des Bezugsdokuments ist bindend: „Diese Regeln duerfen an keiner Stelle der
Implementierung verletzt werden, auch nicht temporaer oder ‚fuer den Prototyp'."

Eine Regel, die nur im Fliesstext steht, wird irgendwann versehentlich gebrochen. Jede Invariante
ist deshalb auf mindestens eine der vier folgenden Arten abgesichert:

| Art | Bedeutung |
|---|---|
| **Typ** | Der Verstoss ist nicht ausdrueckbar. Die stabilste Form. |
| **Datenbank** | Ein Constraint lehnt die Zeile ab. Haelt auch, wenn der Client falsch rechnet. |
| **Guard** | Eine Funktion in `invariants.ts` wirft. Nennt die Invariante beim Namen. |
| **Test** | Ein Testfall, der den Verstoss nachstellt. |

`INVARIANTS` in `src/features/learn/brain/invariants.ts` ist das maschinenlesbare Register
derselben Tabelle. Ein Test prueft, dass es vollstaendig ist und jede Invariante eine Fundstelle
nennt — damit eine neu hinzugefuegte Regel nicht ohne Absicherung durchrutscht.

---

## I1 — Nur direkte Evidenz veraendert die Beherrschung

> Sonst kann ein Wert entstehen, fuer den nie jemand etwas geloest hat.

| Art | Fundstelle |
|---|---|
| Guard | `assertMasteryChangeAllowed` — laeuft in `perceiveGradedAnswer` und `perceiveChatSignal` |
| Datenbank | `learn_evidence_events_only_direct_evidence_moves_mastery` |
| Typ | Nur `applyDirectEvidence` schreibt `mastery`. Propagation und Chatsignale haben keinen Codepfad dorthin. |
| Test | `invariants.test.ts`, `chatSignals.test.ts`, `frontSearch.test.ts` |

**Der leiseste Verstoss waere der Kaltstart.** Die adaptive Suche folgert „wenn C sitzt, sitzt A
wahrscheinlich auch" — und genau das darf sie nicht ins Lernerbild schreiben. `FrontSearchState`
ist deshalb ein reiner Suchzustand ohne Persistenz. Ein Test prueft, dass `recordProbe` nur die
drei Suchfelder zurueckgibt und die uebergebenen Lernerbilder byte-gleich bleiben.

**Der tatsaechliche Verstoss lag woanders.** Die Invariantenpruefung vor Fassung 1.1 fand ihn
nicht im Gehirn, sondern in der alten Engine: `propagateSignal`/`applyPropagation` in
`engine/conceptGraph.ts` verschoben bei jeder Antwort die **Beherrschung** benachbarter Konzepte —
ohne dass zu diesen Konzepten je etwas geloest worden waere. Das verletzte I1 und I3 zugleich.
Beide Funktionen sind entfernt; die Aufrufstelle in `learnerModel.ts` gibt nur noch eine leere
Liste zurueck, und die Tests dort halten fest, dass die Nachbarn unberuehrt bleiben. Zweifel
verteilt ausschliesslich `brain/memory/propagation.ts`, und nur auf die Sicherheit.

Auch die Zurueckweisung an der Jetzt-Karte („Spaeter", UI-Spezifikation 3.3) faellt unter I1: sie
ist ein Signal an den **Planer**, nicht ans Lernerbild. Sie nimmt dem Konzept die Runde und
bewegt keinen Wert.

---

## I2 — Chatverhalten erhoeht niemals die Beherrschung

> Fragen stellen beweist nichts. Verhindert geschoente Lernerbilder durch Vielrederei.

| Art | Fundstelle |
|---|---|
| Guard | `assertMasteryChangeAllowed('chat', delta)` |
| Datenbank | `learn_evidence_events_chat_never_raises_mastery` |
| Code | `perceiveChatSignal` reicht `mastery` woertlich durch und setzt `masteryDelta: 0` |
| Test | `chatSignals.test.ts` prueft **beides**: das Delta im Ereignis *und* den Zustand selbst |

**Eine Feinheit mit zwei Lesarten.** I2 sagt „Es darf nur senken oder Zweifel wecken", die Tabelle
in Kapitel 5.1 sagt beim Chat ausdruecklich „Darf Beherrschung senken: **nein**, nur Sicherheit
senken". Die Tabelle ist die praezisere Angabe und gewinnt im Code: Chat setzt `masteryDelta`
strikt auf 0. Der Datenbank-Constraint sichert die grosszuegigere Grenze (`<= 0`) zusaetzlich ab,
damit auch ein Fehler in der Wahrnehmungsschicht nie ein Anheben durchlaesst.

---

## I3 — Propagation veraendert nie die Beherrschung, nur die Sicherheit

> Ein Fluechtigkeitsfehler darf keine Lawine ausloesen.

| Art | Fundstelle |
|---|---|
| **Typ** | `ConfidenceAdjustment` in `memory/propagation.ts` hat **kein** Beherrschungsfeld |
| Guard | `assertPropagationTouchesConfidenceOnly` — faengt untergeschobene Felder aus JSON ab |
| Datenbank | `propagation_confidence_penalty` ist eine eigene Spalte, getrennt von `mastery` |
| Test | `propagation.test.ts` prueft, dass `mastery` nach einem Abschlag unveraendert ist |

Der Typ ist hier die eigentliche Absicherung. Wer in der Propagation die Beherrschung bewegen
wollte, muesste den Rueckgabetyp aendern — und faellt damit in jeder Ueberpruefung auf.

Der Abschlag wird **getrennt gefuehrt**, nicht direkt von `confidence` abgezogen. So laesst sich
der Anteil, der allein aus Zweifel stammt, jederzeit zuruecknehmen: `applyDirectEvidence` setzt
ihn auf 0, sobald echte Evidenz vorliegt. Dafuer war er da.

---

## I4 — Jedes Wissensatom traegt eine Herkunftsmarkierung

> Pruefungsrealitaet und Halluzinationsschutz. Ohne Quelle keine Pruefbarkeit.

| Art | Fundstelle |
|---|---|
| **Typ** | `BrainConcept.origin` ist nicht optional |
| Datenbank | `learn_concepts.origin` NOT NULL, **ohne Standardwert**, plus Check `learn_concepts_material_needs_quote`; `learn_concept_edges.origin` NOT NULL + Check |
| Code | `parseCartographerResult` **verwirft** Konzepte ohne Herkunft, statt sie aufzufuellen; die Ingestion stuft eine behauptete Materialherkunft ohne Beleg auf `ai_supplement` herab |
| Oberflaeche | Herkunftszeile im Knoten-Panel (`pathView.provenanceLine`) und die getrennten Toepfe im Material-Bereich (`materialView.buildMaterialSources`) |
| Hilfsmittel | `conceptsWithoutProvenance`, `originBreakdown` |
| Test | `agents.test.ts`, `knowledgeGraph.test.ts`, `conceptIngestion.test.ts`, `ui/goalMaterialView.test.ts` |

Ein Konzept, das sich als `material` ausgibt, aber weder `sourceRef` noch `sourceQuote` traegt,
ist ein Widerspruch: es behauptet, aus dem Dokument zu stammen, kann das aber nicht belegen. Der
Parser lehnt es mit Grund ab. **Ein stillschweigend ergaenztes Feld ist schlimmer als eine
abgelehnte Antwort, weil es aussieht wie ein Befund.**

**Genau das war der zweite Fund der Invariantenpruefung.** `learn_concepts.origin` hatte den
Standardwert `material` — jede Zeile ohne ausdrueckliche Angabe behauptete damit eine Quelle, die
niemand nachweisen konnte. Der Standardwert ist entfallen. Der Altbestand steht seither auf
`unknown`: nicht loeschen (die Konzepte sind in Benutzung), nicht behaupten (der Beleg fehlt),
sondern benennen. `unknown` wird nie vergeben — `setConceptOrigin` lehnt es ab; der Wert kann nur
verschwinden, nicht entstehen.

---

## I5 — Kein generiertes Material erreicht den Nutzer ohne Quellenabgleich

> Halluzinierte Inhalte vergiften ueber den Pruefer auch das Lernerbild.

| Art | Fundstelle |
|---|---|
| Guard | `assertTaskCleared` in `production/quality.ts` |
| Code | `parseSourceCheckResult` liefert bei fehlender Angabe `sourceAligned: false` |
| Code | `gatePlanFor` setzt `sourceCheck: true` als Literaltyp — nicht abschaltbar |
| Test | `quality.test.ts` |

**Eine fehlende Freigabe ist keine Freigabe.** Der Parser kennt hier bewusst keinen wohlwollenden
Standardwert.

### Zwei Rollen des Materials — Wahrheitsquelle und Themenquelle

I5 war urspruenglich auf ein Lehrbuch zugeschnitten: das Material sagt, was richtig ist, und alles
Ausgelieferte muss sich daraus belegen lassen. Ein **Dossier oder Arbeitsheft** erfuellt diese Rolle
nicht — es **stellt** die Fragen, die gekonnt werden muessen, und **beantwortet sie nicht**. Unter
dem reinen Deckungsmassstab liess sich zu solchen Konzepten nie eine Aufgabe erzeugen: der
Kontrolleur lehnte zu Recht ab, jeder der drei Versuche scheiterte am selben fehlenden Beleg, und
der groesste Teil des Lernstoffs blieb unerreichbar.

Das Material hat deshalb zwei unterscheidbare Rollen:

| Rolle | Was das Material festlegt | Massstab des Kontrolleurs |
|---|---|---|
| **Wahrheitsquelle** | was richtig ist (Lehrbuch, Skript) | `coverage` — die Antwort muss belegbar sein |
| **Themenquelle** | was drankommt (Dossier, Fragenkatalog) | `consistency` — richtig, widerspruchsfrei, trifft die Frage |

Der zweite Massstab wird **nicht gewaehlt, sondern festgestellt**: Er greift ausschliesslich, wenn
der Kontrolleur den Auszug im ersten Durchgang selbst als „stellt die Frage, ohne sie zu
beantworten" beurteilt hat (`SourceCheckResult.posesQuestionOnly`). Ein Konzept ohne jeden
Materialbezug faellt weiterhin durch — das Gehirn erfindet sich keinen Lehrplan.

Fehlt die Antwort im Material, wird sie in dieser Reihenfolge beschafft:

1. **Websuche** (`GenerateTaskArgs.searchWeb`). Die Ergebnisse wandern in den Auszug; damit gilt
   wieder der normale Deckungsmassstab, die Antwort ist belegt — nur nicht durch das Dossier.
   `answerProvenance: 'web'`.
2. **Fachwissen des Modells**, geprueft unter `standard: 'consistency'` und auf dem staerkeren
   Modell (`escalate`), weil der Quellenabgleich als Schutz entfaellt und dann die Modellguete der
   einzige verbliebene ist. `answerProvenance: 'model'`.

**Beides wird dem Nutzer angezeigt** (`ui/sessionView.answerProvenanceNote`,
`.brain-session-provenance`). Das ist dieselbe Haltung wie bei I4 auf Konzeptebene, eine Ebene
hoeher: nicht verschweigen, sondern benennen. Wer lernt, soll wissen, was belegt ist und was er im
Unterricht gegenpruefen sollte.

| Art | Fundstelle |
|---|---|
| Typ | `GeneratedTask.answerProvenance` |
| Vertrag | `SourceCheckResult.posesQuestionOnly`, `ControllerRequest.standard` |
| Code | Verzweigung in `production/generateTask.ts` nach dem Quellenabgleich |
| Oberflaeche | `answerProvenanceNote` in `ui/sessionView.ts`, gerendert in `components/BrainSession.tsx` |

### Die Ablehnung geht zurueck an den Generator

Der Kontrolleur lehnt eine Aufgabe **mit Begruendung** ab („die Musterloesung ergaenzt X, das steht
nicht im Auszug"). Bis diese Begruendung weitergereicht wurde, warf `generateClearedTask` sie weg
und rief den Generator mit **exakt derselben Ausgangslage** erneut auf — dasselbe Konzept, derselbe
Auszug, dasselbe Format. Nach **I11** (gleiche Lage, gleiches Ergebnis) ist damit auch dieselbe
Ausgabe zu erwarten: `MAX_GENERATION_ATTEMPTS` Modellaufrufe, dreimal derselbe Mangel, ein Abbruch.

Deshalb wandert der Befund als `GeneratorRequest.rejectionHint` in den naechsten Versuch. Zwei
Punkte dazu sind wesentlich:

- **Kein Filter nach Fehlerart.** `buildRejectionHint` entfernt nur den zusammenfassenden Schluss-
  satz („laesst sich nicht verankern"), der keinen eigenen Befund traegt, und gibt alles Uebrige
  unveraendert zurueck — auch einen Ablehnungsgrund, den es heute noch gar nicht gibt. Eine
  Rueckkopplung, die jeden Grund gleich behandelt, altert nicht; eine Liste bekannter Sonderfaelle
  schon.
- **Getrennt von `lastErrorHint`.** Der eine nennt einen Fehler der lernenden Person, an dem die
  Aufgabe ansetzen soll (I8), der andere einen Mangel der letzten Modellausgabe. In einem
  gemeinsamen Feld verdraengt der zweite den ersten.

Die Grenze zu I5 bleibt unberuehrt: der Torwaechter urteilt weiter allein anhand des Auszugs. Es
aendert sich nur, was der Generator **vor** dem naechsten Urteil weiss.

| Art | Fundstelle |
|---|---|
| Code | `buildRejectionHint` in `production/quality.ts` (rein, getestet) |
| Vertrag | `GeneratorRequest.rejectionHint` |
| Ablauf | Zweig `outcome.status === 'retry'` in `production/generateTask.ts` |
| Prompt | Abschnitt „Wurde dein letzter Versuch verworfen" der Rolle Generator (beide Kopien) |

---

## I6 — Zerstoererische Aenderungen: Bestaetigung und Protokoll mit Ruecknahme

> Ein System, das sich selbst umbaut und seine Vergangenheit loescht, ist nicht diagnostizierbar.

| Art | Fundstelle |
|---|---|
| Guard | `assertProposalSafe`, `assertLogEntryComplete` |
| Datenbank | `learn_structure_proposals_destructive_needs_confirmation` |
| Datenbank | `learn_structure_log_undo_not_empty` — `undo_payload` NOT NULL **und** nicht `{}` |
| Code | `parseConsolidatorResult` verwirft Verschmelzungsvorschlaege ohne Frage an den Nutzer |
| Reihenfolge | `recordStructureChange` laeuft **vor** der Aenderung |
| Test | `invariants.test.ts`, `consolidation.test.ts`, `agents.test.ts` |

Drei Dinge, die leicht uebersehen werden und alle abgesichert sind:

- Eine Bestaetigung **ohne Frage** ist keine Bestaetigung. `assertProposalSafe` verlangt einen
  nicht-leeren Fragetext.
- Ein Protokoll mit leerem Ruecknahme-Payload existiert, ist aber wertlos — der
  Datenbank-Constraint lehnt `{}` ausdruecklich ab.
- Der Protokolleintrag wird **vor** der Aenderung geschrieben. Umgekehrt koennte eine Aenderung
  ohne Ruecknahmeanleitung zurueckbleiben.

---

## I7 — Keine Strukturfragen waehrend einer Lernsitzung

> Unterbrechungen im Lernfluss zerstoeren die Sitzung und werden reflexhaft weggeklickt.

| Art | Fundstelle |
|---|---|
| **Typ** | `StructureProposal.surfaceContext` kennt nur `sessionStart` und `mapReview` |
| Datenbank | `surface_context` Check ohne einen Wert fuer „waehrend der Sitzung" |
| Datenbank | `expires_at` NOT NULL — unbeantwortete Fragen verfallen |
| Test | `consolidation.test.ts` |

„Mitten im Lernen" ist kein moeglicher Wert, nicht bloss ein unerwuenschter. Zusaetzlich braucht
jeder Vorschlag ein Verfallsdatum (21 Tage), sonst waechst ein Berg unbeantworteter Fragen.

---

## I8 — Jede ausgespielte Aufgabe hat eine Begruendung

> Gewichtete Auswahl ohne Erklaerung wirkt wie Zufall. Zufall zerstoert Vertrauen.

| Art | Fundstelle |
|---|---|
| Guard | `assertHasReason` in `explainSelection` und `explainInsert` |
| Datenbank | `learn_task_log_reason_not_blank` — eine Aufgabe ohne Satz ist nicht speicherbar |
| Code | `explainSelection` ist deterministisch und braucht **kein** Modell |
| Test | `explanation.test.ts`, `planner.test.ts` |

**Warum der Satz nicht vom Modell kommt:** die Rolle „Erklaerer" darf ihn glaetten, aber nie die
Voraussetzung dafuer sein, dass es ihn gibt. Ein Modellaufruf kann langsam sein, teuer sein oder
ausfallen — im Ausfall stuende die Aufgabe ohne Begruendung da. `acceptPolished` verwirft eine
geglaettete Fassung, die leer, zu lang oder mehrsaetzig ist, und faellt auf die Vorlage zurueck.

Ein Test prueft ausserdem, dass kein Satz Fachjargon enthaelt: „Propagation", „Konfidenz" und
„Voraussetzungskante" kommen nicht vor. Der Nutzer soll seinen eigenen Stoff wiedererkennen,
nicht die Architektur.

---

## I9 — Wiederholungs-Mindestreserve in jeder Sitzung

> Sonst ist nach der Pruefung alles Fruehere verfallen.

| Art | Fundstelle |
|---|---|
| Code | `reviewReserveSlots` in `planner/planner.ts` — die einzige Stelle, an der der Boden gerechnet wird |
| Guard | `assertReviewReserveHeld` — prueft gegen genau dieses Ergebnis, statt es nachzurechnen |
| Datenbank | `learn_task_log.from_review_reserve` haelt fest, welche Aufgabe aus der Reserve kam |
| Test | `planner.test.ts` |

**Zwei Grenzen, die der Boden einhalten muss:**

- Er darf **nie die ganze Sitzung** belegen (`sessionSize - 1`). Sonst waere er kein Boden,
  sondern eine Decke, und ein gesetztes Ziel kaeme nie an die Reihe — was Kapitel 6.2 aushebelt.
- Er greift erst ab drei Aufgaben. Eine Sitzung aus ein oder zwei Aufgaben ist ein Bruchstueck.

Guard und Planer teilen sich bewusst **eine** Rechnung. Rechnete der Guard den Boden selbst nach,
koennten beide auseinanderlaufen, und der Guard pruefte eine Regel, die der Planer gar nicht
verfolgt.

---

## I10 — Struktur und Person getrennt gespeichert

> Haelt die Tuer fuer einen spaeteren geteilten Strukturlayer offen, ohne Architekturumbau.

| Art | Fundstelle |
|---|---|
| **Typ** | `BrainConcept` hat kein einziges Leistungsfeld |
| Datenbank | `learn_concepts` ohne `user_id`; `learner_concept_brain_states` mit `user_id` als PK-Teil |
| Code | `loadKnowledgeGraph` gibt keine Leistungsdaten zurueck, `loadLearnerImages` keine Struktur |

Waeren beide vermischt, waere der spaetere Schritt zu einem geteilten Strukturlayer praktisch
unmoeglich. So ist er eine Migration, kein Neubau.

---

## I11 — Der Planer ist deterministisch

> Reproduzierbarkeit, Testbarkeit, Debugbarkeit. Verlaesslichkeit schlaegt hier Cleverness.

| Art | Fundstelle |
|---|---|
| **Typ** | `BrainAgentRole` enthaelt `planer` nicht — die Rolle ist nicht ausdrueckbar |
| Datenbank | `learn_brain_agent_models.role` Check kennt `planer` nicht |
| Datenbank | `admin_set_learn_brain_agent_model` lehnt `planer` mit eigener Fehlermeldung ab |
| Struktur | `planner/` importiert nichts aus `agents/` |
| Test | `planner.test.ts` prueft, dass zweimal dieselbe Sitzung herauskommt — auch bei umgedrehter Eingabereihenfolge |

Auch die Formatwahl ist deterministisch: sie rotiert ueber den Versuchszaehler statt ueber
Zufall. Bei einer jede Sitzung neu berechneten Reihenfolge waere im Fehlerfall nie
unterscheidbar, ob eine seltsame Abfolge ein Bug oder eine kluge Entscheidung war.

Das Admin-Menue nennt den Planer trotzdem — mit einer Zeile, die erklaert, warum er auf keinem
Modell laeuft. Ihn stillschweigend wegzulassen wuerde die Frage offenlassen, und ein Administrator
haelt sein Fehlen dann fuer einen Fehler.

---

## I12 — Musternamen bleiben stabil

> Ein System, das dieselbe Sache jede Woche anders nennt, wirkt orientierungslos.

| Art | Fundstelle |
|---|---|
| Guard | `assertPatternNameStable` — laeuft in `upsertPattern` |
| Datenbank | `learn_error_patterns_name_unique (user_id, name)` |
| Code | `upsertErrorPattern` schreibt beim Fortschreiben nie einen neuen Namen |
| Code | Systemanweisung des Konsolidierers: „Ein bereits bestehender Name wird NIE geaendert." |
| Test | `invariants.test.ts`, `consolidation.test.ts` |

Ein Name aendert sich nur ueber eine **protokollierte Verschmelzung** — dieselbe Regel wie bei
Konzepten, also zerstoererisch mit Bestaetigung und Ruecknahme. Der alte Name bleibt als Zeile
stehen und zeigt ueber `merged_into_id` auf den neuen.

---

## Zusammenfassung

| # | Typ | Datenbank | Guard | Test |
|---|:---:|:---:|:---:|:---:|
| I1 | ● | ● | ● | ● |
| I2 | ● | ● | ● | ● |
| I3 | ● | ● | ● | ● |
| I4 | ● | ● | | ● |
| I5 | ● | | ● | ● |
| I6 | | ● | ● | ● |
| I7 | ● | ● | | ● |
| I8 | | ● | ● | ● |
| I9 | | ● | ● | ● |
| I10 | ● | ● | | |
| I11 | ● | ● | | ● |
| I12 | | ● | ● | ● |

I10 hat keinen Guard und keinen eigenen Test, weil ein Verstoss dagegen nicht zur Laufzeit
entsteht, sondern beim Entwurf: er waere ein Leistungsfeld in `BrainConcept` oder ein `user_id`
in `learn_concepts`. Beides faellt in der Ueberpruefung des Codes auf, nicht im Betrieb.
