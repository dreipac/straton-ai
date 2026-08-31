# Straton – Architektur des digitalen Gehirns

**Version:** 1.0
**Stand:** 18. August 2026
**Status:** Konzeptionell vollständig für die Schichten 1–7. Zwei Bereiche bewusst offen (siehe Kapitel 14).

---

## 0. Wie dieses Dokument zu lesen ist

Dieses Dokument beschreibt die Architektur des adaptiven Lernsystems von Straton – intern „das Gehirn" genannt. Es enthält **keinen Code und keine Datenbankschemata**. Es beschreibt Verantwortlichkeiten, Datenflüsse, Entscheidungsregeln und harte Invarianten in Worten.

Es ist als Referenzdokument für die Implementierung gedacht. Wer daraus baut, sollte drei Dinge beachten:

1. **Kapitel 1 (Invarianten) ist bindend.** Diese Regeln dürfen an keiner Stelle der Implementierung verletzt werden, auch nicht temporär oder „für den Prototyp". Sie sind der Grund, warum das System vertrauenswürdig ist. Jede einzelne wurde bewusst gegen eine bequemere Alternative entschieden.
2. **Die Reihenfolge der Kapitel ist nicht die Reihenfolge der Implementierung.** Eine empfohlene Bauabfolge steht in Kapitel 15.
3. **Wo eine Entscheidung getroffen wurde, steht sie mit Begründung und mit der verworfenen Alternative.** Wer eine Entscheidung ändern will, sollte zuerst die Begründung lesen – mehrere Entscheidungen greifen ineinander und lassen sich nicht einzeln umdrehen.

---

## 1. Invarianten – die unverhandelbaren Regeln

Diese zwölf Regeln definieren das Systemverhalten stärker als jede Komponente. Sie sind der Kern des Produkts.

