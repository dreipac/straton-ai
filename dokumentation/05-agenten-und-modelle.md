# 5 — Agenten und Modelle

Sieben Rollen, sechs davon brauchen ein Modell. Der Planer braucht keines — und das ist keine
Sparmassnahme, sondern Invariante I11.

| Rolle | Aufgabe | Anforderungsprofil | Latenz | Eskalation |
|---|---|---|---|---|
| **Kartograf** | Graph aus Material bauen, Chats zuordnen | hoechstes Verstaendnis | unkritisch | ja |
| **Pruefer** | bewerten, Ursache und Zuversicht liefern | Genauigkeit, Kalibrierung | kritisch | ja |
| **Generator** | Aufgaben erzeugen | Geschwindigkeit, Formatvielfalt | kritisch | nein |
| **Kontrolleur** | gegen Quelle pruefen, gegenloesen | Unabhaengigkeit vom Generator | kritisch | nein |
| **Konsolidierer** | Muster verdichten, Umbau vorschlagen | Mustererkennung ueber viel Material | unkritisch | nein |
| **Erklaerer** | in einem Satz begruenden | Kuerze, Verstaendlichkeit | kritisch | nein |
| **Planer** | auswaehlen, was als Naechstes kommt | **kein Modell** (I11) | — | — |

---

## Die Vermittlungsschicht

> „Die Rollen kennen die Modelle nie direkt. Dazwischen liegt eine Konfiguration, in der steht,
> welche Rolle auf welchem Modell laeuft. Ein Modellwechsel ist dann eine Konfigurationsaenderung,
> kein Umbau." — Kapitel 12

Diese Konfiguration ist die Tabelle `learn_brain_agent_models`. Sie wird im Admin-Menue
**Gehirn-Agenten** gepflegt und wirkt **sofort** — kein Entwurf/Deploy-Zwischenschritt.

Das weicht bewusst vom Muster der Abo-Einstellungen ab: eine Rollenkonfiguration ist kein
Vertragsbestandteil, sondern eine Betriebseinstellung, und sie soll sich im Fehlerfall in
Sekunden zurueckdrehen lassen.

**Kein Modellname steht im Klartext an einer Aufrufstelle.** Wer in `agents/client.ts` oder in
einer Rolle ein Modell hartcodiert, hebt Kapitel 12 auf.

### Der Weg eines Rollenaufrufs

```
Client                          Edge Function                    Anbieter
──────                          ─────────────                    ────────
callBrainAgent({                mode: 'brain_agent'
  role: 'pruefer',      ───►    fetchBrainAgentBinding(role)  ──► learn_brain_agent_models
  escalate: false                     │
})                                    ▼
                                modelForBrainCall(binding, escalate)
                                      │
                                      ▼
                                brainSystemPrompt(role)        ──► OpenAI / Anthropic / Gemini
                                      │
        parse(contracts.ts)   ◄───────┘
```

**Der Client sendet nur die Rolle, nie ein Modell.** Zwei Gruende:

1. Ein manipulierter Client kann sich kein teureres Modell erschleichen.
2. Ein Modellwechsel wirkt sofort fuer alle, ohne dass ein Frontend ausgeliefert werden muss.

---

## Die Eskalation (Kapitel 5.3)

Jede eskalationsfaehige Rolle traegt ein optionales zweites Modell. Es wird **nur bei Zweifel**
geweckt:

```ts
callWithEscalation({
  role: 'pruefer',
  payload,
  parse: (raw) => parseExaminerResult(raw, subject),
  needsEscalation: (v) => v.confidence < ESCALATION_THRESHOLD,   // 0.45
})
```

Hier wird die Mehrmodellarchitektur zum ersten Mal **funktional statt dekorativ**: das schnelle,
guenstige Modell erledigt den Normalfall, das teure zieht nur der Zweifel an. Derselbe
Mechanismus wie im biologischen Gehirn.

Drei Dinge sind dabei bewusst so gebaut:

- **Eskaliert wird hoechstens einmal.** Ein Modell, das dem staerkeren auch nicht glaubt, wuerde
  sonst eine Kette teurer Aufrufe ausloesen.
