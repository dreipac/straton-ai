# 1 — Ueberblick: der geschlossene Kreislauf

Das Gehirn besteht aus fuenf Funktionsbereichen, die einen **geschlossenen Kreis** bilden. Der
Rueckweg ist das Entscheidende: ohne ihn waere es eine Pipeline, kein Gehirn.

```
        Material und Chat
               │
               ▼
         ┌───────────┐
         │ Kartograf │ ──────────────►  Wissensgraph
         └───────────┘                   (Struktur)
                                              │
   ┌───────────────┐                          │
   │ Konsolidierer │ ────►  Lernerbild  ◄─────┤
   └───────────────┘        (Person)          │
           ▲                   │   ▲          │
           │                   ▼   │          ▼
           │              ┌──────────────────────┐
           │              │  Planer (feste Logik) │
           │              └──────────────────────┘
           │                        │
           │                        ▼
           │              ┌───────────┐    ┌──────────────┐
           │              │ Generator │───►│ Kontrolleur  │───► Nutzer
           │              └───────────┘    └──────────────┘        │
           │                                                       │
           │                        ┌─────────┐                    │
           └────────────────────────│ Pruefer │◄───────────────────┘
                                    └─────────┘
```

Der Umlauf in sechs Schritten:

1. **Aufnahme** — Material und Chats kommen herein, der Kartograf zerlegt sie in Konzepte und
   zeichnet die Voraussetzungen.
2. **Gedaechtnis** — Wissensgraph (der Stoff) und Lernerbild (die Person) werden getrennt gefuehrt.
3. **Entscheidung** — der Planer waehlt deterministisch aus, was als Naechstes drankommt.
4. **Produktion** — der Generator erzeugt in Echtzeit, der Kontrolleur prueft, der Nutzer arbeitet.
5. **Wahrnehmung** — der Pruefer bewertet und diagnostiziert, das Ergebnis fliesst zurueck.
6. **Konsolidierung** — im Hintergrund wird verdichtet, korrigiert und umgebaut.

---

## Schicht 1 — Aufnahme (Kartograf)

**Code:** `agents/prompts.ts`, `agents/contracts.ts`
**Bezug:** Kapitel 3

Der Kartograf ist die einzige Rolle, die aus unstrukturiertem Input Struktur macht, und der
**empfindlichste Punkt der gesamten Architektur**. Was er falsch zuordnet, ist an jeder spaeteren
Stelle falsch: der Planer plant auf einer schiefen Karte, der Pruefer diagnostiziert am falschen
Knoten, die Propagation verteilt Zweifel in die falsche Richtung.

Zwei Dinge sind hier nicht verhandelbar:

- **Das Material ist der Anker.** Die KI darf ergaenzen, aber jede Ergaenzung ist markiert.
- **Jedes Konzept traegt seine Herkunft** (Invariante I4). `parseCartographerResult` verwirft
  Konzepte, die sich als „aus dem Material" ausgeben, ohne einen Beleg zu nennen — sie werden
  nicht mit einem Standardwert aufgefuellt, sondern mit Grund abgelehnt.

Aufloesung: **Konzeptebene**. Nicht „Subnetting", sondern „Subnetzmaske aus Hostanzahl ableiten".
Auf Themenebene koennte das Gehirn nur sagen „du kannst Subnetting zu 60 Prozent" — es wuesste
nicht, *was* die fehlenden 40 Prozent sind.

---

## Schicht 2 — Gedaechtnis

**Code:** `memory/knowledgeGraph.ts`, `memory/learnerImage.ts`, `memory/propagation.ts`
**Bezug:** Kapitel 4

Zwei getrennt gefuehrte Ebenen. Die Trennung ist Invariante I10, keine Stilfrage.

### Wissensgraph — die Landkarte des Stoffs

Ein gerichteter **Voraussetzungsgraph**: Kante von A nach B bedeutet, B setzt A voraus. Nur eine
gerichtete Abhaengigkeit erlaubt **Ursachenforschung** — wenn jemand bei der Subnetzmaske
scheitert, geht `findRootCauses` die Kette rueckwaerts und findet die eigentliche Luecke bei den
Zweierpotenzen. Eine reine Hierarchie sagt, wo etwas steht, nicht warum jemand scheitert.

