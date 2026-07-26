# Straton — KI-Architektur & Systemdesign

## Das Kernprinzip

Straton hat eine unsichtbare Schicht die alles antreibt: das **Konzept-Netz**. Die meisten Lernplattformen tracken Fortschritt auf Themen-Ebene ("Subnetting: 60%"). Straton trackt auf **Konzept-Ebene** — atomare Wissenseinheiten innerhalb eines Themas.

Ein Thema wie "Subnetting" besteht intern aus 8-12 Konzepten: "Binäre Umrechnung", "Subnetzmaske lesen", "CIDR-Notation", "Netzadresse berechnen", "Broadcast berechnen", "VLSM-Prinzip", "VLSM-Berechnung", etc.

Jede Frage, jede Lernkarte, jedes Arbeitsblatt ist an ein oder mehrere Konzepte geknüpft. Wenn der User eine Frage falsch beantwortet, weiss das System nicht nur "Subnetting ist schwach", sondern **exakt** "VLSM-Berechnung ist schwach, aber CIDR-Notation sitzt".

Das ist der Unterschied zu allem was es gibt.

---

## Die 7 Schichten

```
┌─────────────────────────────────────────────┐
│  SCHICHT 7: Session-Orchestrator            │
│  Was sieht der User jetzt? Wo war er?       │
├─────────────────────────────────────────────┤
│  SCHICHT 6: Scoring & Zeitsteuerung         │
│  Mastery berechnen, Wiederholung planen     │
├─────────────────────────────────────────────┤
│  SCHICHT 5: Content-Generator               │
│  Erklärungen, Karten, Blätter erzeugen      │
├─────────────────────────────────────────────┤
│  SCHICHT 4: Adaptiver Motor                 │
│  Was zeigen? Was überspringen? Was einfügen? │
├─────────────────────────────────────────────┤
│  SCHICHT 3: Lerner-Modell                   │
│  Was weiss der User? Pro Konzept.           │
├─────────────────────────────────────────────┤
│  SCHICHT 2: Curriculum-Generator            │
│  Themenreihenfolge, Schritte, Abhängigkeiten│
├─────────────────────────────────────────────┤
│  SCHICHT 1: Content-Ingestion               │
│  Rohmaterial → Konzept-Netz                 │
└─────────────────────────────────────────────┘
```

---

## Schicht 1: Content-Ingestion

**Aufgabe:** Verwandle das hochgeladene Material des Users in strukturiertes Wissen.

**Eingabe:** Was der User hochlädt oder eingibt — PDF, Textdatei, Foto von Notizen, kopierter Text, Link, oder ein Thema in natürlicher Sprache ("Ich muss Modul M129 lernen").

**Was die KI tut:**

1. **Extraktion** — Text aus dem Dokument holen, OCR bei Bildern, Struktur erkennen (Kapitel, Überschriften, Listen).

2. **Konzept-Erkennung** — Die KI liest den gesamten Inhalt und identifiziert die atomaren Konzepte. Nicht die Kapitelstruktur des Dokuments (die ist oft schlecht), sondern die tatsächlichen Wissenseinheiten darin. Aus einem 20-seitigen PDF zu Subnetting extrahiert sie z.B.: "Subnetzmaske Definition", "Binäre Umrechnung", "CIDR-Notation", "Netzadresse berechnen", etc.

3. **Beziehungen erkennen** — Welches Konzept setzt welches voraus? "VLSM-Berechnung" braucht "Subnetzmaske berechnen" braucht "Binäre Umrechnung". Die KI baut einen gerichteten Graphen: Konzepte als Knoten, Abhängigkeiten als Kanten.

4. **Schwierigkeits-Einschätzung** — Jedes Konzept bekommt eine initiale Schwierigkeit (1-5), basierend auf Komplexität, Abstraktionsgrad und Anzahl Abhängigkeiten.

5. **Referenz-Speicherung** — Für jedes Konzept wird gespeichert aus welchem Abschnitt des Originaldokuments es stammt. Damit kann die KI später bei der Erklärung auf das Original referenzieren.

**Ausgabe:** Ein **Content Knowledge Graph** — ein Netz aus Konzepten mit Beziehungen, Schwierigkeiten und Quellenreferenzen.

