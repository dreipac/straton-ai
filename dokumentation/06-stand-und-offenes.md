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

### 8. Der Antwortvergleich verwarf richtige Zuordnungen wegen eines Strichs

Gemeldet aus dem Betrieb, als einzige Meldung ohne begleitenden Quellenbefund:

> Zu „Minderjaehriges Steuerpflichtig" liess sich keine belegbare Aufgabe erzeugen: Unabhaengige
> Loesung weicht ab: „A–1, B–2, C–3, D–4" statt „A-1, B-2, C-3, D-4".

Zwei identische Zuordnungen. Unterschieden allein durch Gedankenstrich gegen Bindestrich — reine
Satzkonvention. Dass kein Quellenbefund danebenstand, war schon der halbe Befund: I5 war zufrieden,
gescheitert ist nur das Gegenloesen, und zwar an einem Zeichen. Drei Schichten wirkten zusammen:

1. **`answersAgree` kannte keine Strichvarianten.** Die Funktion faltet Grossschreibung,
   Leerzeichen und Schluss-Interpunktion weg, weil sie „bewusst tolerant bei Schreibweise" sein
   soll; beim Strich fehlte genau diese Toleranz. Das Wissen lag im Haus — `ASSIGNMENT_PAIR` in
   `formats.ts` schrieb schon immer `[-–—]`, weil dort bekannt war, dass der Trennstrich variiert.
   Es stand nur nicht dort, wo verglichen wird.
2. **Der Zahlenrueckfall zog in dieselbe Richtung.** Bei ungleichen Zeichenketten vergleicht
   `answersAgree` die enthaltenen Zahlen; das Muster `-?\d+` schluckte den Bindestrich in „A-1" und
   las die Musterloesung als minus eins bis minus vier, die Gegenloesung mit Gedankenstrich als
   plus eins bis vier. Das Auffangnetz erzeugte die Abweichung also selbst ein zweites Mal.
3. **Zeichenkettenvergleich ist fuer Zuordnungen das falsche Instrument.** Eine Zuordnung ist eine
   MENGE von Paaren; ihre Richtigkeit haengt nicht an Reihenfolge, Trennzeichen oder Strichform.
   „B-2, A-1" scheiterte ebenso wie die Pfeilschreibweise — obwohl `composeMatchingAnswer` die
   Antwort des Nutzers selbst als „Begriff → Beschreibung" aufschreibt, waehrend der Generator
   „A-1, B-2" liefert. Zwei Schreibweisen desselben Sachverhalts, die der Vergleich nie zur
   Deckung brachte.

Wiederholen half nicht: nach I11 bleibt die Lage gleich, und der `rejectionHint` (Abschnitt zu I5
in [02-invarianten.md](02-invarianten.md)) hielt dem Generator hier zwei Zeichenketten vor, die
fuer ihn identisch aussahen. Alle `MAX_GENERATION_ATTEMPTS` verbrannten.

**Entschieden:** alle drei Schichten, nicht nur die oberste — der Strich allein haette die anderen
beiden Loecher nur seltener sichtbar gemacht.

- `answersAgree` faltet Strich- und Anfuehrungsvarianten auf ASCII, bevor verglichen wird (krumm
  auf gerade derselben Art; einfach und doppelt bleiben getrennt).
- Ein Strich, der direkt an einem Wortzeichen klebt, zaehlt nicht mehr als Vorzeichen. „A-1" ist
  ein Paar, „x = -26" bleibt minus 26.
- Fuer `matching` vergleicht `matchingAnswersAgree` die Paare als Menge. `counterAnswersAgree`
  verteilt je Format — die eine Stelle, an der sich ein kuenftiges Format mit eigener Antwortform
  meldet.