| # | Invariante | Warum |
|---|---|---|
| I1 | Nur **direkte Evidenz** verändert die Beherrschung eines Konzepts. | Sonst kann ein Wert entstehen, für den nie jemand etwas gelöst hat. |
| I2 | **Chatverhalten erhöht niemals** die Beherrschung. Es darf nur senken oder Zweifel wecken. | Fragen stellen beweist nichts. Verhindert geschönte Lernerbilder durch Vielrederei. |
| I3 | **Propagation im Graphen verändert nie die Beherrschung**, ausschliesslich die Sicherheit. | Ein Flüchtigkeitsfehler darf keine Lawine auslösen. |
| I4 | Jedes Wissensatom trägt eine **Herkunftsmarkierung** (Quelldokument und Stelle, oder „KI-ergänzt"). | Prüfungsrealität und Halluzinationsschutz. Ohne Quelle keine Prüfbarkeit. |
| I5 | Kein generiertes Material erreicht den Nutzer **ohne Quellenabgleich**. | Halluzinierte Inhalte vergiften über den Prüfer auch das Lernerbild. |
| I6 | **Zerstörerische Strukturänderungen** (Verschmelzen) erfordern Nutzerbestätigung **und** ein Protokoll mit Rücknahmemöglichkeit. | Verschmelzungen sind nicht rekonstruierbar. Ein System, das sich selbst umbaut und seine Vergangenheit löscht, ist nicht diagnostizierbar. |
| I7 | **Keine Strukturfragen während einer Lernsitzung.** | Unterbrechungen im Lernfluss zerstören die Sitzung und werden reflexhaft weggeklickt. |
| I8 | **Jede ausgespielte Aufgabe hat eine Begründung**, die dem Nutzer in einem Satz zeigbar ist. | Gewichtete Auswahl ohne Erklärung wirkt wie Zufall. Zufall zerstört Vertrauen. |
| I9 | Eine **Mindestreserve für Wiederholung** bleibt in jeder Sitzung bestehen, auch im Zielmodus. | Sonst ist nach der Prüfung alles Frühere verfallen. |
| I10 | **Struktur und Person werden getrennt gespeichert.** Der Wissensgraph enthält keine personenbezogenen Leistungsdaten. | Hält die Tür für einen späteren geteilten Strukturlayer offen (Netzwerkeffekt), ohne Architekturumbau. |
| I11 | **Der Planer ist deterministisch.** Keine Modellentscheidung darüber, was als Nächstes kommt. | Reproduzierbarkeit, Testbarkeit, Debugbarkeit. Verlässlichkeit schlägt hier Cleverness. |
| I12 | **Namen von Fehlermustern bleiben stabil**, sobald vergeben. | Ein System, das dieselbe Sache jede Woche anders nennt, wirkt orientierungslos. |

---

## 2. Überblick: der geschlossene Kreislauf

Das Gehirn besteht aus fünf Funktionsbereichen. Entscheidend ist, dass sie einen **geschlossenen Kreis** bilden – ohne den Rückweg wäre es eine Pipeline, kein Gehirn.

```
Material und Chat
      |
      v
   Kartograf  ------------------> Wissensgraph
                                       |
Konsolidierer -----> Lernerbild <------+
      ^                  |   ^         |
      |                  |   |         |
      |                  v   |         v
      |               Planer (feste Logik)
      |                  |
      |                  v
      |             Generator --> Kontrolleur --> Nutzer
      |                                              |
      |                                              v
      +--------------------------------------- Prüfer
```

Kurzform des Umlaufs:

1. **Aufnahme** – Material und Chats kommen herein, der Kartograf zerlegt sie in Konzepte und zeichnet die Voraussetzungen.
2. **Gedächtnis** – Wissensgraph (der Stoff) und Lernerbild (die Person) werden getrennt geführt.
3. **Entscheidung** – der Planer wählt deterministisch aus, was als Nächstes drankommt.
4. **Produktion** – der Generator erzeugt in Echtzeit, der Kontrolleur prüft, der Nutzer arbeitet.
5. **Wahrnehmung** – der Prüfer bewertet und diagnostiziert, das Ergebnis fliesst ins Lernerbild zurück.
6. **Konsolidierung** – im Hintergrund verdichtet, korrigiert und baut um.

---

## 3. Schicht 1 – Aufnahme (Rolle: Kartograf)

### Aufgabe

Der Kartograf ist die einzige Rolle, die aus unstrukturiertem Input Struktur macht. Er hat zwei Betriebsarten:

**Einlesen von Material.** Aus einem hochgeladenen Dokument entstehen Konzepte und die gerichteten Voraussetzungen zwischen ihnen.

**Zuordnen von Chats.** Aus einer laufenden Chatunterhaltung wird bestimmt, welche Konzepte des Graphen gerade berührt werden.

### Wahrheitsquelle

**Entscheidung:** Das hochgeladene Material ist der Anker. Die KI darf ergänzen, aber Ergänzungen sind **markiert**.

**Begründung:** Ein Schüler wird an seinem Skript gemessen, nicht am Weltwissen. Training auf Inhalte, die im Unterricht nie vorkamen, verbrennt seine Zeit. Gleichzeitig ist reines Material oft lückenhaft – ein Skript setzt Grundlagen voraus, die es nicht erklärt, und ohne Ergänzung könnte das Gehirn diese Grundlagen nie als Konzept führen.

**Umsetzung:** Jedes Wissensatom trägt seine Herkunft (Invariante I4). In der Oberfläche muss KI-ergänzter Inhalt unterscheidbar bleiben – spätestens vor einer Prüfung will ein Nutzer wissen, was aus seinem Stoff stammt.

### Kritikalität

Der Kartograf ist der **empfindlichste Punkt der gesamten Architektur**. Was er falsch zuordnet oder falsch verknüpft, ist an jeder späteren Stelle falsch: der Planer plant auf einer schiefen Karte, der Prüfer diagnostiziert am falschen Knoten, die Propagation verteilt Zweifel in die falsche Richtung.

Zwei Gegenmassnahmen sind vorgesehen:

- Die Konsolidierung darf den Graphen später korrigieren (Kapitel 8).
- Der Nutzer braucht eine **Handkorrektur**: Konzepte umbenennen, zusammenlegen, Voraussetzungen ergänzen oder streichen. Was das System nicht selbst darf, muss der Mensch dürfen.

---

## 4. Schicht 2 – Gedächtnis

Das Gedächtnis besteht aus zwei getrennt geführten Ebenen. Die Trennung ist eine Invariante (I10), keine Stilfrage.

### 4.1 Wissensgraph (die Landkarte des Stoffs)

**Auflösung:** Konzeptebene. Nicht Themenebene, nicht Aufgabentypebene.

Ein Konzept ist eine einzelne, prüfbare Teilfähigkeit – nicht „Subnetting", sondern „Subnetzmaske aus Hostanzahl ableiten".

**Begründung:** Auf Themenebene kann das Gehirn nur sagen „du kannst Subnetting zu 60 Prozent" – es weiss nicht, *was* die fehlenden 40 Prozent sind, und kann daher nichts gezielt fördern. Genau diese Präzision ist der Unterschied zu einem generischen Lerntool.

**Verknüpfung:** gerichteter **Voraussetzungsgraph**. Kante von A nach B bedeutet: B setzt A voraus.

**Begründung:** Nur eine gerichtete Abhängigkeit erlaubt **Ursachenforschung**. Wenn jemand bei Subnetzmaske scheitert, geht das Gehirn die Kette rückwärts und findet die eigentliche Lücke bei den Zweierpotenzen. Eine reine Hierarchie (Fach → Thema → Konzept) ist eine Gliederung – sie sagt, wo etwas steht, nicht warum jemand scheitert.

**Geltungsbereich:** ein eigener Graph pro Nutzer.

**Begründung und bewusster Verzicht:** Jeder Lehrplan ist anders, Datenschutz ist einfacher, der Start ist schneller. Der Preis ist der Kaltstart bei jedem neuen Nutzer und der Verzicht auf den Netzwerkeffekt eines geteilten Graphen. Dieser Verzicht ist **umkehrbar gehalten** durch Invariante I10: sobald Struktur und Person getrennt liegen, kann später ein geteilter Strukturlayer eingeführt werden, ohne die Architektur neu zu bauen. Wären sie vermischt, wäre dieser Schritt praktisch unmöglich.

### 4.2 Lernerbild (was das Gehirn über die Person weiss)

Pro Konzept werden drei Werte geführt:

**Beherrschung** – wie gut die Person das Konzept kann.

**Sicherheit** – wie belastbar diese Einschätzung ist.

Ohne diesen zweiten Wert kann das System nicht zwischen „du kannst das nicht" und „ich weiss es noch nicht" unterscheiden. Jemand mit einer einzigen richtigen Antwort und jemand mit zwanzig stünden beide bei 100 Prozent, obwohl das Gehirn im ersten Fall fast nichts weiss. Die Sicherheit steuert, ob das Gehirn nachfragt oder in Ruhe lässt – und sie ist die einzige Grösse, die von Propagation und von Strukturumbauten bewegt wird.

**Anwendungstiefe** – auf welcher Ebene das Konzept sitzt. Drei Stufen:

| Stufe | Bedeutung |
|---|---|
| Erkennen | Begriff wird wiedererkannt und richtig zugeordnet |
| Anwenden | eine Standardaufgabe wird damit gelöst |
| Übertragen | das Konzept wird in einer unbekannt verpackten Aufgabe als nötig erkannt |

Die dritte Stufe entscheidet Prüfungen und wird von Karteikartensystemen nie geprüft. Sie ist ein Verkaufsargument, kein technisches Detail.

**Verfall:** Beherrschung sinkt mit der Zeit. Das ist keine Entscheidung, sondern Voraussetzung dafür, dass das Wiederholungssystem überhaupt funktioniert.

### 4.3 Propagation im Graphen

**Entscheidung:** Propagation in **beide Richtungen**.

- **Rückwärts (Ursachensuche):** Ein Fehlschlag bei einem Konzept erzeugt Verdacht auf dessen Voraussetzungen.
- **Vorwärts (Vorsicht):** Wackelt eine Grundlage, ist die Beherrschung der darauf aufbauenden Konzepte weniger glaubwürdig, auch wenn dort einmal etwas richtig war.

**Zwei zwingende Begrenzungen:**

1. Propagation verändert **ausschliesslich die Sicherheit** (Invariante I3). Sie senkt nie eine Beherrschung. Sie markiert Knoten als „überprüfungsbedürftig", was den Planer aktiviert.
2. Propagation wird **gedämpft und begrenzt**: der Effekt wird pro Schritt schwächer und stoppt nach ein bis zwei Kanten.

**Begründung der Begrenzung:** Ohne sie reisst ein einzelner Flüchtigkeitsfehler in einem tiefen Graphen das halbe Lernerbild ein. Der Nutzer sieht überall rote Werte und verliert das Vertrauen. Ein Gehirn, das bei jedem Stolpern die ganze Biografie umschreibt, ist nicht lebendig, sondern nervös.

---

## 5. Schicht 3 – Wahrnehmung (Rolle: Prüfer)

### 5.1 Zugelassene Signalquellen

**Entscheidung:** bewertete Aufgaben **und** Chatverhalten.

Die beiden Quellen haben sehr unterschiedliche Qualität, und die Architektur behandelt sie unterschiedlich:

| | Bewertete Aufgabe | Chatverhalten |
|---|---|---|
| Menge | selten, wenige pro Woche | häufig, Hauptdatenquelle |
| Verlässlichkeit | hoch | verrauscht |
| Darf Beherrschung erhöhen | ja | **nie** (I2) |
| Darf Beherrschung senken | ja | nein, nur Sicherheit senken |
| Wirkt primär auf | Beherrschung | Sicherheit, Verdachtsmarkierung |

**Aussagekräftige Chatsignale:** dieselbe Frage mehrfach über Wochen, Abbruch einer Erklärung, sowie die Art der Frage – wer nach der Lösung fragt, steht anders da als wer nach dem Warum fragt.

**Pflicht zur Sichtbarkeit:** Der Nutzer muss wissen, dass Chats das Lernerbild beeinflussen, und es abschalten können. Ohne das fühlt es sich überwacht an – und genau die lockere, niedrigschwellige Chatnutzung ist der Einstiegstrichter des Produkts.

### 5.2 Ausgabe des Prüfers

Der Prüfer liefert pro Antwort drei Dinge:

**Fehlerursache** – in halbstrukturierter Form: *was* schiefging (verwechselt, ausgelassen, falsch angewendet, übersehen) und *worauf bezogen*. Freiheit im Inhalt, Disziplin in der Form. Reine Prosa lässt sich später nicht gruppieren, eine feste Auswahlliste würde Fachspezifisches nie finden.

**Teilpunkte** – nicht nur richtig oder falsch. „Rechenweg korrekt, Ergebnis falsch" ist eine andere Diagnose als „Ansatz falsch".

**Zuversicht des Prüfers** – wie sicher er sich seiner eigenen Bewertung ist.

### 5.3 Warum die Zuversicht die wichtigste der drei Angaben ist

Bei offenen Antworten ist eine Bewertung manchmal eindeutig und manchmal Auslegungssache. Ein Prüfer ohne Zuversichtsangabe behauptet in beiden Fällen gleich selbstbewusst etwas, und das Gehirn übernimmt es gleich stark.

**Regel:** Niedrige Zuversicht bewegt das Lernerbild nur schwach. Stattdessen wird eine von zwei Reaktionen ausgelöst:

- dieselbe Sache wird später anders verpackt erneut gefragt, oder
- der Fall wird an ein stärkeres Modell weitergereicht.

Hier wird die Mehrmodellarchitektur zum ersten Mal funktional statt dekorativ: das schnelle, günstige Modell erledigt den Normalfall, das teure wird nur bei Zweifel geweckt. Das ist derselbe Mechanismus wie im biologischen Gehirn – Routine läuft automatisch, Zweifel zieht Aufmerksamkeit an.

### 5.4 Trennung von Prüfer und Generator

Prüfer und Generator sind **getrennte Rollen mit getrennten Modellen**. Ein Modell, das seine eigene Aufgabe bewertet, ist systematisch zu milde.

---

## 6. Schicht 4 – Exekutive (Planer, keine KI)

### 6.1 Warum der Planer deterministisch ist

Ein Modell, das entscheidet, was als Nächstes kommt, ist nicht reproduzierbar: dieselbe Ausgangslage kann morgen zu einer anderen Entscheidung führen, Fehler sind nicht nachvollziehbar, gezielte Verbesserung ist unmöglich.

Feste Logik mit gewichteten Dringlichkeiten ist hier eindeutig überlegen – nachvollziehbar, sofort, kostenlos, testbar. Das Gehirn wirkt dadurch nicht dümmer: **die Intelligenz sitzt in den Signalen, die hereinlaufen, nicht in der Auswahl.** Entscheidungen wirken verlässlich statt launisch.

### 6.2 Die vier konkurrierenden Ansprüche

Zu jedem Zeitpunkt melden vier Quellen eine Dringlichkeit an:

| Anspruch | Meldet | Beispiel |
|---|---|---|
| Wiederholung | Konzepte am Verfallen | acht Konzepte unter Schwelle |
| Ursachensuche | Verdacht auf Grundlagenlücke | Propagation hat Zweifel markiert |
| Ziel | Termin und Umfang | Prüfung Freitag, Kapitel 3 |
| Motivation | Frustrationsschutz | dreimal hintereinander gescheitert |

**Konfliktlösung:** gewichtete Dringlichkeit, wobei ein gesetztes **Ziel übersteuert**.

### 6.3 Das Ziel als echtes Objekt

Damit „Ziel übersteuert" funktionieren kann, muss ein Ziel drei Angaben enthalten:

- **Termin** – wann
- **Umfang** – welche Konzepte dazugehören
- **verfügbare Zeit** – wie viel realistisch pro Tag

Erst damit kann das Gehirn rückwärts rechnen und eine ehrliche Machbarkeitsaussage treffen: „Bis Freitag sind es elf Konzepte bei geschätzt 40 Minuten pro Tag. Das geht sich nur aus, wenn drei davon auf Erkennen-Niveau bleiben statt auf Anwenden."

Diese Ehrlichkeit ist ein Alleinstellungsmerkmal. Konkurrenzprodukte liefern an dieser Stelle Motivationssprüche.

### 6.4 Zwei Schutzmechanismen

**Wiederholungs-Mindestreserve (I9).** Wenn das Ziel alles übersteuert, verhungert die Wiederholung – nach der Prüfung wacht der Nutzer mit einem verfallenen Lernerbild auf. Ein kleiner Anteil jeder Sitzung bleibt reserviert, auch im Zielmodus. Kein starres Verhältnis, aber ein Boden.

**Erklärpflicht (I8).** Weil gewichtet statt starr entschieden wird, ist die Auswahl von aussen nicht mehr offensichtlich. Zu jeder Aufgabe muss in einem Satz sagbar sein, warum genau sie jetzt kommt.

### 6.5 Steuerungsverteilung

Der **Nutzer setzt das Ziel**, das **Gehirn plant den Weg**.

Beide Extreme sind Fehler: Ein Gehirn, das alles allein entscheidet, besteht darauf, Kapitel 1 zu reparieren, während der Nutzer am Freitag über Kapitel 3 geprüft wird – dann fliegt die App raus. Ein Nutzer, der alles selbst steuert, macht das Gehirn zur Dekoration.

---

## 7. Schicht 5 – Produktion (Rollen: Generator, Kontrolleur)

### 7.1 Erzeugungszeitpunkt

**Entscheidung:** Echtzeit.

**Begründung:** Nur in Echtzeit erzeugtes Material kennt den Moment – es weiss, dass der Nutzer vor zwei Minuten genau diesen Fehler gemacht hat. Vorratsproduktion wäre schneller und prüfbarer, aber blind für die aktuelle Lage.

**Latenzlösung – Vorproduktion um eine Aufgabe versetzt:** Das Gehirn erzeugt die *nächste* Aufgabe, während der Nutzer an der aktuellen sitzt. Formal bleibt es Echtzeit, weil alle Signale bis zur letzten Sekunde einfliessen, aber der Nutzer wartet nie. Nur das allererste Element einer Sitzung hat unvermeidbare Wartezeit.

### 7.2 Qualitätssicherung

Eine generierte Aufgabe kann auf drei Arten kaputt sein:

1. inhaltlich falsch
2. gar nicht lösbar
3. die hinterlegte Musterlösung stimmt nicht

**Entschieden:** Abgleich mit dem Quellmaterial (Invariante I5). Dieser deckt Fehlerart 1 ab.

**Offene Empfehlung (nicht entschieden):** Gegenlösen bei allen Aufgaben mit eindeutiger richtiger Antwort – ein zweites Modell löst die Aufgabe unabhängig, ohne die Musterlösung zu kennen. Weicht das Ergebnis ab, geht die Aufgabe nicht raus.

**Warum diese Empfehlung wichtig ist:** Fehlerart 3 ist die gefährlichste, weil der Prüfer den Nutzer dann für eine *richtige* Antwort bestraft. Das kostet doppelt: der Nutzer verliert sofort das Vertrauen, und ein falsches Signal wandert ins Lernerbild, wo es zusätzlich propagiert. Der Kompromissvorschlag – Gegenlösen nur bei eindeutig lösbaren Aufgabentypen, Quellenabgleich allein bei offenen Erklärfragen – trifft schätzungsweise ein Drittel der Aufgaben und schliesst genau die teuerste Lücke.

---

## 8. Schicht 6 – Konsolidierung (Rolle: Konsolidierer)

Dies ist die einzige Schicht, die von sich aus tätig wird. Sie ist der Kern des Markenversprechens „lebendiges Gehirn". Das Vorbild ist der Schlaf: der Tag wird nicht abgespielt, sondern umgebaut, verdichtet und neu verknüpft.

### 8.1 Auslöser

**Entscheidung:** bei ausreichendem **Evidenzgewicht**, nicht nach Zeitplan und nicht nach jeder Sitzung.

**Zwei Präzisierungen:**

- „Genug" wird in Evidenzgewicht gemessen, nicht in Stückzahl. Zwanzig Chatnachrichten wiegen weniger als fünf bewertete Aufgaben. Reines Zählen würde Vielrederei zu Auslösern machen, die nichts Neues enthalten.
- Es gibt eine **Obergrenze für die Wartezeit**, sonst konsolidiert ein Gelegenheitsnutzer nie und sein Lernerbild bleibt für immer roh.

**Verworfene Alternativen:** Nach jeder Sitzung – zu verrauscht, ein müder Abend würde zur Erkenntnis, und fünf kurze Sitzungen bedeuten fünf teure Durchläufe. Nächtlich – erzählerisch attraktiv (Schlafmetapher), aber bei intensivem Lernen vor einer Prüfung kommen die Einsichten zu spät, und bei seltener Nutzung laufen die meisten Nächte leer.

### 8.2 Erlaubter Wirkungsbereich

**Entscheidung:** Lernerbild **und** Wissensgraph.

Vier Operationen sind vorgesehen:

| Operation | Art | Absicherung |
|---|---|---|
| Voraussetzungskante hinzufügen oder entfernen | umkehrbar | automatisch |
| Konzept aufspalten | teilweise umkehrbar | automatisch, mit Wertregel (8.3) |
| Konzepte verschmelzen | **zerstörerisch** | Nutzerbestätigung erforderlich |
| Fehlermuster zu benanntem Muster befördern | umkehrbar | automatisch |

**Was die einzelnen Operationen leisten:**

- **Zusammenlegen** korrigiert Doppelungen, die zwangsläufig entstehen, wenn Material aus verschiedenen Quellen eingelesen wurde.
- **Aufspalten** repariert zu grobe Knoten – erkennbar daran, dass die Leistungsdaten eines Konzepts in zwei Gruppen zerfallen.
- **Neue Kanten entdecken** ist der stärkste Fall: über Wochen wird sichtbar, dass niemand Konzept B schafft, der A nicht hat. Der Kartograf hat diese Kante nie gezeichnet, die Daten zeigen sie trotzdem.
- **Muster befördern** ist das, was der Nutzer am Ende als Einsicht über sich selbst erlebt.

**Die entscheidende Unterscheidung ist umkehrbar gegen zerstörerisch**, nicht gross gegen klein. Eine Kante lässt sich wieder entfernen. Eine Verschmelzung löscht die Unterscheidung dauerhaft – deshalb Invariante I6.

**Bestätigungs-Interaktion:** Verschmelzungsvorschläge werden gesammelt und ausschliesslich an ruhiger Stelle gezeigt (Sitzungsbeginn oder ein eigener Bereich „Karte überprüfen"), niemals mitten im Lernen (I7). Sie brauchen ein Verfallsdatum: bleibt eine Frage unbeantwortet, ändert sich nichts und der Vorschlag verschwindet nach einer Weile. Sonst wächst ein Berg unbeantworteter Fragen.

Die Frage muss in der Sprache des Nutzers gestellt werden, nicht in Graphensprache: „Meinen ‚Subnetzmaske' und ‚Netzmaske berechnen' dasselbe?" ist keine Fachfrage, sondern eine über sein eigenes Material – und damit beantwortbar.

### 8.3 Wertbehandlung bei Strukturumbau

**Grundsatz: konservativ.**

**Beim Verschmelzen:** der niedrigere Beherrschungswert gewinnt.

**Beim Aufspalten:** beide Hälften erben den ursprünglichen Wert, die Sicherheit fällt auf nahezu null.

**Warum diese Asymmetrie stimmig ist:** Beim Aufspalten gibt es keinen zweiten Wert, aus dem man den niedrigeren wählen könnte. Konservativ bedeutet hier: keinen sichtbaren Fortschritt wegnehmen, aber die Einschätzung als unbelegt markieren. Weil unsichere Werte beim Planer Überprüfungsbedarf erzeugen, stellt er beide Hälften von selbst zeitnah auf die Probe. Nach zwei bis drei Aufgaben trennen sich die Werte anhand echter Evidenz. Das nutzt genau die Trennung von Beherrschung und Sicherheit aus Kapitel 4.2.

**Zur Nebenwirkung beim Verschmelzen:** Werden 80 Prozent und 30 Prozent zusammengelegt, steht der neue Knoten bei 30 Prozent – der Nutzer sieht Fortschritt verschwinden. Das wäre normalerweise der Moment, in dem sich eine App kaputt anfühlt. Weil Verschmelzungen aber ohnehin eine Bestätigung erfordern, gibt es genau dort einen Dialog, in dem es erklärt werden kann. Der Verlust ist damit angekündigt statt mysteriös – der Unterschied zwischen einem Bug und einer nachvollziehbaren Systementscheidung. **Diese beiden Entscheidungen greifen ineinander und sollten nicht einzeln geändert werden.**

### 8.4 Protokollpflicht

Jeder Strukturumbau wird protokolliert: was geändert wurde, welche Belege dafür sprachen, wann es geschah, und wie es rückgängig zu machen ist.

Ohne Protokoll wäre das System eines, das sich selbst verändert und dabei seine eigene Vergangenheit löscht. Fehler wären dann weder für den Betreiber noch für den Nutzer diagnostizierbar.

---

## 9. Kaltstart

### Ausgangslage

Ein neuer Nutzer lädt sein Skript hoch, der Kartograf baut den Graphen – und das Lernerbild ist vollständig leer. Trotzdem muss die erste Aufgabe sitzen.

### Entscheidung: adaptive Suche im laufenden Lernen

Der Voraussetzungsgraph macht eine effiziente Ortung möglich: weil die Konzepte gerichtet verbunden sind, halbiert jede beantwortete Aufgabe den Suchraum. Wird etwas Mittelschweres richtig gelöst, gilt vieles darunter als wahrscheinlich vorhanden; bei einem Fehlschlag liegt die Grenze weiter unten. Nach etwa fünf bis sieben Aufgaben ist die Front ziemlich genau bestimmt – ohne dass sich je ein Test angefühlt hätte.

**Verworfene Alternativen:** Einstufungstest vorweg – begrüsst einen Schüler, der schnell seine Hausaufgabe machen wollte, mit einer Prüfung. Selbsteinschätzung – angenehm, aber notorisch unzuverlässig, brauchbar höchstens als Startpunkt mit sehr niedriger Sicherheit.

### Sichtbarkeit

**Entscheidung:** ein erklärender Satz vor der ersten Aufgabe, plus Ergebnisanzeige am Ende der ersten Sitzung.

**Begründung:** Die adaptive Suche liegt zwangsläufig daneben, bevor sie trifft – genau daraus gewinnt sie ihre Information. Entscheidend ist, wie der Nutzer diese Fehlgriffe deutet. Ohne Vorwarnung denkt er bei einer zu leichten Aufgabe: „das Ding hält mich für einen Anfänger, das taugt nichts." Nach einem Satz wie „die ersten Aufgaben nutze ich, um dich einzuschätzen – sie können zu leicht oder zu schwer wirken" denkt er: „es tastet sich ran." Identisches Erlebnis, völlig andere Bewertung. Dasselbe gilt für die stark springenden Werte im Lernerbild: erklärt wirken sie lebendig, unerklärt wirken sie kaputt.

Die Ergebnisanzeige am Sitzungsende liefert den befriedigenden Einordnungsmoment einer klassischen Einstufung, ohne deren Prüfungscharakter.

### Erhöhte Lernrate

Während der Kaltstartphase darf sich die Beherrschung in **grösseren Schritten** bewegen als später. Weil die Sicherheit bei null startet, ist ein starker Ausschlag nach einer einzigen Aufgabe hier korrekt – bei viel vorhandener Evidenz wäre derselbe Ausschlag falsch. Dasselbe Prinzip wie beim Menschen: der erste Eindruck prägt stark, der hundertste kaum noch.

---

## 10. Fehlermuster

### Herkunft

**Entscheidung:** frei entstehende Muster. Kein fest vordefinierter Katalog.

Der Prüfer beschreibt die Ursache, der Konsolidierer gruppiert wiederkehrende Beschreibungen und tauft daraus benannte Muster.

**Begründung:** Ein fester Katalog kann nur finden, was vorher gedacht wurde. Fachspezifische Muster wie „verwechselt Netz- und Broadcast-Adresse" – die nützlichsten – kämen darin nie vor.

**Bekanntes Risiko:** Freie Beschreibungen fransen aus. „Liest zu schnell", „überfliegt die Aufgabe" und „übersieht Angaben" sind dreimal dasselbe in drei Formulierungen.

### Vier Auflagen gegen das Ausfransen

1. **Halbstrukturierte Form** (siehe 5.2): Freiheit im Inhalt, feste Satzform. Daran scheitern solche Systeme normalerweise.
2. **Herkunft mitschreiben:** Jedes Auftreten merkt sich Konzept und Fach. Damit beantwortet sich von selbst, ob ein Muster generisch oder fachspezifisch ist – ein Muster über viele unverwandte Konzepte hinweg ist generisch, eines, das sich in einer Ecke des Graphen ballt, fachspezifisch. **Diese Information ist nachträglich nicht rekonstruierbar** und muss von Anfang an mitgeschrieben werden.
3. **Stabile Namen** (Invariante I12).
4. **Musterverschmelzung folgt derselben Regel wie Konzeptverschmelzung** – zerstörerisch, also Protokoll und Rücknahme. Fastduplikate müssen aber früh und konsequent zusammengeführt werden, sonst stehen nach drei Monaten achtzig Muster da, von denen zwanzig dasselbe meinen.

### Warum generische Muster besonders wertvoll sind

Fachspezifische Muster sind präziser, sterben aber mit dem Fach. Generische Muster sind fachübergreifend: „Du liest Aufgabenstellungen zu schnell" gilt in Netzwerktechnik genauso wie in Recht und Mathematik. Das ist die Aussage, die einen Nutzer tatsächlich trifft, weil sie über sein Fach hinausgeht und etwas über ihn selbst sagt. Kein Lehrer mit 24 Schülern und kein Chatbot ohne Gedächtnis liefert das.

### Anzeigeschwelle

**Entscheidung:** Anzeige erst ab klarer Wiederholung.

**Präzisierung:** Die Schwelle ist keine reine Zahl, sondern **Wiederholung über verschiedene Konzepte und über Zeit**. Sieben Fehler an einem müden Abend in einem einzigen Thema sind kein Charakterzug, sondern ein schlechter Abend.

**Tonalität:** Beobachtung mit Beleg, kein Urteil. Mit der Möglichkeit für den Nutzer zu widersprechen – ein Widerspruch ist selbst ein wertvolles Signal.

**Wichtig:** Intern nutzt das Gehirn Muster längst, bevor es sie ausspricht. **Es handelt auf Verdacht, es redet nur über Gewissheit.**

---

## 11. Vom Netz zum Pfad – Abbildung auf die Oberfläche

### Der Grundwiderspruch

Das Gedächtnis ist ein **Netz** mit meist mehreren gültigen Reihenfolgen. Die Oberfläche zeigt einen **Pfad**: Knoten auf einer Linie, mit Fortschritt. Jemand muss eine Reihenfolge wählen – die Frage ist, wer und wie oft.

### Reihenfolge: fester Pfad mit adaptiven Einschüben

**Begründung:** Menschen bleiben an Lernsystemen dran, weil sie eine Strecke schrumpfen sehen. Das funktioniert nur, wenn die Strecke stillhält. Ein Nenner, der sich jede Sitzung ändert, macht jede Fortschrittsanzeige bedeutungslos – und die Mastery-Anzeige hängt genau daran.

Adaptivität braucht das Umsortieren nicht: fast der gesamte adaptive Wert steckt in *welche Aufgabe*, *welche Schwierigkeit*, *wie oft wiederholt* und *welcher Umweg wird eingeschoben* – nicht in der Grundrichtung.

Zusätzlich ist eine feste Grundordnung erklärbar, testbar und debugbar. Bei einer jede Sitzung neu berechneten Reihenfolge ist im Fehlerfall nie unterscheidbar, ob eine seltsame Abfolge ein Bug oder eine kluge Entscheidung war.

**Auflage:** Weil die Konsolidierung den Graphen umbauen darf, muss die feste Reihenfolge **nachziehbar** sein. Wird ein Konzept aufgespalten, gehören die neuen Knoten an ihre logisch richtige Stelle im Pfad einsortiert, nicht hinten angehängt. Sonst zerfällt die Ordnung mit der Zeit.

### Sichtbarkeit: Überblick plus Fokus

Der ganze Pfad auf einmal ist bei vierzig Konzepten entmutigend. Nur die nächsten Schritte zu zeigen nimmt zwar Druck, macht aber weder die schrumpfende Strecke sichtbar noch die Auswahl eines Zielumfangs möglich – Letzteres ist zwingend nötig, weil das Ziel übersteuern darf (6.3).

**Umsetzung:** Der Überblick zeigt **verdichtet** – Themen als Gruppen, nicht jedes einzelne Konzept. Der Arbeitsbereich zeigt den aktuellen Abschnitt in voller Auflösung. Das entspricht der bestehenden dreistufigen Inhaltshierarchie: die oberen zwei Ebenen sind Überblick, die unterste ist Fokus.

**Auflage:** Adaptive Einschübe müssen im Überblick **sichtbar** werden. Wächst der Pfad im Hintergrund, weil Umwege eingebaut werden, und die Prozentzahl fällt deshalb, wirkt das wie ein Fehler. Als markierter Einschub mit Begründung wirkt dasselbe Ereignis wie Fürsorge.

---

## 12. Modellrollen im Überblick

| Rolle | Aufgabe | Modell nötig | Anforderungsprofil |
|---|---|---|---|
| **Kartograf** | Graph aus Material bauen, Chats Konzepten zuordnen | ja | höchstes Verständnis, kritischste Rolle |
| **Prüfer** | Antworten bewerten, Ursache und Zuversicht liefern | ja | Genauigkeit, Kalibrierung der eigenen Unsicherheit |
| **Generator** | Aufgaben, Karten, Arbeitsblätter erzeugen | ja | Geschwindigkeit, Formatvielfalt |
| **Kontrolleur** | Generiertes gegen Quelle prüfen, ggf. gegenlösen | ja | Unabhängigkeit vom Generator |
| **Konsolidierer** | Muster verdichten, Strukturumbau vorschlagen | ja | Mustererkennung über grosse Datenmengen |
| **Erklärer** | in einem Satz begründen, warum jetzt diese Aufgabe | ja | Kürze, Verständlichkeit |
| **Planer** | auswählen, was als Nächstes kommt | **nein** | deterministische Logik (I11) |

### Verteilung: eigenes Modell pro Rolle

**Zwei Auflagen, damit das wartbar bleibt:**

1. **Vermittlungsschicht.** Die Rollen kennen die Modelle nie direkt. Dazwischen liegt eine Konfiguration, in der steht, welche Rolle auf welchem Modell läuft. Ein Modellwechsel ist dann eine Konfigurationsänderung, kein Umbau.
2. **Eigener Qualitätstest je Rolle** mit festen Beispielfällen. Bei fünf oder sechs Modellen im Betrieb fällt eine Verschlechterung sonst erst durch Nutzerbeschwerden auf – und dann ist unklar, welche Rolle schuld ist.

---

## 13. Entscheidungsprotokoll

| # | Frage | Entscheidung | Verworfen |
|---|---|---|---|
| 1 | Auflösung des Lernerbilds | Konzept + Fehlermuster | Themenebene, reine Fehlermusterebene |
| 2 | Wahrheitsquelle | Material als Anker, KI ergänzt markiert | nur Material, KI gleichberechtigt |
| 3 | Verknüpfung der Konzepte | gerichteter Voraussetzungsgraph | reine Hierarchie |
| 4 | Geltungsbereich des Graphen | pro Nutzer | geteilt pro Fach |
| 5 | Werte pro Konzept | Beherrschung, Sicherheit, Anwendungstiefe | nur Beherrschung |
| 6 | Propagation | beide Richtungen, nur auf Sicherheit, gedämpft | keine, nur rückwärts |
| 7 | Signalquellen | bewertete Aufgaben + Chat | nur Aufgaben, zusätzlich Selbsteinschätzung |
| 8 | Prüferausgabe | Ursache, Teilpunkte, Zuversicht | richtig/falsch |
| 9 | Planertyp | feste Logik | KI-Modell |
| 10 | Konfliktlösung | gewichtet, Ziel übersteuert | feste Prioritätenreihenfolge |
| 11 | Steuerungsverteilung | Nutzer setzt Ziel, Gehirn plant Weg | Gehirn entscheidet allein |
| 12 | Erzeugungszeitpunkt | Echtzeit, Vorproduktion versetzt | Vorrat |
| 13 | Qualitätssicherung | Quellenabgleich (Gegenlösen empfohlen, offen) | keine Prüfung |
| 14 | Konsolidierungsauslöser | Evidenzgewicht, mit Wartezeitgrenze | nach Sitzung, nächtlich |
| 15 | Konsolidierungsumfang | Lernerbild + Graph | nur Lernerbild |
| 16 | Absicherung Verschmelzung | Nutzerbestätigung + Protokoll | vollautomatisch |
| 17 | Werte bei Umbau | konservativ, niedrigerer gewinnt | erben ohne Abzug, verwerfen |
| 18 | Kaltstart | adaptive Suche im Lernen | Einstufungstest, Selbsteinschätzung |
| 19 | Kaltstart-Sichtbarkeit | Satz vorab + Ergebnis am Ende | unsichtbar, getrennte Phase |
| 20 | Fehlermusterherkunft | frei entstehend | fester Katalog, Hybrid |
| 21 | Musteranzeige | erst ab Wiederholung über Konzepte und Zeit | sofort, nie |
| 22 | Pfadreihenfolge | fest + adaptive Einschübe | jede Sitzung neu, komplett fest |
| 23 | Pfadsichtbarkeit | Überblick verdichtet + Fokus | ganzer Pfad, nur nächste Schritte |
| 24 | Modellverteilung | eigenes Modell pro Rolle | ein Modell, zweistufig |

---

## 14. Offene Punkte

| Thema | Was noch fehlt |
|---|---|
| **Gegenlösen** | Entscheidung offen. Empfehlung: bei allen Aufgaben mit eindeutiger Lösung (Kapitel 7.2). |
| **Produktionsformate** | Welcher Aufgabentyp bedient welche Anwendungstiefe. Die Verbindung zwischen Gehirn und dem, was der Nutzer in die Hand bekommt. |
| **Chatbündelung** | Mehrere Chats zu einem Lernpfad zusammenführen. Das ist das Kernszenario der Prüfungsvorbereitung und hat in der Oberfläche bislang keinen Einstiegspunkt. |
| **Kostensteuerung** | Budgetgrenzen pro Nutzer und Rolle bei Echtzeitproduktion mit sechs Modellen. |
| **Geteilter Strukturlayer** | Zurückgestellt, aber durch Invariante I10 offen gehalten. |

---

## 15. Empfohlene Bauabfolge

Nicht alles auf einmal. Die Reihenfolge ergibt sich daraus, was ohne was nicht testbar ist.

1. **Gedächtnis** – Wissensgraph und Lernerbild als getrennte Strukturen. Ohne sie hat nichts anderes ein Zuhause.
2. **Kartograf** – ein Dokument rein, ein Graph raus. Hier liegt das grösste Qualitätsrisiko, also früh und ausgiebig testen.
3. **Planer** – deterministische Auswahl mit den vier Dringlichkeiten. Zunächst ohne Ziel, nur Wiederholung und Lücken.
4. **Generator + Kontrolleur** – erst ein Aufgabenformat, sauber, mit Quellenabgleich.
5. **Prüfer** – mit Ursache und Zuversicht von Anfang an. Nicht erst richtig/falsch bauen und später erweitern; die Datenstruktur muss von Beginn an stimmen.
6. **Propagation** – erst wenn genug echte Bewertungen durchlaufen, sonst nicht sinnvoll beobachtbar.
7. **Kaltstart** – erst sinnvoll, wenn der Graph verlässlich ist.
8. **Konsolidierer** – zuletzt. Er braucht Daten, die erst durch die Nutzung entstehen.

**Vertikaler Schnitt für den ersten lauffähigen Durchstich:** ein kleiner Graph von Hand, ein Aufgabenformat, Prüfer, Lernerbild-Aktualisierung, ein Planer mit nur einer Dringlichkeit. Damit läuft der Kreislauf einmal komplett – und ab da ist alles Weitere eine Erweiterung statt eines Neubaus.

---

## 16. Glossar

| Begriff | Bedeutung |
|---|---|
| **Anwendungstiefe** | Erkennen, Anwenden oder Übertragen – auf welcher Ebene ein Konzept sitzt |
| **Beherrschung** | wie gut die Person ein Konzept kann |
| **Einschub** | ein vom Gehirn eingeschobener Umweg im Pfad, meist zur Reparatur einer Voraussetzungslücke |
| **Evidenzgewicht** | gewichtete Menge an Belegen; bewertete Aufgaben wiegen mehr als Chatsignale |
| **Front** | die Grenze zwischen dem, was jemand kann, und dem, was noch offen ist |
| **Konzept** | kleinste prüfbare Teilfähigkeit im Wissensgraph |
| **Lernerbild** | alles, was das Gehirn über die Person weiss |
| **Propagation** | Weitergabe von Zweifel entlang der Voraussetzungskanten |
| **Sicherheit** | wie belastbar eine Einschätzung ist |
| **Wissensgraph** | die Landkarte des Stoffs, ohne Personenbezug |
| **Zuversicht** | wie sicher sich der Prüfer seiner eigenen Bewertung ist |
