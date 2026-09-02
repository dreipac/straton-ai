# 4 — Codekarte

Alles unter `src/features/learn/brain/`. Rein heisst: kein DOM, kein Netzwerk, keine Zeitquelle
ausser dem hereingereichten `nowIso` — und damit ohne Aufbau testbar.

```
src/features/learn/brain/
├── types.ts                    alle Datentypen, mit Kapitelbezug
├── invariants.ts               die zwoelf Regeln als ausfuehrbarer Code
├── index.ts                    oeffentliche Schnittstelle
│
├── memory/                     Schicht 2 — Gedaechtnis
│   ├── knowledgeGraph.ts       Voraussetzungsgraph, Ursachensuche, Front
│   ├── learnerImage.ts         Beherrschung, Sicherheit, Anwendungstiefe, Verfall
│   └── propagation.ts          Zweifel verteilen — nur auf die Sicherheit
│
├── perception/                 Schicht 3 — Wahrnehmung
│   ├── examiner.ts             Pruefer-Ausgabe validieren, Zuversicht auswerten
│   ├── evidence.ts             Kompositionswurzel: Bewertung rein, Zustand raus
│   └── chatSignals.ts          Chatverhalten — senkt nur die Sicherheit
│
├── planner/                    Schicht 4 — Exekutive (kein Modell)
│   ├── urgency.ts              die vier konkurrierenden Ansprueche
│   ├── goal.ts                 Ziel-Objekt und Machbarkeitsrechnung
│   ├── sprint.ts               knapper Termin: Leiter des Verzichts, zwei Grenzen
│   ├── planner.ts              deterministische Auswahl, Mindestreserve, „Spaeter"
│   ├── responsibility.ts       Grenze Wiederholung ↔ Pfad (6.7, neu in 1.1)
│   └── explanation.ts          Erklaerpflicht — der eine Satz
│
├── production/                 Schicht 5 — Produktion
│   ├── formats.ts              neun Formate, Tiefe und Gegenloesbarkeit (6.6)
│   ├── quality.ts              Quellenabgleich, Gegenloesen, Torwaechter
├── preparation/
│   ├── derive.ts               Schicht 0: Arbeitsheft -> Lehrstoff (Aufbereiter)
│   └── cartography.ts          Kartografenergebnis -> IngestedGraph
│   ├── generateTask.ts         der EINE Weg zu einer freigegebenen Aufgabe (I5)
│   ├── explanations.ts         die drei Erklaerstellen und ihre Freigabe (7.3)
│   ├── reviewStock.ts          Vorratserzeugung — nur fuer den Stapel (7.1)
│   └── prefetch.ts             historisch: versetzte Vorproduktion (unbenutzt seit Abw. 7)
│
├── consolidation/              Schicht 6 — Konsolidierung
│   ├── trigger.ts              Evidenzgewicht, Wartezeit, Cooldown
│   ├── patterns.ts             Fehlermuster gruppieren, taufen, anzeigen
│   ├── restructure.ts          Wertregeln, Entdeckung, Vorschlaege, Protokoll
│   ├── plan.ts                 was ein Lauf vorschlaegt: Sperrmenge, Obergrenzen
│   └── consolidator.ts         Bruecke zur Rolle (semantische Doppelungen, Musternamen)
│
├── coldstart/
│   └── frontSearch.ts          adaptive Suche nach der Front
│
├── path/
│   └── ordering.ts             fester Pfad mit adaptiven Einschueben
│
├── agents/                     Modellrollen
│   ├── roles.ts                Rollenregister mit Anforderungsprofilen
│   ├── modelRouting.ts         Vermittlungsschicht Rolle → Modell
│   ├── prompts.ts              Systemanweisungen je Rolle
│   ├── contracts.ts            Ein-/Ausgabevertraege und Parser
│   └── client.ts               ← einzige Netzwerkstelle ausserhalb services/
│
├── services/                   Persistenz (I/O)
│   ├── brainErrors.ts
│   ├── brainMemory.persistence.ts
│   ├── brainEvidence.persistence.ts
│   ├── brainGoals.persistence.ts
│   ├── brainConsolidation.persistence.ts
│   ├── brainReviewStock.persistence.ts
│   ├── brainStructureOps.ts    Handkorrekturen: umbenennen, Kanten, verschmelzen
│   └── brainAgentModels.persistence.ts
│
├── ui/                         Anbindung — rein, ohne React (UI-Spezifikation Kap. 15)
│   ├── pathView.ts             Kopf, Jetzt-Karte, Themenliste, Knoten-Panel
│   ├── sessionView.ts          Lernsitzung und Abschlussbilanz
│   ├── reviewView.ts           Wiederholen, Leerzustand, Abschluss
│   ├── insightsView.ts         Einsichten — mit I7-Sperre
│   ├── goalView.ts             Ziel setzen: Entwurf, Machbarkeit, Ausweg
│   └── materialView.ts         Quellen nach Herkunft getrennt (I4)
│
├── hooks/                      Zustand und Ablauf (React)
│   ├── useBrainPath.ts         der eine Datenhaushalt fuer alle Bildschirme
│   ├── useBrainSession.ts      die Lernsitzung, vollstaendige Vorproduktion (Abweichung 7)
│   ├── useBrainReview.ts       der Wiederholungsstapel
│   └── useBrainExplanation.ts  „Erklaeren lassen"
│
├── components/                 Darstellung (React)
│   ├── BrainPathTab.tsx        setzt Kopf, Jetzt-Karte, Liste, Einsichten zusammen
│   ├── BrainPathHeader.tsx     Fortschritt, Zaehler, Ziel-Chip
│   ├── BrainNowCard.tsx        der einzige primaere Handlungsweg
│   ├── BrainTopicList.tsx      Themen mit Knotenzustaenden (Form, nicht Farbe)
│   ├── BrainNodePanel.tsx      die drei Werte, Herkunft, Befund, Aktionen
│   ├── BrainNodeEditor.tsx     Handkorrektur inkl. Verschmelzungsdialog (I6)
│   ├── BrainGoalDialog.tsx     Ziel setzen mit Machbarkeitsaussage
│   ├── BrainSprintNotice.tsx   Umfangsvorschlag als Band unter der Jetzt-Karte (6.3)
│   ├── BrainExplanationDialog.tsx  quellengebundener Erklaertext
│   ├── BrainInsightsCard.tsx   Beobachtungen und Kartenfragen
│   ├── BrainSession.tsx        Lernsitzung im Vollbild
│   ├── BrainSessionSummary.tsx Abschlussbilanz
│   ├── BrainReviewTab.tsx      Uebersicht des Stapels
│   ├── BrainReviewStack.tsx    der Stapel im Vollbild (Enter prueft)
│   ├── BrainReviewCompletion.tsx  Termine statt Punktzahl
│   └── BrainSourcesSection.tsx Quellen im Material-Bereich
│
└── admin/
    └── BrainAgentModelsSection.tsx
```

