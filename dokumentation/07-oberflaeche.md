# 7 — Die Oberflaeche

**Bezugsdokument:** [`../straton-ui-spezifikation.md`](../straton-ui-spezifikation.md).
Bei Widerspruechen zwischen UI-Spezifikation und Architekturdokument gilt das
Architekturdokument.

`straton-prototyp.html` zeigt Verhalten und Zustandswechsel, ist aber **kein Styleguide**:
Farben, Abstaende und Typografie kommen aus dem bestehenden Designsystem
(`src/styles/*.css`, `var(--color-*)`).

---

## Drei Schichten, und warum es drei sind

```
brain/ui/          rein    was auf den Bildschirm gehoert und wie es heisst
brain/hooks/       Ablauf  wann geladen, erzeugt, bewertet und geschrieben wird
brain/components/  Form    wie es aussieht
```

Die mittlere Schicht ist die uebliche. Die erste ist der eigentliche Punkt: **Kapitel 15 der
UI-Spezifikation ist eine Tabelle, und eine Tabelle laesst sich pruefen.** Jede Datei in `ui/`
setzt genau einen ihrer Abschnitte um und ist ohne Aufbau testbar. Stuende die Zuordnung in den
Komponenten, waere sie beim naechsten Layoutumbau Verhandlungssache.

Was dadurch geschuetzt ist, sind keine Kleinigkeiten:

| Entscheidung | steht in | waere in einer Komponente verloren |
|---|---|---|
| Einsichten nie waehrend einer Sitzung (I7) | `insightsView.ts` | ein vergessener Filter, und der Vorschlag erscheint mitten im Lernen |
| Werte erst in der Bilanz (4.8) | `sessionView.ts` | eine hilfreiche Prozentanzeige, und die Sitzung wird zur Notenvergabe |
| Zaehler nennt Konzepte, nicht Karten (5.7) | `reviewView.ts` | „17 Abfragen", die ohne Nutzerhandlung auf 14 springen |
| Herkunftszeile am Knoten (I4) | `pathView.ts` | eine Zeile weniger, und KI-Ergaenztes sieht aus wie Skriptstoff |

---

## Zuordnung Bildschirm → Datei

| Bildschirm (Kap. 15) | Anbindung | Komponente |
|---|---|---|
| Lernpfad-Kopf | `pathView.buildPathHeader` | `BrainPathHeader` |
| Jetzt-Karte | `pathView.buildNowCard` | `BrainNowCard` |
| Themenliste | `pathView.groupIntoTopics` | `BrainTopicList` |
| Knoten-Panel | `pathView.buildNodePanel` | `BrainNodePanel` |
| Lernsitzung | `sessionView.buildSessionView` | `BrainSession` |
| Abschlussbilanz | `sessionView.buildSessionSummary` | `BrainSessionSummary` |
| Wiederholen | `reviewView.buildReviewOverview` | `BrainReviewTab`, `BrainReviewStack` |
| Einsichten | `insightsView.buildInsightsCard` | `BrainInsightsCard` |
| Ziel setzen (Kap. 7) | `goalView.buildGoalPreview` | `BrainGoalDialog` |
| Quellen (Kap. 6) | `materialView.buildMaterialSources` | `BrainSourcesSection` |

---

## Tabs nach Absicht (Kapitel 3.2)

| Tab | Absicht | Inhalt |
|---|---|---|
| **Pfad** | lernen | Jetzt-Karte, Themenliste, Einsichten |
| **Wiederholen** | auffrischen | faelliger Stapel, mit Zaehler im Tab |
| **Material** | nachschlagen, exportieren | Quellen, Arbeitsblaetter |

Tabs mit den Namen „Quiz", „Lernkarten", „Arbeitsblaetter" wuerden die Formatwahl an den Nutzer
abgeben. Das Format ist aber eine Planerentscheidung, abgeleitet aus der Anwendungstiefe —
Format-Tabs machen das Gehirn umgehbar.

