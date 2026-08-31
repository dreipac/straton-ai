# 6 — Stand, Abweichungen und offene Punkte

## Was fertig ist

Kapitel 15 des Bezugsdokuments empfiehlt eine Bauabfolge. Sie wurde eingehalten:

| # | Schritt | Stand |
|---|---|---|
| 1 | **Gedaechtnis** — Graph und Lernerbild getrennt | fertig |
| 2 | **Kartograf** — Rolle, Vertrag, Herkunftspruefung | fertig |
| 3 | **Planer** — deterministisch, alle vier Dringlichkeiten | fertig |
| 4 | **Generator + Kontrolleur** — Formate, Quellenabgleich, Gegenloesen | fertig |
| 5 | **Pruefer** — mit Ursache und Zuversicht von Anfang an | fertig |
| 6 | **Propagation** — beide Richtungen, nur Sicherheit | fertig |
| 7 | **Kaltstart** — adaptive Suche nach der Front | fertig |
| 8 | **Konsolidierer** — Ausloeser, Muster, Strukturumbau | fertig |

Dazu: Ziel-Objekt mit Machbarkeitsrechnung (Kapitel 6.3), Pfadordnung mit Einschueben
(Kapitel 11), Fehlermuster mit Anzeigeschwelle (Kapitel 10) und die Vermittlungsschicht mit
Admin-Menue (Kapitel 12).

Schritt 5 verdient eine Anmerkung: das Bezugsdokument warnt ausdruecklich davor, den Pruefer erst
als richtig/falsch zu bauen und spaeter zu erweitern — „die Datenstruktur muss von Beginn an
stimmen". Deshalb traegt `learn_evidence_events` von der ersten Migration an Teilpunkte,
Fehlerursache und Zuversicht.

### Fassung 1.1 — die fuenf Ergaenzungen

Sie wurden in der vom Bezugsdokument vorgegebenen Reihenfolge gebaut:

| # | Ergaenzung | Kapitel | Stand |
|---|---|---|---|
| 1 | **Formatzuordnung** — neun Formate, drei je Anwendungstiefe | 6.6 | fertig |
| 2 | **Wiederholungsgrenze** — Stapel gegen Pfad, nach Ausloeser | 6.7 | fertig |
| 3 | **Erklaertexte** — drei Stellen, eigene Freigabe | 7.3 | fertig |
| 4 | **Vorratserzeugung** — die eine Ausnahme von der Echtzeitregel | 7.1 | fertig |
| 5 | **Musterkatalog-Geltungsbereich** — je Nutzer, pfadeuebergreifend | 10 | fertig |

Zwei davon brachten Entscheidungen mit sich, die im Text nicht stehen:

**Zu 1:** Die Formattabelle ist bindend, und mit ihr sind **vier von neun** Formaten
gegenloesbar — Auswahlfrage, Zuordnung, Rechenaufgabe, Lueckenrechnung, also trifft Kapitel 7.2s
Schaetzung „rund ein Drittel" fast genau. „Gegenloesbar" heisst dabei mehr als „hat eine richtige
Loesung": die Musterloesung muss kurz und woertlich vergleichbar sein. Ein spaeterer Fund zeigte,
dass die erste Fassung das zu grosszuegig auslegte — siehe „Abweichungen" unten, Punkt 5.

**Zu 2:** Die Grenze braucht eine **Hysterese**. Mit einer einzigen Schwelle faellt ein lange
unangetastetes Konzept aus dem Stapel, weil sein verfallener Wert darunter rutscht — und landet
zugleich nicht im Pfad, weil es dort nichts zu reparieren gibt. Es waere verschwunden, obwohl
gerade der Verfall der Grund ist, es zu zeigen. Eintritt bei 0.7, Rueckfall erst unter 0.45,
gemerkt in `ever_consolidated`, geprueft gegen die **gespeicherten** Werte.

### Die Invariantenpruefung vor dem Bau von 1.1

Drei Abweichungen wurden gefunden und behoben, bevor etwas Neues entstand:

| Fund | Invariante | Behebung |
|---|---|---|
| Die alte Engine verschob bei Propagation die **Beherrschung** benachbarter Konzepte | I1, I3 | `propagateSignal`/`applyPropagation` aus `engine/conceptGraph.ts` entfernt; die Aufrufstelle in `learnerModel.ts` gibt nur noch eine leere Liste zurueck. Die Nachbarn bleiben unberuehrt — Zweifel verteilt ausschliesslich `brain/memory/propagation.ts`, und nur auf die Sicherheit. |
| `learn_concepts.origin` hatte den Standardwert `material` | I4 | Standardwert entfernt, `unknown` fuer den Altbestand, Belegzwang als Check. Die Ingestion schreibt die Herkunft jetzt selbst und stuft eine behauptete Materialherkunft **ohne** Beleg auf `ai_supplement` herab. |
| Platzhalterkonzepte trugen keine Herkunft | I4 | ausdruecklich als `ai_supplement` markiert. |

I2 war bereits sauber: Chatsignale setzen `masteryDelta` strikt auf 0.

---

## Was bewusst offen blieb

### Die Lern-Oberflaeche — inzwischen angebunden

Sie ist gebaut und laeuft: Pfad-Tab mit Jetzt-Karte, Themenliste und Knoten-Panel, Lernsitzung,
Abschlussbilanz, Wiederholungsstapel, Ziel-Dialog, Handkorrektur, Erklaertexte und die
Quellenliste im Material-Bereich. Beschrieben in [`07-oberflaeche.md`](07-oberflaeche.md).

Der Umbau laeuft schrittweise: `brainPath.isAvailable` entscheidet je Pfad, ob die
Gehirn-Oberflaeche uebernimmt oder die bisherige Ansicht stehen bleibt. Kein Bereich verschwindet,
bevor sein Nachfolger traegt.

Was an der Oberflaeche noch fehlt, steht am Ende von `07-oberflaeche.md`; die vier Punkte sind
klein und keiner davon ist ein Neubau.

### Aus Kapitel 14 uebernommen

| Punkt | Stand |
|---|---|
| **Gegenloesen** | **umgesetzt.** Bei allen Formaten mit kurzer, woertlich vergleichbarer Musterloesung — vier von neun nach der bindenden Formattabelle aus 6.6. |
| **Produktionsformate** | **umgesetzt.** Neun Formate, drei je Anwendungstiefe, jedes mit Gegenloesbarkeit und Evidenzstaerke. |

### Aus Kapitel 14 nicht umgesetzt

| Punkt | Warum nicht |
|---|---|
| **Kostensteuerung** | Budgetgrenzen pro Nutzer und Rolle. Die Vorarbeit steht: der Verbrauch wird bereits je Rolle als `brain_<rolle>` in `ai_token_usage` geschrieben, und das bestehende Credits-System (`ai_credits_*`) waere der Anknuepfungspunkt. Nicht beauftragt. |
| **Chatbuendelung** | Mehrere Chats zu einem Lernpfad zusammenfuehren. Braucht laut Kapitel 14 einen eigenen Einstiegspunkt im Chat; der Lernbereich bringt ihn nicht mit. |
| **Geteilter Strukturlayer** | Im Bezugsdokument selbst zurueckgestellt. Durch Invariante I10 offen gehalten: `learn_concepts` traegt keine `user_id` und kein Leistungsfeld. |

---

## Abweichungen vom Bezugsdokument

Vier Stellen, an denen die Umsetzung praeziser oder anders ist als der Text. Alle vier sind
bewusst.

### 1. I2 — welche Lesart gilt

Invariante I2 sagt „Chatverhalten erhoeht niemals die Beherrschung. Es darf nur senken oder
Zweifel wecken." Die Tabelle in Kapitel 5.1 sagt beim Chat dagegen ausdruecklich „Darf
Beherrschung senken: **nein**, nur Sicherheit senken".

**Entschieden:** Die Tabelle gewinnt. Chat setzt `masteryDelta` strikt auf 0 und wirkt
ausschliesslich auf die Sicherheit. Der Datenbank-Constraint sichert zusaetzlich die
grosszuegigere Grenze (`<= 0`) ab, damit auch ein Fehler in der Wahrnehmungsschicht nie ein
Anheben durchlaesst.

### 2. Die Wiederholungs-Mindestreserve hat eine Obergrenze

Kapitel 6.4 nennt einen Boden, keine Decke. Beim Bauen zeigte sich: ein Boden von „mindestens ein
Platz" belegt bei einer Sitzung von einer Aufgabe **die ganze Sitzung** — und damit kaeme ein
gesetztes Ziel nie an die Reihe, was Kapitel 6.2 aushebelt.

**Entschieden:** Die Reserve ist auf `sessionSize - 1` gedeckelt und greift erst ab drei
Aufgaben. Der Boden bleibt ein Boden.

### 3. Der Kaltstart fasst kein Lernerbild an

