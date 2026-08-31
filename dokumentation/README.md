# Straton Lernbereich — die neue Architektur

**Stand:** 20. August 2026 — Fassung 1.1, Oberflaeche angebunden
**Bezugsdokumente:**
[`../straton-gehirn-architektur.md`](../straton-gehirn-architektur.md) (Architektur, Fassung 1.1)
und [`../straton-ui-spezifikation.md`](../straton-ui-spezifikation.md) (Oberflaeche).
**Bei Widerspruechen gilt das Architekturdokument.**

Diese Dokumentation beschreibt, wie das digitale Gehirn des Lernbereichs **gebaut** ist. Das
Bezugsdokument beschreibt, **warum** es so gebaut ist. Wo hier eine Entscheidung erklaert wird,
steht die Kapitelnummer des Bezugsdokuments dabei — die Begruendungen sind dort ausfuehrlicher
und sollten vor jeder Aenderung gelesen werden.

---

## Was hier neu ist

Der Lernbereich hatte bereits eine adaptive Engine (`src/features/learn/engine/`) mit
Bayesian Knowledge Tracing, Verfallsmodell und Konzeptgraph. Die neue Architektur ersetzt sie
nicht, sondern legt ein zweites, vollstaendigeres Modell daneben: das **Gehirn**
(`src/features/learn/brain/`).

Drei Dinge kann die alte Engine grundsaetzlich nicht, und alle drei sind der Grund fuer den
Neubau:

| | alte Engine | Gehirn |
|---|---|---|
| Werte pro Konzept | nur `pMastery` | Beherrschung, **Sicherheit**, **Anwendungstiefe** |
| Propagation | verschiebt die Beherrschung | verschiebt **nur die Sicherheit** (Invariante I3) |
| Herkunft des Stoffs | nicht gefuehrt | jedes Konzept traegt seine Quelle (Invariante I4) |

Der zweite Wert — die Sicherheit — ist der eigentliche Bruch. Ohne ihn kann ein System nicht
zwischen „du kannst das nicht" und „ich weiss es noch nicht" unterscheiden. Jemand mit einer
einzigen richtigen Antwort und jemand mit zwanzig stehen sonst beide bei 100 Prozent.

Die alte Engine bleibt lauffaehig und wird vom Gehirn als Primitiv-Bibliothek weiterverwendet
(BKT-Mathematik, Verfallskurve). Sie wurde nicht angefasst.

---

## Wo was steht

| Dokument | Inhalt |
|---|---|
| [`01-ueberblick.md`](01-ueberblick.md) | Der geschlossene Kreislauf, die sechs Schichten, was wo passiert |
| [`02-invarianten.md`](02-invarianten.md) | Die zwoelf unverhandelbaren Regeln und wo jede durchgesetzt wird |
| [`03-datenmodell.md`](03-datenmodell.md) | Tabellen, RPCs, welche Regel in welchem Constraint steckt |
| [`04-codekarte.md`](04-codekarte.md) | Jede Datei, ihre Aufgabe und ihre Abhaengigkeiten |
| [`05-agenten-und-modelle.md`](05-agenten-und-modelle.md) | Die sechs Modellrollen, die Vermittlungsschicht, das Admin-Menue |
| [`06-stand-und-offenes.md`](06-stand-und-offenes.md) | Was fertig ist, was bewusst offen blieb, was als Naechstes kommt |
| [`07-oberflaeche.md`](07-oberflaeche.md) | Anbindung, Tabs, Hooks, Handkorrekturen — die Umsetzung der UI-Spezifikation |

---

## Der schnellste Einstieg

Wer das System zum ersten Mal anfasst, liest in dieser Reihenfolge:

1. **Kapitel 1 des Bezugsdokuments** (die zwoelf Invarianten). Sie sind bindend und erklaeren
   die meisten Eigenheiten des Codes.
2. [`02-invarianten.md`](02-invarianten.md) — wo jede dieser Regeln im Code sitzt.
3. `src/features/learn/brain/types.ts` — alle Datentypen mit Kapitelbezug an einem Ort.
4. `src/features/learn/brain/invariants.ts` — die Regeln als ausfuehrbarer Code.

---

## Umfang

- **7 Migrationen** — 11 Tabellen, 6 RPCs, 3 Spaltenerweiterungen
- **1 Edge-Function-Modus** (`brain_agent`) plus ein eigenes Modul dafuer
- **65 TypeScript-Module** im Gehirn: Kern und `ui/` rein, `hooks/`, `components/` und
  `services/` nicht
- **1 Admin-Bereich** — Modellzuweisung je Rolle
- **476 Tests** allein fuer das Gehirn

Alles ausser `hooks/`, `components/`, den Persistenz-Modulen und `agents/client.ts` ist frei von
Seiteneffekten und ohne Aufbau testbar. Das ist keine Stiltreue, sondern die Voraussetzung dafuer,
dass die Entscheidungslogik des Planers reproduzierbar geprueft werden kann — was Invariante I11
verlangt. Aus demselben Grund liegt die Anbindung an die Oberflaeche in `ui/` und nicht in den
Komponenten: Kapitel 15 der UI-Spezifikation ist eine Tabelle, und eine Tabelle laesst sich
pruefen.

---

## Was noch nicht laeuft

**Die Migrationen sind nie gegen eine Datenbank gelaufen.** Auf dem Entwicklungsrechner lief kein
Postgres. Solange sie nicht eingespielt sind, laeuft die Gehirn-Oberflaeche in einen Ladefehler —
sie ist gebaut, aber nichts steht hinter ihr. Das ist der erste Schritt in
[`06-stand-und-offenes.md`](06-stand-und-offenes.md).

Die verbliebenen kleinen Luecken an der Oberflaeche stehen am Ende von
[`07-oberflaeche.md`](07-oberflaeche.md).