**Beispiel:**
```
Konzept: "Subnetzmaske lesen"
  Voraussetzungen: ["Binärystem verstehen", "IP-Adresse Aufbau"]
  Schwierigkeit: 2
  Quelle: Dokument S.4-6, Abschnitt "Subnetzmasken"
  Verwandt mit: ["CIDR-Notation", "Netzklassen"]
```

---

## Schicht 2: Curriculum-Generator

**Aufgabe:** Verwandle das Konzept-Netz in eine lernbare Reihenfolge — den Lernpfad mit Themen.

**Was die KI tut:**

1. **Themen-Clustering** — Die Konzepte werden zu Themen gruppiert. Nicht willkürlich, sondern nach inhaltlicher Nähe und gemeinsamen Abhängigkeiten. "Binäre Umrechnung" + "Subnetzmaske lesen" + "Subnetzmaske berechnen" → Thema "Subnetting Grundlagen". Die KI entscheidet wie viele Konzepte pro Thema sinnvoll sind (typisch: 5-12 Konzepte).

2. **Themen-Reihenfolge** — Basierend auf dem Abhängigkeitsgraph der Konzepte. Wenn Thema B Konzepte enthält die Konzepte aus Thema A voraussetzen, kommt A vor B. Topologische Sortierung des Graphen, aber mit der KI als menschlicher Korrektor (manchmal ist die didaktisch beste Reihenfolge nicht die rein logische).

3. **Schritt-Vorplanung** — Für jedes Thema plant die KI potenzielle Schritte vor. Noch nicht die finalen Schritte (die kommen erst nach dem Einstiegscheck), sondern ein Pool an möglichen Schritten. Ein Thema mit 10 Konzepten hat vielleicht 6 mögliche Schritte, wovon der User nach dem Check nur 4 machen muss.

4. **Prüfungs-Blueprint** — Für den Einstiegscheck jedes Themas wird definiert welche Konzepte getestet werden und mit welchem Fragetyp. Nicht jedes Konzept muss im Check vorkommen — die KI wählt "diagnostische" Konzepte: wenn du Konzept X kannst, kannst du wahrscheinlich auch Y.

5. **Abschlussprüfungs-Blueprint** — Für die finale Prüfung des ganzen Pfades wird definiert welche Konzepte auf jeden Fall geprüft werden und welche gewichtet nach dem User-Profil dazukommen.

**Ausgabe:** Ein **Curriculum-Plan** — die Themenreihenfolge, Schritt-Pools pro Thema, Prüfungs-Blueprints.

---

## Schicht 3: Lerner-Modell

**Aufgabe:** Halte den aktuellen Wissensstand des Users pro Konzept fest — das "Gehirn" das sich alles merkt.

**Das ist das Herzstück der ganzen Architektur.** Jeder User hat sein eigenes Lerner-Modell. Es ist eine Tabelle mit einem Eintrag pro Konzept:

```
Konzept: "VLSM-Berechnung"
  P(Mastery): 0.35          ← Wahrscheinlichkeit dass der User es beherrscht
  Versuche: 7               ← Wie oft getestet/geübt
  Richtig: 3                ← Davon richtig
  Letzte Interaktion: vor 4 Tagen
  Schwierigkeit der letzten Fragen: [3, 4, 3, 2, 4, 3, 4]
  Richtig/Falsch-Verlauf: [✗, ✗, ✓, ✗, ✓, ✗, ✓]
  Verfalls-Rate: 0.08       ← Wie schnell vergisst der User dieses Konzept
  Nächste Wiederholung: in 2 Tagen
```

**Wie P(Mastery) berechnet wird:**

Nicht einfach "Richtig / Versuche". Das System nutzt **Bayesian Knowledge Tracing (BKT)** — ein bewährtes Modell aus der Lernforschung:

- Jedes Konzept startet mit einer Prior-Wahrscheinlichkeit (basierend auf Schwierigkeit und verwandten Konzepten).
- Jede richtige Antwort erhöht P(Mastery) — aber mehr wenn die Frage schwer war.
- Jede falsche Antwort senkt P(Mastery) — aber weniger wenn die Frage sehr schwer war.
- Der Verlauf zählt: 5× falsch dann 3× richtig (Trend nach oben) ergibt einen höheren Score als 3× richtig dann 5× falsch (Trend nach unten), auch wenn das Verhältnis gleich ist.
- Verwandte Konzepte beeinflussen sich: wenn du "Subnetzmaske berechnen" meisterst, steigt auch die Prior von "VLSM-Berechnung" leicht an.