Kapitel 9 formuliert „wird etwas Mittelschweres richtig geloest, gilt vieles darunter als
wahrscheinlich vorhanden". Woertlich genommen waere das ein Verstoss gegen I1: es entstuenden
Werte, fuer die nie jemand etwas geloest hat.

**Entschieden:** „Gilt als vorhanden" ist eine Aussage ueber den **Suchraum**, nicht ueber die
Person. `FrontSearchState` wird nie persistiert und beruehrt kein Lernerbild. Ein Test prueft das
ausdruecklich. Damit halbiert jede Antwort weiterhin den Suchraum — genau wie beschrieben —, ohne
I1 zu verletzen.

### 4. Der Erklaerer ist optional, nicht notwendig

Kapitel 12 fuehrt den Erklaerer als Rolle, die begruendet, warum jetzt diese Aufgabe kommt.
Waere er die einzige Quelle des Satzes, haenge Invariante I8 an einem Modellaufruf, der langsam
sein, teuer sein oder ausfallen kann.

**Entschieden:** Der Satz entsteht deterministisch in `explainSelection`. Der Erklaerer glaettet
ihn nur, und `acceptPolished` verwirft eine Fassung, die leer, zu lang oder mehrsaetzig ist.

### 5. Gegenloesen nur bei kurz vergleichbarer Musterloesung — nicht bei jeder eindeutigen

Ein Nutzungsfund, kein Textwiderspruch: die erste Fassung markierte `scenario` und `errorHunt`
als gegenloesbar, weil beide „eine richtige Loesung" haben. Ihre Musterloesung ist aber eine
Begruendung in Prosa (`errorHunt` nennt laut Generatorauftrag „die fehlerhafte Stelle UND warum
sie falsch ist"). Zwei unabhaengige, beide richtige Begruendungen stimmen so gut wie nie
wortgleich ueberein — `answersAgree` vergleicht Zeichenketten, keine Bedeutung. Im Betrieb
verwarf das Gegenloesen dadurch wiederholt richtig geloeste Uebertragen-Aufgaben; die betroffenen
Konzepte liessen sich nicht ueben.

**Entschieden:** `hasUniqueAnswer` misst nicht „hat eine richtige Antwort", sondern „ist die
Musterloesung kurz und woertlich vergleichbar". `scenario` und `errorHunt` stehen jetzt neben
`justification` beim reinen Quellenabgleich. Das senkt die gegenloeste Quote von sechs auf vier
der neun Formate — naeher an Kapitel 7.2s eigener Schaetzung „rund ein Drittel", nicht weiter
davon weg.

### 6. Auswahlfragen liefen dem Kontrolleur blind zu — an ZWEI Stellen

Ein dritter Nutzungsfund, in zwei Schritten entdeckt: der Kontrolleur bekam bei
`multipleChoice`-Aufgaben nur `taskPrompt` — den Fragestamm. Die Antwortmoeglichkeiten stehen
aber in einem GETRENNTEN Feld (`GeneratedTask.options`), das ausschliesslich fuer die
Schaltflaechen der Oberflaeche gedacht ist und nirgends in den Fragetext eingebettet wird.

Betroffen waren beide Kontrolleur-Auftraege, die eine Aufgabe vor der Auslieferung durchlaeuft:

- **Gegenloesen** (`counter_solve`): der Kontrolleur sollte die Aufgabe unabhaengig loesen, sah
  aber eine Frage ohne jede Antwortmoeglichkeit und konnte sie unmoeglich in der erwarteten Form
  beantworten.
- **Quellenabgleich** (`source_check`): verwies der Aufgabentext auf „folgende Aussagen" (eine
  uebliche Formulierung bei Auswahlfragen), konnte der Kontrolleur nicht beurteilen, welche davon
  gemeint war — und lehnte eine inhaltlich einwandfreie Aufgabe allein deshalb ab. Diese zweite
  Stelle kam erst zum Vorschein, NACHDEM die erste behoben war: das Gegenloesen lief durch, aber
  derselbe Mangel wartete im naechsten Pruefschritt.

Betroffen war damit der haeufigste Fall ueberhaupt: `multipleChoice` ist das erste Format in der
Praeferenzreihenfolge fuer „Erkennen", und „Erkennen" ist wegen der aufsteigenden Tiefe (6.6) die
erste Stufe jeder Sitzung. Ein neues Konzept scheiterte dadurch reproduzierbar bei praktisch
jedem ersten Versuch, unabhaengig vom Fachgebiet.