**Der Umbau laeuft schrittweise.** In `LearnPage.tsx` entscheidet `brainPath.isAvailable`, welche
Fassung eines Bereichs erscheint: liegt fuer den Pfad ein Wissensgraph mit Lernerbild vor,
uebernimmt die Gehirn-Oberflaeche; sonst bleibt die bisherige Ansicht unveraendert stehen. Kein
Bereich verschwindet, bevor sein Nachfolger traegt. Auch die Beschriftungen haengen daran —
„Lernkarten" heisst „Wiederholen", sobald der Stapel dahinter steht.

Deshalb laedt `useBrainPath`, sobald ein Pfad aktiv ist, und nicht erst im Pfad-Tab: waere der
Datenhaushalt an einen Tab gebunden, wechselte die Beschriftung beim Hinsehen zurueck.

---

## Die vier Hooks

### `useBrainPath` — ein Datenhaushalt fuer alle Bildschirme

Ein Hook statt vieler. Waeren es mehrere, wuerde nach einer Antwort die Kopfzeile aktualisiert,
die Liste darunter aber noch nicht — ein Bildschirm, der sich in Teilen aktualisiert, wirkt
kaputt.

Er plant, entscheidet aber nichts: `planSession` ist rein und deterministisch (I11). `nowIso`
wird **einmal je Planung** genommen, nicht bei jedem Rendern — sonst koennten zwei
Renderdurchgaenge in derselben Sekunde verschiedene Sitzungen ergeben.

**„Spaeter"** (3.3) liegt hier als Oberflaechenzustand, nicht in der Datenbank: es heisst „jetzt
nicht", nicht „nie". Der naechste Besuch ist ein neues Jetzt. Der Planer nimmt zurueckgewiesene
Konzepte aus der Rangliste — ihre Dringlichkeit melden sie weiterhin, sie kommen nur nicht dran.

### `useBrainSession` — die Lernsitzung

Der geschlossene Kreislauf an der Oberflaeche: Planer waehlt, Generator erzeugt, Kontrolleur gibt
frei, Pruefer bewertet, Wahrnehmung schreibt, Propagation verteilt Zweifel.

Zwei Regeln sind verdrahtet und nicht verhandelbar:

- **I5.** Keine Aufgabe erreicht den Nutzer ohne Kontrolleur-Befund. Der Torwaechter wirft, statt
  zu warnen — und zwar fuer JEDE Aufgabe einzeln, unabhaengig davon, wann sie erzeugt wurde.
- **Kapitel 4.8.** Waehrend der Sitzung gibt der Hook keine aktualisierten Werte heraus.

**Erzeugungszeitpunkt — Abweichung von Kapitel 7.1.** Der Hook erzeugt beim Start einer Sitzung
ALLE geplanten Aufgaben gleichzeitig, nicht nur die naechste. Nur die erste Aufgabe hat noch
unvermeidbare Wartezeit; die uebrigen laufen im Hintergrund mit, waehrend die Person liest und
antwortet. Grund: bei versetzter Vorproduktion (nur je eine Aufgabe im Voraus) wartete faktisch
jede Aufgabe, sobald die Person schneller antwortete als die Hintergrunderzeugung hinterherkam.
`produceSlot` buendelt laufende und fertige Erzeugungen je Platz, `prefetchRest` stoesst sie beim
Start an, `next()` liefert einen fertigen Platz ohne Wartezeit aus. Details im Kopfkommentar von
`hooks/useBrainSession.ts` und in `06-stand-und-offenes.md`, Abweichung 7.

### `useBrainReview` — der Wiederholungsstapel

Getrennt von der Sitzung, weil die Zustaendigkeiten getrennt sind (5.1): der Pfad arbeitet an
Fehlern und Luecken, der Stapel gegen den Verfall. Ein gemeinsamer Zustand haette die Grenze zu
einer Einstellung gemacht, die man versehentlich anders setzt.

Was hineindarf, entscheidet `planner/responsibility.ts` und sonst nichts. Die Abfragen kommen aus
dem Vorrat (7.1) und rotieren; erzeugt wird neu, sobald sich im Lernerbild etwas geaendert hat.

### `useBrainExplanation` — „Erklaeren lassen"

Ein Erklaertext ist eine eigene Erzeugungsart mit eigener Freigabe (7.3), keine Aufgabe ohne
Frage. Welche Stelle gilt, entscheidet der Zustand des Konzepts: unberuehrt heisst Einstieg,
alles andere heisst vollstaendige Erklaerung auf Anforderung. Ein frei waehlbarer Umfang waere
die Hintertuer, durch die Straton zum Lehrbuch wird.