**Verfall (Decay):**

Wissen verfällt. P(Mastery) sinkt langsam über die Zeit wenn das Konzept nicht geübt wird. Wie schnell hängt von der individuellen Verfalls-Rate ab:

- Konzepte die beim ersten Mal richtig waren: langsamer Verfall.
- Konzepte die mehrfach falsch waren bevor sie sassen: schnellerer Verfall.
- Konzepte die über mehrere Sessions hinweg konsistent richtig waren: sehr langsamer Verfall.

Das System lernt die Verfalls-Rate pro Konzept pro User. Manche Leute vergessen Formeln schnell aber merken sich Konzepte gut. Das Modell passt sich an.

**Konzept-Verbindungen:**

Das Lerner-Modell weiss welche Konzepte zusammenhängen (aus Schicht 1). Drei Typen:

- **Voraussetzung** → wenn du A nicht kannst, kannst du B wahrscheinlich auch nicht.
- **Verwandt** → wenn du A kannst, ist die Chance höher dass du B auch kannst.
- **Gegensätzlich** → Konzepte die oft verwechselt werden (z.B. "Netzadresse" vs "Broadcast-Adresse"). Wenn du eines verwechselst, braucht das andere gezieltes Training.

---

## Schicht 4: Adaptiver Motor

**Aufgabe:** Entscheide was der User als nächstes sieht, basierend auf dem Lerner-Modell.

**Der Adaptive Motor trifft 6 Entscheidungen:**

### Entscheidung 1: Einstiegscheck zusammenstellen

Wenn der User ein neues Thema öffnet, stellt der Motor den Diagnosetest zusammen:
- Wähle 5-8 Fragen die verschiedene Konzepte des Themas abdecken.
- Mische Schwierigkeiten: 2 leicht, 3 mittel, 2 schwer.
- Wenn verwandte Konzepte aus vorherigen Themen schon im Lerner-Modell stehen, nutze das als Vorwissen: z.B. wenn der User "Binäre Umrechnung" schon gemeistert hat (aus einem früheren Thema), teste es nicht nochmal.

### Entscheidung 2: Schritte personalisieren

Nach dem Einstiegscheck:
- Nimm den Schritt-Pool aus dem Curriculum (Schicht 2).
- Streiche Schritte deren Konzepte der User schon beherrscht (P(Mastery) > 0.8).
- Füge Schritte hinzu für Konzepte die überraschend schwach sind.
- Sortiere die verbleibenden Schritte: leichtere Konzepte zuerst, aufbauend.

**Beispiel:** Thema "Subnetting" hat 6 mögliche Schritte. Einstiegscheck zeigt: User kann Subnetzmasken lesen (P=0.85), aber nicht berechnen (P=0.2) und VLSM ist komplett unbekannt (P=0.1). Ergebnis: Schritt "Masken lesen" wird übersprungen, die anderen 5 bleiben.

### Entscheidung 3: Zwischenschritte auf der Karte einfügen

Nach einem Themen-Abschluss prüft der Motor:
- Gibt es Konzepte mit P(Mastery) zwischen 0.4 und 0.7? → Schwach genug um Probleme im nächsten Thema zu verursachen, aber zu spezifisch um dort nochmal erklärt zu werden.
- Wenn ja: generiere einen Zwischenschritt auf der Hauptkarte zwischen diesem und dem nächsten Thema. Der Zwischenschritt fokussiert auf genau diese schwachen Konzepte.

### Entscheidung 4: Schwierigkeit anpassen

Innerhalb eines Schritts, in Echtzeit:
- Lernkarten werden in aufsteigender Schwierigkeit präsentiert.
- Wenn der User die ersten 3 Karten mühelos richtig hat → überspringe die nächsten 2 einfachen, zeige direkt die schwierigeren.
- Wenn der User 2 von 3 falsch hat → füge zusätzliche einfachere Karten ein bevor es weitergeht.
- Arbeitsblatt-Aufgaben werden in der Schwierigkeit angepasst basierend auf der Performance in den Lernkarten desselben Schritts.

### Entscheidung 5: Wiederholung planen

