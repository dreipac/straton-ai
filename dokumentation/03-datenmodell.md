# 3 — Datenmodell

Sieben Migrationen, elf neue Tabellen, zwei erweiterte Tabellen, sechs RPCs.

| Migration | Inhalt |
|---|---|
| `20260818120000_learn_brain_memory.sql` | Lernerbild, Pfadreihenfolge, Herkunft auf dem Graphen |
| `20260818121000_learn_brain_perception_planner.sql` | Evidenz, Fehlermuster, Ziele, Aufgabenprotokoll |
| `20260818122000_learn_brain_consolidation.sql` | Ausloeser, Vorschlaege, Protokoll |
| `20260818123000_learn_brain_agent_models.sql` | Rolle-zu-Modell-Zuordnung |
| `20260819100000_learn_concept_origin_enforced.sql` | Herkunft ohne Standardwert, Belegzwang (I4) |
| `20260819110000_learn_brain_ever_consolidated.sql` | `ever_consolidated` — die Hysterese des Stapels (6.7) |
| `20260819120000_learn_review_stock.sql` | Vorrat an Wiederholungsabfragen (7.1) |

Einspielen mit `npm run db:push:selfhosted` beziehungsweise `npm run db:push:server`.

---

## Erweiterungen bestehender Tabellen

### `learn_concepts` — Herkunft (Invariante I4)

| Spalte | Typ | Zweck |
|---|---|---|
| `origin` | text NOT NULL, **ohne Standardwert** | `material` / `ai_supplement` / `user` / `unknown` |
| `source_quote` | text NOT NULL | woertlicher Beleg aus dem Quelldokument |

`source_ref` (bereits vorhanden) haelt die Koordinaten — Dokument, Abschnitt, Seiten.
`source_quote` haelt den Beleg selbst. Beides zusammen macht ein Konzept pruefbar.

**Nachgezogen in `20260819100000`,** nachdem die Invariantenpruefung zeigte, dass die erste
Fassung I4 nur halb durchsetzte:

- Der Standardwert `material` ist **entfallen**. Ein Standardwert, der eine Quelle behauptet, ist
  genau die Behauptung, die I4 verbietet — jede schreibende Stelle muss die Herkunft nennen.
- Neuer Wert `unknown` fuer den Altbestand. Zeilen mit `origin = 'material'` **ohne** Beleg
  wurden darauf umgestellt: nicht loeschen (die Konzepte sind in Benutzung), nicht behaupten
  (der Beleg fehlt), sondern benennen.
- Neuer Check `learn_concepts_material_needs_quote`: Materialherkunft **nur** mit nichtleerem
  Beleg. Damit ist die Regel nicht mehr eine Frage der Sorgfalt im Frontend.

`unknown` wird nie vergeben — `setConceptOrigin` lehnt es ausdruecklich ab. Der Wert entsteht
ausschliesslich aus der Migration und verschwindet, sobald ein Konzept von Hand korrigiert wird.

`ai_supplement` muss in der Oberflaeche unterscheidbar bleiben: spaetestens vor einer Pruefung
will ein Nutzer wissen, was aus seinem Stoff stammt.

### `learn_concept_edges` — Herkunft und Zeitpunkt

| Spalte | Typ | Zweck |
|---|---|---|
| `origin` | text NOT NULL | `cartographer` / `consolidator` / `user` |
| `created_at` | timestamptz | fuer Protokoll und Ruecknahme |

`consolidator` markiert Kanten, die aus den Daten entdeckt wurden — nicht gezeichnet, sondern
nachgewiesen.

### `profiles` — Chatsignal-Schalter

| Spalte | Typ | Zweck |
|---|---|---|
| `learn_brain_chat_signals_enabled` | boolean NOT NULL DEFAULT true | Kapitel 5.1, Pflicht zur Sichtbarkeit |

Bei `false` darf **keine** Chat-Evidenz geschrieben werden. `perceiveChatSignal` gibt dann `null`
zurueck.

---

## Schicht 2 — Gedaechtnis

### `learner_concept_brain_states` — das Lernerbild

Primaerschluessel `(user_id, concept_id)`.

