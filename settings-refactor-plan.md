# Einstellungen — IST-Analyse &amp; Refactoring-Plan

> **Status: Umgesetzt.** Schritte 1–6 (siehe Abschnitt 3) sind vollständig implementiert und verifiziert
> (`tsc -b`, gezielte + breite `eslint`-Läufe, vollständiger `vite build`, `vitest run` — 147/147 grün).
> Schritt 7 (admin-* aus `settings.css` auslagern) blieb wie entschieden bewusst draussen. Details und
> was zusätzlich zum Ursprungsplan gefunden/gefixt wurde: siehe Nachtrag am Dateiende.
>
> Ursprünglicher Zweck dieses Dokuments (reine Analyse, keine Codeänderung): konkret zeigen, wo im
> Einstellungen-Bereich (`src/features/settings/`, `src/pages/SettingsPage.tsx`, `src/styles/settings.css`)
> Dinge mehrfach mit leicht unterschiedlichem Namen gebaut wurden statt eine gemeinsame Regel zu nutzen,
> wo es toten Code gibt, und wie Datei-/Ordnerstruktur aufgeräumt werden sollte. Alle Befunde unten sind
> mit `grep` gegen den tatsächlichen Code verifiziert, keine Vermutungen ins Blaue.

---

## 0. Kurzfassung

Der Einstellungen-Bereich funktioniert, ist aber an drei Stellen organisch gewachsen statt bewusst
strukturiert:

1. **CSS-Duplikate statt gemeinsamer Bausteine** — mindestens 4 Konzepte (Dialog-Karte, Einstellungs-Zeile,
   Nutzungs-Karte mit Balken, Sektionstitel+Trennlinie) existieren je 2–4× unter verschiedenen Namen mit
   fast identischem CSS, weil niemand einen gemeinsamen Baustein extrahiert hat.
2. **Toter Code** — 15 CSS-Klassen (≈25 Regel-Blöcke inkl. Dark-/Pink-Glass-Varianten) in `settings.css`
   werden von keiner einzigen `.tsx`-Datei mehr referenziert. Vermutlich Reste von mind. 2 früheren
   Redesigns (Chat-Aufräumen-Button, Theme-Auswahl, Abo-Formular).
3. **`SettingsPage.tsx` ist eine "God Component"** — 1265 Zeilen, 20 `useState`, 19 `useEffect`, ~17
   Handler-Funktionen für komplett unterschiedliche Themen (Konto, Design, Sprache, Chat-Aufräumen,
   Einführungstext) — obwohl es für jedes Thema längst eine eigene Präsentations-Komponente gibt. Anders
   als bei `chat`, `learn`, `friends`, `news` fehlt bei `settings` ein `hooks/`-Ordner völlig.

Nebenbefund: `settings.css` (4624 Zeilen) enthält **~134 Selektoren mit Präfix `admin-*`**, die zu
`AdminPage.tsx` gehören, nicht zu den Einstellungen — quer über die Datei verteilt, nicht am Ende
angehängt. Das ist kein Kernthema der Einstellungen, aber es erklärt, warum die Datei so groß wirkt, und
ist eine der Quellen der Row-Duplikate unten (Punkt 1.2b).

---

## 1. IST-Zustand

### 1.1 Datei- und Ordnerstruktur

```
src/features/settings/
├── components/
│   ├── AccountSettingsSection.tsx        209 Zeilen
│   ├── AccountSubscriptionUsageGrid.tsx   67 Zeilen  ← Duplikat-Kandidat, siehe 1.2c
│   ├── ArchivedChatsSettingsSection.tsx  152 Zeilen
│   ├── BillingSettingsSection.tsx        185 Zeilen  ← Duplikat-Kandidat, siehe 1.2c
│   ├── FeedbackSettingsSection.tsx       279 Zeilen
│   ├── GeneralSettingsSection.tsx        246 Zeilen
│   ├── IntroductionEditor.tsx            181 Zeilen
│   ├── IntroductionSectionHeader.tsx      19 Zeilen
│   ├── IntroductionSettingsSection.tsx    80 Zeilen
│   ├── PersonalizeSettingsSection.tsx    284 Zeilen
│   ├── SecuritySettingsSection.tsx       326 Zeilen
│   └── StratonSettingsSection.tsx         48 Zeilen
├── constants/accentPalettes.ts
├── uiSettings.ts                          (liegt direkt im Feature-Root, nicht in constants/ oder utils/)
└── utils/accountSubscriptionDisplay.ts   307 Zeilen

src/pages/SettingsPage.tsx                1265 Zeilen  ← God Component, siehe 1.4
src/styles/settings.css                   4624 Zeilen  ← siehe 1.2 / 1.3
src/styles/chat-settings-workspace.css      17 Zeilen  (sauber, kein Problem)
```