Basierend auf dem Verfall-Modell:
- Berechne für jede Lernkarte den optimalen Wiederholungszeitpunkt (Spaced Repetition: SM-2 Algorithmus oder ähnlich).
- Wenn der User ein Thema öffnet und Karten fällig sind → zeige den "X Karten zur Wiederholung" Hinweis.
- Wenn Karten aus mehreren Themen fällig sind → bündle sie im "Üben"-Tab als themenübergreifende Session.

### Entscheidung 6: Abschlussprüfung gewichten

Wenn alle Themen abgeschlossen sind:
- Nehme den Prüfungs-Blueprint aus dem Curriculum.
- Gewichte Fragen stärker zu Konzepten wo P(Mastery) niedrig ist oder der Verfall hoch war.
- Mische themenübergreifende Fragen ein die Konzepte kombinieren die der User einzeln kann aber nie zusammen anwenden musste.

---

## Schicht 5: Content-Generator

**Aufgabe:** Generiere die eigentlichen Lerninhalte — Erklärungen, Karten, Arbeitsblätter.

**Drei Generierungs-Modi:**

### Modus 1: Verstehen-Inhalte generieren

**Eingabe an die KI:**
- Das Konzept (oder die Konzeptgruppe) für diesen Schritt
- Der Originaltext aus dem hochgeladenen Material (Quellenreferenz aus Schicht 1)
- Das Lerner-Modell: was weiss der User schon? Welche verwandten Konzepte sitzen?
- Anweisungen: "Erkläre das Konzept in 4-6 kurzen Abschnitten (Karten-Format). Baue auf vorhandenem Wissen auf. Füge nach jedem 2.-3. Abschnitt eine unbenotete Verständnisfrage ein."

**Wichtige Regeln für die KI:**
- Nutze Analogien die zum Vorwissen des Users passen. Wenn er IP-Adressierung schon kann, erkläre Subnetting als Erweiterung davon, nicht von Null.
- Keine langen Textblöcke. Maximal 4 Sätze pro Karte.
- Jede Karte muss einen klaren "Aha-Moment" haben — eine Erkenntnis, nicht nur Information.
- Verwende Visualisierungen wo möglich (Tabellen, Schemata, Vergleiche).

### Modus 2: Lernkarten generieren

**Eingabe an die KI:**
- Die Konzepte des aktuellen Schritts
- Die Schwierigkeit die der Adaptive Motor anfordert
- Der aktuelle Stand des Users bei diesen Konzepten
- Anweisung: "Generiere 5-8 Lernkarten. Jede Karte testet ein Konzept. Schwierigkeit verteilt nach Vorgabe. Jede Karte muss einem Konzept zugeordnet sein."

**Kartentypen die die KI wählen kann:**
- **Wissenskarte** — Frage → Antwort. Klassisch. "Was ist die Subnetzmaske für ein /26 Netzwerk?"
- **Anwendungskarte** — Szenario → Lösung. "Du hast das Netzwerk 10.0.0.0/16 und brauchst 6 Subnetze. Welche Maske verwendest du?"
- **Unterscheidungskarte** — Was ist der Unterschied zwischen A und B? Gezielt für "gegensätzliche" Konzeptpaare.
- **Lückenkarte** — Ein Satz mit Lücke die gefüllt werden muss. Gut für Definitionen und Formeln.

**Jede Karte wird intern getaggt:**
```
Karte: "Was ist die Subnetzmaske für /26?"
  Konzept-ID: subnetting_masken_lesen
  Schwierigkeit: 2
  Typ: Wissenskarte
  Erwartete Antwort: "255.255.255.192"
  Bewertungsmethode: exakt_oder_äquivalent
```

### Modus 3: Arbeitsblätter generieren

**Eingabe an die KI:**
- Alle Konzepte des Schritts (oder des ganzen Themas beim Abschlusstest)
- Die Performance aus den Lernkarten
- Anweisung: "Generiere 3-5 zusammenhängende Aufgaben. Die Aufgaben sollen aufeinander aufbauen. Schwerer als die Lernkarten — der User muss mehrere Konzepte kombinieren."