- **Faellt die Eskalation aus, gilt die erste Antwort** — sie wiegt ohnehin nur schwach, weil die
  Wahrnehmungsschicht sie ueber die niedrige Zuversicht daempft.
- **Ohne konfiguriertes Eskalationsmodell** bleibt als Reaktion auf Zweifel das erneute, anders
  verpackte Fragen. Das Admin-Menue weist ausdruecklich darauf hin.

---

## Zwei gesperrte Zuordnungen

**Pruefer** und **Kontrolleur** duerfen nie auf demselben Modell laufen wie der **Generator**.

> Ein Modell, das seine eigene Aufgabe bewertet, ist systematisch zu milde. Ein Kontrolleur auf
> demselben Modell wiederholt die Fehler des Generators, statt sie zu finden.

Die Regel ist **dreifach** durchgesetzt:

| Wo | Was |
|---|---|
| `validateRouting` im Frontend | zeigt den Fehler, bevor gespeichert wird, und sperrt den Knopf |
| `admin_set_learn_brain_agent_model` | lehnt ab — die verbindliche Instanz |
| in **beide** Richtungen | auch das Umstellen des *Generators* auf ein Pruefer-Modell wird abgelehnt |

Die zweite Richtung ist der Punkt, der leicht fehlt: ohne sie liesse sich die Regel trivial
umgehen, indem man statt des Pruefers den Generator verschiebt.

Zusaetzlich **warnt** die Oberflaeche (ohne zu sperren), wenn Generator und Kontrolleur beim
selben *Anbieter* liegen. Zulaessig, aber ein anderer Anbieter macht die Gegenpruefung
unabhaengiger.

---

## Vorbelegung

Bewusst nur Modelle, deren API-Schluessel in diesem Projekt ohnehin gesetzt ist. Anthropic steht
zur Auswahl, ist aber nicht vorbelegt — das Gehirn laeuft damit ohne zusaetzliches Secret sofort.

| Rolle | Anbieter | Modell | Eskalation |
|---|---|---|---|
| Kartograf | OpenAI | `gpt-5.4` | `gpt-5.6-sol` |
| Pruefer | OpenAI | `gpt-5-mini` | `gpt-5.4` |
| Generator | **Gemini** | `gemini-3.1-flash-lite` | — |
| Kontrolleur | OpenAI | `gpt-5-mini` | — |
| Konsolidierer | OpenAI | `gpt-5.4` | — |
| Erklaerer | Gemini | `gemini-3.1-flash-lite` | — |

Die Trennung ist im Seed bereits eingehalten: Generator auf Gemini, Pruefer und Kontrolleur auf
OpenAI.

Dieselbe Belegung existiert dreifach — als Seed in der Migration, als `FALLBACK_BINDINGS` im
Frontend und als `FALLBACK` in der Edge Function. `modelRoutingConsistency.test.ts` haelt die
drei zusammen.

---

## Systemanweisungen

Jede Rolle bekommt genau den Auftrag, den das Architekturdokument ihr gibt — nicht mehr. Das ist
der Sinn getrennter Rollen.

Alle antworten in **striktem JSON**. Nicht aus Bequemlichkeit, sondern wegen I4 und I5: nur ein
strukturiertes Feld laesst sich auf Herkunft und Quellenbezug abklopfen. Freitext liesse sich
nicht maschinell pruefen.

Ausgewaehlte Stellen, an denen die Anweisung eine Invariante traegt:

| Rolle | Anweisung | Warum |
|---|---|---|
| Kartograf | „Erfinde nie einen Beleg." | I4 — ein erfundenes Zitat ist schlimmer als eine fehlende Ergaenzung |
| Kartograf | „Im Zweifel keine Kante." | eine fehlende Kante wird spaeter entdeckt, eine falsche verteilt Zweifel falsch |
| Pruefer | „Sei hier ehrlich. Eine niedrige Zuversicht ist kein Fehler." | ohne das kalibriert kein Modell nach unten |
| Generator | Auf Transferstufe: „Nenne das Konzept NICHT beim Namen." | genau das Erkennen ist die Leistung |
| Kontrolleur | „Du erhaeltst NUR die Aufgabe, ohne Musterloesung." | sonst bestaetigt er sie bloss |
| Konsolidierer | „Ein bereits bestehender Name wird NIE geaendert." | I12 |
| Erklaerer | „Der Inhalt bleibt exakt derselbe." | I8 — er formuliert um, er begruendet nicht |

