# Straton – UI-Spezifikation des Lernpfad-Bereichs

**Version:** 1.1
**Stand:** 19. August 2026
**Gehört zu:** `straton-gehirn-architektur.md` (Version 1.1)
**Referenzprototypen:** `straton-prototyp.html`, `straton-lernpfad-ui.html`, `straton-lernsitzung-ui.html`

> **Hinweis zur Nummerierung:** Fünf Regeln, die zunächst hier standen, sind mit Architektur 1.1 dorthin gewandert, weil sie bestimmen, welche Daten entstehen: Formatzuordnung, Wiederholungsgrenze, Vorratserzeugung, Erklärtexte, Musterkatalog-Geltungsbereich. Sie sind dort die Entscheidungen 25–29. Dieses Dokument beschreibt sie weiterhin, aber nur in ihrer Auswirkung auf die Oberfläche. Bei Widersprüchen gilt das Architekturdokument.

---

## 0. Zweck und Abgrenzung

Dieses Dokument beschreibt, **wie das digitale Gehirn für den Nutzer sichtbar und bedienbar wird**. Es setzt die Architektur voraus und wiederholt sie nicht.

Die Aufgabenteilung zwischen den beiden Dokumenten:

| | Architekturdokument | Dieses Dokument |
|---|---|---|
| beantwortet | Was darf das Gehirn, welche Daten fliessen wohin | Wie wird das sichtbar, was kann der Nutzer tun |
| ändert sich | selten, jede Änderung ist eine Grundsatzentscheidung | häufig, beim Gestalten |
| Faustregel | beeinflusst, welche Daten ins Lernerbild fliessen | beeinflusst nur, wie derselbe Vorgang aussieht |

**Kapitel 15 ist das Bindeglied**: dort steht pro Bildschirm, welche Felder die Oberfläche vom Gehirn braucht. Wer die Anbindung baut, sollte dort anfangen.

---

## 1. Leitprinzipien der Oberfläche

Diese fünf Sätze erklären fast jede Einzelentscheidung in diesem Dokument.

**P1 — Ein primärer Weg.** Auf jedem Bildschirm gibt es genau eine offensichtliche Hauptaktion. Wer nichts entscheiden will, muss nichts entscheiden. Der Zielnutzer kommt unter Zeitdruck und mit wenig Geduld.

**P2 — Das Gehirn hat keinen eigenen Bildschirm.** Es wird dort sichtbar, wo es handelt: in der Begründung über der nächsten Aufgabe, im Zustand der Knoten, im Knoten-Panel, in der Abschlussbilanz. Ein Statistik-Dashboard wird zweimal angeschaut und nie wieder.

**P3 — Adaptivität muss erzählt werden.** Jede Abweichung vom Erwarteten (Einschub, eingemischte Wiederholung, fallender Prozentwert) braucht einen Satz Begründung. Unerklärt wirkt Adaptivität wie ein Fehler. Erklärt wirkt derselbe Vorgang wie Fürsorge.

**P4 — Verdichten, dann fokussieren.** Übersicht immer auf Themenebene, Detail immer auf Konzeptebene. Nie beides gleichzeitig in voller Auflösung.

**P5 — Nur ein Vollbildwechsel.** Der einzige echte Bildschirmwechsel im ganzen Bereich ist der Eintritt in eine Sitzung. Aufklappen, Auswählen und Ansehen passieren an Ort und Stelle.

---

## 2. Informationsarchitektur

### Drei Ebenen, keine vierte

| Ebene | Beispiel | Wo sichtbar | Werte |
|---|---|---|---|
| **Lernpfad** | Netzwerke M129 | Sidebar-Eintrag, Kopfzeile | hochgerechnet |
| **Thema** | Adressierung | aufklappbare Sektion im Pfad | hochgerechnet |
| **Konzept** | Binärumrechnung | Knoten in der Themensektion | **einzige gespeicherte Ebene** |

Unterkapitel gibt es bewusst nicht. Die Hierarchie dient nur der Navigation; die inhaltlichen Beziehungen stecken im Voraussetzungsgraph. Zwei konkurrierende Ordnungssysteme würden die Hochrechnung mehrdeutig machen.

Begriffsregel: **Thema**, nicht „Kapitel". Ein Name pro Ebene.

### Bildschirme

1. **Lernpfad-Bereich** (Standard) mit drei Tabs
2. **Lernsitzung** (Vollbild)
3. **Wiederholungsstapel** (Vollbild)

---

## 3. Der Lernpfad-Bereich

### 3.1 Kopfzeile

Enthält: Fortschrittsring des Pfades, Name, Kurzstatistik (`15 Konzepte · 7 gefestigt · 2 fällig`), Ziel-Chip.