**Arbeitsblatt-Struktur:**
- Aufgaben sind nicht isoliert. Eine Aufgabe baut auf der vorherigen auf. "Gegeben ist Netzwerk X → Aufgabe 1: Subnetze es → Aufgabe 2: Gib die Hostbereiche an → Aufgabe 3: Bestimme die Broadcast-Adressen."
- Jede Aufgabe ist an Konzepte geknüpft. Die Bewertung aktualisiert P(Mastery) pro Konzept.

### Bewertungs-Engine:

Die KI bewertet Antworten nicht nur als richtig/falsch:
- **Exakte Antworten** (Zahlen, IPs, Formeln): automatische Prüfung.
- **Textantworten** (Erklärungen): die KI bewertet semantisch — ist der Kern richtig, auch wenn die Wortwahl anders ist?
- **Teilweise richtige Antworten**: "Methode stimmt, Rechenfehler im letzten Schritt" → Konzept "Methode" bekommt Punkte, Konzept "Berechnung" nicht.
- **Feedback**: Bei jeder falschen Antwort erklärt die KI kurz was falsch war und warum. Nicht die ganze Theorie nochmal — nur den Fehler.

---

## Schicht 6: Scoring & Zeitsteuerung

**Aufgabe:** Berechne Mastery-Scores und plane Wiederholungen.

### Mastery-Score Berechnung

**Auf Schritt-Ebene:** Wird nicht als Zahl angezeigt. Intern: Durchschnitt der P(Mastery)-Werte aller Konzepte im Schritt.

**Auf Themen-Ebene:** (das ist der Ring den der User sieht)
- Gewichteter Durchschnitt aller Konzepte im Thema.
- Gewichtung nach Schwierigkeit: schwierigere Konzepte zählen mehr.
- Minimum-Regel: wenn ein Konzept unter 0.3 ist, kann der Themen-Score nicht über 70% steigen. Verhindert dass ein User mit 9/10 Konzepten auf 90% steht aber das eine fehlende Konzept kritisch ist.

**Auf Pfad-Ebene:** (die Leiste ganz oben)
- "X von Y Themen gemeistert" — ein Thema gilt als gemeistert wenn sein Score über 75% ist UND der Abschlusstest bestanden wurde.
- Gesamt-Prozent: Durchschnitt aller Themen-Scores.

### Score-Aktualisierung in Echtzeit

Was der User sieht wenn er eine Lernkarte richtig beantwortet:
1. Die Karte wird als richtig bewertet.
2. P(Mastery) des zugehörigen Konzepts wird neu berechnet (Schicht 3).
3. Der Themen-Score wird aus allen Konzept-Scores neu berechnet.
4. Der Mastery-Ring im Drawer aktualisiert sich sichtbar.

Alles in Millisekunden. Der User tippt "Gewusst" → Ring bewegt sich. Sofort.

### Score-Verhalten

- **Während einer Session:** Score geht nur hoch oder bleibt gleich. Nie runter. Das ist psychologisch wichtig — der User soll nie das Gefühl haben er verliert Fortschritt während er lernt.
- **Zwischen Sessions:** Verfall passiert im Hintergrund. Wenn der User nach 2 Wochen wiederkommt, kann der Score leicht gesunken sein. Aber das wird nicht dramatisch angezeigt — stattdessen erscheint der orange Punkt auf der Karte und die "Karten zur Wiederholung" im Drawer.
- **Nach Wiederholung:** Score kann wieder steigen, oft schneller als beim ersten Mal (der User lernt es ja schon zum zweiten Mal).

### Spaced Repetition Zeitplanung

Jede Lernkarte hat einen eigenen Wiederholungs-Zeitplan:

- Erste Wiederholung: 1 Tag nach dem Lernen.
- Wenn richtig: nächste Wiederholung in 3 Tagen.
- Wieder richtig: 7 Tage.
- Wieder richtig: 14 Tage.
- Wieder richtig: 30 Tage.
- Bei jedem Fehler: zurück auf 1 Tag.

Die Intervalle passen sich der individuellen Verfalls-Rate an (aus Schicht 3). Für Konzepte die der User schnell vergisst, bleiben die Intervalle kürzer.

### Streak-Berechnung

- Ein "Lern-Tag" zählt wenn der User mindestens 5 Lernkarten oder 1 Arbeitsblatt abgeschlossen hat. Nicht nur die App öffnen.
- Streak zählt aufeinanderfolgende Lern-Tage.
- Am Wochenende ist ein "Freeze" eingebaut: der Streak bricht nicht wenn Samstag/Sonntag ausgelassen wird (konfigurierbar).