---

## Handkorrekturen (3.6)

`Knoten bearbeiten` ist Pflicht, „weil der Kartograf Fehler macht und die Konsolidierung nicht
alles repariert". Drei Eingriffe, in `services/brainStructureOps.ts`:

| Eingriff | umkehrbar | Protokoll | Bestaetigung |
|---|---|---|---|
| umbenennen | ja | nein | nein |
| Voraussetzung ergaenzen/streichen | ja | ja | nein |
| zusammenlegen | **nein** | ja | **ja (I6)** |

Beim Zusammenlegen laeuft die Reihenfolge streng: erst der Protokolleintrag mit
Ruecknahmeanleitung, dann die konservative Wertregel (8.3), dann Kanten umhaengen, dann die
**Belege** umhaengen, erst zuletzt loeschen. Der vorletzte Schritt ist der Grund, warum hier
nicht einfach geloescht wird: die Fremdschluessel raeumen sonst Evidenzereignisse,
Fehlerbeobachtungen und Aufgabenprotokoll mit weg — und genau diese Belege sind der Grund, warum
das Lernerbild ueberhaupt etwas behauptet.

Der Bestaetigungsdialog kuendigt die Wertregel woertlich an (`MERGE_VALUE_WARNING`). Ohne diesen
Satz sieht die Person Fortschritt verschwinden und haelt es fuer einen Fehler.

---

## Antworten des Nutzers, die zurueckfliessen

| Handlung | Wirkung | bewegt Werte? |
|---|---|---|
| `Spaeter` an der Jetzt-Karte | Planer waehlt neu und begruendet erneut | nein (I1) |
| `Kommt hin` an einer Beobachtung | Muster bleibt, meldet sich nicht mehr | nein |
| `Stimmt nicht` an einer Beobachtung | Widerspruch wird festgehalten, Muster bleibt bestehen | nein |
| `Ja, zusammenlegen` an einer Kartenfrage | Umbau wird ausgefuehrt, nicht nur der Status gesetzt | ja, nach 8.3 |
| `Weiss ich nicht` an einer Kartenfrage | Vorschlag bleibt offen und verfaellt ueber seine Frist | nein |

Ein bestrittenes Muster wird **nicht geloescht**, sondern markiert: geloescht waere die
Information weg; markiert bleibt sie als Beobachtung ueber die Beobachtung.

---

## Stile

`src/styles/learn-brain.css`, eingebunden in `src/main.tsx` nach `learn-map.css`. Ausschliesslich
bestehende Tokens.

Die einzige gestalterische Vorgabe, die aus der Spezifikation stammt und nicht aus dem
Designsystem, steht in Kapitel 3.5: **der Knotenzustand steckt primaer in der Form, nicht in der
Farbe.** Leerer Kreis, gestrichelter Rand, vollflaechig gefuellt, Halo — Farbenblindheit und ein
einzelner Akzentfarbwechsel duerfen die Bedeutung nicht zerstoeren.

---

## Was an der Oberflaeche noch fehlt

- **`Das ist mir wichtig`** am Knoten (5.5): erhoeht die Dringlichkeit beim Planer, ohne Werte
  anzufassen. Der Hebel ist beschrieben, aber nicht gebaut.
- **Chatsignal-Schalter** in den Einstellungen samt `CHAT_SIGNALS_DISCLOSURE` (5.1). Die Daten
  stehen (`profiles.learn_brain_chat_signals_enabled`), die Bedienung fehlt.
- **Anstoss der Konsolidierung** am Sitzungsbeginn: `evaluateTrigger` sagt, *ob* ein Lauf faellig
  ist; wer ihn ausloest, ist weiterhin nicht verdrahtet.
- **`Ins Lernpfad aufnehmen`** als Einzelhandlung im Chat (Kapitel 11). Heute entstehen Konzepte
  aus einem Chat nur ueber den Weg „Lernpfad anlegen" und die anschliessende Ingestion — ein
  einzelner Chatabschnitt laesst sich nicht gezielt als Konzept aufnehmen.