**Der Ziel-Chip** ist funktional, kein Etikett. Er zeigt Termin, Umfang und die Machbarkeitseinschätzung: `Ziel: Prüfung Freitag · 11 Konzepte · wird knapp`. Ohne ihn kann der Nutzer die Ziel-Übersteuerung aus Architekturkapitel 6.3 gar nicht auslösen. Ist kein Ziel gesetzt, steht dort `Ziel setzen`.

### 3.2 Tabs — nach Absicht, niemals nach Format

| Tab | Absicht | Inhalt |
|---|---|---|
| **Pfad** | lernen | Jetzt-Karte, Themenliste, Einsichten |
| **Wiederholen** | auffrischen | fälliger Stapel, mit Zähler im Tab |
| **Material** | nachschlagen, exportieren | Quellen, Arbeitsblätter |

**Warum nicht nach Format:** Tabs mit den Namen „Quiz", „Lernkarten", „Arbeitsblätter" würden die Formatwahl an den Nutzer abgeben. Das Format ist aber eine Planerentscheidung, abgeleitet aus der Anwendungstiefe. Format-Tabs machen das Gehirn umgehbar und das Produkt zu einem gewöhnlichen Lerntool.

**Einsichten** ist bewusst kein vierter Tab, sondern eine Karte unten im Pfad — es soll etwas sein, das einem begegnet, kein Ort, den man besuchen muss.

### 3.3 Die Jetzt-Karte

Der einzige primäre Handlungsweg des ganzen Bereichs.

Aufbau: Kennzeichnung (`Jetzt dran`), Konzeptname, **Begründung in einem Satz**, Hauptknopf `Weiterlernen`, Nebenknopf `Später`.

Die Begründung stammt vom Erklärer und erfüllt Invariante I8. Beispiele nach Auslöser:

| Auslöser | Beispieltext |
|---|---|
| Einschub | „Ich schiebe das hier ein: deine Fehler bei der Subnetzmaske kommen aus den Zweierpotenzen, nicht aus dem Rechenweg." |
| Wiederholung | „Das war 19 Tage unangetastet und fängt an zu verfallen." |
| Zielmodus | „Steht im Prüfungsumfang und ist von deinen offenen Punkten der grundlegendste." |
| Regulär | „Nächster Schritt im Pfad. Die Voraussetzungen dafür sitzen." |

**`Später` ist Pflicht, nicht Höflichkeit.** Ein System ohne Widerspruchsmöglichkeit wird als bevormundend erlebt. Die Ablehnung ist zudem selbst ein Signal. Nach dem Klick wählt der Planer die nächstdringlichste Option und begründet erneut.

### 3.4 Die Themenliste

Themen sind Sektionen, auf- und zuklappbar. Standard: das Thema mit dem aktuellen Knoten ist offen, alle anderen zu.

Themenkopf: Ring mit gefestigt-Anteil, Name, Kurzstatus (`2 von 5 · hier bist du gerade`).

### 3.5 Knotenzustände — verbindliche Darstellung

Der Zustand steckt **primär in der Form**, nicht in der Farbe. Farbenblindheit und ein einzelner Akzentfarbwechsel dürfen die Bedeutung nicht zerstören.

| Zustand | Punkt | Zusatz | Bedingung im Gehirn |
|---|---|---|---|
| offen | leerer Kreis, grauer Rand | — | keine Evidenz |
| jetzt dran | gefüllt, Akzent, Halo | — | vom Planer gewählt |
| unsicher | gestrichelter Rand | — | Sicherheit niedrig oder Propagationsverdacht |
| gefestigt | vollflächig gefüllt | — | Beherrschung hoch, Sicherheit ausreichend |
| fällig | Rand in Warnfarbe | Marke `fällig` | Verfall unter Schwelle |
| Einschub | wie „jetzt dran" | Marke `Einschub`, eingerückt, gestrichelte Verbindungslinie | ausserhalb der Grundordnung eingefügt |
| neu | wie „unsicher" | Marke `neu` | von der Konsolidierung ergänzt |

**Der Einschub ist kein Sondermodus.** Er ist ein normaler Konzeptknoten an ungewohnter Stelle. Gleiches Panel, gleiche Sitzung, nur mit Markierung und Begründungszeile. Er soll sich wie ein kurzer Umweg anfühlen, nicht wie ein anderes Produkt.

### 3.6 Das Knoten-Panel

Öffnet sich beim Antippen eines Knotens — rechts auf Desktop, als Sheet von unten auf Mobil. **Kein Bildschirmwechsel.**

Inhalt:

1. Konzeptname
2. **Herkunftszeile** — `Skript Seite 12 · aus deinem Material` oder `KI-ergänzt · nicht in deinem Skript`. Erfüllt Invariante I4 an der Oberfläche. Bei KI-ergänzten Knoten zusätzlich ein Hinweis, dass der Nutzer prüfen soll, ob es im Unterricht vorkam.
3. **Die drei Werte, alle offen sichtbar:**
   - Beherrschung als Prozentwert mit Balken
   - Sicherheit als Wort (`niedrig` / `mittel` / `hoch`) mit Balken
   - Anwendungstiefe als drei Stufen (`Erkennen` / `Anwenden` / `Übertragen`)