---

## Schicht 7: Session-Orchestrator

**Aufgabe:** Steuere was der User auf dem Bildschirm sieht, verwalte seinen Zustand.

### Was der Orchestrator speichert

Pro User und Lernpfad:
```
Aktiver Lernpfad: "Netzwerktechnik M129"
Aktives Thema: "Subnetting"
Aktiver Schritt: "VLSM verstehen" (Schritt 3 von 5)
Aktuelle Phase: "Üben" (Lernkarten)
Position in Phase: Karte 3 von 8
Offene Wiederholungskarten: [karte_12, karte_34, karte_56]
Letzter Besuch: vor 6 Stunden
```

### Entscheidungsbaum: Was zeigen?

**User öffnet einen Lernpfad:**
1. Lade die Karte mit allen Themen und ihren aktuellen Farben.
2. Bestimme den "aktiven" Knoten (blau leuchtend): das erste Thema das nicht grün ist.
3. Prüfe ob neue Zwischenschritte nötig sind (Schicht 4, Entscheidung 3).
4. Zeige die Karte.

**User klickt auf ein Thema — erster Besuch:**
1. Öffne Drawer.
2. Zeige den Einstiegscheck.
3. Nach dem Check: generiere den personalisierten Schrittplan (Schicht 4, Entscheidung 2).
4. Zeige den Plan mit dem ersten aktiven Schritt.

**User klickt auf ein Thema — Rückkehr:**
1. Öffne Drawer.
2. Lade den gespeicherten Zustand: welcher Schritt, welche Phase, welche Position.
3. Prüfe ob Wiederholungskarten fällig sind.
4. Zeige den Plan mit dem Zustand und ggf. die Wiederholungs-Box.

**User klickt auf den aktiven Schritt:**
1. Lade die Phase in der er aufgehört hat.
2. Wenn Verstehen → zeige die Erklär-Karte an der Position wo er war.
3. Wenn Üben → zeige die Lernkarte an der er aufgehört hat.
4. Wenn Festigen → zeige das Arbeitsblatt.

**User schliesst einen Schritt ab:**
1. Aktualisiere alle Konzept-Scores (Schicht 3 + Schicht 6).
2. Markiere den Schritt als erledigt.
3. Prüfe ob der nächste Schritt freigeschaltet werden kann.
4. Aktualisiere den Drawer mit dem neuen Zustand.
5. Wenn letzter Schritt vor dem Abschlusstest → schalte den Abschlusstest frei.

**User besteht den Abschlusstest:**
1. Markiere das Thema als gemeistert (grün auf der Karte).
2. Prüfe ob Zwischenschritte nötig sind (Schicht 4).
3. Schalte das nächste Thema frei.
4. Wenn alle Themen grün → schalte die Abschlussprüfung frei.

---

## Daten-Modell

### Die Entitäten und ihre Beziehungen