| Spalte | Bedeutung |
|---|---|
| `mastery` | Beherrschung 0..1 |
| `confidence` | Sicherheit 0..1 |
| `depth` | `recognize` / `apply` / `transfer` |
| `depth_evidence` | jsonb, Zaehler je Stufe |
| `direct_evidence_count` / `direct_evidence_weight` | nur **direkte** Evidenz (I1) |
| `propagation_confidence_penalty` | Anteil der Sicherheit, der allein aus Zweifel stammt (I3) |
| `review_needed` / `review_reason` | „ueberpruefungsbeduerftig", aktiviert den Planer |
| `decay_rate` | individuelle Vergessensrate |
| `cold_start` | Kaltstartphase noch aktiv |
| `last_direct_evidence_at` / `last_seen_at` / `next_review_at` | Zeitanker |

**Bewusst eine eigene Tabelle**, nicht eine Erweiterung von `learner_concept_states`: die alte
Engine haelt dort ihren BKT-Zustand und laeuft weiter. Beide Modelle koennen parallel existieren,
ohne dass die Invarianten des einen die Semantik des anderen brechen.

**Warum `propagation_confidence_penalty` getrennt gefuehrt wird:** so laesst sich der Zweifel
zuruecknehmen, sobald echte Evidenz vorliegt. Waere er direkt von `confidence` abgezogen, waere
nach dem Abzug nicht mehr unterscheidbar, wie viel Sicherheit aus Evidenz und wie viel aus
Propagation stammt.

RLS: nur SELECT. Geschrieben wird ausschliesslich ueber `learn_brain_upsert_concept_states`.

#### `ever_consolidated` — die Hysterese des Wiederholungsstapels (6.7, neu in 1.1)

| Spalte | Typ | Zweck |
|---|---|---|
| `ever_consolidated` | boolean NOT NULL DEFAULT false | war dieses Konzept schon einmal gefestigt? |

Gesetzt wird sie in `applyDirectEvidence`, sobald die Beherrschung 0.7 erreicht; zurueckgesetzt
wird sie nie durch Verfall. Genau das ist ihr Zweck: ohne diesen Merker faellt ein lange
unangetastetes Konzept aus dem Stapel heraus, weil sein **verfallener** Wert unter die
Eintrittsschwelle rutscht — und landet zugleich nicht im Pfad, weil es dort nichts zu reparieren
gibt. Es waere verschwunden, obwohl gerade der Verfall der Grund ist, es zu zeigen.

Die Schwellen liegen deshalb auseinander: Eintritt bei 0.7, Rueckfall in den Pfad erst unter
0.45. Geprueft wird gegen die **gespeicherten** Werte, nicht gegen die verfallenen.

### `learn_review_stock` — Vorrat an Wiederholungsabfragen (7.1, neu in 1.1)

| Spalte | Typ | Zweck |
|---|---|---|
| `user_id`, `concept_id` | uuid | zusammen der Schluessel |
| `items` | jsonb | die vorproduzierten Abfragen mit Ausspielzaehler |
| `fingerprint` | text | Stand des Lernerbilds, aus dem der Vorrat entstand |
| `rotation` | integer | Zeigerposition der Rotation |

Die einzige Stelle, an der das Gehirn von der Echtzeitregel abweicht — und die Ausnahme ist eng
benannt: nur der Wiederholungsstapel, nur auf Erkennen-Niveau. `assertReviewOnly` macht jeden
anderen Gebrauch zum Fehler.

Der Fingerabdruck enthaelt bewusst **keinen** Verfall: er laeuft kontinuierlich weiter und wuerde
den Vorrat bei jedem Aufruf fuer ungueltig erklaeren. Uebrig bliebe Echtzeitgenerierung mit einem
Zwischenschritt.

### `learn_brain_session` — die unterbrochene Sitzung

| Spalte | Typ | Zweck |
|---|---|---|
| `user_id`, `path_id` | uuid | zusammen der Schluessel — hoechstens EINE offene Sitzung je Pfad |
| `plan` | jsonb | der beim Start festgeschriebene `PlannedTask[]` |
| `tasks` | jsonb | die bereits freigegebenen Aufgaben nach Platz: `{"0": {...}}` |
| `current_index` | integer | wo die Person steht |
| `images_before`, `events` | jsonb | nur fuer die Abschlussbilanz (4.9) |
| `started_at` | timestamptz | Beginn der **urspruenglichen** Sitzung, nicht der Fortsetzung |