**Vergleich mit Schwester-Features** (gleiche Ebene `src/features/*`):

| Feature | `hooks/` | `services/` | eigener State-Layer getrennt vom Seiten-Component? |
|---|---|---|---|
| `chat` | ✅ | ✅ | ✅ (`useChat`, `useChatComposer`, `useChatPageModals`, …) |
| `learn` | ✅ | ✅ | ✅ (`useLearningPathsSidebar`, …) |
| `friends` | ✅ | ✅ | ✅ (`useFriends`) |
| `news` | ✅ | ✅ | ✅ (`useNewsUnreadCount`) |
| `settings` | ❌ | ❌ | ❌ — alles in `SettingsPage.tsx` |

`settings/` ist das einzige größere Feature ohne `hooks/`. `uiSettings.ts` liegt zudem direkt im
Feature-Root statt in `utils/` oder `constants/` — inkonsistent zur eigenen `constants/`/`utils/`-Struktur
desselben Features.

### 1.2 CSS-Duplikate (mit Beleg)

#### a) Dialog-/Karten-Box viermal fast identisch neu geschrieben

Vier Selektoren in `settings.css` wiederholen exakt dieselben vier Deklarationen
(`border: 1px solid var(--color-border)`, `background: var(--settings-modal-bg)`,
`box-shadow: 0 …px var(--color-shadow-strong)`, `color: var(--color-text-app)`) und unterscheiden sich
nur in `width`/`padding`/`border-radius`/`text-align`:

| Selektor | Radius | Verwendung |
|---|---|---|
| `.settings-modal` | 22px | Haupt-Modal-Rahmen |
| `.rename-modal` | 20px | Passwort-Formular, Umbenennen-Dialoge, Bestätigungen |
| `.billing-manage-dialog` | 18px | „Abo verwalten“-Platzhalter |
| `.security-password-done-dialog` | 18px | Erfolgsmeldung nach Passwortwechsel |

`.billing-manage-dialog` und `.security-password-done-dialog` sind bis auf 20px Breitenunterschied
(320px vs. 340px) **byte-identisch**.

#### b) „Einstellungszeile" zweimal unter verschiedenem Namen gebaut

`.general-setting-bar-row` (genutzt in `GeneralSettingsSection.tsx`, `SecuritySettingsSection.tsx`) und
`.chat-setting-row` (genutzt ausschließlich in `AdminPage.tsx`, 8×) sind dieselbe Idee
(`display:flex; align-items:center; justify-content:space-between`) mit nur Gap/Padding-Unterschied —
zwei Namen für dasselbe Layout-Primitiv, weil `AdminPage.tsx` nicht auf die in `settings.css` bereits
vorhandene Klasse zurückgegriffen hat.

**Dabei gefunden, nebenbei ein echter (kleiner) Bug:** `AdminPage.tsx` nutzt an 3 Stellen den Modifier
`className="chat-setting-row chat-setting-row--stacked"` — diese Modifier-Klasse ist **nirgendwo in
irgendeiner `.css`-Datei definiert**. Sie tut aktuell nichts. Bei `.general-setting-bar-row` existiert das
Pendant (`.general-setting-bar-label--stacked`) korrekt. Löst sich automatisch, wenn beide Zeilen-Klassen
zusammengeführt werden.