```
LERNPFAD
├── Titel, Beschreibung
├── Quell-Material (hochgeladene Dokumente)
├── Status: aktiv / abgeschlossen
├── Gesamt-Score
│
├── THEMEN (geordnet)
│   ├── Titel, Reihenfolge, Status (grau/blau/orange/grün)
│   ├── Mastery-Score
│   ├── Einstiegscheck-Ergebnis
│   │
│   ├── SCHRITTE (geordnet)
│   │   ├── Titel, Typ (regulär / adaptiv)
│   │   ├── Status (gesperrt / aktiv / erledigt)
│   │   ├── Verknüpfte Konzepte
│   │   │
│   │   ├── VERSTEHEN-KARTEN (geordnet)
│   │   │   └── Inhalt, Verständnisfragen
│   │   │
│   │   ├── LERNKARTEN
│   │   │   ├── Frage, Antwort, Typ, Schwierigkeit
│   │   │   └── Verknüpfte Konzepte
│   │   │
│   │   └── ARBEITSBLATT
│   │       ├── Aufgaben, Lösungen
│   │       └── Verknüpfte Konzepte
│   │
│   └── ABSCHLUSSTEST
│       └── Fragen, Bestehens-Schwelle
│
├── ZWISCHENSCHRITTE (zwischen Themen)
│   ├── Auslöser-Thema, Ziel-Thema
│   └── Gleiche Struktur wie ein Schritt (Verstehen/Üben/Festigen)
│
└── ABSCHLUSSPRÜFUNG
    └── Fragen aus allen Themen, gewichtet

KONZEPT-NETZ (pro Lernpfad)
├── KONZEPTE
│   ├── Name, Beschreibung, Schwierigkeit
│   └── Quellenreferenz im Original-Material
│
└── BEZIEHUNGEN
    └── Konzept A → Konzept B (Typ: Voraussetzung / Verwandt / Gegensätzlich)

LERNER-MODELL (pro User × Lernpfad)
├── KONZEPT-ZUSTÄNDE
│   ├── Konzept-ID
│   ├── P(Mastery), Versuche, Richtig-Rate
│   ├── Verlauf (letzte 20 Antworten)
│   ├── Verfalls-Rate
│   └── Nächste Wiederholung
│
└── KARTEN-ZUSTÄNDE
    ├── Karten-ID
    ├── Status (neu / in Wiederholung / gemeistert)
    ├── Easiness-Faktor (SM-2)
    ├── Aktuelles Intervall
    └── Nächste Wiederholung

SESSION-ZUSTAND (pro User × Lernpfad)
├── Aktives Thema
├── Aktiver Schritt
├── Aktuelle Phase (Verstehen / Üben / Festigen)
├── Position in der Phase
└── Letzte Aktivität
```

---

## Wie alles zusammenspielt — ein Durchlauf

**Szenario: User startet das erste Mal Thema "Subnetting"**

```
1. USER klickt auf "Subnetting"
   │
2. SESSION-ORCHESTRATOR (Schicht 7) prüft:
   Erster Besuch → Einstiegscheck nötig
   │
3. ADAPTIVER MOTOR (Schicht 4) stellt Check zusammen:
   Liest CURRICULUM (Schicht 2): 8 Konzepte in "Subnetting"
   Liest LERNER-MODELL (Schicht 3): "Binäre Umrechnung" P=0.9 aus vorherigem Thema
   → Überspringe "Binäre Umrechnung" im Check
   → 6 Fragen für die restlichen 7 Konzepte
   │
4. CONTENT-GENERATOR (Schicht 5) generiert die 6 Fragen
   │
5. USER beantwortet die 6 Fragen
   │
6. SCORING (Schicht 6) berechnet:
   "Subnetzmaske lesen": P=0.85 (2/2 richtig, leichte Fragen)
   "Subnetzmaske berechnen": P=0.2 (0/1 richtig, mittlere Frage)
   "CIDR-Notation": P=0.7 (1/1 richtig, aber nur eine Frage)
   "VLSM": P=0.05 (0/2 richtig)
   ... etc.
   │
7. ADAPTIVER MOTOR (Schicht 4) baut den Schritt-Plan:
   Pool: 6 mögliche Schritte
   "Masken lesen" → ÜBERSPRUNGEN (P=0.85)
   "CIDR vertiefen" → ÜBERSPRUNGEN (P=0.7, knapp aber ausreichend)
   Verbleibend: 4 Schritte + Abschlusstest
   │
8. SESSION-ORCHESTRATOR (Schicht 7):
   Zeigt dem User den Plan mit 4 Schritten
   Erster Schritt leuchtet blau
   │
9. USER klickt auf Schritt 1 "Subnetzmasken berechnen"
   │
10. CONTENT-GENERATOR (Schicht 5) generiert:
    Verstehen-Karten: 5 Karten mit 2 Verständnisfragen
    (Nutzt das Vorwissen: User kann Masken lesen, also starte von dort)
    │
11. USER arbeitet sich durch Verstehen
    │
12. CONTENT-GENERATOR (Schicht 5) generiert Lernkarten:
    6 Karten, Schwierigkeit 2-4
    │
13. USER macht Lernkarten. 4 richtig, 2 falsch.
    │
14. SCORING (Schicht 6) aktualisiert live:
    "Subnetzmaske berechnen" P: 0.2 → 0.55
    Mastery-Ring springt von 25% auf 42%
    │
15. Die 2 falschen Karten kommen nochmal.
    User kriegt 1 richtig, 1 nochmal falsch.
    │
16. SCORING: P: 0.55 → 0.62
    │
17. Letzte Karte nochmal. Richtig.
    │
18. CONTENT-GENERATOR (Schicht 5) generiert Arbeitsblatt:
    3 Aufgaben, Schwierigkeit 3 (angepasst an Lernkarten-Performance)
    │
19. USER füllt aus. 2 richtig, 1 teilweise richtig.
    │
20. SCORING: P: 0.62 → 0.73. Ring auf 58%.
    Falsche Karten → in Wiederholungs-Pool
    │
21. SESSION-ORCHESTRATOR: Schritt 1 erledigt.
    Schritt 2 freigeschaltet. Drawer aktualisiert.
    │
22. USER schliesst den Drawer. Zurück zur Karte.
    Knoten "Subnetting" ist orange, Ring zeigt 58%.
```