**Das ist keine zweite Ausnahme von der Echtzeitregel.** Der Unterschied zum Vorrat oben liegt im
Zeitpunkt der Erzeugung, nicht in der Ablage: ein Vorrat entsteht, **bevor** jemand ihn braucht,
und wird fuer wechselnde Lagen wiederverwendet. Die Aufgaben hier sind bereits in Echtzeit
entstanden — fuer diese Person, diese Sitzung, diesen Stand des Lernerbilds. Sie liegen nur
zwischen zwei Aufrufen der Seite. Es entsteht nichts Neues; es wird lediglich nichts weggeworfen.
Torwaechter I5 ist unberuehrt: jede dieser Aufgaben hat ihn bei ihrer Erzeugung durchlaufen, und
eine gespeicherte Aufgabe erneut anzuzeigen ist keine Erzeugung.

Fortsetzbar bleibt eine Sitzung **sieben Tage** (`RESUMABLE_FOR_DAYS`). Es braucht eine Grenze,
weil der Plan aus dem Lernerbild eines Augenblicks stammt; nach Wochen ist er nicht mehr die
Antwort auf „was ist jetzt dran". Die Zeile faellt beim Abschluss **und beim Abbruch** weg — ein
Abbruch ist eine Entscheidung, keine Unterbrechung.

Gelesen wird misstrauisch (`parseStoredSession`): ein Plan, der nicht **vollstaendig** lesbar ist,
oder der auf ein inzwischen geloeschtes Konzept zeigt, wird verworfen statt gekuerzt — ein
gekuerzter Plan waere ein anderer Plan, und die Segmentleiste zeigte eine falsche Gesamtzahl (4.2).
Geschrieben wird lautlos: schlaegt das Speichern fehl, laeuft die Sitzung unveraendert weiter und
verhaelt sich beim naechsten Aufruf wie vor dieser Erweiterung.

### `learn_path_order` — die feste Pfadreihenfolge

Primaerschluessel `(path_id, concept_id)`.

| Spalte | Bedeutung |
|---|---|
| `position` | numeric(20,10) — **Bruchzahl**, kein Index |
| `kind` | `base` / `insert` |
| `insert_reason` | Begruendung des Umwegs |

`position` ist der Kern: zwischen 300 und 400 passt 350. Ein Einschub oder ein aufgespaltenes
Konzept kann einsortiert werden, ohne den Pfad umzunummerieren — und damit ohne dass die Strecke
fuer den Nutzer springt.

`kind = 'insert'` haelt Einschuebe aus dem Fortschrittsnenner heraus. Waechst der Pfad im
Hintergrund und die Prozentzahl faellt deshalb, wirkt das wie ein Fehler.

---

## Schicht 3 — Wahrnehmung

### `learn_evidence_events` — die Ausgabe des Pruefers

| Spalte | Bedeutung |
|---|---|
| `source` | `graded_task` / `chat` |
| `credit` / `partial_credit` | Teilpunkte gesamt und aufgeschluesselt |
| `examiner_confidence` | Zuversicht des Pruefers in die eigene Bewertung |
| `escalated` | an ein staerkeres Modell weitergereicht |
| `depth` / `format` / `difficulty` | Umstaende der Beobachtung |
| `evidence_weight` | Gewicht fuer Sicherheit und Konsolidierungszaehler |
| `mastery_delta` / `confidence_delta` | tatsaechlich angewandte Aenderungen |

**Zwei Constraints halten die Invarianten:**

```sql
constraint learn_evidence_events_only_direct_evidence_moves_mastery
  check (source = 'graded_task' or mastery_delta <= 0)
constraint learn_evidence_events_chat_never_raises_mastery
  check (source <> 'chat' or mastery_delta <= 0)
```

Die Deltas werden mitgeschrieben, obwohl sie sich aus dem Zustand ergeben. Sie sind die einzige
Moeglichkeit, im Nachhinein nachzuweisen, dass I1 und I2 gehalten haben — ein Lernerbild allein
zeigt nur das Ergebnis, nicht wodurch es entstand.