`ui/` ist rein und ohne Aufbau testbar; `components/` und `hooks/` sind es nicht. Die Trennung
ist der Grund, warum ein Layoutumbau die Produktentscheidungen aus den Kapiteln 3.5, 4.7 und 4.8
nicht versehentlich mitnehmen kann — sie stehen nicht in den Komponenten.

Ausserhalb des Moduls:

```
supabase/functions/chat-completion/brainAgents.ts   Rollenaufloesung serverseitig
supabase/migrations/20260818*.sql                   vier Migrationen (Grundbestand)
supabase/migrations/20260819*.sql                   drei Migrationen (Fassung 1.1)
src/styles/learn-brain.css                          Stile aus bestehenden Tokens
src/features/chat/services/chatPrefill.ts           „Im Chat dazu fragen" — Uebergabe
```

---

## Abhaengigkeitsrichtung

```
                  types.ts ◄──── alles
                 invariants.ts ◄─ alle Schichten

  memory/  ◄──  perception/  ◄──  planner/  ──►  production/
     ▲              ▲                              (formats)
     │              │
  coldstart/     consolidation/
     │
   path/  ──► planner/explanation (fuer Einschub-Begruendungen)

  agents/  ────────────────────────────────►  contracts nutzen perception/examiner
  services/ ──► alle reinen Module (Mapping DB ↔ Typ)
```

**Zwei Regeln, die dauerhaft gelten:**

1. **`planner/` importiert nichts aus `agents/`.** Das ist Invariante I11 als Struktur. Wer diese
   Kante einzieht, hebt die Determiniertheit des Planers auf.
2. **`index.ts` exportiert `admin/` nicht.** Die oeffentliche Schnittstelle des Gehirns bleibt
   frei von React.

---

## Die wichtigsten Einstiegspunkte