**Entschieden:** `options` wird jetzt in BEIDEN Kontrolleur-Auftraegen mitgegeben, wenn vorhanden;
der `source_check`-Auftrag bekommt zusaetzlich die Anweisung, „folgende Aussagen" im Aufgabentext
als Verweis auf genau dieses Feld zu lesen.

Beim `counter_solve`-Auftrag reichte das Mitgeben allein nicht: eine erste Fassung verlangte die
woertliche Wiedergabe der gewaehlten Option, aber Optionen sind bei Wertefragen oft ganze Saetze
("Weil die Familie Schutz, Unterstuetzung und soziales Lernen bietet und damit …"), und ein
unabhaengig loesendes Modell umschreibt sie routinemaessig — ein Pronomen statt der Wiederholung,
ein abgeschnittener Nachsatz. Das ist keine falsche Loesung, nur eine andere Formulierung
derselben, und `answersAgree` kann das nicht unterscheiden. **Entschieden:** der Kontrolleur gibt
bei Auswahlfragen nur noch die POSITION der gewaehlten Option zurueck ("2" statt eines Zitats);
`resolveCounterSolveAnswer` loest sie serverseitig in den woertlichen Optionstext auf, bevor
verglichen wird. Eine Positionsnummer laesst sich nicht umformulieren — das Problem ist damit
umgangen, nicht bloss toleriert.

**Diagnostische Nebenwirkung, die den zweiten Fund erst sichtbar machte:** `buildControlVerdict`
kennt seit jeher einen `sourceIssues`-Parameter fuer die konkrete Begruendung des Kontrolleurs —
er wurde von `generateTask.ts` nie befuellt. Bis dahin sah jeder Abbruch nur den generischen Satz
„Aufgabe laesst sich nicht im Quellmaterial verankern", nie den eigentlichen Befund. Ohne diese
Korrektur waere der zweite Fund kaum aufzufinden gewesen.

### 7. Vollstaendige Vorproduktion statt versetzter Echtzeit-Erzeugung

Eine bewusste Produktentscheidung, keine Fehlerbehebung: Kapitel 7.1 sieht vor, immer nur DIE
NAECHSTE Aufgabe im Voraus zu erzeugen, waehrend der Nutzer an der aktuellen sitzt — mit der
Begruendung, nur Echtzeit-Material kenne den Moment.

Im Betrieb reichte das nicht: nur die erste Aufgabe einer Sitzung wartete planmaessig, jede
folgende wartete faktisch trotzdem, sobald die versetzte Vorproduktion im Hintergrund nicht
schnell genug hinterherkam. Gemeldete Beschwerde: „ich muss bei jeder Frage warten".

**Entschieden:** Beim Start einer Sitzung werden ALLE geplanten Aufgaben gleichzeitig
angestossen, nicht nur die naechste (`useBrainSession.ts`). Nur die erste Aufgabe hat noch
unvermeidbare Wartezeit. Torwaechter I5 laeuft fuer jede Aufgabe unveraendert vor der Auslieferung
— die Abweichung betrifft ausschliesslich den ZEITPUNKT der Erzeugung. Aufgegeben wird der
Momentbezug INNERHALB einer laufenden Sitzung; er war zuvor ohnehin nicht verdrahtet
(`lastErrorHint` wurde beim Erzeugen einer Sitzungsaufgabe nirgends gesetzt). Zwischen Sitzungen
bleibt er unveraendert erhalten — der Planer sieht bei jeder neuen Sitzung den aktuellen Stand
des Lernerbilds.