#### c) „Nutzungs-Karte mit Balken" zweimal komplett separat gebaut

Beide lesen dieselben Daten aus `buildAccountSubscriptionDisplay()` (`accountSubscriptionDisplay.ts`),
rendern aber mit komplett unabhängigem Markup/CSS:

- `AccountSubscriptionUsageGrid.tsx` + `.account-subscription-usage-*` (Karte, Meter, Detail-Zeilen) —
  wird nur von `ChatSubscriptionUsagePreview.tsx` (Composer-Hinweis) verwendet.
- `BillingSettingsSection.tsx`s interne `BillingUsageSection()`-Funktion + `.billing-credits-*` — wird nur
  im Einstellungen-Tab „Abonnement" verwendet.

Gleiches Datenmodell, gleicher visueller Zweck (Titel, Kopfzeile, Fortschrittsbalken), zwei Komponenten,
zwei CSS-Familien, ein Team hätte nur eine gebraucht (ggf. mit einer `compact`/`full`-Variante).

#### d) Positiv-Befund — Buttons sind schon relativ konsistent

`PrimaryButton`/`SecondaryButton` werden in den meisten Settings-Komponenten korrekt wiederverwendet;
die „schlichte Text-Trigger"-Variante (`general-language-trigger general-language-trigger--plain`, z. B.
„Verwalten", „Passwort ändern", „Löschen") ist bereits **eine** gemeinsame Klasse an mehreren Stellen —
das ist das Muster, das wir auf die anderen Duplikate (a–c) übertragen sollten, kein Neuerfinden nötig.

### 1.3 Toter Code (verifiziert: 0 Treffer in irgendeiner `.ts`/`.tsx`-Datei)

Geprüft per Skript: jede CSS-Klasse aus `settings.css` gegen alle `.ts`/`.tsx`-Dateien im Projekt
gegengrepped. Eine anfängliche Kandidatin (`admin-feedback-chat-viewer-message--user`) habe ich wieder
verworfen, weil sie dynamisch per Template-String (`` `...--${message.role}` ``) erzeugt wird — also doch
in Gebrauch, nur nicht als Literal auffindbar. Die folgenden 15 sind es dagegen wirklich nicht mehr:

| Klasse | Zeile in `settings.css` | Vermutlicher Ursprung |
|---|---|---|
| `.chat-cleanup-button` | 1881 | Alter „Leere Chats löschen"-Button, heute nutzt `GeneralSettingsSection.tsx` dafür `.general-language-trigger` |
| `.chat-cleanup-icon` | 1896 | s. o. |
| `.chat-cleanup-loading` | 1900 | s. o. |
| `.chat-cleanup-spinner` | 1906 | s. o. |
| `.chat-cleanup-info` | 1921 | s. o. |
| `.chat-setting-divider` | 1862 | Trennlinie desselben alten Aufräumen-Blocks |
| `.chat-setting-divider-after-cleanup` | 1927 | s. o. |
| `.chat-settings-panel` | 1857 | umgebender Container desselben alten Blocks |
| `.personalize-theme-toggle` | 1255 | Design-Auswahl ist heute Kachel-basiert (`.personalize-theme-preview`), kein Toggle mehr |
| `.subscription-plan-tier-intro` | 107 | vermutlich Rest eines früheren Abo-Formular-Layouts |
| `.account-subscription-button` | 2668 | Rest, `.account-subscription-overlay`/`-modal` sind die aktiven Nachbarn |
| `.admin-ai-actions` | 3732 | Nachbarn `.admin-ai-form`/`.admin-ai-info` sind aktiv, `-actions` nicht |
| `.admin-file-input-hidden` | 3422 | — |
| `.admin-subscriptions-checkbox-label` | 3689 | — |
| `.feedback-settings-success-id` | 3294 | vermutlich Tippfehler-Rest neben dem aktiven `.feedback-settings-success` |

Das sind nur die **eindeutig identifizierbaren** Fälle (Basis-Selektor ohne Treffer). Es lohnt sich, das
nach jedem größeren Umbau routinemäßig zu wiederholen (siehe Vorschlag in Abschnitt 3).