4. **Befundzeile** — der letzte Prüferbefund im Klartext: „Zuletzt dreimal dieselbe Ursache: Zweierpotenzen verwechselt."
5. Aktionen: `Hier üben` (primär), `Erklären lassen`, `Im Chat dazu fragen`, `Knoten bearbeiten`

**Ersterklärung der Werte (Pflicht).** Beim ersten Öffnen eines Panels erscheint einmalig eine kurze Erläuterung, sonst liest ein Schüler „Sicherheit 18 %" als zweite Note. Vorgesehene Texte:

> **Beherrschung** — wie gut du das gerade kannst.
> **Sicherheit** — wie sicher ich mir bei dieser Einschätzung bin. Niedrig heisst nicht, dass du es nicht kannst, sondern dass ich es noch nicht oft genug gesehen habe.
> **Anwendungstiefe** — ob du es wiedererkennst, anwenden kannst, oder in einer fremden Aufgabe erkennst, dass es gebraucht wird.

Danach über ein Fragezeichen jederzeit erneut abrufbar.

**`Knoten bearbeiten`** ist die Handkorrektur aus Architekturkapitel 3: umbenennen, Voraussetzung ergänzen oder streichen, mit einem anderen Knoten zusammenlegen. Sie ist Pflicht, weil der Kartograf Fehler macht und die Konsolidierung nicht alles repariert.

### 3.7 Die Einsichten-Karte

Unten im Pfad, mit Zähler: `2 Beobachtungen über dich · 1 Frage zu deiner Karte`.

Enthält zwei Sorten Inhalt, die beide **nie während einer Sitzung erscheinen dürfen** (Invariante I7):

**Beobachtungen** — Fehlermuster, die die Anzeigeschwelle überschritten haben. Als Beobachtung mit Beleg formuliert, nicht als Urteil, mit Widerspruchsmöglichkeit:

> Mir fällt auf: in 7 von 9 Fällen stimmte dein Rechenweg, aber du hast eine Angabe aus der Aufgabenstellung übersehen. Das kam in drei verschiedenen Themen vor.
> `Kommt hin` · `Stimmt nicht`

Der Widerspruch ist selbst ein wertvolles Signal und muss zurückfliessen.

**Kartenfragen** — Verschmelzungsvorschläge der Konsolidierung, in Nutzersprache statt Graphensprache:

> Meinen „Subnetzmaske" und „Netzmaske berechnen" bei dir dasselbe?
> `Ja, zusammenlegen` · `Nein, das ist verschieden` · `Weiss ich nicht`

Bei Bestätigung muss der Dialog die konservative Wertregel ankündigen, sonst wirkt der Fortschrittsverlust wie ein Fehler:

> Ich lege beide zusammen. Der Fortschritt wird dabei vorsichtshalber auf den niedrigeren Wert gesetzt und in den nächsten Sitzungen schnell wieder überprüft.

Unbeantwortete Kartenfragen verfallen nach einer Weile ohne Änderung.

---

## 4. Die Lernsitzung

### 4.1 Rahmen

Vollbild. Kopfzeile: `✕`, Konzeptname, Untertitel mit Art und Zeitschätzung (`Einschub · Adressierung · etwa 8 Minuten`), Zähler `3 / 5`.

**Die ehrliche Zeitangabe am Anfang senkt Abbrüche stärker als jede Motivationsgrafik.**

Fortschritt als Segmentleiste, ein Segment pro Aufgabe: neutral (offen), Akzent (aktuell), grün (richtig), warnfarben (falsch).

### 4.2 Länge und Zusammensetzung

**Feste Anzahl Aufgaben pro Sitzung.** Damit ist die Segmentleiste ehrlich — bei adaptiver Länge wäre „3 von 5" gelogen.

Der Planer **füllt die Plätze**. Eine Sitzung hat einen Ankerknoten, aber nicht alle Aufgaben stammen zwingend daraus:

| Platz | Herkunft |
|---|---|
| Mehrheit | Ankerknoten, in aufsteigender Anwendungstiefe |
| mindestens einer | fällige Wiederholung aus einem anderen Konzept (Mindestreserve, Invariante I9) |
| Rest | nächstes Konzept im Pfad, falls der Anker früher sitzt |

Eingemischte Wiederholungen werden **gekennzeichnet**: Kennzeichnung `Wiederholung · VLSM` und ein Untertitel „Eingemischt aus deinem fälligen Stapel — nicht Teil des Einschubs." Ohne diese Markierung wirkt es wie ein Themensprung.

### 4.3 Aufgabentypen nach Anwendungstiefe