Die Anweisungen liegen **doppelt** vor — in `agents/prompts.ts` und in
`supabase/functions/chat-completion/brainAgents.ts` —, weil Edge Functions nicht in den
Frontend-Build hineinreichen.

> **Beim Aendern einer Anweisung muessen beide Seiten nachgezogen und der Cache-Schluessel
> hochgezaehlt werden** (`straton-brain-<rolle>-v1` → `-v2`). Sonst liefert der Prompt-Cache die
> alte Anweisung zu einem neuen Auftrag aus — ein Fehler, der sich als unerklaerliches
> Rollenverhalten aeussert und schwer zu finden ist.

---

## Die Parser als Grenze

`agents/contracts.ts` ist die Grenze zwischen Modellausgabe und Gehirn. Ab dort gelten die Typen,
davor gilt nichts.

Die Parser **verwerfen** fehlerhafte Antworten, statt sie mit Standardwerten aufzufuellen:

| Fall | Verhalten | Warum |
|---|---|---|
| Konzept ohne `origin` | verworfen, mit Grund | I4 |
| `origin: 'material'` ohne Beleg | verworfen, mit Grund | I4 |
| Kante auf unbekannten Slug | verworfen | Verweis ins Leere |
| `sourceAligned` fehlt | gilt als **false** | I5 — eine fehlende Freigabe ist keine Freigabe |
| Verschmelzungsvorschlag ohne Frage | verworfen | I6 — nicht bestaetigungsfaehig |
| Muster mit unbekannter Fehlerart | verworfen | die halbstrukturierte Form waere sonst hin |

`extractJson` ist dagegen bewusst tolerant: Codeblock-Zaeune und vorangestellte Erklaersaetze
werden entfernt. Das ist kein Widerspruch — die Verpackung darf schlampig sein, der Inhalt nicht.

---

## Das Admin-Menue

**Administrator → Gehirn-Agenten**

Je Rolle eine Karte mit Aufgabe, Anforderungsprofil, Anbieter, Modell und — wo vorgesehen —
Eskalation. Speichern wirkt sofort.

Die Oberflaeche erklaert dabei drei Dinge, die sonst als Fehler missverstanden wuerden:

- **Warum der Planer fehlt.** Eine eigene Karte am Ende erklaert, dass er deterministisch laeuft.
  Ihn stillschweigend wegzulassen wuerde die Frage offenlassen.
- **Warum eine Zuordnung abgelehnt wird.** Der Speichern-Knopf ist gesperrt und daneben steht der
  Grund im Klartext.
- **Was ohne Eskalationsmodell passiert.** Nicht „nichts", sondern: dieselbe Sache kommt spaeter
  anders verpackt.

### Kosten

Der Verbrauch erscheint im Admin-Menue **KI-Tokens** unter `brain_<rolle>` — also getrennt je
Rolle. Damit ist sichtbar, welche Rolle wie viel kostet, was die Grundlage fuer eine spaetere
Budgetsteuerung ist (Kapitel 14, noch offen).

### Benoetigte Secrets

| Secret | Wofuer |
|---|---|
| `OPENAI_API_KEY` | alle OpenAI-Modelle |
| `GEMINI_API_KEY` | alle Gemini-Modelle |
| `ANTHROPIC_API_KEY` | nur falls eine Rolle auf Claude gelegt wird |

Nach Aenderungen an `brainAgents.ts` oder `index.ts` muss `chat-completion` neu deployt werden
(`npm run functions:deploy:server`). Eine Aenderung der **Modellzuordnung** braucht das nicht —
sie liegt in der Datenbank.