### 1.4 „God Component" `SettingsPage.tsx`

1265 Zeilen, **20** `useState`, **19** `useEffect`, **~17** Handler-Funktionen — für inhaltlich getrennte
Themen, die alle bereits eigene Presentational-Komponenten haben:

- Konto (Name/E-Mail/Avatar) → State lebt hier, Anzeige in `AccountSettingsSection.tsx`
- Design (Theme, Sidebar-Skalierung, Chat-Hintergrund, Akzentfarbe) → State hier, Anzeige in `PersonalizeSettingsSection.tsx`
- Allgemein (Sprache, Auto-Löschen Chats/Lernpfade, Aufräumen) → State hier, Anzeige in `GeneralSettingsSection.tsx`
- Einführungstext speichern → State hier, Editor in `IntroductionEditor.tsx`
- Mobile-Navigation zwischen Menü/Detail, Menü-Suche, Logout

Jede dieser Gruppen bräuchte eigentlich ihren eigenen Hook (z. B. `useAccountSettings()`,
`usePersonalizeSettings()`), analog zu `useChat`/`useLearningPathsSidebar` in den Schwester-Features.
Aktuell ist `SettingsPage.tsx` dadurch die am schwersten zu überblickende Datei im Feature, obwohl die
UI selbst schon sauber in Komponenten aufgeteilt ist — nur die Logik nicht.

---

## 2. SOLL-Zustand

### 2.1 CSS — gemeinsame Bausteine statt vier/zwei Kopien

| Duplikat aus 1.2 | Vorschlag |
|---|---|
| a) Dialog-Karten (4×) | Eine Basis-Klasse `.ui-dialog-card` (in `ui.css`, projektweit gültig, nicht settings-spezifisch) mit den 4 gemeinsamen Deklarationen; `.settings-modal`, `.rename-modal`, `.billing-manage-dialog`, `.security-password-done-dialog` erben sie und setzen nur noch `width`/`padding`/`border-radius`/`text-align` als Modifier. `.billing-manage-dialog` und `.security-password-done-dialog` können ggf. sogar zu einer Klasse mit Breiten-Modifier verschmelzen. |
| b) Zeilen-Layout (2×) | `.chat-setting-row` in `AdminPage.tsx` durch `.general-setting-bar-row` ersetzen (umbenennen in etwas Neutrales wie `.setting-row`, da es dann auch außerhalb von „General" genutzt wird); dabei den fehlenden `--stacked`-Fix automatisch miterledigen. |
| c) Nutzungs-Karte (2×) | Eine Komponente (z. B. `SubscriptionUsageCard.tsx`) mit einer `variant="preview" \| "full"`-Prop, eine CSS-Familie. `AccountSubscriptionUsageGrid.tsx` und `BillingSettingsSection.tsx`s `BillingUsageSection` darauf ummünzen. |
| Neu (2.3 unten) | `SecuritySettingsSection.tsx`s frisch gebaute Anforderungs-Checkliste (roter/grüner Kreis, dezent→normal) als generisches `RequirementChecklist`-Bauteil in `components/ui/` vorziehen, bevor sie ein zweites Mal von Hand nachgebaut wird (z. B. für `FirstLoginPasswordModal.tsx`, die aktuell noch ohne Checkliste auskommt). |

### 2.2 Datei-/Ordnerstruktur

```
src/features/settings/
├── components/        (unverändert, ggf. + SubscriptionUsageCard.tsx)
├── hooks/              ← NEU
│   ├── useAccountSettings.ts
│   ├── usePersonalizeSettings.ts
│   ├── useGeneralSettingsPrefs.ts
│   └── useIntroductionSettings.ts
├── constants/
│   ├── accentPalettes.ts
│   └── uiSettings.ts   ← verschoben aus dem Feature-Root
└── utils/accountSubscriptionDisplay.ts
```