**Verbindliche Zuordnung.** Der Nutzer wählt den Typ nie.

| Anwendungstiefe | Typen | Evidenzstärke |
|---|---|---|
| **Erkennen** | Auswahlfrage, Kurzantwort, Zuordnung | mittel; Auswahlfragen leiden unter Raten |
| **Anwenden** | Rechenaufgabe mit Eingabe, Verfahrensaufgabe, Lückenrechnung | hoch |
| **Übertragen** | eingekleidetes Szenario ohne Nennung des Konzepts, Fehlersuche in gegebener Lösung, „erkläre warum" | am höchsten, aber teuer in der Bewertung |

Die Diagnoseaufgabe (Fehlersuche) ist ein Sonderfall: sie prüft Übertragen und liefert zugleich besonders präzise Fehlerursachen, weil der Nutzer selbst auf den Fehler zeigt.

**Ansteigende Reihenfolge innerhalb der Sitzung.** So entsteht pro Sitzung Evidenz auf mehreren Tiefenstufen, statt fünfmal auf derselben.

### 4.4 Erklärstellen

Straton ist **kein Lehrbuch** — die Quelle ist das Lehrbuch. Erklärt wird an genau drei Stellen:

**(a) Kurzer Einstieg bei neuen Konzepten.** Nur wenn Beherrschung und Sicherheit bei null stehen. Drei bis fünf Sätze, aus der Quelle, mit Seitenangabe. Ein Absatz, kein Kapitel. Bei Wiederholungen und bei bereits begonnenen Konzepten entfällt er.

Begründung: Kaltabfragen ohne jedes Vorwissen erzeugt Frust und keine verwertbare Evidenz — ein Nichtwissen ohne Vorwissen diagnostiziert nichts.

**(b) In der Rückmeldung nach dem Versuch.** Der eigentliche Lernmoment. Wer erst versucht und dann die Erklärung bekommt, behält mehr als wer erst liest.

**(c) Nach `Ich weiss es nicht`.** Vollständige Erklärung, weil dort Bedarf und Aufmerksamkeit am höchsten sind.

Alles darüber hinaus geht in den **Chat**. Der ist der Erklärmotor, nicht die Sitzung.

**Erzeugung:** Erklärtexte sind eine eigene Ausgabeart des Generators mit Quellenbindung. Sie unterliegen dem Quellenabgleich durch den Kontrolleur (Invariante I5) wie jede Aufgabe.

### 4.5 Rückmeldung

Erscheint nach dem Prüfen, unterhalb der Aufgabe, in ruhiger Farbfläche.

Aufbau:

1. **Verdikt** — `Richtig` / `Noch nicht` / bei „weiss ich nicht": `Zählt als offen, nicht als Fehler.`
2. **Ursache im Klartext**, nicht nur die Lösung: „Fast. 255 ist der höchste Wert, aber die Anzahl ist 256 — die Null zählt mit. Genau diese Verwechslung taucht bei dir wieder auf."
3. **Aufklappbar: „Wie es richtig geht"** — Rechenweg oder Begründung
4. **Quellenzeile** — `Skript Seite 12`, anspringbar

Ton: sachlich, nie tadelnd, nie überschwänglich. `Noch nicht` statt `Falsch`.

### 4.6 `Ich weiss es nicht`

Steht als Nebenknopf bei **jeder** Aufgabe. Der wichtigste unscheinbare Baustein der Sitzung: ohne ihn rät der Nutzer, und Raten erzeugt verrauschte Evidenz, die das Lernerbild verschmutzt.

Wird ausdrücklich als **offen** verbucht, nicht als Fehler — und dem Nutzer auch so gesagt.

### 4.7 Nach einer falschen Antwort

**Kein erneuter Versuch, keine Wiederholung innerhalb derselben Sitzung.** Das Konzept kommt in einer späteren Sitzung wieder.

Folgen für die Oberfläche: die Segmentleiste springt nie zurück, die Sitzungslänge bleibt planbar, und es entsteht kein Frustkreisel. Der Weiter-Knopf heisst nach der Rückmeldung schlicht `Weiter`, bei der letzten Aufgabe `Sitzung abschliessen`.

### 4.8 Werte bewegen sich erst in der Bilanz

**Während der Sitzung werden keine Werte aktualisiert angezeigt.** Kein steigender Ring, keine Prozentzahl neben der Aufgabe.

Begründung: Zwischenstände nach einzelnen Antworten springen stark und wirken nach einem Fehler entmutigend. Die gesammelte Veränderung am Ende ist ruhiger und aussagekräftiger.

**Folge: der Abschlussbildschirm trägt das gesamte Erlebnis.** Er ist der wichtigste Bildschirm der Sitzung, kein Anhängsel.

### 4.9 Abschlussbilanz

Nicht „gut gemacht", sondern **was sich verändert hat**:

```
Sitzung beendet
Das hat sich verändert
4 von 5 richtig · rund 8 Minuten

●  Binärumrechnung              34 % → 58 %
●  Subnetzmaske berechnen       Sicherheit gestiegen
●  Netz- und Broadcast-Adresse  neuer Knoten aus Verdacht

Der Einschub ist erledigt. Weiter geht es regulär mit
Subnetzmaske berechnen — jetzt auf einer Grundlage, die trägt.

[ Zurück zum Pfad ]
```

Enthalten sein müssen, sofern zutreffend: veränderte Beherrschungswerte, gestiegene oder gefallene Sicherheit (auch bei Knoten, an denen nicht direkt gearbeitet wurde — das ist die Propagation, sichtbar gemacht), neu entstandene Knoten, erledigte Einschübe, und ein Satz, wie es weitergeht.

**Beim ersten Mal** steht hier zusätzlich das Kaltstart-Ergebnis (Kapitel 10).

Bei der Rückkehr in den Pfad muss die veränderte Struktur **sofort sichtbar** sein: Ring aktualisiert, Marken entfernt oder gesetzt, neue Knoten vorhanden, Jetzt-Karte mit neuem Inhalt und neuer Begründung.

---

## 5. Der Wiederholen-Bereich

### 5.1 Zuständigkeitsgrenze — verbindlich

| | Wiederholen | Pfad |
|---|---|---|
| Auslöser | **Verfall** | **Fehler und Lücken** |
| Inhalt | was du kannst und wieder verlieren würdest | was du noch nicht kannst |
| Tiefe | Erkennen | alle Stufen |
| Charakter | kurz, mechanisch, für zwischendurch | Erklärung, Ursachensuche, Einschübe |

Ein nie gelerntes Konzept kann nicht verfallen und erscheint im Stapel nie. Ein Konzept, das auf Anwenden- oder Übertragen-Ebene aufgefrischt werden muss, gehört in den Pfad, nicht in den Stapel.

**Verbindung in beide Richtungen:** Verpatzte Wiederholungen senken die Beherrschung und können ein Konzept zurück in den Pfad rutschen lassen. Umgekehrt wandert ein Konzept erst in den Stapel, wenn es gefestigt ist und zu verfallen beginnt.

### 5.2 Übersicht

Liste der fälligen Konzepte mit Anzahl und **Grund** (`19 Tage nicht angefasst`, `verfällt in 2 Tagen`, `planmässige Auffrischung`). Zwei Knöpfe: `Stapel starten` und `Nur 3 Minuten`.

**`Nur 3 Minuten` ist der wichtigste Knopf für die Abschlussquote.** Niemand startet acht Abfragen, wenn er zwei Minuten hat — und was nicht gestartet wird, liefert gar keine Evidenz.

Ein erklärender Satz gehört dazu, weil er eine Erwartung bricht:

> Du tippst statt umzudrehen — so bleibt die Bewertung beim Prüfer. Die Formulierungen wechseln zwischen den Durchgängen, damit du das Konzept lernst und nicht die Karte.

### 5.3 Der Stapel

Vollbild, gleiche Bausteine wie die Sitzung, aber schneller getaktet: kein Einstieg, keine Begründung, keine aufklappbaren Erklärungen. Kennzeichnung zeigt Konzept und Fälligkeitsgrund.

Eingabefeld erhält automatisch den Fokus, **Enter prüft** — ohne das ist ein Stapel auf dem Handy zäh.

### 5.4 Abbrechen zählt

Das `✕` verwirft nichts. Jede beantwortete Abfrage ist bereits Evidenz. Das muss auch dastehen — sonst brechen Nutzer aus Verlustangst nicht ab, sondern schliessen den Tab, was dieselbe Sitzung kostet, nur schlechter.

Abschluss zeigt **nicht** eine Punktzahl als Belohnung, sondern **wann das jeweilige Konzept wieder dran ist**. Das ist die einzige Information, die beim Wiederholen interessiert.

### 5.5 Keine selbst erstellten Abfragen

Es gibt keinen `Karte erstellen`-Knopf, keine Kartenliste, keinen Bearbeitungsmodus. Der Stapel enthält nichts zu verwalten, nur etwas zu tun.

