# Design-Tokens: Schriftgrößen & Ecken-Radien

**Stand:** 26. August 2026
**Betrifft:** alle Dateien unter `src/styles/*.css` (und jede neue CSS-Datei im Projekt)
**Verbindlich für:** jede Änderung an `font-size` oder `border-radius` — auch für Claude Code
in künftigen Sessions.

---

## Die eine Regel

> **Brauchst du eine neue Schriftgröße oder einen neuen Eckenradius: schau zuerst in die
> Tabellen unten und nimm die nächstliegende Stufe. Erfinde keinen neuen Rohwert
> (`font-size: 0.91rem`, `border-radius: 13px`, …).**
>
> Nur wenn *wirklich keine* Stufe auch nur annähernd passt (ein neuer, deutlich größerer oder
> kleinerer Anwendungsfall), wird die Skala unten um eine neue, benannte Stufe erweitert —
> nie ein unbenannter Einzelwert direkt im Selektor.

Warum das überhaupt eine eigene Regel braucht: Vor dieser Aufräumaktion (26. August 2026) gab es
im Projekt **über 30 verschiedene, teils nur 1px auseinanderliegende Schriftgrößen** und **14
verschiedene Radius-Werte zwischen 4px und 22px** — jede Komponente hatte sich ihren Wert einzeln
"erfühlt", ohne erkennbares System. Das Ergebnis wirkt in der Summe unruhig, auch wenn kein
Einzelwert für sich falsch aussieht. Die Tokens unten fassen das in eine Skala; jede neue Stelle
im Code soll aus dieser Skala schöpfen statt die alte Beliebigkeit fortzusetzen.

---

## 1. Schriftgrößen-Skala (`--fs-*`)

Definiert in `src/styles/theme.css`, ganz oben, theme-unabhängig (gilt in Light/Dark/Pink-Glass/
OLED gleichermaßen).

| Token | Wert | ≈ px (16px-Root) | Einsatz |
|---|---|---|---|
| `--fs-2xs` | `0.6875rem` | 11px | kleinste Labels, Zähler-Badges, Meta-Text |
| `--fs-xs` | `0.75rem` | 12px | Sekundär-Text, Buttons in Toolbars, Kapitel-Meta |
| `--fs-sm` | `0.8125rem` | 13px | dichte Listen, kleine Buttons |
| `--fs-md` | `0.875rem` | 14px | **häufigste Fließtext-Größe** in dichten UI-Bereichen |
| `--fs-base` | `0.9375rem` | 15px | Standard-Fließtext, Beitragstexte |
| `--fs-lg` | `1rem` | 16px | Standard-Fließtext, Post-/Karten-Titel |
| `--fs-xl` | `1.125rem` | 18px | kleine Überschriften, Card-Titel, Tages-Badges |
| `--fs-2xl` | `1.25rem` | 20px | Abschnitts-/Seitentitel |
| `--fs-3xl` | `1.5rem` | 24px | große Überschriften |

Benutzung: `font-size: var(--fs-md);` — nie `font-size: 0.875rem;` direkt.

### Bewusste Ausnahmen (gehören NICHT in diese Skala)

- **`em`-Werte** (`1em`, `0.9em`, `0.98em`, …): skalieren relativ zur *umgebenden* Schriftgröße
  (z. B. ein Icon oder Badge, das mit seinem Elterntext mitwachsen soll). Das ist ein anderer
  Mechanismus als eine feste Stufe — nicht anfassen, nicht auf `--fs-*` migrieren.
- **`font-size: 16px` (roher px-Wert)** auf `<input>`/`<textarea>` (u. a. `chat-input`,
  Mobile-Suchfelder): iOS Safari zoomt beim Fokussieren automatisch in ein Eingabefeld hinein,
  wenn dessen Schrift unter *echten* 16px liegt. Dieser Wert muss ein garantierter Pixel-Wert
  bleiben, kein `rem` (das mit einer künftigen Root-Font-Size-Einstellung mitskalieren könnte)
  und keine kleinere Stufe.