`SettingsPage.tsx` wird dadurch vom State-Owner zum reinen Layout-/Routing-Component (Tabs, Modal-Rahmen,
mobile Stack-Logik) — die fachliche Logik zieht in die Hooks, konsistent mit `chat`/`learn`/`friends`/`news`.

### 2.3 `settings.css` — Umfang klären (admin-* Nebenbefund)

Zwei Optionen, keine davon zwingend Teil dieses Tickets:

- **Minimal:** `admin-*`-Selektoren bleiben vorerst in `settings.css`, werden aber ans Dateiende
  zusammengezogen (statt verstreut) und mit einem Kommentarblock „gehört zu AdminPage, nicht zu
  Settings" markiert — reduziert Verwirrung ohne Datei-Split.
- **Sauber, aber größer:** `admin-*`-Selektoren in eine eigene `admin.css` auslagern (analog zu
  `chat-folders.css`, `chat-friends-overview.css` — ein File pro Feature/Seite, das ist das
  Projekt-Muster). Größerer, eigenständiger Task, siehe offene Frage in Abschnitt 4.

---

## 3. Umsetzungsplan (Reihenfolge nach Risiko, nicht nach Zeitaufwand)

| # | Schritt | Risiko | Warum in dieser Reihenfolge |
|---|---|---|---|
| 1 | Toten Code entfernen (1.3, 15 Klassen) | sehr niedrig — reine Löschung, mit demselben grep-Verfahren nach dem Löschen erneut verifizierbar | Kein Verhaltensrisiko, schafft sofort Übersicht für die folgenden Schritte |
| 2 | Zeilen-Primitiv zusammenführen (`.chat-setting-row` → `.general-setting-bar-row`/neuer Name) inkl. `--stacked`-Fix | niedrig — betrifft nur `AdminPage.tsx`-Klassennamen, kein neues Markup | Behebt nebenbei den echten (kleinen) Rendering-Bug |
| 3 | Dialog-Karten-Basisklasse einführen | niedrig-mittel — 4 Stellen, rein visuell, gut mit Screenshots vor/nach zu verifizieren | Baut den Präzedenzfall „gemeinsame Basisklasse in `ui.css`" für spätere Wiederverwendung |
| 4 | Nutzungs-Karte vereinheitlichen (`AccountSubscriptionUsageGrid` + `BillingUsageSection` → eine Komponente) | mittel — zwei Aufrufstellen, unterschiedliche Kontexte (Composer-Hinweis vs. voller Tab), braucht sorgfältiges Prop-Design | Größter CSS-Gewinn, aber am ehesten mit sichtbaren Layout-Unterschieden — eigener Review-Schritt sinnvoll |
| 5 | `RequirementChecklist` als generisches Bauteil auslagern | niedrig — reine Extraktion aus bereits funktionierendem Code | Verhindert, dass Schritt 4 oder künftige Passwort-Flows es ein drittes Mal nachbauen |
| 6 | Hooks aus `SettingsPage.tsx` extrahieren (2.2) | mittel-hoch — größter Diff, viele Props/Closures, höheres Regressionsrisiko | Bewusst zuletzt, am besten Hook für Hook (z. B. erst `useIntroductionSettings`, kleinster Umfang, dann die größeren) mit `tsc`/Lint-Check nach jedem einzelnen |
| 7 (optional) | `admin-*` aus `settings.css` auslagern (2.3) | mittel — reine Umbenennung/Verschiebung, aber große Diff-Fläche in `AdminPage.tsx` | Kein direkter Nutzen für „Einstellungen" selbst, deshalb optional/separates Ticket |

Nach jedem Schritt: `npx tsc -b` + gezielter `eslint`-Lauf auf den geänderten Dateien (wie bisher in
diesem Projekt üblich), plus der grep-Dead-Code-Check aus 1.3 erneut laufen lassen, um zu bestätigen, dass
nichts Neues übrig bleibt.

---

## 4. Offene Fragen an dich

1. **Soll Schritt 7 (admin-* aus `settings.css` raus) überhaupt Teil dieser Aufräum-Runde sein**, oder
   bewusst zurückstellen, weil es strenggenommen `AdminPage.tsx` betrifft, nicht die Einstellungen?