### `learn_error_observations` und `learn_error_patterns`

`learn_error_observations` haelt jedes einzelne Auftreten:

| Spalte | Bedeutung |
|---|---|
| `kind` | `confused` / `omitted` / `misapplied` / `overlooked` |
| `object` | worauf bezogen, frei |
| `subject` | **Fach** — Herkunft, nachtraeglich nicht rekonstruierbar |
| `pattern_id` | null, bis der Konsolidierer gruppiert hat |

`learn_error_patterns` haelt die getauften Muster:

| Spalte | Bedeutung |
|---|---|
| `name` | **unique (user_id, name)** — stabil (I12) |
| `scope` | `generic` / `domain_specific` / `unknown` |
| `subjects` | text[] — Grundlage der Einordnung |
| `distinct_concept_count` / `occurrence_count` / `distinct_day_count` | Anzeigeschwelle |
| `surfaced` | Schwelle erreicht, das Gehirn darf darueber reden |
| `user_disputed` | Widerspruch des Nutzers — selbst ein wertvolles Signal |
| `merged_into_id` | zeigt nach einer Verschmelzung auf das Zielmuster |

Die drei Zaehler stehen getrennt, weil die Anzeigeschwelle **keine reine Zahl** ist: sie verlangt
Wiederholung ueber verschiedene Konzepte **und** ueber Zeit.

### `learn_goals` — das Ziel als echtes Objekt

| Spalte | Bedeutung |
|---|---|
| `due_at` | Termin |
| `concept_ids` | Umfang |
| `minutes_per_day` | verfuegbare Zeit |

```sql
create unique index learn_goals_one_active_per_path
  on public.learn_goals (path_id) where status = 'active';
```

Hoechstens ein aktives Ziel pro Pfad. Mit zwei waere „Ziel uebersteuert" mehrdeutig.

### `learn_task_log` — Erklaerpflicht (I8)

| Spalte | Bedeutung |
|---|---|
| `claim` | `review` / `root_cause` / `goal` / `motivation` / `cold_start` |
| `urgency` / `urgency_breakdown` | Entscheidungslage, fuer Diagnose |
| `reason` | **der eine Satz** — NOT BLANK |
| `from_review_reserve` | aus der Mindestreserve gezogen (I9) |
| `evidence_event_id` | Verkettung mit der spaeteren Bewertung |

```sql
constraint learn_task_log_reason_not_blank check (length(trim(reason)) > 0)
```

Weil das Protokoll vor der Auslieferung geschrieben wird, ist eine Aufgabe ohne Begruendung nicht
nur unspeicherbar, sondern auch nicht ausspielbar.

---

## Schicht 6 — Konsolidierung

### `learn_consolidation_state` — der Ausloeser

| Spalte | Bedeutung |
|---|---|
| `pending_evidence_weight` | seit dem letzten Lauf aufgelaufen |
| `oldest_pending_at` | Basis der Wartezeit-Obergrenze |
| `last_run_at` / `run_count` | Cooldown und Statistik |
| `last_run_summary` | Ergebnis des letzten Laufs, fuer Diagnose |

### `learn_structure_proposals`

| Spalte | Bedeutung |
|---|---|
| `operation` | sechs Werte, siehe unten |
| `question` | in der Sprache des Nutzers, nicht in Graphensprache |
| `requires_confirmation` | true bei zerstoererischen Operationen |
| `surface_context` | `session_start` / `map_review` — **kein** Wert fuer „in der Sitzung" (I7) |
| `expires_at` | NOT NULL — unbeantwortete Fragen verfallen |

```sql
constraint learn_structure_proposals_destructive_needs_confirmation
  check (operation not in ('merge_concepts', 'merge_patterns')
         or (requires_confirmation = true and status <> 'auto_applied'))

constraint learn_structure_proposals_confirmation_needs_question
  check (requires_confirmation = false or length(trim(question)) > 0)
```

Der zweite Constraint ist der leicht uebersehene: eine Bestaetigung ohne Frage ist keine.

### `learn_structure_log` — Protokollpflicht