| Wenn du … | dann fang hier an |
|---|---|
| eine Antwort bewerten willst | `perception/evidence.ts` → `perceiveGradedAnswer` |
| wissen willst, was als Naechstes kommt | `planner/planner.ts` → `planSession` / `planNextTask` |
| eine Aufgabe erzeugen willst | `production/formats.ts` → `selectFormat`, dann `agents/client.ts` |
| eine Aufgabe freigeben willst | `production/quality.ts` → `buildControlVerdict`, `assertTaskCleared` |
| ein Ziel setzen willst | `planner/goal.ts` → `assessGoal`, `describeFeasibility` |
| wissen willst, was bei knappem Termin noch hineinpasst | `planner/sprint.ts` → `planSprintScope` |
| wissen willst, ob der Zielumfang Vorrang hat | `planner/sprint.ts` → `sprintScopeOf` |
| den Pfad aufbauen willst | `path/ordering.ts` → `buildBaseOrder` |
| konsolidieren willst | `services/brainConsolidationRun.ts` → `runConsolidationIfDue` (Ablauf), `consolidation/plan.ts` (Auswahl) |
| wissen willst, ob ein Lauf faellig ist | `consolidation/trigger.ts` → `evaluateTrigger` |
| verstehen willst, warum ein Vorschlag NICHT kommt | `consolidation/plan.ts` → `suppressionKeys`, `MAX_MERGE_QUESTIONS_PER_RUN` |
| ein Modell tauschen willst | Admin-Menue „Gehirn-Agenten" — kein Code |
| wissen willst, ob ein Konzept in den Stapel gehoert | `planner/responsibility.ts` → `responsibilityFor` |
| einen Erklaertext ausliefern willst | `production/explanations.ts` → `assertExplanationCleared` |
| die Oberflaeche anbinden willst | `ui/` — eine Datei je Bildschirm aus Kapitel 15 |
| Struktur von Hand korrigieren willst | `services/brainStructureOps.ts` |

---

## Wiederverwendung der alten Engine

Das Gehirn baut auf `src/features/learn/engine/` auf, statt deren Mathematik zu duplizieren:

| Import | Was daraus kommt |
|---|---|
| `engine/bkt` | `updateMastery`, `seedPrior`, `DEFAULT_BKT_PARAMS` |
| `engine/forgetting` | `applyDecay`, `daysBetween`, `MASTERY_FLOOR` |

Neu ist nicht die Bayes-Rechnung, sondern **was sich bewegen darf und wie stark**. Die alte
Engine wurde nicht veraendert.

---

## Ein vollstaendiger Durchlauf

So haengt alles zusammen, am Beispiel einer beantworteten Aufgabe:

```ts
// 1 — Was kommt als Naechstes? (deterministisch, kein Modell)
const plan = planSession({ concepts, edges, images, goal, sessionSize: 8,
                           consecutiveFailures, nowIso })
const task = plan.tasks[0]          // traegt bereits seine Begruendung (I8)

// 2 — Erzeugen und pruefen
const spec = formatSpec(task.format)
const generated = parseGeneratorResult(
  (await callBrainAgent({ role: 'generator', payload: { ... } })).data,
)
const verdict = buildControlVerdict({
  task: generated,
  sourceAligned: sourceCheck.sourceAligned,
  counterAnswer: requiresCounterSolve(task.format) ? counter.answer : null,
})
assertTaskCleared(generated, verdict)   // I5 — Torwaechter

// 3 — Bewerten, mit Eskalation bei Zweifel (Kapitel 5.3)
const examined = await callWithEscalation({
  role: 'pruefer',
  payload: { ... },
  parse: (raw) => parseExaminerResult(raw, subject),
  needsEscalation: (v) => v.confidence < ESCALATION_THRESHOLD,
})

// 4 — Ins Lernerbild, inklusive Propagation (I1, I2, I3)
const result = perceiveGradedAnswer({
  userId, pathId, conceptId: task.conceptId,
  image, images, edges, verdict: examined.data,
  depth: task.depth, format: task.format, difficulty,
  escalationAvailable: escalationAvailable(bindings.get('pruefer')!),
  nowIso,
})

// 5 — Persistieren: bewertetes Konzept UND Nachbarn in einem Rutsch
await upsertLearnerImages(userId, [result.updated, ...result.propagated])
const eventId = await recordEvidenceEvent(result.event)
if (result.event.verdict.cause) {
  await recordErrorObservation({ ..., cause: result.event.verdict.cause })
}

// 6 — Evidenzgewicht buchen; der Lauf selbst haengt am Sitzungsende
await addEvidenceWeight({ userId, pathId, weight: result.event.evidenceWeight })

// ... und am Ende der Sitzung (useBrainPath.refreshAfterSession), nie mittendrin (I7):
void runConsolidationIfDue({ userId, pathId })   // prueft den Ausloeser selbst, wirft nie
```