- **`clamp(...)`-Werte**: fließende, auf die jeweilige Komponente abgestimmte responsive
  Titelgrößen (z. B. Seiten-/Card-Titel, die zwischen Mobile und Desktop stufenlos wachsen). Über
  90 solcher, individuell austarierter `clamp()`-Regeln existieren im Projekt — sie sind
  Absicht, keine Unordnung, und wurden bei dieser Aufräumaktion **nicht** angefasst. Beim NEUEN
  Schreiben eines `clamp()`: wo sinnvoll, die beiden Endpunkte auf `--fs-*`-Werte legen (z. B.
  `clamp(var(--fs-xl), 1vw + 1rem, var(--fs-2xl))`), aber niemals bestehende, funktionierende
  `clamp()`-Formeln umbauen, nur um Tokens einzusetzen.
- **Einzelfälle mit Zählung 1**, die weit von jeder Stufe liegen (z. B. `0.4rem`, `2.45rem`) —
  bewusst nicht migriert, um keine sichtbare Größenänderung an einer Stelle zu riskieren, die nur
  einmal vorkommt und deren genauer Zweck nicht rekonstruierbar war. Wer eine solche Stelle
  ohnehin bearbeitet: auf die nächstliegende Stufe umstellen.

---

## 2. Radius-Skala (`--radius-*`)

Ebenfalls in `src/styles/theme.css`.

| Token | Wert | Einsatz |
|---|---|---|
| `--radius-2xs` | `6px` | Chips, kleine Icon-Flächen |
| `--radius-xs` | `8px` | Buttons (`.ui-button`), kleine Badges |
| `--radius-sm` | `10px` | kompakte Karten/Zeilen, untere Ecke von Eingabefeldern |
| `--radius-md` | `12px` | Standard-Karten, Panels, Popovers |
| `--radius-lg` | `14px` | größere Karten |
| `--radius-xl` | `16px` | Modals, Dialoge, Bottom-Sheets |
| `--radius-2xl` | `18px` | große Flächen |
| `--radius-3xl` | `20px` | sehr große Flächen/Bilder |
| `--radius-full` | `999px` | Pills, Kapsel-Buttons, Fortschrittsbalken |
| `--radius-circle` | `50%` | runde Avatare/Icon-Kreise |

Zusammengesetzte Radien (z. B. oben rund, unten fast eckig) werden aus denselben Tokens gebaut,
nicht neu erfunden:

```css
/* Eingabefelder: oben stärker gerundet als unten (Fokus-Unterlinie) */
border-radius: var(--radius-md) var(--radius-md) var(--radius-sm) var(--radius-sm);

/* Tab/Chip mit rechts abgerundeter Kante */
border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
```

### Bewusste Ausnahmen

- **`0`** bleibt literal (kein `--radius-none`-Token nötig, `0` ist selbsterklärend).
- **`inherit`** bleibt literal (übernimmt bewusst den Radius des Elternelements, z. B. bei
  Pseudo-Elementen wie `::before`/`::after`, die exakt die Form ihres Trägers teilen sollen).
- **`clamp(...)`-Radien** (z. B. `clamp(14px, 0.6vw + 12px, 20px)`): responsiv abgestimmt,
  nicht angefasst.
- **Eigene, komponentenlokale Radius-Variablen** (`--squircle-radius`, `--chat-chip-radius`,
  `--chat-input-radius`, `--learn-tab-slide-radius`, `--straton-bottom-sheet-radius`, …): das
  sind bereits benannte Tokens, nur lokal statt global — vollkommen in Ordnung, wenn eine
  Komponente ihre eigene, mehrfach wiederverwendete Sonderform braucht (z. B. die Squircle-Ecken
  in `squircle.css`, die per JS berechnet werden). Nicht zusammenlegen mit den globalen
  `--radius-*`-Tokens, wenn die Werte aus einem anderen Berechnungsweg kommen.