| Spalte | Bedeutung |
|---|---|
| `payload` | was geaendert wurde |
| `evidence` | welche Belege dafuer sprachen |
| `undo_payload` | **wie es rueckgaengig zu machen ist** |
| `destructive` | Art der Operation |
| `reverted_at` | gesetzt nach einer Ruecknahme |

```sql
constraint learn_structure_log_undo_not_empty
  check (jsonb_typeof(undo_payload) = 'object' and undo_payload <> '{}'::jsonb)
```

Ein Strukturumbau ohne hinterlegte Ruecknahme laesst sich physisch nicht protokollieren — und
ohne Protokoll darf er nicht stattfinden.

Beim Verschmelzen enthaelt `undo_payload` **beide urspruenglichen Lernerbilder** samt Konzept-
Schnappschuss und den umgehaengten Kanten. Nach dem Zusammenlegen sind sie sonst nicht mehr
rekonstruierbar — das ist ja gerade der Grund, warum eine Verschmelzung als zerstoererisch gilt.

---

## Vermittlungsschicht

### `learn_brain_agent_models`

Primaerschluessel `role`. Sechs Zeilen, eine je Modellrolle.

| Spalte | Bedeutung |
|---|---|
| `provider` / `model` | Hauptmodell |
| `escalation_provider` / `escalation_model` | bei Zweifel (Kapitel 5.3), optional |
| `max_output_tokens` | 256 bis 32768 |

```sql
role text primary key check (role in (
  'kartograf', 'pruefer', 'generator', 'kontrolleur', 'konsolidierer', 'erklaerer'
))
```

**`planer` ist kein moeglicher Wert.** Das ist die Datenbank-Fassung von Invariante I11.

RLS: SELECT fuer alle Angemeldeten (die Aufloesung passiert vor jedem Rollenaufruf), Schreiben
nur Superadmin.

---

## RPCs

| RPC | Zweck |
|---|---|
| `learn_brain_upsert_concept_states(uuid, jsonb)` | Lernerbilder atomar upserten |
| `learn_brain_replace_path_order(uuid, jsonb)` | Pfadreihenfolge in einem Rutsch setzen |
| `learn_brain_add_evidence_weight(uuid, uuid, float8)` | Konsolidierungszaehler erhoehen |
| `learn_brain_finish_consolidation(uuid, uuid, jsonb)` | Lauf abschliessen, Zaehler zuruecksetzen |
| `learn_brain_expire_structure_proposals(uuid)` | abgelaufene Vorschlaege schliessen |
| `get_learn_brain_agent_models()` | Rollenkonfiguration lesen |
| `admin_set_learn_brain_agent_model(...)` | eine Rolle umkonfigurieren, nur Superadmin |

Alle mit `security definer` und `auth.uid()`-Guard, Muster wie `learn_gamification_record_event`.

**Die Mathematik liegt bewusst nicht in den RPCs**, sondern in getesteten TypeScript-Modulen. Die
RPCs persistieren nur das Ergebnis in einer Transaktion. Das ist die Voraussetzung dafuer, dass
Verfall, Propagationsdaempfung und Planerlogik ohne Datenbank pruefbar sind.

**Warum Lernerbilder immer als Satz geschrieben werden:** ein Wahrnehmungsschritt aendert das
bewertete Konzept **und** die per Propagation angepassten Nachbarn. Getrennte Schreibvorgaenge
koennten dazwischen abbrechen und einen Zustand hinterlassen, in dem der Zweifel gesetzt, die
Evidenz aber verloren ist.

### Regeln in `admin_set_learn_brain_agent_model`

Zwei Pruefungen, die kein Tabellen-Constraint leisten kann, weil sie das Verhaeltnis **zweier
Zeilen** betreffen:

- **Pruefer** und **Kontrolleur** duerfen nicht auf dem Generator-Modell laufen.
- Umgekehrt darf der **Generator** nicht auf das Modell von Pruefer oder Kontrolleur gelegt
  werden. Ohne diese zweite Haelfte liesse sich die Regel trivial umgehen.

Die zugelassenen Modelle stehen in `learn_brain_model_is_allowed(text, text)` — als Funktion
statt als Constraint, damit die Liste per `create or replace` fortgeschrieben werden kann, ohne
bestehende Zeilen zu invalidieren.