Der Graph enthaelt **keine** personenbezogenen Leistungsdaten. `BrainConcept` hat kein einziges
Leistungsfeld. Das haelt die Tuer fuer einen spaeter geteilten Strukturlayer offen.

### Lernerbild — was das Gehirn ueber die Person weiss

Drei Werte pro Konzept:

| Wert | Bedeutung | Wer darf ihn bewegen |
|---|---|---|
| **Beherrschung** | wie gut die Person das Konzept kann | ausschliesslich direkte Evidenz (I1) |
| **Sicherheit** | wie belastbar diese Einschaetzung ist | Evidenz (hoch), Propagation und Chat (nur runter) |
| **Anwendungstiefe** | Erkennen / Anwenden / Uebertragen | direkte Evidenz auf der jeweiligen Stufe |

Die Beherrschung reagiert **umso schwaecher, je mehr Evidenz schon vorliegt**
(`responsivenessFor`). Das ist der Kaltstart-Mechanismus aus Kapitel 9 als stetige Kurve statt
als Schalter: der erste Eindruck praegt stark, der hundertste kaum noch.

Die Anwendungstiefe gilt erst ab zwei Versuchen und 60 Prozent Trefferquote als belegt. Eine
einzelne gelungene Transferaufgabe macht niemanden zum Uebertrager.

### Propagation

Laeuft in **beide Richtungen** — rueckwaerts als Ursachensuche, vorwaerts als Vorsicht — und ist
zweifach begrenzt:

1. Sie beruehrt **ausschliesslich die Sicherheit** (I3). Der Rueckgabetyp `ConfidenceAdjustment`
   hat kein Beherrschungsfeld. Das ist die Absicherung: wer hier die Beherrschung bewegen wollte,
   muesste den Typ aendern und faellt damit auf.
2. Sie ist **gedaempft und stoppt nach zwei Kanten**. Ohne diese Grenze reisst ein einzelner
   Fluechtigkeitsfehler in einem tiefen Graphen das halbe Lernerbild ein.

Vorwaerts wirkt sie schwaecher als rueckwaerts (Faktor 0.6): ein Fehlschlag sagt mehr ueber seine
Grundlagen aus als ueber das, was darauf aufbaut.

---

## Schicht 3 — Wahrnehmung (Pruefer)

**Code:** `perception/examiner.ts`, `perception/evidence.ts`, `perception/chatSignals.ts`
**Bezug:** Kapitel 5

Zwei zugelassene Signalquellen, sehr unterschiedlich behandelt:

| | bewertete Aufgabe | Chatverhalten |
|---|---|---|
| Menge | selten | haeufig, Hauptdatenquelle |
| Grundgewicht | 1.0 | 0.05 |
| Darf Beherrschung erhoehen | ja | **nie** (I2) |
| Wirkt primaer auf | Beherrschung | Sicherheit, Verdachtsmarkierung |

Zwanzig Chatnachrichten wiegen damit genauso viel wie **eine** bewertete Aufgabe. Das ist der
Grund, warum reine Vielrederei die Konsolidierung nicht ausloest.

### Der Pruefer liefert drei Dinge

**Teilpunkte** — nicht nur richtig oder falsch. „Rechenweg korrekt, Ergebnis falsch" ist eine
andere Diagnose als „Ansatz falsch".

**Fehlerursache** — halbstrukturiert: eine feste Auswahl (`confused` / `omitted` / `misapplied` /
`overlooked`) plus ein freies Objekt. Freiheit im Inhalt, Disziplin in der Form. Reine Prosa
liesse sich spaeter nicht gruppieren, eine feste Auswahlliste wuerde Fachspezifisches nie finden.

**Zuversicht** — und das ist die wichtigste der drei Angaben.

### Warum die Zuversicht alles steuert

Ein Pruefer ohne Zuversichtsangabe behauptet bei Auslegungssache genauso selbstbewusst etwas wie
bei einem eindeutigen Fall. `reactionFor` uebersetzt sie in drei Verhalten:

| Zuversicht | Reaktion |
|---|---|
| ab 0.6 | Bewertung wirkt voll |
| 0.45 bis 0.6 | Bewertung wirkt gedaempft, dieselbe Sache kommt spaeter anders verpackt |
| unter 0.45 | Fall geht an ein **staerkeres Modell**, das Lernerbild bleibt vorerst unberuehrt |

Hier wird die Mehrmodellarchitektur zum ersten Mal funktional statt dekorativ: das schnelle,
guenstige Modell erledigt den Normalfall, das teure wird nur bei Zweifel geweckt. Derselbe
Mechanismus wie im biologischen Gehirn — Routine laeuft automatisch, Zweifel zieht Aufmerksamkeit an.

Zusaetzlich wertet `calibrateConfidence` die Zuversicht ab, wenn die Teilpunkte in sich nicht
schluessig sind (Gesamtwert 1.0 bei durchweg leeren Teilpunkten ist ein Modellfehler).

### Chatsignale

Vier Arten, nach Aussagekraft gestaffelt: dieselbe Frage wiederholt (0.12), abgebrochene
Erklaerung (0.08), Frage nach der Loesung (0.06), Frage nach dem Warum (0.02). Wer nach dem
Warum fragt, steht anders da als wer nach der Loesung fragt.

Wiederholung ueber **Zeit** zaehlt, nicht Wiederholung in einer Sitzung: dieselbe Frage dreimal
in fuenf Minuten ist ein Gespraech, dreimal ueber drei Wochen ist eine Luecke.

Der Nutzer kann Chat als Signalquelle **abschalten**
(`profiles.learn_brain_chat_signals_enabled`). Ohne diesen Schalter fuehlt sich die
niedrigschwellige Chatnutzung ueberwacht an — und genau sie ist der Einstiegstrichter des
Produkts. Der zugehoerige Erklaertext steht als `CHAT_SIGNALS_DISCLOSURE` bereit.

---

## Schicht 4 — Exekutive (Planer, keine KI)

**Code:** `planner/urgency.ts`, `planner/goal.ts`, `planner/planner.ts`,
`planner/responsibility.ts`, `planner/explanation.ts`
**Bezug:** Kapitel 6 (mit 6.6 und 6.7 in der Fassung 1.1)

Der Planer ist **deterministisch** (I11). `planner/` importiert nichts aus `agents/` und wird es
nie tun. Ein Modell, das entscheidet, was als Naechstes kommt, ist nicht reproduzierbar: dieselbe
Ausgangslage koennte morgen zu einer anderen Entscheidung fuehren, Fehler waeren nicht
nachvollziehbar, gezielte Verbesserung unmoeglich.

Das Gehirn wirkt dadurch nicht duemmer. **Die Intelligenz sitzt in den Signalen, die
hereinlaufen, nicht in der Auswahl.**

### Die vier konkurrierenden Ansprueche

| Anspruch | Gewicht | Meldet |
|---|---|---|
| Ziel | 2.2 | Konzepte im Zielumfang, die noch nicht sitzen |
| Kaltstart | 1.6 | ungesehene Konzepte mit hohem Informationsgewinn |
| Ursachensuche | 1.4 | markierte Verdachtsknoten und deren schwache Voraussetzungen |
| Motivation | 1.1 | ein sitzendes Konzept nach drei Fehlschlaegen in Folge |
| Wiederholung | 1.0 | Konzepte am Verfallen |

Das Ziel liegt deutlich vorn — das ist die technische Form von „Ziel uebersteuert". Es ist
bewusst ein **Gewicht** und keine Vorrangregel: ein Konzept direkt vor dem Verfall kann ein
schwach dringliches Zielkonzept immer noch schlagen.

Pro Konzept gewinnt der **staerkste** Anspruch und stellt die Begruendung; die uebrigen fliessen
mit 25 Prozent ein. Eine reine Summe waere falsch — sonst gewinnt das Konzept mit den meisten
Etiketten statt dem dringendsten Grund.

### Zwei Schutzmechanismen