Das ist derselbe Gedanke wie in Eintrag 6, eine Ebene tiefer: **nicht vergleichen, was sich
umformulieren laesst.** Bei Auswahlfragen ist das der Wortlaut der Option, bei Zuordnungen sind es
Reihenfolge und Trennzeichen. Streng bleibt der Vergleich, wo es zaehlt — eine andere Zuordnung
(„A-2, B-1") und eine unvollstaendige fallen weiterhin durch, sonst faengt das Gegenloesen die
Fehlerart nicht mehr, gegen die es antritt.

**Nebenwirkung auf die Formatwahl, bewusst in Kauf genommen:** `avoidFormat` speist sich aus
`learn_task_log`, und protokolliert wird erst NACH dem Torwaechter (`useBrainSession.ts`). Eine am
Vergleich gescheiterte Zuordnung wurde nie protokolliert — die Wiederholungssperre hatte fuer
Zuordnungen faktisch nie etwas zu sperren. Seit dem Fix ueberleben sie, werden protokolliert, und
Zuordnungen tauchen dort auf, wo sie vorher lautlos verschwanden. Das ist die Absicht des Planers,
die endlich ausgefuehrt wird, keine Abweichung von ihr.

### 9. „Es kam keine Antwort" war kein eigener Fall

Gemeldet aus dem Betrieb, sporadisch:

> Rolle „generator": Anthropic hat keine Antwort geliefert.

Kein Netzwerkfehler und keine Ablehnung: HTTP 200, das Modell hat geantwortet, aber die Antwort
enthielt keinen verwertbaren Textblock. Das passiert eine Schicht UNTER dem Torwaechter — der
I5-Kreis mit `rejectionHint` und `MAX_GENERATION_ATTEMPTS` lief nie an, weil es nichts zu pruefen
gab.

**Der Mangel:** Das Gehirn unterscheidet sorgfaeltig zwischen „das Modell hat geantwortet, und die
Antwort taugte nichts" — dafuer gibt es den Kontrolleur, den `rejectionHint` und drei informierte
Versuche — und „es kam gar keine Antwort". Fuer den zweiten Fall gab es nichts. `callBrainAgent`
warf, der Generatoraufruf in `generateTask.ts` steht ohne `try`/`catch`, und der Wurf ging
ungebremst durch `produceSlot` auf den Bildschirm. Ein einzelner Aussetzer zerstoerte die Aufgabe
endgueltig — obwohl die richtige Reaktion auf „es kam nichts an" schlicht ist, noch einmal zu
fragen. Der teure, sorgfaeltige Wiederholungsweg schuetzte gegen schlechten INHALT, der billige
und offensichtliche gegen KEINEN Inhalt fehlte.

**Dazu Blindheit an der Fehlerstelle:** `stop_reason` wurde in den Edge Functions nirgends gelesen,
obwohl Anthropic ihn in jeder Antwort mitschickt. Drei voellig verschiedene Lagen fielen in
denselben Satz — abgeschnittenes Ausgabebudget, Ablehnung durch das Modell, wirklich leere
Antwort —, und keine davon war anschliessend zu belegen. Dieselbe Sorte Blindheit wie beim nie
befuellten `sourceIssues` in Eintrag 6.

**Entschieden:**

- `callAnthropic` liest `stop_reason` und benennt die drei Lagen getrennt. Ein abgeschnittenes
  Budget nennt ausdruecklich `max_output_tokens in learn_brain_agent_models` — die Stelle, an der
  es zu beheben ist.
- Neu `ProviderCallError` mit einem Feld `retryable`: die Einschaetzung entsteht dort, wo sie
  begruendbar ist (Ueberlastung gegen Urteil ueber die Anfrage), statt sie den Aufrufer aus einem
  Fehlertext raten zu lassen. `handleBrainAgent` reicht sie an den Client durch. Ein nicht
  klassifizierter Fehler gilt als endgueltig — auch die Aufrufe an Gemini und OpenAI, solange sie
  die Klasse nicht ebenfalls benutzen.
- 529 (Anthropics Ueberlastungsstatus), 5xx und 408 gelten als voruebergehend; ein nicht
  zustandegekommener Verbindungsaufbau ebenfalls. 429 ausdruecklich NICHT: ein sofortiger zweiter
  Versuch verschaerft ein Token-Limit, statt es zu entspannen.
- `callBrainAgent` fasst bei einem voruebergehenden Fehler EINMAL nach
  (`MAX_TRANSPORT_ATTEMPTS = 2`, 700 ms Wartezeit, ein Abbruch wird nicht verschlafen). Das gilt
  fuer alle sechs Rollen, nicht nur den Generator. Ebenfalls wiederholt werden „leere Antwort" und
  „kein gueltiges JSON": beides passiert VOR jeder Beurteilung, der Kontrolleur bekommt so eine
  Antwort nie zu sehen, und beides faellt damit in die Klasse „nichts Verwertbares angekommen".

`MAX_TRANSPORT_ATTEMPTS` und `MAX_GENERATION_ATTEMPTS` sind ausdruecklich zweierlei und duerfen
nicht zusammengelegt werden: das eine wiederholt, weil nichts ankam, das andere, weil das
Angekommene begruendet abgelehnt wurde und der naechste Versuch einen Hinweis mitbekommt.

**Rueckfall ohne Deployment:** Der Client entscheidet anhand des Feldes `retryable`, wenn es
vorliegt, und sonst anhand des Fehlertexts (`looksTransient`). Ohne diesen Rueckfall wuerde die
Wiederholung erst mit dem Ausrollen der Edge Function wirksam, obwohl sie das nicht braucht.

### 10. Ein Arbeitsheft ist kein Lehrbuch — die Aufbereitung als eigene Schicht

Der Befund kam aus dem Betrieb („das Gehirn wird schlechter, je mehr es weiss") und liess sich am
Material selbst nachmessen. Ein Schuldossier (21 Seiten, TBZ) ergab:

| Messung | Ergebnis |
|---|---|
| Textdichte | 897 Zeichen je Seite — eine dicht bedruckte A4-Seite hat rund 3000 |
| Zusammensetzung | ueberwiegend Arbeitsauftraege, Fragen und Lernziele; erklaerende Prosa mit Definitionen praktisch nicht vorhanden |
| Verweise | „Lesen Sie im Lehrmittel «Gesellschaft_Ausgabe A» in Kapitel 9.2" — auf Material, das gar nicht hochgeladen ist |
| Auszug bei 1 Datei | 1 von 1 Ausschnitten zum Thema |
| Auszug bei 9 Dateien | **2 von 6** — vier Plaetze an die ersten Absaetze unbeteiligter Dateien |
| Datei mit passendem NAMEN, themenfremdem Inhalt | **5 von 6 Plaetzen** |

Daraus folgten fuenf Aenderungen. Sie haengen zusammen: die ersten beiden sind die Voraussetzung
dafuer, dass die dritte auf festem Grund steht.

**1. Die Materialsuche kennt jetzt zwei Betriebsarten** (`utils/ragLite.ts`, `RetrievalPurpose`).
Beim BEANTWORTEN ist breite Abdeckung ein Vorteil — lieber ein Ausschnitt zu viel. Beim BELEGEN
kehrt sich das um: der Kontrolleur soll beurteilen, ob eine Aussage gedeckt ist, und ein
themenfremder Ausschnitt ist dann kein harmloser Beifang. In der Beleg-Betriebsart entfaellt das
Auffuellen mit fremden Dateien und die Gewichtung des Dateinamens; findet sich nichts
Einschlaegiges, ist die Antwort ein leerer Auszug. `generateTask.ts` behandelt den bereits mit
benannter Begruendung — besser als drei Versuche gegen fremdes Material.

**2. Die Texterkennung entscheidet jetzt je Seite** (`utils/documentParser.ts`). Die Schwelle
(80 Zeichen je Seite) wurde ueber das ganze Dokument gemittelt. Ein Arbeitsheft mit rund 900
Zeichen Aufgabentext je Seite lag weit darueber und loeste **nie** eine Erkennung aus — obwohl der
eigentliche Lehrstoff darin als eingescanntes Bild steckte (Gesetzesauszuege, Tabellen,
abfotografierte Buchseiten). Fuer das Gehirn existierte dieser Stoff nicht. Jetzt gilt: duenner
Textlayer ODER Rasterbild auf der Seite → Erkennung, und das Ergebnis wird seitenweise
eingefuegt, nicht als Block angehaengt. Was die Erkennung im Textlayer wiederfindet, faellt weg
(`ocrLinesBeyondTextLayer`) — sonst stuende der halbe Auszug doppelt da, und die Materialsuche
zaehlt Begriffe.

**3. Neue Rolle: der Aufbereiter** (`brain/preparation/derive.ts`, siebte Rolle). Er zerlegt das
Arbeitsheft in drei Arten und behandelt sie verschieden:

| Art | Beispiel | Behandlung |
|---|---|---|
| `wissensfrage` | „Welche Folgen hat die Aufloesung einer Verlobung?" | beantworten → Lehrtext → Konzept → Aufgabe |
| `arbeitsauftrag` | „Schauen Sie sich den Filmbeitrag an" | kein Wissen; das Thema wird recherchiert |
| `reflexion` | „Wie sieht Ihre Traumfrau aus?" | **nie** Lehrstoff, **nie** eine Aufgabe |

Die dritte Art war der teuerste bisherige Fehler: aus einer Reflexionsfrage entstand ein Konzept,
zu dem der Generator eine pruefbare Frage bauen sollte — eine Aufgabe, auf die niemand richtig
antworten kann.

**Warum das I5 nicht schwaecht, sondern wiederherstellt:** Genau diese Ableitung geschah vorher
schon, nur heimlich. Der Zweig `posesQuestionOnly` in `production/generateTask.ts` fuellte die
Luecke bei JEDER Aufgabe einzeln, mit potenziell jedes Mal anderer Antwort, und nirgends stand
hinterher, was das Modell als wahr angenommen hatte. Jetzt geschieht es einmal, im Voraus, und das
Ergebnis ist ein gespeicherter Text. Ab da gilt I5 wieder in voller Schaerfe — gegen einen
Lehrtext, der vorher da war, statt gegen etwas, das im Moment der Pruefung erfunden wurde. Der
Zweig bleibt als Rueckfall fuer Luecken, die die Aufbereitung nicht geschlossen hat.

Reihenfolge der Quellen: erst das Material selbst, dann Websuche, zuletzt das Fachwissen des
Modells. Recherchiert wird nur, wo der Aufbereiter selbst Unsicherheit meldet oder ein Auftrag auf
nicht vorliegendes Material verweist — was sicher im Dossier stand, bleibt unangetastet. Das
Material der Person hat Vorrang: es ist das, woran sie geprueft wird.

**4. Der Kartograf ist angeschlossen** (`brain/preparation/cartography.ts`). Die Rolle stand seit
jeher im Register, galt dort als „die kritischste" und wurde nie aufgerufen; die Konzeptbildung
lief ueber den allgemeinen Chatweg und umging damit die Vermittlungsschicht aus Kapitel 12 — ein
Modellwechsel im Admin-Menue wirkte auf jede Rolle ausser ausgerechnet diese. Der Chatweg bleibt
als Rueckfall, falls die Rolle serverseitig nicht aufloesbar ist; ohne ihn haette ein fehlendes
Deployment einen Pfad ganz ohne Konzeptnetz zur Folge.

**5. Der abgeleitete Lehrstoff ist sichtbar und aenderbar**
(`brain/components/BrainDerivedMaterialPanel.tsx`). Das ist die Bedingung, unter der die
Vorverlagerung ueberhaupt vertretbar ist: ein falscher abgeleiteter Satz vergiftet nicht mehr eine
Aufgabe, sondern ein ganzes Konzept mitsamt allen Aufgaben daraus — dieselbe Fehlerfortpflanzung,
gegen die I5 geschrieben wurde, nur eine Stufe frueher. „Fachlich richtig" und „was die Lehrperson
erwartet" gehen bei Recht und Staatskunde regelmaessig auseinander (Kantonsunterschiede, aeltere
Auflage, bewusste Vereinfachung im Unterricht). Die Korrektur geht denselben Weg wie jede andere
Materialaenderung — es gibt bewusst keinen zweiten Speicherort fuer „korrigierte" Fassungen.

Die Herkunft steht im NAMEN des abgeleiteten Materials, nicht im Text. Die Materialsuche schreibt
den Namen in jeden Auszug („Quelle 1 (<name>): …") — damit reist die Angabe bis zum Generator und
zum Kontrolleur mit, ohne dass ein Markierungssatz in den Lehrstoff muss, der dort mitgelernt und
spaeter abgefragt wuerde.

**Was offen bleibt:** Die Einordnung in die drei Arten kann nur ein Modell leisten — ein Parser
sieht bei „Wie stellen Sie sich Ihr Zusammenleben vor?" dieselbe Zeichenkette wie bei einer
Wissensfrage. `parseAufbereiterResult` prueft deshalb nur, dass eine Wissensfrage eine Antwort UND
eine Herkunftsangabe hat, nicht ob die Einordnung stimmt. Diese Grenze zu kennen ist besser, als
sie mit Stichwortlisten zu verwischen.

### 11. Ein Konzept zweimal, mit zwei Beherrschungswerten

**Der Befund.** Im Pfad standen Konzepte doppelt — gleicher Name, verschiedene Werte. Die
Datenbank kann das gar nicht anders: `learn_concepts` ist auf `(path_id, slug)` eindeutig, also
waren es nie zwei Zeilen desselben Konzepts, sondern zwei verschiedene Konzepte mit demselben
Namen. **Die Identitaet eines Konzepts ist der Slug, sichtbar ist der Name — und der Name wurde
nirgends geprueft.**

Der Zwilling entsteht in der abschnittsweisen Ingestion. Jeder Abschnitt geht einzeln an den
Kartografen, ohne zu wissen, was die anderen gefunden haben. Der Slug ist dabei eine freie
Erfindung des Modells (der Auftrag verlangt nur „kebab-case"), der Name dagegen ist gebunden: er
MUSS der Begriff sein, der im Beleg woertlich vorkommt. Behandelt ein Dossier dasselbe Thema auf
Seite 3 und Seite 11, liefern beide Abschnitte verlaesslich denselben NAMEN und verschiedene
SLUGS. `mergeConceptGraphs` verglich nur Slugs und liess beide durch.

Dass die Werte auseinanderlaufen, ist danach kein zweiter Fehler, sondern I1 bei der Arbeit: zwei
Knoten, zwei Lernerbilder, keine Kante dazwischen, also keine Propagation. Der Planer sieht einen
unberuehrten Knoten und fragt nach etwas, das die Person laengst beantwortet hat.

**Zwei Reparaturen, absichtlich verschieden streng.**

*Verhindern* — `mergeConceptGraphs` dedupliziert jetzt zusaetzlich ueber den normalisierten Namen.
Das ist ein EXAKTER Vergleich, keine Aehnlichkeitsschaetzung: zwei nur aehnliche Namen duerfen
hier nicht stillschweigend zusammenfallen, denn das waere eine inhaltliche Entscheidung. Die
Kanten des eingeschmolzenen Zwillings werden auf den ueberlebenden Knoten umgehaengt — ohne das
verloeren sie ihr Ziel und fielen weg. Nebenbei geschlossen: der Einzelabschnitts-Pfad lief bis
dahin ganz ohne Deduplizierung, und weder `parseConceptGraphFromText` noch
`parseCartographerResult` faengt doppelte Slugs vollstaendig ab — eine Modellantwort mit zwei
gleichen Slugs haette die Eindeutigkeit verletzt und damit den GANZEN Einfuegevorgang scheitern
lassen, der Pfad waere ohne jedes Konzept geblieben.

*Aufraeumen* — die Konsolidierung wird jetzt tatsaechlich gestartet (`services/
brainConsolidationRun.ts`, angestossen am Sitzungsende in `useBrainPath.refreshAfterSession`).
Sie war vollstaendig gebaut und nie gelaufen: Ausloeser, Wertregeln, Kandidatensuche,
Vorschlagsbau, Persistenz, Bestaetigungsdialog und Ruecknahmeprotokoll standen da, aber
`evaluateTrigger` hatte keine Aufrufstelle und die Rolle „konsolidierer" wurde nie gefragt —
derselbe Zustand, in dem der Kartograf vor Eintrag 10 war. Das ist der eigentliche Befund hinter
dem Symptom: es gab keinen Mechanismus, der aufraeumt, also wurde es mit jedem Material
schlimmer statt besser.

**Warum die Rolle trotz deterministischer Fassung gebraucht wird.** `findMergeCandidates`
vergleicht Wortmengen (Jaccard, Schwelle 0.6). Das trifft den haeufigsten Fall — identische oder
fast identische Namen, also genau die bereits gespeicherten Zwillinge — und ist dabei
nachrechenbar. Es findet „Steuerprogression" neben „Progressive Besteuerung" NICHT, weil kein
Wort geteilt wird. Genau diese Faelle sind der Grund fuer den Konsolidierer. Beide Quellen
speisen dieselbe Auswahl, und der belegbare Namenstreffer bekommt den knappen Platz zuerst.

**Was der Lauf tut, nach der Unterscheidung aus Kapitel 8.2** — umkehrbar gegen zerstoererisch,
nicht gross gegen klein:

| Operation | Weg | Obergrenze je Lauf |
|---|---|---|
| Verschmelzen | Frage an den Nutzer (I6), Anzeige nur ausserhalb der Sitzung (I7) | 2 |
| Voraussetzungskante | automatisch angewandt, protokolliert mit Ruecknahme | 2 |
| Aufspalten | nur gezaehlt — kein Ausfuehrungsweg vorhanden | — |

Die Obergrenzen sind keine Vorsicht, sondern Rechenwerk am Nutzer: eine Verschmelzungsfrage ist
eine Entscheidung ueber das eigene Material, und fuenf davon nebeneinander werden nicht fuenfmal
beantwortet, sondern einmal weggeklickt — was nach Kapitel 3.7 ein dauerhaftes Nein ist.

**Die Sperrmenge** (`suppressionKeys`) verhindert das Wiederkommen: jeder je gestellte Vorschlag
sperrt sein Paar, unabhaengig vom Ausgang. Ohne sie waere das Nein des Nutzers folgenlos — die
Kandidatensuche ist deterministisch und faende denselben Kandidaten alle sechs Stunden erneut.
Zusaetzlich gesperrt sind Paare mit einer Voraussetzungskante zwischen ihnen: gerade enge
Nachbarn („Einnahmen des Bundes" / „Einnahmen des Bundes berechnen") haben hohe Wortueberlappung
UND eine echte Abhaengigkeit, und eine Verschmelzung wuerde die dauerhaft loeschen.

**Der Prompt des Konsolidierers** sagte bisher nicht, was in `payload` gehoert (`"payload":{}`) —
seine Verschmelzungsvorschlaege waeren also selbst dann unbrauchbar gewesen, wenn ihn jemand
gefragt haette. Er nennt jetzt beide Konzept-IDs; `readInsights` prueft sie gegen den echten
Graphen und verwirft, was erfunden ist. Cache-Schluessel auf `-v2` gehoben, beide Kopien
woertlich gleich.


---

### 12. Ein Termin in zwei Tagen — der Sprint

**Die Lage.** Die Einrichtung fragt in Schritt 3 nach Termin und Zeit pro Tag, und die
Rueckwaertsrechnung stand vollstaendig da. Fuer einen Termin in zwei Tagen half sie trotzdem
nicht:

1. **Die Einrichtung schwieg.** Die Machbarkeit kann in Schritt 3 nicht gerechnet werden — das
   Konzeptnetz entsteht erst in Schritt 4. Der Moment, in dem die Warnung wirkt, blieb leer.
2. **Das Ziel schnitt nichts zu.** `assessGoal` rechnete den Verzicht aus
   (`downgradedConceptIds`), angewandt wurde er nie. Der Umfang blieb „alles", und der Planer
   arbeitete vierzig Konzepte gleichmaessig dringlich ab — statt zwanzig fertig zu machen,
   bekam man vierzig halb.
3. **Es gab keine Zieltiefe.** `assessGoal` nahm ueberall `apply` an, und `nextDepthFor` hob ein
   Konzept automatisch auf `apply`, sobald es 0.7 erreichte. Im Sprint verbrannte das genau die
   Minuten, die dort fehlen.
4. **Im Zwei-Tage-Fenster gibt es keine Wiederholung — strukturell.** Ein an Tag 1 auf 0.75
   gebrachtes Konzept bekommt `nextReviewAt` = +6 Tage; bei 0.5 bis 0.7 sind es +2 bis +4. Der
   Stapel ist an Tag 2 leer, und weil die Mindestreserve nur aus dem *faelligen* Stapel gefuellt
   wird, besteht auch die zweite Sitzung zu 100 Prozent aus neuem Stoff. Jedes Konzept bekommt
   genau einen Durchgang. Das ist keine Luecke, sondern die Aufloesung der Terminierung: die
   kleinste Einheit ist ein Tag.

**Was gebaut wurde.** Ein Sprint-Modus als Zustand des bestehenden Ziels, kein zweiter Pfad.
Die Leiter des Verzichts, die zwei Grenzen und die beiden getrennten Warnungen stehen in
`01-ueberblick.md`; hier nur, was daran eine Entscheidung war.

**Das Netz bleibt vollstaendig, geschnitten wird das Ziel.** Der Termin steht technisch vor der
Ingestion fest — der Kartograf koennte also weniger Konzepte anlegen. Dagegen sprechen drei
Dinge: dasselbe Dokument ergaebe je nach Pruefungsdatum eine andere Karte (I11, I4), ein
verschobener Termin liesse ein dauerhaft verarmtes Netz zurueck, und ein erneutes Einlesen
erzeugte genau die Zwillinge aus Eintrag 11. Der sichtbare Effekt ist derselbe — nur bleiben die
uebrigen Konzepte nach der Pruefung erhalten.

**Der Umfang ist eine Reihenfolge, keine Mauer.** Waere er eine Mauer, wuerde ausgebremst, wer
schneller ist als geplant. „Offen" misst `needsWorkForGoal` und damit dieselbe Definition, die
`assessGoal` fuer `openConceptCount` benutzt. Der naheliegende Test „meldet eine Dringlichkeit"
waere falsch gewesen: `rootCauseUrgency` liefert auch fuer ein laengst sitzendes Konzept noch
einen winzigen Wert (aus der Differenz von Beherrschung und Sicherheit), der Umfang waere damit
nie erledigt und der Pfad liefe nie von selbst weiter.

**Die Vorrangregel gilt nur im Sprint.** Ein Ziel mit vier Wochen Vorlauf bleibt eine Gewichtung
(`goalUrgency`) und darf den Rest des Pfads nicht verdecken. Die Mindestreserve ist auch im
Sprint nicht eingeschraenkt (I9).

**Der Ein-Tages-Fall weicht bewusst von der Minutenrechnung ab.** Bei einem Tag gilt die
Breitengrenze (20) auch dann, wenn die eingetragene Zeit weniger hergibt — wer am Vortag
anfaengt, sitzt nicht die eingetragene Stunde. Ungefaehrlich ist das nur, weil der Umfang eine
Reihenfolge ist; die Karte beziffert die echten Stunden.

**„Zurueckgestellt" ist ein Merkmal, kein Knotenzustand.** Als sechster `NodeState` haette es
den Lernzustand verschluckt — ein Konzept kann gleichzeitig faellig und ausserhalb des Umfangs
sein. Der Knoten bleibt vollstaendig bedienbar: zurueckgenommen, nicht gesperrt.

**Der Fortschrittsring wechselt im Sprint die Bezugsgroesse** — sonst stuende er bei 50 Prozent,
obwohl das Ziel erreicht ist. Weil eine heimlich wechselnde Bezugsgroesse schlimmer waere als
eine unguenstige, sagt `scopeNote` sie an: „20 von 40 im Umfang".

**Der Hinweis ist keine zweite Karte, sondern ein Band, das unter der Jetzt-Karte
hervorschaut.** Zwei Karten uebereinander waeren zwei gleichrangige Angebote, und der Hinweis ist
keins: er sagt, WORAUS die Jetzt-Karte gerade schoepft. Die Karte selbst bleibt deshalb unberuehrt
— eigenstaendig, rundum abgerundet, mit ihrem Schatten. Das Band (`.brain-sprint-notice-slot`,
dieselbe 0-zu-Inhalt-Technik wie beim Aufklappen eines Themas) schiebt sich um genau einen
Kartenradius unter sie und liegt hinter ihr. Daraus folgt alles Weitere: die Oberkante ist flach
und randlos, weil sie hinter der Karte liegt; an den Seiten bleibt keine Luft, weil das Band die
runden Kartenecken von hinten ausfuellt; einen eigenen Schatten traegt es nicht, denn der Schatten
der Karte faellt auf das Band und nicht umgekehrt. `.brain-now-stack` klammert beide, damit der
Gitterabstand von `.brain-path` sich nicht dazwischenlegt, und haelt in `--brain-card-radius` den
Wert, den Einschub, Rundung und obere Polsterung teilen muessen.

Die Uebergangskante traegt einen flachen Schatten, und zwar als `box-shadow` der KARTE, solange
das Band offen ist. Ein Verlauf auf dem Band waere ueber die ganze Breite eine gerade Linie
gewesen und an den runden Kartenecken sichtbar daran vorbeigelaufen; ein `box-shadow` folgt der
Rundung von selbst. Er ersetzt den normalen Kartenschatten statt ihn zu ergaenzen — der weiche
Umgebungsschatten lag ohnehin hinter dem Band —, und derselbe Wert gilt in allen Themen: die
dunklen nehmen der Karte ihren Schatten sonst weg, diese eine Kante braucht ihn aber ueberall.

**Der Hinweis hat eine eigene Ueberschrift** (`title` in `SprintCardView`) statt den ersten Satz
gross zu setzen. Der erste Satz beginnt mit einer Zahl („20 von 40 Konzepten …"); gross gesetzt
liest er sich nicht als Ueberschrift, sondern als Fliesstext, der zufaellig hervorgehoben wurde.
Die Ueberschrift traegt Groesse, Gewicht und Farbe des Jetzt-Karten-Titels eine Stufe kleiner, der
Rest ist Fliesstext in der Sekundaerfarbe.

Berechnet wird der Hinweis trotzdem in `LearnPage` und nur als fertige Ansicht hereingereicht: das
„Nicht jetzt" des Rueckhol-Angebots soll einen Tabwechsel ueberleben, der Pfad-Tab wird dabei aber
abgeraeumt.

**Beide Antworten auf den Vorschlag senken die Zieltiefe** — auch „alles behalten". Stufe 2 der
Leiter gilt unabhaengig davon, ob jemand ein Konzept hergeben will, und die gesenkte Tiefe ist
zugleich die Merkung, DASS geantwortet wurde. Kein zusaetzliches Feld, das mit dem Ziel
auseinanderlaufen koennte.

**Derselbe Hinweis steht ein zweites Mal, als Bestaetigung vor der Erzeugung.** Der Text in
Schritt 3 der Einrichtung (`sprintWarning`, `LearnSetupPanel.tsx`, ueber `describeSprintDeadline`)
ist Feedback waehrend der Termin eingetippt wird — leicht zu ueberlesen, weil er neben einem
Eingabefeld steht statt im Weg. `LearnSprintConfirmModal.tsx` macht ihn zur aktiven Bestaetigung:
faellt der Termin in den Sprint-Bereich, haelt „Einrichtung abschließen" hier an, bevor
`onFinishSetup` (und damit die Erzeugung) ueberhaupt aufgerufen wird — „Anpassen" fuehrt nur zurueck
in Schritt 3. Es ist derselbe `describeSprintDeadline`-Text, nicht `describeSprintScope`/
`describeRetention`: vor der Erzeugung existiert noch kein Konzept-Netz, an dem sich ein Umfang
berechnen liesse.

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
- **Aufspalten wird erkannt, aber nicht vorgeschlagen.** `findSplitCandidates` laeuft im
  Konsolidierungslauf mit und landet in dessen Zusammenfassung; ein Vorschlag entsteht daraus
  nicht. Der Grund ist kein Zoegern, sondern ein fehlender Ausfuehrungsweg: eine Aufspaltung muss
  zwei NEUE Konzepte anlegen, und wie die Haelften heissen, weiss nur, wer das Material gelesen
  hat. Weder `services/` kann das ausfuehren noch haette die Zustimmung des Nutzers einen
  Empfaenger. Eine Frage zu stellen, deren Ja folgenlos bleibt, waere schlimmer als zu schweigen.
- **Im Sprint gibt es keine Wiederholung.** Das kuerzeste Intervall, das
  `nextReviewIntervalDays` fuer ein gefestigtes Konzept vergibt, ist groesser als ein Fenster von
  drei Tagen — jedes Konzept bekommt genau einen Durchgang. Der Leerzustand des
  Wiederholen-Bereichs sagt das jetzt, statt „alles erledigt" zu suggerieren. Behoben waere es
  erst mit Abstaenden unterhalb eines Tages, und das ruehrt an die Zuordnungsgrenze aus Kapitel
  6.7 — deshalb bewusst nicht mit erledigt.
- **Das Rueckhol-Angebot wird nicht persistiert.** „Nicht jetzt" gilt fuer die aktuelle Ansicht.
  Das ist Absicht: das Angebot ist kein Vorschlag mit Frist, sondern eine Beobachtung ueber den
  aktuellen Stand — wer morgen wieder vorne liegt, soll es wieder bekommen.
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

1. **Migrationen einspielen** und den ersten Lauf beobachten. Inzwischen sind es acht, davon
   vier aus Fassung 1.1 (zuletzt `…_learn_goal_target_depth.sql`). Bis dahin laeuft die Gehirn-Oberflaeche in einen Ladefehler — sie ist
   gebaut, aber nichts steht hinter ihr.
2. **Vertikaler Durchstich am echten Bildschirm**: ein Pfad mit eingelesenem Material, eine
   Sitzung von der Jetzt-Karte bis zur Abschlussbilanz. Der Kreislauf ist verdrahtet; was fehlt,
   ist ein Lauf mit echten Modellantworten.
3. **Ersten Konsolidierungslauf beobachten** — er braucht acht Evidenzgewicht (rund acht
   bewertete Aufgaben) und laeuft dann am Sitzungsende. Interessant ist, ob die
   Verschmelzungsfragen die richtigen Paare treffen.
4. **Aufspaltung ausfuehrbar machen** — die Erkennung steht, der Weg zum Anlegen der beiden
   Haelften fehlt (siehe „Bekannte Grenzen").
5. **Rollen-Qualitaetstests** gegen echte Modelle, sobald der Durchstich Daten liefert.
6. **Kostensteuerung**, sobald der Echtbetrieb zeigt, welche Rolle wie viel kostet.