Das dahinterliegende Bedürfnis („das will ich behalten") wird an anderer Stelle bedient: `Ins Lernpfad aufnehmen` aus dem Chat (Kapitel 11) erzeugt ein **Konzept**, keine Karte. Die Abfragen dazu macht wieder das Gehirn.

Zusätzlicher Hebel ohne Architekturbruch: **`Das ist mir wichtig`** am Knoten. Legt nichts an, ändert keine Werte, erhöht nur die Dringlichkeit beim Planer.

### 5.6 Erzeugung der Abfragen

Kleiner Vorrat pro Konzept, rotierend, neu erzeugt sobald sich im Lernerbild etwas geändert hat.

Begründung: Bei einer Sitzung mit fünf Aufgaben fällt Echtzeitgenerierung nicht auf. Bei siebzehn kurzen Abfragen, die man im Zug durchklickt, ist Tempo das ganze Produkterlebnis.

### 5.7 Zählerdefinition

Der Zähler im Tab muss stabil sein. „17 Lernkarten" suggeriert 17 existierende Objekte, tatsächlich sind es abgeleitete Prüfpunkte. Entweder eine stabile Formulierung wählen (`5 Konzepte fällig`) oder die Zahl für die Dauer einer Sitzung fixieren. Eine Zahl, die ohne Nutzerhandlung springt, wirkt kaputt.

---

## 6. Der Material-Bereich

Zwei Abschnitte.

**Quellen** — hochgeladene Dokumente mit abgeleiteter Konzeptanzahl, aus Chats gewonnene Konzepte, und getrennt aufgeführt die **KI-ergänzten Konzepte** mit Hinweis, dass sie nicht im Skript stehen. Das ist die Oberflächenumsetzung von Invariante I4 auf Pfadebene.

**Arbeitsblätter** — kein Sitzungsformat, sondern ein **Export**. Auf Anfrage erzeugt, für Papier und offline, Lösungen auf Seite zwei. Sinnvolle Varianten: nach Thema, oder gezielt aus den eigenen Fehlerthemen.

---

## 7. Ziel setzen

Erreichbar über den Ziel-Chip. Drei Eingaben, entsprechend Architekturkapitel 6.3: **Termin**, **Umfang** (Themen- oder Konzeptauswahl), **verfügbare Zeit pro Tag**.

Danach eine **ehrliche Machbarkeitsaussage**, kein Motivationsspruch:

> Bis Freitag sind es 11 Konzepte bei 40 Minuten pro Tag. Das geht sich nur aus, wenn drei davon auf Erkennen-Niveau bleiben statt auf Anwenden.

Bei Unmöglichkeit muss ein konkreter Vorschlag folgen (Umfang kürzen, Zeit erhöhen, Tiefe senken), nicht nur eine Warnung.

Der Umfang braucht die Überblicksdarstellung — deshalb hängt „Überblick verdichtet sichtbar" direkt an der Zielfunktion.

---

## 8. Warte-, Leer- und Fehlerzustände

**Wartezustand bei Echtzeitgenerierung.** Nur die erste Aufgabe einer Sitzung hat spürbare Wartezeit (alle weiteren entstehen vorproduziert während der laufenden Aufgabe). Dort keine leere Fläche, sondern eine benennende Zeile: `Ich baue dir eine Aufgabe zu Binärumrechnung.` Kein Fortschrittsbalken, der Genauigkeit vortäuscht.

**Kontrolleur lehnt ab.** Die Aufgabe wird nie ausgespielt. Für den Nutzer unsichtbar; es wird neu erzeugt. Nur bei wiederholtem Scheitern eine ehrliche Meldung: `Ich bekomme hier gerade keine saubere Aufgabe hin. Ich nehme so lange ein anderes Konzept.` — und der Planer wählt neu.

**Leerer Pfad.** Nach dem Anlegen ohne Material: eine Aufforderung, Material hochzuladen oder aus einem Chat aufzunehmen. Nicht eine leere Themenliste.

**Kein fälliger Stapel.** `Nichts fällig. Komm in zwei Tagen wieder, dann werden 4 Konzepte weich.` — mit konkreter Angabe statt nur „alles erledigt".

---

## 9. Tonalität

Verbindliche Regeln für alle Systemtexte:

- **Ich-Form für das System**, Du-Form für den Nutzer. „Ich schiebe das ein", nicht „Es wurde eingefügt".
- **Beobachtung statt Urteil.** „In 7 von 9 Fällen …" statt „Du bist unaufmerksam".
- **`Noch nicht` statt `Falsch`.**
- **Keine Belohnungssprache.** Kein „Super!", keine Konfetti, keine Serien-Zähler. Die Belohnung ist die sichtbare Veränderung.
- **Zahlen mit Bezug.** Nie „58 %", immer „34 % → 58 %".
- **Kein Fachjargon aus der Architektur.** Nutzer sehen nie die Wörter Propagation, Konsolidierung, Evidenzgewicht, Knoten. In der Oberfläche heisst es Konzept, Thema, Lernpfad.

---

## 10. Kaltstart in der Oberfläche

**Vor der ersten Aufgabe** ein Satz:

> Die ersten Aufgaben nutze ich, um dich einzuschätzen — sie können zu leicht oder zu schwer wirken.

**Am Ende der ersten Sitzung** die Einordnung, zusätzlich zur normalen Bilanz:

> So habe ich dich eingeordnet: Grundlagen sitzen, bei der Adressierung fangen wir an.

Die stark springenden Werte der ersten Sitzung sind dadurch erklärt und wirken lebendig statt kaputt. Die erhöhte Lernrate während dieser Phase ist ein Architekturdetail und wird nicht erwähnt.

---

## 11. Chat → Lernpfad

Der wichtigste Übergang der ganzen App: bis dahin ist Straton ein Chatbot, danach ein Lernsystem.

**Platzierung:** zusätzlich zum bestehenden Kopfzeilenknopf ein unauffälliger Knopf **direkt unter der Antwort** — dort, wo der Nutzer gerade etwas Nützliches bekommen hat und die Bereitschaft am höchsten ist.

**Ablauf:** Kartograf erkennt die berührten Konzepte, dann eine Bestätigung mit Vorschlag:

> Zwei Konzepte erkannt: Subnetzmaske berechnen, Binärumrechnung.
> Passt zu **Netzwerke M129** · `anderer Pfad` · `neuer Pfad`

Ein Klick im Normalfall, zwei im Ausnahmefall.

**Zwei Sonderfälle sind Pflicht:**

*Erster Chat überhaupt, kein Pfad vorhanden.* Direkt anlegen, nur nach einem Namen fragen, und den vorschlagen. Ein neuer Nutzer darf hier nicht vor einem leeren Formular stehen.

*Passt zu keinem bestehenden Pfad.* Ehrlich sagen und einen neuen anbieten, statt den nächstbesten vorzuschlagen. Ein falsch einsortiertes Konzept wird später von der Konsolidierung zu einer falschen Kante verarbeitet.

**Bündelung mehrerer Chats** (Prüfungsvorbereitung): Mehrfachauswahl in der Chatliste über Auswahlfelder beim Überfahren, dann eine Leiste `3 Chats ausgewählt · Lernpfad erstellen`. Bekanntes Muster, muss niemand lernen.

---

## 12. Mobil

Mobil ist der Regelfall, nicht die Ausnahme.

- Knoten-Panel wird zum Sheet von unten, Pfad bleibt dahinter sichtbar
- Tabs bleiben oben, Zähler bleibt sichtbar
- Sitzung: eine Aufgabe pro Bildschirm, ohne Scrollen; Eingabefeld über der Tastatur, Prüfen-Knopf erreichbar
- Stapel: Enter prüft, damit ohne Fingerweg durchgeklickt werden kann
- Themenliste zugeklappt bis auf das aktive Thema

---

## 13. Zustandsübergänge

Diese Übergänge müssen sichtbar animiert oder zumindest eindeutig erkennbar sein, weil sie die Lebendigkeit tragen:

| Ereignis | Sichtbare Folge |
|---|---|
| Sitzung abgeschlossen | Ring des Pfades steigt, Knotenzustände aktualisiert, Jetzt-Karte neu befüllt und neu begründet |
| Einschub erledigt | Marke `Einschub` verschwindet, Einrückung entfällt, Knoten normalisiert sich |
| Neuer Knoten aus Verdacht | erscheint mit Marke `neu` an logisch richtiger Stelle, nicht angehängt |
| Konzept verfällt | Knoten wechselt zu `fällig`, Zähler im Wiederholen-Tab steigt |
| Verschmelzung bestätigt | zwei Knoten werden einer, Wert auf niedrigeren gesetzt, angekündigt |
| Wiederholung verpatzt | Konzept kann aus dem Stapel zurück in den Pfad wandern |

Bei wachsendem Pfad kann der Prozentwert **fallen**, obwohl gelernt wurde (aus 14 werden 15 Konzepte). Das muss begleitet werden — sonst wirkt es wie ein Fehler. Der Zusatz gehört in die Bilanz: „Ein Konzept ist dazugekommen, deshalb verschiebt sich der Anteil."

---

## 14. Was der Nutzer nie sieht

- Die Wörter Propagation, Konsolidierung, Kartograf, Prüfer, Evidenzgewicht, Invariante
- Rohwerte der Sicherheit als Prozentzahl ohne Wort
- Verschmelzungsvorschläge während einer Sitzung
- Fehlermuster unterhalb der Anzeigeschwelle (intern werden sie längst genutzt: **das Gehirn handelt auf Verdacht, es redet nur über Gewissheit**)
- Abgelehnte Generierungen
- Die erhöhte Lernrate während des Kaltstarts

---

## 15. Datenbedarf pro Bildschirm

Das Bindeglied zwischen Gehirn und Oberfläche. Pro Ansicht: was gebraucht wird und woher es stammt.

### Lernpfad-Kopf
| Feld | Quelle |
|---|---|
| Fortschritt gesamt | hochgerechnet aus Beherrschung aller Konzepte |
| Anzahl Konzepte, gefestigt, fällig | Lernerbild |
| Ziel: Termin, Umfang, Machbarkeit | Zielobjekt + Planer-Rückrechnung |

### Jetzt-Karte
| Feld | Quelle |
|---|---|
| gewähltes Konzept | Planer |
| Auslöserart (Einschub, Wiederholung, Ziel, regulär) | Planer |
| Begründungssatz | Erklärer |
| geschätzte Dauer | Planer, aus Aufgabenzahl |

### Themenliste
| Feld | Quelle |
|---|---|
| Themen mit Reihenfolge | fester Pfad |
| Konzepte je Thema, in Pfadreihenfolge | Wissensgraph + Pfadordnung |
| Zustand je Konzept | Lernerbild (Beherrschung, Sicherheit, Verfall) |
| Einschubmarkierung + Grund | Planer |
| Neu-Markierung | Konsolidierung |

### Knoten-Panel
| Feld | Quelle |
|---|---|
| Name | Wissensgraph |
| Herkunft (Quelle/Seite oder KI-ergänzt) | Herkunftsmarkierung, Invariante I4 |
| Beherrschung, Sicherheit, Anwendungstiefe | Lernerbild |
| letzter Befund im Klartext | letzter Prüferbefund |
| Voraussetzungen (für „bearbeiten") | Wissensgraph |

### Lernsitzung
| Feld | Quelle |
|---|---|
| Aufgabenanzahl | fest konfiguriert |
| Platzbelegung (Anker, Wiederholung, Folgekonzept) | Planer |
| Aufgabentyp je Platz | Planer, aus Ziel-Anwendungstiefe |
| Aufgabeninhalt + Musterlösung | Generator, freigegeben durch Kontrolleur |
| Einstiegstext (nur bei neuem Konzept) | Generator, quellengebunden |
| Verdikt, Teilpunkte, Ursache | Prüfer |
| ausführliche Erklärung | Generator, quellengebunden |
| Quellenverweis | Herkunftsmarkierung |

### Abschlussbilanz
| Feld | Quelle |
|---|---|
| veränderte Beherrschungswerte vorher/nachher | Lernerbild vor und nach der Sitzung |
| veränderte Sicherheiten, auch propagierte | Propagationsergebnis |
| neue oder umgebaute Knoten | Konsolidierung |
| nächster Schritt + Begründung | Planer + Erklärer |
| Kaltstart-Einordnung (nur erste Sitzung) | Kaltstartverfahren |

### Wiederholen
| Feld | Quelle |
|---|---|
| fällige Konzepte mit Grund und Anzahl | Verfallsmodell |
| Abfragen | Generator-Vorrat je Konzept |
| nächste Fälligkeit je Konzept | Verfallsmodell |

### Einsichten
| Feld | Quelle |
|---|---|
| Muster über Schwelle, mit Belegzahl und Streuung | Musterkatalog, pfadübergreifend |
| offene Kartenfragen | Konsolidierung, Verschmelzungsvorschläge |
| Widerspruch des Nutzers | zurück an den Musterkatalog |

---

## 16. Entscheidungsprotokoll Oberfläche

Die Nummerierung setzt das Architekturprotokoll fort. Die Entscheidungen 25–29 stehen dort, nicht hier.

| # | Frage | Entscheidung |
|---|---|---|
| 30 | Tabs im Lernpfad | nach Absicht (Pfad, Wiederholen, Material), nicht nach Format |
| 31 | Selbst erstellte Abfragen | nein, nur automatisch |
| 32 | Erklärzeitpunkt in der Sitzung | kurzer Einstieg bei neuen Konzepten, sonst nach dem Versuch |
| 33 | Sitzungslänge | feste Anzahl Aufgaben, Planer füllt die Plätze |
| 34 | Sichtbarkeit des Lernerbilds | alle drei Werte offen, mit einmaliger Ersterklärung |
| 35 | Nach falscher Antwort | kein erneuter Versuch, erst in einer späteren Sitzung |
| 36 | Wertaktualisierung | erst in der Abschlussbilanz, nicht live |
| 37 | Navigationstiefe | ein einziger Vollbildwechsel (Sitzung/Stapel) |
| 38 | Zustandskodierung | primär über Form, nicht über Farbe |

---

## 17. Offene Punkte

| Thema | Was fehlt |
|---|---|
| Aufgabenanzahl je Sitzung | konkrete Zahl noch nicht festgelegt (Vorschlag: 5 bis 7) |
| Schwellenwerte | ab welcher Beherrschung gilt „gefestigt", ab welchem Verfall „fällig" |
| Einsichten-Bereich | vollständiges Layout, bisher nur Inhaltsdefinition |
| Ziel setzen | Ablauf der Umfangsauswahl im Detail |
| Chatbündelung | Auswahlmodus in der Chatliste, Ablauf beim Zusammenführen |
| Arbeitsblatt-Export | Format, Umfang, Layout |
| Gegenlösen | Architekturentscheidung 13 weiterhin offen (Empfehlung: bei eindeutig lösbaren Aufgaben) |