**Wiederholungs-Mindestreserve (I9).** `reviewReserveSlots` reserviert 20 Prozent der Sitzung
fuer Wiederholung, mindestens einen Platz — aber **nie die ganze Sitzung** und erst ab drei
Aufgaben. Ein Boden, der die ganze Sitzung belegt, waere kein Boden, sondern eine Decke, und ein
gesetztes Ziel kaeme nie an die Reihe.

**Erklaerpflicht (I8).** Jede Auswahl traegt ihren Satz, erzeugt deterministisch in
`explainSelection`. Die Rolle „Erklaerer" darf ihn glaetten, ist aber nie die Voraussetzung
dafuer, dass es ihn gibt — sonst haenge eine Invariante an einem Modellaufruf, der ausfallen kann.

### Die Zustaendigkeitsgrenze Wiederholung ↔ Pfad (6.7, neu in 1.1)

Der Planer speist zwei Oberflaechen, und die Grenze zwischen ihnen laeuft ueber den **Ausloeser**,
nicht ueber den Zustand:

| | Wiederholen | Pfad |
|---|---|---|
| Ausloeser | **Verfall** | **Fehler und Luecken** |
| Inhalt | was du kannst und wieder verlieren wuerdest | was du noch nicht kannst |
| Tiefe | Erkennen | alle Stufen |

`responsibilityFor` entscheidet das an einer Stelle, und `reviewView.ts` wie `planner.ts` fragen
dort nach. Eine zweite Bedingung anderswo waere eine zweite Grenze, und die beiden liefen
auseinander.

Zwei Feinheiten, die im Betrieb den Unterschied machen:

- **Hysterese.** Eintritt in den Stapel ab Beherrschung 0.7, Rueckfall in den Pfad erst unter
  0.45, gemerkt in `ever_consolidated`. Mit einer einzigen Schwelle verschwindet ein lange
  unangetastetes Konzept aus **beiden** Oberflaechen — aus dem Stapel, weil sein verfallener Wert
  zu niedrig ist, und aus dem Pfad, weil es dort nichts zu reparieren gibt.
- **Gespeicherte statt verfallene Werte.** Geprueft wird gegen das, was zuletzt belegt wurde. Der
  Verfall laeuft kontinuierlich weiter; eine Grenze, die daran haengt, wandert von selbst.

### Das Ziel als echtes Objekt

Drei Angaben, alle drei noetig: **Termin**, **Umfang**, **verfuegbare Zeit**. Erst damit kann
`assessGoal` rueckwaerts rechnen und eine ehrliche Machbarkeitsaussage treffen.

Im Nichtmachbarkeitsfall liefert `describeFeasibility` keinen Zuspruch, sondern einen konkreten
Verzicht:

> „In 5 Tagen sind es 11 Konzepte bei 40 Minuten pro Tag. Das geht sich nur aus, wenn 3 davon auf
> Erkennen-Niveau bleiben statt auf Anwenden."

Gekuerzt wird dort, wo am meisten Zeit frei wird, nicht dort, wo es am wenigsten wehtut.

---

## Schicht 5 — Produktion (Generator, Kontrolleur)

**Code:** `production/formats.ts`, `production/quality.ts`, `production/generateTask.ts`,
`production/explanations.ts`, `production/reviewStock.ts`, `production/prefetch.ts`
**Bezug:** Kapitel 7 (mit 7.1 und 7.3 in der Fassung 1.1)

### Erzeugungszeitpunkt: vollstaendige Vorproduktion je Sitzung (Abweichung von 7.1)

Kapitel 7.1 sah urspruenglich Echtzeit mit **Vorproduktion um eine Aufgabe versetzt** vor: das
Gehirn erzeugt nur die naechste Aufgabe, waehrend der Nutzer an der aktuellen sitzt. Begruendung:
„Nur in Echtzeit erzeugtes Material kennt den Moment."

**Im Betrieb blieb davon zu wenig uebrig.** Nur die erste Aufgabe einer Sitzung wartete planmaessig
— jede folgende wartete faktisch trotzdem, sobald die Vorproduktion im Hintergrund nicht schnell
genug hinterherkam. Genau das war die gemeldete Beschwerde: „ich muss bei jeder Frage warten".