---

## Technische Entscheidungen

### Wo läuft die KI?

**Nicht lokal. Server-seitig über API.**

Jeder KI-Aufruf geht an die API (z.B. Claude API). Das System sendet strukturierte Prompts mit:
- Kontext aus dem Konzept-Netz
- Relevante Teile des Lerner-Modells
- Klare Anweisungen welcher Content-Typ generiert werden soll
- Format-Vorgaben (JSON-Output für strukturierte Daten)

### Was wird gecacht vs. neu generiert?

**Gecacht (einmal generiert, gespeichert):**
- Der Content Knowledge Graph (Schicht 1) — ändert sich nur wenn neues Material hochgeladen wird.
- Der Curriculum-Plan (Schicht 2) — stabil pro Pfad.
- Verstehen-Karten — generiert beim ersten Besuch eines Schritts, dann gespeichert.

**On-the-fly generiert (jedes Mal frisch):**
- Einstiegscheck-Fragen — müssen zum aktuellen Stand des Users passen.
- Lernkarten — werden adaptiv zur Schwierigkeit angepasst.
- Arbeitsblätter — basieren auf der gerade erbrachten Leistung.
- KI-Zusammenfassungen ("Grundlagen sitzen, jetzt geht's an die Berechnung").
- Zwischenschritte — werden erst erzeugt wenn Schwächen erkannt werden.

### Datenbank-Wahl

**Zwei Datenbanken, getrennte Aufgaben:**

1. **Relationale Datenbank (PostgreSQL):** Für alles Strukturierte — User, Lernpfade, Themen, Schritte, Session-Zustände, Karten-Zustände, Scores. Hier sind Beziehungen und Abfragen wichtig.

2. **Vektor-Datenbank oder Graph-Datenbank (z.B. Neo4j):** Für das Konzept-Netz. Konzepte als Knoten, Beziehungen als Kanten. Ermöglicht schnelle Abfragen wie "welche Konzepte hängen mit VLSM zusammen?" oder "was sind die Voraussetzungen für Routing?"

**Alternativ:** Alles in PostgreSQL mit JSON-Feldern für das Konzept-Netz. Einfacher am Anfang, skaliert aber schlechter.

---

## Was das System einzigartig macht

1. **Konzept-Level Tracking** statt Themen-Level. Kein anderes Tool für Berufsschulen macht das. Duolingo trackt pro Lektion, Khan Academy pro Video, Anki pro Karte. Straton trackt pro Wissenseinheit und versteht die Beziehungen dazwischen.

2. **Adaptiver Schrittplan** der sich nach dem Einstiegscheck erst aufbaut. Keine vorgefertigten Kurse. Jeder User bekommt einen anderen Weg durch dasselbe Thema.

3. **Übergreifende Intelligenz** — Konzepte die in mehreren Themen vorkommen werden nur einmal gelernt. Das System erkennt: "Binäre Umrechnung" aus Thema 1 hilft bei Thema 3.

4. **Dual-Content-System** — Das Material des Users wird nicht einfach in Fragen verwandelt. Es wird in ein Konzept-Netz zerlegt, und die KI generiert Inhalte die auf dem Netz basieren. Das bedeutet: die Erklärungen sind besser als das Originalmaterial, weil sie auf den User zugeschnitten sind.

5. **Score der sich anfühlt** — nicht eine dumme Prozentzahl, sondern ein Wert der auf echtem Wissens-Modelling basiert. Wenn der Mastery-Ring auf 80% steht, hat der User mit hoher Wahrscheinlichkeit tatsächlich 80% des Themas verstanden.