- **Sehr seltene, weit abweichende Einzelfälle** (`44px`, `25px`, `13px`, `1.75rem`, `0.7rem`,
  `0.6rem`, `0.32rem`, `2px`, `1px`): meist an eine konkrete, feste Element-Größe gekoppelt (z. B.
  ein Kreis-Radius, der exakt die halbe Kantenlänge eines bestimmten Icons ist). Nicht blind
  auf die Skala zwingen — beim Anfassen einer solchen Stelle prüfen, ob sie wirklich ein
  Sonderfall ist oder inzwischen doch auf eine Stufe passt.

---

## 3. Wie diese Migration entstanden ist

Am 26. August 2026 wurden **alle** Deklarationen migriert, die entweder exakt einem Token-Wert
entsprachen oder ihm nahe genug waren (≤ ~2px Abweichung) **und** mindestens zweimal im Code
vorkamen — das deckt die überwiegende Mehrheit ab (606 `font-size`- und 435 `border-radius`-
Stellen). Alles, was darunter fiel (echte Einzelfälle, `em`, feste `px`, `clamp()`, lokale
Komponenten-Variablen), wurde **bewusst nicht angefasst**, um keine unbeabsichtigte optische
Änderung an seltenen, schwer nachvollziehbaren Stellen zu riskieren.

Diese Datei beschreibt also nicht nur die Ziel-Skala, sondern auch den bewussten Rest-Bestand an
Ausnahmen — beide sind gültig, nicht nur die Tokens. Wer eine der oben gelisteten Ausnahmen sieht,
soll sie nicht "korrigieren", ohne den Grund dafür nachzulesen.

## 4. Wenn eine Stufe fehlt

Skala erweitern, nicht umgehen:

1. Prüfen, ob wirklich keine bestehende Stufe (auch nicht mit 1–2px Toleranz) passt.
2. Neue Stufe in `src/styles/theme.css` im selben Block ergänzen, alphabetisch/numerisch einsortiert
   (`--fs-4xl` nach `--fs-3xl`, nicht dazwischen einfügen).
3. Diese Tabelle hier aktualisieren — sonst kennt der nächste Blick in den Code die neue Stufe
   nicht und der Grund für ihre Existenz geht verloren.

## 5. Verwandte, bisher nicht konsolidierte Bereiche

Diese Aufräumaktion deckt nur Schriftgrößen und Radien ab. Beim Design-Review vom 26. August 2026
wurden zusätzlich diese Baustellen identifiziert, aber noch nicht behoben:

- **Schatten (`box-shadow`)**: fast durchgehend handgeschriebene `rgba(...)`-Einzelwerte statt der
  vorhandenen Tokens `--color-shadow-soft`/`--color-shadow-strong` (in `theme.css`). Bei
  Gelegenheit auf 2–3 Elevation-Stufen (`--shadow-sm/md/lg`) konsolidieren.
- **Fokus-Ring**: `.ui-button`, `.ui-button-primary/-secondary` und das globale `button` in
  `base.css` haben keine eigene `:focus-visible`-Regel; andere Stellen (v. a. `chat.css`) definieren
  pro Komponente eigene Fokus-Ringe mit uneinheitlichen, teils fest codierten Farben. Ein
  globaler `--focus-ring`-Token (an `--color-accent` gekoppelt) auf `button:focus-visible`,
  `a:focus-visible`, `.ui-button:focus-visible` steht noch aus.
- **`--primary-button-gradient` vs. `--accent-gradient`**: zwei konkurrierende Gradient-Tokens
  (`base.css`). Nur `--accent-gradient` folgt der vom Nutzer gewählten Akzentfarbe; der
  Fortschrittsbalken in `learn.css` (`.learn-chapter-preview-progress span`) nutzt weiterhin fest
  das alte Navy-Blau, unabhängig von der gewählten Akzentfarbe.
- **Button-Hierarchie**: nur Primary/Secondary vorhanden. Für Aktionen geringerer Priorität fehlt
  eine Ghost/Tertiary-Variante; destruktive Aktionen (Löschen-Buttons) werden aktuell pro Stelle
  einzeln mit `--color-danger-text`-Rahmen nachgebaut statt einer gemeinsamen `.ui-button-danger`.