**Entschieden (Abweichung vom Bezugsdokument, siehe `06-stand-und-offenes.md`):** Beim Start
einer Sitzung werden ALLE geplanten Aufgaben gleichzeitig angestossen (`useBrainSession.ts` →
`start()`, `produceSlot()`, `prefetchRest()`), nicht nur die naechste. Nur die ERSTE Aufgabe hat
noch unvermeidbare Wartezeit — es gibt nichts, womit sie ueberlappen koennte. Bei der ueblichen
Sitzungslaenge (5 bis 7 Aufgaben, Kapitel 4.2) liegen alle folgenden Aufgaben in aller Regel
laengst bereit, wenn sie gebraucht werden.

Torwaechter I5 bleibt fuer jede einzelne Aufgabe unveraendert scharf — vollstaendige
Vorproduktion aendert nur den ZEITPUNKT der Erzeugung, nie die Pruefung davor. Was tatsaechlich
aufgegeben wird, ist der Momentbezug INNERHALB einer laufenden Sitzung; er war zuvor ohnehin
nicht verdrahtet. Zwischen Sitzungen bleibt er vollstaendig erhalten.

Das urspruengliche, versetzte Vorproduktionsmodell mit Staleness-Pruefung (`basisFingerprint`)
bleibt als eigenstaendiges, getestetes Modul in `production/prefetch.ts` erhalten — historisch
markiert, nicht mehr eingebunden.

**Die eine benannte Ausnahme, die davon unberuehrt bleibt (7.1, neu in 1.1):** der
Wiederholungsstapel. Dort wird ein kleiner Vorrat je Konzept vorgehalten und rotierend
ausgespielt, neu erzeugt, sobald sich im Lernerbild etwas geaendert hat. Die Begruendung ist eine
eigene Produktbeobachtung: bei fuenf Aufgaben faellt Erzeugungszeit nicht auf, bei siebzehn
kurzen Abfragen im Zug ist Tempo das ganze Erlebnis. Der Preis ist der Momentbezug — vertretbar,
weil Wiederholungen auf Erkennen-Niveau kaum vom Moment abhaengen. `assertReviewOnly` macht jeden
anderen Gebrauch zum Fehler.

### Produktionsformate

Kapitel 14 fuehrt sie als offenen Punkt; hier sind sie entschieden. Neun Formate, jedes mit zwei
Eigenschaften, die anderswo Folgen haben:

- **welche Anwendungstiefe** es pruefen kann. Multiple Choice kann Wiedererkennen zeigen, aber
  niemals Uebertragen — die Alternativen verraten, dass ein Konzept ueberhaupt gefragt ist.
- **ob es eine eindeutige Antwort hat.** Daran haengt das Gegenloesen.

Fassung 1.1 macht die Zuordnung **bindend** (Kapitel 6.6): drei Formate je Anwendungstiefe, ein
Format gehoert genau einer Tiefe. Ein Format, das in zwei Tiefen steht, laedt dazu ein, die Tiefe
am Format abzulesen — und dann misst der Wert nicht mehr, was er behauptet.

| Tiefe | Formate | Gegenloesbar |
|---|---|---|
| Erkennen | Auswahlfrage, ~~Kurzantwort~~, Zuordnung | ja, ausser Kurzantwort |
| Anwenden | Rechenaufgabe, ~~Verfahrensaufgabe~~, Lueckenrechnung | ja, ausser Verfahrensaufgabe |
| Uebertragen | Eingekleidetes Szenario, Fehlersuche, Begruendungsfrage | nein |