2. **Namensvorschlag für das vereinheitlichte Zeilen-Primitiv** (Punkt 2.1b): `.general-setting-bar-row`
   beibehalten (kleinerer Diff, aber der Name passt dann nicht mehr zu „auch von Admin genutzt") oder auf
   einen neutraleren Namen wie `.setting-row` umbenennen (sauberer, aber Diff an allen bisherigen
   Nutzungsstellen)?
3. **Reihenfolge okay so**, oder soll ich mit dem risikoärmsten Teil (toter Code, Schritt 1) direkt
   anfangen, sobald du grünes Licht gibst, statt auf eine Freigabe für den ganzen Plan zu warten?

Sag Bescheid, dann setze ich das entsprechend um — auf Wunsch auch Schritt für Schritt mit Zwischenstopps
statt in einem Rutsch.

---

## 5. Nachtrag — Umsetzung (alle Schritte 1–6, ein Durchgang)

Entscheidungen aus Abschnitt 4: Schritt 7 draussen gelassen; Zeilen-Primitiv heisst `.setting-row`
(neutral); alle 6 Schritte in einem Durchgang.

**Ergebnis:** `SettingsPage.tsx` **1265 → 574 Zeilen** (−55 %). `settings.css` **4624 → 4385 Zeilen**
(−239, trotz neuer Kommentare); `ui.css` **429 → 510 Zeilen** (+81, dort liegen jetzt die neuen
geteilten Primitive `.ui-dialog-card`/`.requirement-checklist*`).

- **Schritt 1:** 15 tote CSS-Klassen (~25 Regel-Blöcke inkl. Dark-/Pink-Glass-Overrides) entfernt,
  inkl. eines toten `@keyframes`. Erneuter grep-Check danach: 0 Treffer.
- **Schritt 2:** `.general-setting-bar-row` + `.chat-setting-row` → `.setting-row` (samt Label-Familie
  umbenannt: `-divider`, `-label`, `-label--plain`, `-label--stacked`, `-label-title`, `-label-desc`,
  `-control`). `AdminPage.tsx` nutzt jetzt `.setting-row` statt eigener Kopie. Fehlenden
  `.setting-row--stacked`-Modifier definiert (vorher referenziert, aber nirgends definiert — echter,
  wenn auch kleiner, Bug).
- **Schritt 3:** `.ui-dialog-card` in `ui.css` (Rahmen/Hintergrund/Schatten/Textfarbe); `.settings-modal`,
  `.rename-modal`, `.billing-manage-dialog`, `.security-password-done-dialog` liefern nur noch die
  Modifier. Dabei eine winzige, optisch kaum wahrnehmbare Schatten-Abweichung bei `.rename-modal`
  vereinheitlicht (0 22px 54px → 0 24px 60px).
- **Schritt 4:** Neue `SubscriptionUsageMeterBar`-Komponente + `.usage-meter-bar`/`-fill` (theme-fest
  über `color-mix()`) ersetzen die beiden bisherigen Balken-Implementierungen in
  `AccountSubscriptionUsageGrid.tsx` und `BillingSettingsSection.tsx`; dabei einen separaten
  Dark-Theme-Override überflüssig gemacht (nicht mehr nötig). Layout drumherum (Icon/Titel vs.
  Detail-Liste) bewusst nicht vereinheitlicht — siehe Begründung unten.
- **Schritt 5:** `RequirementChecklist` nach `src/components/ui/` ausgelagert (`.requirement-checklist*`
  in `ui.css`), `SecuritySettingsSection.tsx` nutzt sie.
- **Schritt 6:** 4 neue Hooks unter `src/features/settings/hooks/` (`useAccountProfileSettings`,
  `useGeneralSettingsPrefs`, `useSettingsLanguage`, `useSettingsUiPreferences`) + reine Datenauslagerung
  `buildSettingsPageI18n()` (`utils/settingsPageI18n.ts`, ~300 Zeilen Übersetzungstabellen ohne
  State/Effekte) + `SettingsSectionId`/`SettingsSection`-Typen nach `constants/settingsSections.ts`.
  `uiSettings.ts` nach `constants/` verschoben (Feature-Root ist jetzt leer von losen Dateien).
  `SettingsPage.tsx` ist jetzt reine Layout-/Routing-Komponente.

### Zusätzlich gefunden und mitgefixt (nicht im Ursprungsplan)

- **11× duplizierte Sprach-Union** (`'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'`) quer über 7 Dateien.
  Neue `SettingsLanguage`-Type in `constants/settingsLanguage.ts`, in den 4 Settings-eigenen Stellen
  (`SettingsPage.tsx`, `GeneralSettingsSection.tsx`, `FeedbackSettingsSection.tsx`,
  `settingsPageI18n.ts`) eingesetzt. Die 3 Stellen in `auth/` (`AuthContext.ts`, `AuthProvider.tsx`,
  `auth.service.ts`) bewusst **nicht** angefasst — grösserer, auth-übergreifender Schnitt, eigenes Ticket.
- **`react-hooks/set-state-in-effect` / `react-hooks/refs`:** Beim Verschieben von zwei
  Hydration-Effekten (Sprache, UI-Settings) in echte Hook-Dateien schlug ein bisher inaktiver Lint-Regel
  zu (er greift primär in als Hook erkannten Dateien). Beide auf das im Projekt bereits etablierte Muster
  "State während des Renderns anpassen" umgestellt (Vorbild: `useLearnGamification.ts`) statt die Regel
  zu unterdrücken.
- **Unerreichbares "Abo-Modelle"-Modal:** `isPlansModalOpen`/`visibleSubscriptionPlans` in
  `SettingsPage.tsx` — `setIsPlansModalOpen(true)` wird nirgends aufgerufen, das Modal kann aktuell nicht
  geöffnet werden. Nutzt zudem noch `plan.max_tokens` (veraltete Terminologie von vor dem
  Credits-System). Bewusst **nicht** entfernt (eigene Entscheidung nötig, ob das Feature reaktiviert
  oder ganz gestrichen werden soll) — nur hierher verschoben in den Hook-Rahmen, unverändert im Verhalten.

### Bewusst nicht vereinheitlicht (Schritt 4, Detail)

`AccountSubscriptionUsageGrid.tsx` (Composer-Vorschau) und `BillingSettingsSection.tsx` (voller
Einstellungen-Tab) unterscheiden sich in der Praxis stärker als vermutet: eigenes Icon+Überschrift vs.
Karten-Header, Prozentzahl unter dem Balken vs. keine, Detail-Zeilen vs. keine. Nur den echten
gemeinsamen Kern (den Balken selbst) zusammengeführt statt beide Layouts zwangszuverschmelzen — das
hätte ohne visuelle Prüfung (kein Browser-Zugriff in dieser Umgebung) ein reales Regressionsrisiko auf
einer aborechnungsnahen Fläche bedeutet.

### Verifikation

Nach jedem der 6 Schritte: `npx tsc -b` sauber, gezielter `eslint`-Lauf sauber. Am Ende zusätzlich:
vollständiger `npx vite build` (nur vorbestehende, unabhängige Warnungen zu Fonts/Chunk-Grösse),
`npx vitest run` (147/147 Tests grün), erneuter Dead-Code-grep über alle CSS-Klassen in `settings.css`
(0 neue Treffer), sowie ein breiter `eslint`-Lauf über alle in dieser Session geänderten Dateien
projektweit — alle verbleibenden Funde dort geprüft und als vorbestehend/unabhängig bestätigt (u. a.
`AdminPage.tsx` Zeilen 1097/1102, `IntroductionEditor.tsx`, `ChatPage.tsx`).

Keine visuelle/Browser-Verifikation möglich (keine Browser-Automatisierung in dieser Umgebung verfügbar)
— alle CSS-Werte wurden stattdessen 1:1 verglichen (alt vs. neu) statt neu gestaltet, um das Risiko
unsichtbarer optischer Änderungen zu minimieren.