---

## Testaufbau

663 Tests fuer das Gehirn, verteilt auf 30 Dateien.

| Datei | Schwerpunkt |
|---|---|
| `invariants.test.ts` | die zwoelf Regeln einzeln |
| `memory/learnerImage.test.ts` | Trennung der drei Werte, Verfall, Reaktionsstaerke |
| `memory/propagation.test.ts` | I3, Richtung, Daempfung, Zyklensicherheit |
| `memory/knowledgeGraph.test.ts` | Ursachensuche, Topologie, Herkunft |
| `perception/evidence.test.ts` | Zuversicht → Reaktion, Gewichte, Propagationsausloesung |
| `perception/chatSignals.test.ts` | I2 doppelt: Delta **und** Zustand |
| `planner/planner.test.ts` | Determinismus, Mindestreserve, Konfliktloesung |
| `planner/goal.test.ts` | Machbarkeit, ehrliche Aussage statt Zuspruch |
| `planner/sprint.test.ts` | Leiter des Verzichts, welche Grenze genannt wird, Tragweitenordnung |
| `ui/sprintView.test.ts` | wann die Sprintkarte erscheint, Vorschlag gegen Rueckhol-Angebot |
| `planner/explanation.test.ts` | I8, kein Fachjargon, Glaettungsgrenzen |
| `production/quality.test.ts` | Gegenloesen, Torwaechter, Antwortvergleich |
| `preparation/derive.test.ts` | drei Arten im Arbeitsheft, Lehrtext, Recherchebedarf |
| `preparation/cartography.test.ts` | Uebersetzung ins Konzeptnetz, Aufbereitungssperre |
| `utils/ragLite.test.ts` | Beleg- gegen Antwort-Betriebsart der Materialsuche |
| `utils/documentParser.test.ts` | was die Texterkennung ueber den Textlayer hinaus beitraegt |
| `production/prefetch.test.ts` | ueberholte Vorproduktion wird verworfen |
| `coldstart/frontSearch.test.ts` | Suchraumhalbierung **ohne** Lernerbild-Aenderung |
| `consolidation/consolidation.test.ts` | Ausloeser, Wertregeln, Entdeckung, Protokoll, Musternamen |
| `consolidation/plan.test.ts` | Sperrmenge, Obergrenzen, drei Wege der drei Operationen |
| `consolidation/consolidator.test.ts` | erfundene IDs, Verschmelzung ohne Frage (I6) |
| `path/ordering.test.ts` | Positionen bleiben stehen, Nenner bleibt stabil |
| `agents/agents.test.ts` | Rollentrennung, Vertraege, Systemanweisungen |
| `agents/modelRoutingConsistency.test.ts` | die drei Kopien der Konfiguration |
| `planner/responsibility.test.ts` | Stapel gegen Pfad, Hysterese, gespeicherte statt verfallene Werte |
| `production/explanations.test.ts` | die drei Stellen, Umfangsgrenzen, Freigabe (I4, I5) |
| `production/reviewStock.test.ts` | Rotation, Fingerabdruck ohne Verfall, `assertReviewOnly` |
| `ui/pathView.test.ts` | Kopf, Jetzt-Karte, Knotenzustaende, Herkunftszeile |
| `ui/sessionView.test.ts` | Platzbelegung, Fortschritt, Bilanzreihenfolge |
| `ui/reviewInsights.test.ts` | Stapel, Leerzustand mit Angabe, I7 in der Einsichten-Karte |
| `ui/goalMaterialView.test.ts` | Machbarkeit mit konkretem Ausweg, Herkunft in vier Toepfen |

### Der Konsistenztest verdient eine eigene Erklaerung

Die Vermittlungsschicht existiert notgedrungen **dreifach** — im Frontend, in der Datenbank und
in der Edge Function —, weil diese drei keinen gemeinsamen Modulraum haben. Solche Kopien laufen
mit der Zeit auseinander, und der Ausfall waere unangenehm still: die Admin-Auswahl boete ein
Modell an, das die Datenbank ablehnt.

`modelRoutingConsistency.test.ts` liest die Migration und das Edge-Modul als **Text** und
vergleicht Modell-Listen, Rollennamen, Notbelegungen und Cache-Schluessel mit der
TypeScript-Fassung. Er ersetzt keine Migration, aber er faengt das Auseinanderlaufen.

### Ausfuehren

```bash
npx vitest run src/features/learn/brain     # nur das Gehirn
npm test                                     # alles
```