Die Wiederholungsstapel-Ausnahme aus 7.1 ist davon unberuehrt und bleibt bestehen (siehe
Kapitel 1, „Erzeugungszeitpunkt").

Details, Ablauf und der Umgang mit ueberholter/gescheiterter Vorproduktion stehen im Kopfkommentar
von `src/features/learn/brain/hooks/useBrainSession.ts`. Das urspruengliche, versetzte Modell mit
Staleness-Pruefung bleibt als eigenstaendiges, getestetes Modul in `production/prefetch.ts`
erhalten — historisch markiert, nicht mehr eingebunden.

---

## Zwei Entscheidungen, die nicht einzeln geaendert werden duerfen

Das Bezugsdokument warnt an einer Stelle ausdruecklich davor, und die Warnung gilt im Code genauso:

**Verschmelzen nimmt Fortschritt weg, und Verschmelzen braucht eine Bestaetigung.** Werden 80 %
und 30 % zusammengelegt, steht der Knoten bei 30 % — der Nutzer sieht Fortschritt verschwinden.
Das waere normalerweise der Moment, in dem sich eine App kaputt anfuehlt. Weil Verschmelzungen
ohnehin bestaetigt werden muessen, gibt es genau dort einen Dialog, in dem es erklaert werden
kann. Der Verlust ist damit angekuendigt statt mysterioes.

Wer die Wertregel lockert („der hoehere gewinnt"), verliert die Vorsicht. Wer die
Bestaetigungspflicht streicht, verliert die Erklaerung. Beides zusammen ist der Unterschied
zwischen einem Bug und einer nachvollziehbaren Systementscheidung.

---

## Bekannte Grenzen der Umsetzung

Ehrlich benannt, damit sie niemanden ueberraschen:

- **Die Migrationen sind nicht gegen eine laufende Datenbank ausgefuehrt worden.** Auf dem
  Entwicklungsrechner lief zum Zeitpunkt des Baus kein Postgres. Sie sind sorgfaeltig geschrieben
  und folgen den Mustern der bestehenden Migrationen, aber der erste `db:push` sollte beobachtet
  werden.
- **Die Rollen-Qualitaetstests aus Kapitel 12, Auflage 2 sind nur zur Haelfte da.** Der
  deterministische Teil ist umgesetzt: die Vertragstests pruefen, dass eine abweichende
  Modellausgabe zuverlaessig auffaellt. Was fehlt, sind feste Beispielfaelle **gegen echte
  Modelle** — bei fuenf oder sechs Modellen im Betrieb faellt eine Verschlechterung sonst erst
  durch Nutzerbeschwerden auf.
- **`discoverEdges` arbeitet auf den Daten eines Nutzers.** Das Bezugsdokument formuliert
  „niemand schafft B, der A nicht hat" — mit einem geteilten Strukturlayer waere die Aussage
  statistisch belastbarer. Bis dahin ist die Schwelle bewusst hoch gesetzt (sechs gepaarte
  Beobachtungen, 40 Prozent Unterschied in der Fehlerquote).
- **Der Konsolidierer wird nicht automatisch angestossen.** `evaluateTrigger` sagt, *ob* ein Lauf
  faellig ist; wer ihn ausloest, ist noch nicht verdrahtet — das gehoert an den Sitzungsbeginn.
- **„Spaeter" ueberlebt keinen Seitenwechsel.** Die Zurueckweisung wirkt sofort auf die Auswahl
  des Planers, wird aber nicht gespeichert. Das ist vertretbar, weil „spaeter" „jetzt nicht"
  heisst und der naechste Besuch ein neues Jetzt ist — eine dauerhafte Ablage braeuchte eine
  Verfallsregel, sonst wuerde sie zur stillen Sperrliste.
- **Beim Verschmelzen wandert die Historie mit, die Ruecknahme holt sie nicht zurueck.** Der
  Ruecknahme-Payload traegt beide Lernerbilder, den Konzept-Abzug und die umgehaengten Kanten.
  Evidenzereignisse und Fehlerbeobachtungen werden an den ueberlebenden Knoten umgehaengt statt
  geloescht — nach einer Ruecknahme blieben sie dort. Das ist die bessere der beiden schlechten
  Moeglichkeiten: die Alternative waere, sie beim Verschmelzen zu verlieren.

---

## Naechste Schritte, in sinnvoller Reihenfolge

1. **Migrationen einspielen** und den ersten Lauf beobachten. Inzwischen sind es sieben, davon
   drei aus Fassung 1.1. Bis dahin laeuft die Gehirn-Oberflaeche in einen Ladefehler — sie ist
   gebaut, aber nichts steht hinter ihr.
2. **Vertikaler Durchstich am echten Bildschirm**: ein Pfad mit eingelesenem Material, eine
   Sitzung von der Jetzt-Karte bis zur Abschlussbilanz. Der Kreislauf ist verdrahtet; was fehlt,
   ist ein Lauf mit echten Modellantworten.
3. **Konsolidierung anstossen** am Sitzungsbeginn — `evaluateTrigger` sagt, *ob* ein Lauf faellig
   ist; wer ihn ausloest, ist weiterhin nicht verdrahtet.
4. **Rollen-Qualitaetstests** gegen echte Modelle, sobald der Durchstich Daten liefert.
5. **Kostensteuerung**, sobald der Echtbetrieb zeigt, welche Rolle wie viel kostet.