„Gegenloesbar" heisst hier mehr als „hat eine richtige Loesung": die Musterloesung muss KURZ und
WOERTLICH vergleichbar sein — eine Zahl, eine Option, eine Zuordnung. Verfahrensaufgabe und
Kurzantwort haben zwar eine erkennbar richtige Antwort, aber keine kurze; bei den drei
Uebertragen-Formaten ist die Musterloesung durchgehend eine Begruendung in Prosa („nennt die
fehlerhafte Stelle UND warum sie falsch ist", bei `errorHunt`). Zwei unabhaengige, beide richtige
Begruendungen stimmen so gut wie nie wortgleich ueberein — ein Gegenloesen wuerde dort staendig
richtige Aufgaben verwerfen. Das war ein echter Fehler in der ersten Fassung: `scenario` und
`errorHunt` waren zunaechst als gegenloesbar markiert und verwarfen dadurch wiederholt richtig
gegengeloeste Uebertragen-Aufgaben.

Damit sind **vier von neun** Formaten gegenloesbar. Das trifft Kapitel 7.2s Schaetzung „rund ein
Drittel" ziemlich genau — die sechs von neun einer frueheren Fassung waren zu grosszuegig gezaehlt.

Die Formatwahl ist deterministisch: sie rotiert ueber den Versuchszaehler, nicht ueber Zufall.
Ein Konzept immer im selben Format zu fragen misst am Ende das Format, nicht das Konzept.

Innerhalb einer Sitzung steigen die Tiefen an (6.6): erst Erkennen, dann Anwenden, dann
Uebertragen. Eine Uebertragungsaufgabe zu einem Konzept, bei dem die Sitzung gerade erst angekommen
ist, erzeugt Frust statt Evidenz.

### Erklaertexte (7.3, neu in 1.1)

Drei zugelassene Stellen, und eine vierte gibt es nicht: **Einstieg** (nur bei Beherrschung und
Sicherheit auf null), **Rueckmeldung** (immer, nach dem Versuch) und **nach „weiss ich nicht"**
(vollstaendig, auf Anforderung). Alles darueber hinaus gehoert in den Chat — der ist der
Erklaermotor, die Sitzung ist es nicht.

Erklaertexte laufen durch einen eigenen Kontrolleur-Modus (`explanation_check`) und einen eigenen
Torwaechter (`assertExplanationCleared`). Der Grund steht im Bezugsdokument: ein halluzinierter
Erklaertext ist gefaehrlicher als eine halluzinierte Aufgabe, weil der Nutzer ihn ungeprueft
uebernimmt.

### Qualitaetssicherung

Eine generierte Aufgabe kann auf drei Arten kaputt sein. Zwei davon werden abgefangen:

| Fehlerart | Gegenmassnahme |
|---|---|
| 1 — inhaltlich falsch | Quellenabgleich, **immer** (I5) |
| 2 — nicht loesbar | faellt beim Gegenloesen auf |
| 3 — Musterloesung stimmt nicht | **Gegenloesen** bei eindeutiger Antwort |

Fehlerart 3 ist die gefaehrlichste: der Pruefer bestraft den Nutzer dann fuer eine *richtige*
Antwort. Das kostet doppelt — sofortiger Vertrauensverlust, und ein falsches Signal wandert ins
Lernerbild, wo es zusaetzlich propagiert.

Beim Gegenloesen sieht der Kontrolleur die Musterloesung **nicht** — sonst bestaetigt er sie bloss.

`assertTaskCleared` ist der Torwaechter davor. Eine fehlende Freigabe gilt nie als Freigabe:
`parseSourceCheckResult` liefert bei fehlender Angabe `sourceAligned: false`.

---

## Schicht 6 — Konsolidierung

**Code:** `consolidation/trigger.ts`, `consolidation/patterns.ts`, `consolidation/restructure.ts`
**Bezug:** Kapitel 8 und 10

Die einzige Schicht, die von sich aus taetig wird. Vorbild ist der Schlaf: der Tag wird nicht
abgespielt, sondern umgebaut, verdichtet und neu verknuepft.

### Ausloeser

**Evidenzgewicht**, nicht Stueckzahl und nicht Zeitplan. Schwelle: 8 (etwa acht bewertete
Aufgaben). Chat allein erreicht sie praktisch nie — bei 0.05 je Signal braeuchte es 160
Chatsignale.

Dazu eine **Wartezeit-Obergrenze** von 14 Tagen, sonst konsolidiert ein Gelegenheitsnutzer nie,
und ein **Cooldown** von 6 Stunden, damit ein langer Lernabend nicht mehrere teure Durchlaeufe
hintereinander ausloest.

### Vier Operationen

| Operation | Art | Absicherung |
|---|---|---|
| Kante hinzufuegen/entfernen | umkehrbar | automatisch |
| Konzept aufspalten | teilweise umkehrbar | automatisch, mit Wertregel |
| Konzepte verschmelzen | **zerstoererisch** | Nutzerbestaetigung (I6) |
| Muster befoerdern | umkehrbar | automatisch |

Die entscheidende Unterscheidung ist **umkehrbar gegen zerstoererisch**, nicht gross gegen klein.

**Kantenentdeckung** ist der staerkste Fall: `discoverEdges` teilt jede B-Beobachtung danach ein,
ob die letzte A-Beobachtung *davor* gelungen war. Weichen die Fehlerquoten deutlich ab, ist A
eine Voraussetzung von B — eine Kante, die der Kartograf nie gezeichnet hat, die die Daten aber
zeigen. Der zeitliche Bezug ist wesentlich: ohne ihn waere jede Korrelation zwischen zwei starken
Konzepten eine Kante.

### Wertbehandlung — konservativ und asymmetrisch

**Beim Verschmelzen** gewinnt der niedrigere Beherrschungswert. Auch das Evidenzgewicht wird auf
den kleineren Wert gesetzt: wuerden die Gewichte addiert, stuende der verschmolzene Knoten
selbstsicherer da als jede seiner Haelften — obwohl die Evidenz der einen ueber die andere nichts
aussagt.

**Beim Aufspalten** erben beide Haelften den Wert, die Sicherheit faellt auf nahezu null. Beim
Aufspalten gibt es keinen zweiten Wert, aus dem man den niedrigeren waehlen koennte; konservativ
heisst hier: keinen sichtbaren Fortschritt wegnehmen, aber die Einschaetzung als unbelegt
markieren. Weil unsichere Werte beim Planer Ueberpruefungsbedarf erzeugen, stellt er beide
Haelften von selbst zeitnah auf die Probe.

> Das Verschmelzen nimmt sichtbaren Fortschritt weg (80 % und 30 % ergeben 30 %). Weil es ohnehin
> eine Bestaetigung erfordert, gibt es genau dort einen Dialog, in dem es erklaert werden kann.
> **Diese beiden Entscheidungen greifen ineinander und sollten nicht einzeln geaendert werden.**

### Fehlermuster

Frei entstehend, kein vordefinierter Katalog: ein fester Katalog kann nur finden, was vorher
gedacht wurde, und die nuetzlichsten fachspezifischen Muster kaemen darin nie vor.

Vier Auflagen gegen das Ausfransen, alle umgesetzt:

1. **Halbstrukturierte Form** — gruppiert wird ueber Fehlerart plus normalisiertes Objekt, nie
   ueber Prosa. Die Normalisierung ist bewusst konservativ: sie fasst Wortstellung und
   Bindestriche zusammen, aber nicht Zusammen- und Getrenntschreibung. Ein Muster, das zwei
   Sachen meint, ist als Einsicht wertlos.
2. **Herkunft mitschreiben** — jedes Auftreten merkt sich Konzept und Fach. Daraus ergibt sich
   von selbst, ob ein Muster generisch oder fachspezifisch ist. **Diese Information ist
   nachtraeglich nicht rekonstruierbar.**
3. **Stabile Namen** (I12) — `assertPatternNameStable` schlaegt bei jeder Umbenennung an.
4. **Musterverschmelzung** folgt derselben Regel wie Konzeptverschmelzung.

**Anzeigeschwelle:** vier Vorkommen ueber mindestens zwei Konzepte und drei verschiedene Tage.
Sieben Fehler an einem mueden Abend in einem einzigen Thema sind kein Charakterzug, sondern ein
schlechter Abend.

Intern nutzt das Gehirn Muster laengst, bevor es sie ausspricht: **es handelt auf Verdacht, es
redet nur ueber Gewissheit.**

---

## Kaltstart

**Code:** `coldstart/frontSearch.ts`
**Bezug:** Kapitel 9

Ein neuer Nutzer laedt sein Skript hoch, der Kartograf baut den Graphen — und das Lernerbild ist
leer. Trotzdem muss die erste Aufgabe sitzen.

Der Voraussetzungsgraph macht eine effiziente Ortung moeglich: `informationGain` ist dort maximal,
wo eine Frage den offenen Suchraum in zwei gleich grosse Haelften teilt. Eine richtige Antwort
raeumt die Vorfahren ab, eine falsche die Nachfahren. Nach fuenf bis sieben Aufgaben ist die
Front bestimmt — ohne dass sich je ein Test angefuehlt haette.

> **Der subtilste Punkt der ganzen Umsetzung:** „vieles darunter gilt als vorhanden" veraendert
> **nicht** das Lernerbild. Invariante I1 laesst nur direkte Evidenz an die Beherrschung. Was
> `FrontSearchState` fuehrt, ist ein reiner **Suchzustand**, der nie persistiert wird. Wuerde er
> ins Lernerbild geschrieben, entstuenden Werte, fuer die nie jemand etwas geloest hat — genau
> das, was I1 verhindert. Ein Test prueft ausdruecklich, dass die uebergebenen Lernerbilder
> unveraendert bleiben.

Sichtbarkeit: ein erklaerender Satz vorab (`COLD_START_DISCLOSURE`), eine Ergebnisanzeige am Ende
(`summariseColdStart`). Die adaptive Suche liegt zwangslaeufig daneben, bevor sie trifft.
Entscheidend ist, wie der Nutzer diese Fehlgriffe deutet — ohne Vorwarnung denkt er „das Ding
haelt mich fuer einen Anfaenger", danach denkt er „es tastet sich ran". Identisches Erlebnis,
voellig andere Bewertung.

---

## Vom Netz zum Pfad

**Code:** `path/ordering.ts`
**Bezug:** Kapitel 11

Das Gedaechtnis ist ein **Netz**, die Oberflaeche zeigt einen **Pfad**. Die Reihenfolge ist
**fest**, mit adaptiven Einschueben.

Menschen bleiben an Lernsystemen dran, weil sie eine Strecke schrumpfen sehen. Das funktioniert
nur, wenn die Strecke stillhaelt. Ein Nenner, der sich jede Sitzung aendert, macht jede
Fortschrittsanzeige bedeutungslos.

Zwei Mechaniken tragen das:

**Bruchzahl-Positionen.** Die Grundordnung liegt auf Vielfachen von 100. Zwischen 300 und 400
passt 350, zwischen 300 und 350 passt 325. Ein Einschub oder ein aufgespaltenes Konzept kann
einsortiert werden, **ohne dass ein einziger anderer Eintrag seine Position aendert**. Ein Test
prueft genau das.

**Getrennter Fortschrittsnenner.** `pathProgressView` zaehlt nur `base`-Eintraege im Nenner. Ein
Einschub laesst die Prozentzahl damit nicht fallen, sondern erscheint daneben als eigener,
begruendeter Umweg. Ohne diese Trennung waere Fuersorge von aussen von einem Fehler nicht zu
unterscheiden.

Aufgespaltene Konzepte werden **nachgezogen** (`reflowAfterSplit`) statt hinten angehaengt. Hinten
anhaengen waere der bequeme Weg — und genau der, an dem die Ordnung zerfaellt: nach drei
Aufspaltungen stuenden Grundlagen hinter dem Stoff, der sie voraussetzt.

Sichtbarkeit: `buildOverview` verdichtet zu Gruppen, `focusWindow` zeigt den aktuellen Abschnitt
in voller Aufloesung. Einschuebe werden je Gruppe getrennt ausgewiesen.

---

## Und die Oberflaeche?

Der Kreislauf endet nicht im Lernerbild, sondern auf einem Bildschirm. Wie die sechs Schichten an
den Lernbereich angebunden sind — Tabs nach Absicht, die reine Anbindungsschicht `brain/ui/`, die
vier Hooks und die Handkorrekturen —, steht in [`07-oberflaeche.md`](07-oberflaeche.md).
