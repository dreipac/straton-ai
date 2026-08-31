# Credits-System — IST-Analyse &amp; SOLL-Plan

> Reine Planungs-Grundlage. Keine Codeänderung in diesem Schritt. Ziel: unter **Nutzung &amp; Abonnement**
> zeigt der Nutzer künftig ein verständliches **Credits-Guthaben** für KI-Nutzung statt roher „Tokens“.
>
> **Status:** Umgesetzt (Code). Migrationen liegen als Dateien vor, sind aber **nicht** gegen eine
> Datenbank ausgeführt/deployt — das erfordert eine bewusste, separate Freigabe (siehe unten).
>
> **Eine Verfeinerung gegenüber 2.3:** Statt "Vorab-Reservierung dann Delta-Korrektur" wurde ein
> einfacheres, robusteres Muster gebaut: ein reiner **Vorab-Veto-Check** (`check_ai_credits_available_for_content`,
> keine Buchung) vor dem KI-Aufruf, gefolgt von einer **einzigen autoritativen Belastung**
> (`charge_ai_credits_usage`) nach der echten Antwort — kein Delta-Rechnen, kein Trust-Problem mit
> clientseitig übermittelten Zwischenbeträgen. Gleiche Schutzwirkung, weniger Fehlerfläche.

---

## 0. Kurzfassung

Heute rechnet Straton den Chat-Verbrauch in **Tokens** ab, geschätzt rein aus der **Zeichenlänge** der
Nachricht (`ceil(Zeichen / 4)`) — unabhängig davon, welches Modell benutzt wurde und was die Anfrage
tatsächlich gekostet hat. Gleichzeitig gibt es für Bilder, Denken (Thinking) und Websuche bereits
waschechte **Guthabenkonten** (`*_credit_balance`), die intern schon „Credit“ heißen. Nur der
Chat-Verbrauch ist noch die Ausnahme — er heißt „Token“, ist technisch, und hat keinen Bezug zu realen
Kosten.

**Ziel:** Chat-/Denk-Verbrauch bekommt ebenfalls ein „Credits“-Gesicht, das (a) für Nutzer verständlicher
ist als „Tokens“ und (b) — wenn gewünscht — fair an den tatsächlichen Modellkosten hängt statt an
Zeichenlänge. Die drei bestehenden Guthaben-Karten (Bilder/Denken/Websuche) bleiben inhaltlich, wie sie
sind, bekommen aber ein einheitliches Vokabular.

---

## 1. IST-Zustand

### 1.1 Datenmodell (Supabase)

**`subscription_plans`** (Admin-definierte Abo-Vorlagen, ein Datensatz pro Plan):

| Spalte | Bedeutung |
|---|---|
| `max_tokens` | Tages-Token-Kontingent für Chat („Smart Instant“). `NULL` = unbegrenzt. |
| `instant_token_start_balance` / `instant_token_balance_max` | Start-Guthaben bzw. Sparobergrenze für den Token-Übertrag (Carryover). |
| `chat_context_max_tokens` | Obergrenze für den mitgesendeten Chat-Verlauf (Client-Clipping, keine Abrechnung). |
| `max_images` | Täglicher Bild-Zuschuss. |
| `image_start_balance` / `image_credit_max` | Start-/Sparobergrenze Bild-Guthaben. |
| `thinking_daily_grant` | Täglicher Zuschuss Denk-Anfragen. |
| `thinking_start_balance` / `thinking_credit_max` | Start-/Sparobergrenze Denk-Guthaben. |
| `web_search_daily_grant` | Täglicher Zuschuss Websuchen. |
| `web_search_start_balance` / `web_search_credit_max` | Start-/Sparobergrenze Websuche-Guthaben. |
| `max_files` | Tages-Datei-Limit. |
| `chat_allow_model_choice`, `default_chat_model_id`, `chat_daily_tier1_*`, `chat_allow_custom_mode`, `image_generation_model` | Modellsteuerung, nicht Teil der Guthabenlogik. |

**`subscription_usages`** (1:1 zu `profiles`, laufender Verbrauch pro Nutzer):

| Spalte | Bedeutung |
|---|---|
| `used_tokens` / `token_balance` | Heutiger Chat-Verbrauch / übertragenes Token-Guthaben. |
| `used_images` / `image_credit_balance` | Heutiger Bild-Verbrauch / Bild-Guthaben. |
| `used_thinking_requests` / `thinking_credit_balance` | Heutiger Denk-Verbrauch / Denk-Guthaben. |
| `used_web_searches` / `web_search_credit_balance` | Heutiger Websuche-Verbrauch / Websuche-Guthaben. |
| `used_files` | Heutiger Datei-Verbrauch. |
| `last_reset_date` | Datum des letzten Tages-Resets (UTC). |

**`ai_token_usage`** — separates Logging der **echten** API-Nutzung (Provider, Modell, `input_tokens`,
`output_tokens`, `estimated_cost_usd`), wird ausschließlich fürs Admin-Kosten-Reporting geschrieben und
**fließt nicht** in `subscription_usages` ein. Das ist die einzige Stelle im System, an der die *echten*,
modellabhängigen Kosten pro Anfrage bereits vorliegen.

**Ohne zugewiesenen Plan:** hartes Fallback-Limit von 100 Tokens/Tag, keine Bild-/Denk-/Websuche-Guthaben.

### 1.2 Ablauf Ende-zu-Ende (heute)

```
Admin legt Plan an (max_tokens, image_credit_max, thinking_credit_max, web_search_credit_max, …)
        │
        ▼
Admin weist Nutzer per Draft + Deploy zu → admin_set_user_subscription_plan()
        │  (setzt profiles.subscription_plan_id + initialisiert alle 4 Guthabenkonten
        │   auf die Start-Werte des Plans)
        ▼
Nutzer schreibt Chat-Nachricht
        │
        ▼
DB-Trigger auf chat_messages (Insert):
  1) subscription_guard_chat_messages_before_insert()
     prüft: used_tokens + estimate_tokens_from_text(content) ≤ token_balance + max_tokens
  2) subscription_increment_used_tokens_after_insert()
     erhöht used_tokens um denselben Schätzwert
        │  (passiert für User-Nachricht UND Assistant-Antwort separat — 2× pro Turn)
        ▼
Edge Function chat-completion ruft echtes KI-Modell auf,
protokolliert reale usage.input_tokens/output_tokens + estimated_cost_usd
NUR in ai_token_usage (Admin-Statistik, keine Rückwirkung auf Limits)
        │
        ▼
Settings → „Nutzung & Abonnement“ liest profile.subscription_plans + subscription_usages
und rendert 5 Karten (Smart Instant „Tokens“, Bilder, Denken, Websuche, Dateien)
```

Bilder, Denken und Websuche laufen **parallel, aber getrennt**: eigene Guthabenkonten, eigene
Edge-Function-Abzüge (`generate-chat-image`, `chat-completion` für Thinking, `tavily-search`), eigener
täglicher Reset — konzeptionell schon „Credits“, nur die Chat-/Token-Seite ist die Ausnahme.

### 1.3 Anzeige heute (`accountSubscriptionDisplay.ts`)

Fünf Karten werden aus Plan + Usage berechnet:

| Karte | Formel (verkürzt) | Basis |
|---|---|---|
| „Smart Instant“ (Tokens) | `remaining = (token_balance + max_tokens) − used_tokens` | Zeichen-Schätzung |
| Bilder | Pool-Meter aus `used_images` vs. `image_credit_balance` | echter Zähler |
| Denken | analog Bilder | echter Zähler |
| Websuche | analog Bilder | echter Zähler |
| Dateien | `remaining = max_files − used_files` | echter Zähler |

Der Begriff „Credit“ existiert intern **bereits** für Bilder/Denken/Websuche (`image_credit_balance` usw.)
— nur die UI zeigt sie nicht konsistent als „Credits“ an, und die Chat-Seite heißt weiterhin „Tokens“
bzw. „Smart Instant“.

### 1.4 Relevante Auffälligkeiten aus dem IST (Auswahl, vollständig s. Analyse-Anhang unten)

1. **Token-Abrechnung ist rein zeichenbasiert** (`ceil(Zeichen/4)`), nicht modell- oder kostenbasiert.
   Ein teures Modell mit langem Reasoning „kostet“ im Limit-System exakt gleich viel wie ein günstiges —
   nur die Zeichenlänge zählt. Das ist der Hauptgrund, warum „Tokens“ für Nutzer weder verständlich noch
   fair wirken.
2. **Doppelte Buchung pro Turn**: User-Nachricht und Assistant-Antwort lösen je einen eigenen
   Trigger-Durchlauf aus.
3. **Terminologie-Drift**: „Smart Instant“ (UI) = „Token-Balance“ (DB-Kommentare) = `MAX_TOKEN_BALANCE`
   (Frontend-Konstante) — drei Namen für dasselbe Feld.
4. **Echte Kosten liegen bereits vor**, werden aber nur für Admin-Statistik verwendet
   (`ai_token_usage.estimated_cost_usd`), nicht für die Nutzer-Anzeige oder das Limit.
5. Kein „warning“-Schwellenwert (z. B. 80 %-Gelb) trotz vorgesehenem `tone: 'warning'`-Wert im Typ.
6. Kein Self-Service-Kauf — „Abo-Modelle ansehen &amp; kaufen“-Button ist aktuell hart deaktiviert.

---

## 2. SOLL: Credits-System

### 2.1 Produktziel

Unter **Nutzung &amp; Abonnement** sieht der Nutzer statt „Tokens verbraucht“ eine verständliche,
faire Angabe wie:

> **KI-Credits: 26 von 5000 heute verbraucht** (Fortschrittsbalken, wie bei den anderen Karten schon üblich)

„Credits“ wird zum einheitlichen Wort für die KI-Verbrauchsarten — Nutzer denken nicht mehr in „Tokens“,
„Zeichen“ oder Modell-Interna, sondern in einer nachvollziehbaren, an echten Kosten orientierten Einheit.

### 2.2 Beschlüsse (mit dem Nutzer final abgestimmt)

| Frage | Entscheidung |
|---|---|
| **Umfang** | Beides zusammen umsetzen: die Anzeige **und** das technische Limit selbst werden auf Credits umgestellt (vormals „Phase 1 + 2“, siehe 2.3). |
| **Vereinheitlichung** | **Chat + Denken** verschmelzen zu einer gemeinsamen „KI-Credits“-Karte (beides ist reiner Sprachmodell-Verbrauch). **Bilder und Websuche bleiben eigene, separate Karten** — andere Kostenstruktur, bewusst getrennt gedeckelt — werden aber ebenfalls konsequent „Credits“ genannt statt „Guthaben“. |
| **Umrechnungskurs** | An **echte USD-Modellkosten** gekoppelt (`CREDITS_PRO_USD`, exakter Wert vor Umsetzung festzulegen), nicht an eine „schöne“ Pauschalzahl. |
| **Chat-Limit-Warnung** (`chatPageSubscriptionDisplay.ts`) | **Wird zwangsläufig mit umgestellt** — das ist keine separate Wahl mehr, sondern eine direkte Konsequenz aus der Umfang-Entscheidung: Wenn das echte Limit in Credits gerechnet wird, muss auch die Warnung, die genau dieses Limit meldet, in Credits sprechen. Alles andere wäre widersprüchlich (Warnung nennt „Tokens“, obwohl technisch ein Credit-Limit greift). |
| **KI-Systemprompt-Text** (`chatSubscriptionUsageContext.ts`) | Bleibt vorerst bei der bestehenden Token-Wortwahl. Rein kosmetisch, hängt an keiner Enforcement-Logik — kann jederzeit unabhängig nachgezogen werden. |

Damit ist **Option B** aus der ursprünglichen Abwägung (kostenbasierte Credits) gewählt, mit vollem statt
gestaffeltem Umfang. Die Ressourcen Bilder/Websuche werden **nicht** mit hineinfusioniert (Option C bleibt
weiterhin nur eine mögliche spätere Erweiterung, siehe 2.6).

### 2.3 Zielarchitektur

**Neuer Pool „KI-Credits“** ersetzt für Chat und Denken die heutigen getrennten Felder:

| Heute (2 getrennte Pools) | Neu (1 gemeinsamer Pool) |
|---|---|
| `subscription_plans.max_tokens`, `instant_token_start_balance`, `instant_token_balance_max` | `subscription_plans.ai_credits_daily_grant`, `ai_credits_start_balance`, `ai_credits_balance_max` |
| `subscription_plans.thinking_daily_grant`, `thinking_start_balance`, `thinking_credit_max` | *(entfällt, geht im selben Pool auf)* |
| `subscription_usages.used_tokens`, `token_balance` | `subscription_usages.used_ai_credits_today`, `ai_credits_balance` |
| `subscription_usages.used_thinking_requests`, `thinking_credit_balance` | *(entfällt, geht im selben Pool auf)* |

Bilder (`max_images`/`image_credit_balance`) und Websuche (`web_search_daily_grant`/
`web_search_credit_balance`) bleiben strukturell unverändert — nur die UI-Beschriftung wechselt auf
„Credits“.

**Enforcement wird zweistufig**, weil die echten Kosten erst nach der KI-Antwort bekannt sind:

```
1) Vorab-Reservierung (beim Senden, wie ein Kreditkarten-Autorisierungs-Halt):
   grobe Zeichen-Schätzung → in Credits umgerechnet → provisorisch reserviert.
   Verhindert, dass bei Guthaben 0 trotzdem eine (kostenpflichtige) Anfrage rausgeht.
        │
        ▼
2) KI-Antwort kommt zurück mit echten usage.input_tokens/output_tokens
        │
        ▼
3) Nachbuchung/Reconciliation:
   echte Kosten (usage × Modellpreis) → Credits nach CREDITS_PRO_USD
   → Reservierung wird auf den echten Betrag korrigiert (Differenz gutgeschrieben/nachbelastet)
        │
        ▼
4) User- und Assistant-Nachricht werden dabei als EINE Turn-Abrechnung zusammengeführt
   (behebt nebenbei die heutige Doppelbuchung pro Turn, siehe IST Punkt 1.4.2)
```

Thinking-Anfragen laufen durch denselben Mechanismus (ihr reales Reasoning-Modell hat ebenfalls einen
echten Preis) und landen im selben `ai_credits_balance`-Topf wie der Chat-Verbrauch.

**Täglicher Reset/Carryover** funktioniert analog zur heutigen `token_balance`-Logik, nur in Credits:
`neues ai_credits_balance = min(ai_credits_balance_max, max(0, altes_balance + ai_credits_daily_grant − used_ai_credits_today))`.

### 2.4 Beispiel-Ablauf nach der Umsetzung

1. Admin legt Plan „Pro“ an: `ai_credits_daily_grant = 5000`, `ai_credits_start_balance = 5000`,
   `ai_credits_balance_max = 15000` (Carryover-Deckel). Bild-/Websuche-/Datei-Limits unverändert separat.
2. Zuweisung an Nutzer → `ai_credits_balance` startet bei 5000.
3. Nutzer schickt eine Chat-Nachricht (Modell GPT-5.4) → provisorisch ~8 Credits reserviert.
4. Echte Antwort kommt zurück, reale Kosten $0,006 → bei `CREDITS_PRO_USD` = 1000 Credits/$ sind das
   6 Credits → Korrektur von 8 auf 6 (2 Credits zurückgebucht).
5. Im selben Chat eine Denk-Anfrage (teureres Reasoning-Modell) → reale Kosten $0,02 → 20 Credits,
   **aus demselben Pool** abgezogen.
6. Settings zeigt: **„KI-Credits: 26 von 5000 heute verbraucht“**, ein Fortschrittsbalken, Chat+Denken
   kombiniert.
7. Bilder-Karte separat: „3 von 60 Bild-Credits“. Websuche separat: „12 von 50 Websuche-Credits“ —
   unveränderte Mechanik, nur neue Beschriftung.
8. Chat-Limit-Warnung (falls Guthaben knapp wird) meldet „Nur noch 12 Credits übrig“ statt „Token-Limit
   fast erreicht“.
9. Tageswechsel (UTC): ungenutzte 4974 Credits wandern als Carryover ins Guthaben (gedeckelt bei 15000),
   plus neuer Tageszuschuss 5000.

### 2.5 Migration bestehender Pläne/Guthaben

- Jeder bestehende Plan braucht einen einmaligen Umrechnungs-Lauf von `max_tokens` +
  `thinking_daily_grant` (heutige, getrennte Schätz-/Guthaben-Werte) auf ein äquivalentes
  `ai_credits_daily_grant` (Kosten-Schätzung) — z. B. basierend auf dem tatsächlichen Modell-Mix des
  jeweiligen Plans der letzten 30 Tage aus `ai_token_usage`, ersatzweise auf einer konservativen
  Default-Schätzung, wenn keine Historie vorliegt.
- Bestehende Guthabenstände (`token_balance`, `thinking_credit_balance`) werden zum Umstellungszeitpunkt
  einmalig in Credits umgerechnet und in `ai_credits_balance` zusammengeführt, statt auf 0 zurückgesetzt
  zu werden (Nutzer verlieren kein angespartes Guthaben durch die Umstellung).
- Bild-/Websuche-Konten bleiben unangetastet.

### 2.6 Preistabelle — verifiziert, Ergebnis &amp; Empfehlung

**Befund:** Die Modell-zu-USD-Umrechnung existiert bereits, aber **dreifach dupliziert**, jeweils hart
codiert als „Listenpreise“ (Stand laut Kommentar 2026, manuell gepflegt, keine automatische
Synchronisierung):

| Ort | Datei | Umfang |
|---|---|---|
| Frontend (Admin-Kostendashboard) | `src/features/auth/utils/aiModelPricing.ts` | Alle Text-Modelle + GPT-Image-1/2 |
| Edge Function `chat-completion` | `estimateAiUsageUsd`/`openAiRatesForEstimate`/`anthropicRatesForEstimate`/`geminiRatesForEstimate` | Nur Text-Modelle (Kommentar im Code: „Edge Function dupliziert“ von der Frontend-Datei) |
| Edge Function `generate-chat-image` | `estimateGptImageUsageUsd` | Nur GPT-Image, gleiche Zahlen wie Frontend, aber eigenständig eingetragen |

Websuche (Tavily) hat **keine** Kostenerfassung — bestätigt, dass sie zu Recht außerhalb des
KI-Credits-Pools bleibt (2.2).

**Datengrundlage für Credits:** `ai_token_usage.estimated_cost_usd` wird pro Anfrage in der Edge Function
berechnet, gespeichert mit `created_at` (Tages-Filterung möglich), summierbar über die vorhandene RPC
`sum_user_ai_estimated_cost_usd(user_id)`. **Aber:** diese RPC ist aktuell nur an `service_role`
vergeben, und `ai_token_usage` hat RLS ohne Lese-Policy für normale Nutzer — für die Credits-Anzeige
braucht es zwingend eine neue, auf `auth.uid()` gescopte RPC (`security definer`), an `authenticated`
vergeben. Kleine Nebenerkenntnis: Cache-Treffer (`cached_input_tokens`) werden aktuell komplett
kostenlos (0 $) statt zum echten Cache-Rabattpreis gerechnet — eine leichte, für den Nutzer eher
günstige Vereinfachung, kein Blocker.

**Empfehlung für die Umsetzung:** Die drei Kopien zu einer einzigen **`ai_model_pricing`-DB-Tabelle**
konsolidieren (Modell, Provider, USD/Mio Input, USD/Mio Output), von beiden Edge Functions gelesen statt
hart codiert, und vom Admin-Dashboard ebenfalls von dort statt aus der Frontend-Datei. Vorteil: eine
Quelle der Wahrheit, Admin kann Preise bei Änderungen anpassen ohne Deploy — statt drei Stellen im Code.

**Vorgeschlagener Startwert:** `CREDITS_PRO_USD = 1000` (1 Credit = 0,001 $) — ergibt die runden
Beispielzahlen aus 2.4 (6 Credits für eine 0,006-$-Antwort etc.), jederzeit als reiner Faktor
nachjustierbar, keine Datenmigration nötig bei späterer Anpassung.

### 2.7 Nicht Teil dieses Plans (spätere, eigenständige Erweiterung)

Eine **vollständige** Verschmelzung aller vier Ressourcen (Chat, Denken, Bilder, Websuche) zu einem
einzigen Guthaben (Option C der ursprünglichen Abwägung) wurde bewusst **nicht** gewählt, weil der Admin
damit die getrennte Feinsteuerung pro Ressource verlieren würde (z. B. „max. 3 Bilder/Tag unabhängig vom
Chat-Verbrauch“ wäre nicht mehr möglich). Falls das später doch gewünscht ist: Umbau auf eine generische
`credit_ledger`-Tabelle (Nutzer-ID, Aktionstyp, Betrag, Zeitpunkt), aus der sich sowohl der Kontostand als
auch eine Verlaufsansicht („Credits-Historie“, wie ein Kontoauszug) ableiten ließe — eigenständiges,
größeres Projekt, hier nur als Ausblick vermerkt.

---

## 3. Vorgeschlagene Umsetzungsschritte

1. **Preistabelle konsolidieren:** neue Tabelle `ai_model_pricing` (Modell, Provider, USD/Mio Input,
   USD/Mio Output) anlegen, einmalig mit den heutigen drei Kopien befüllen; `chat-completion` und
   `generate-chat-image` lesen künftig daraus statt hart codierter Funktionen; Frontend-Datei
   `aiModelPricing.ts` liest ebenfalls von dort (2.6). `CREDITS_PRO_USD = 1000` als Startwert setzen.
2. **Nutzerscoped Lesezugriff schaffen:** neue RPC (`security definer`, gefiltert auf `auth.uid()`) für
   die aggregierte Tageskosten-Summe aus `ai_token_usage`, an `authenticated` vergeben — ersetzt/ergänzt
   das bisher nur `service_role`-berechtigte `sum_user_ai_estimated_cost_usd` (2.6).
3. DB-Migration: neue Spalten `ai_credits_daily_grant`/`ai_credits_start_balance`/`ai_credits_balance_max`
   auf `subscription_plans`, `used_ai_credits_today`/`ai_credits_balance` auf `subscription_usages`;
   Umrechnungs-Lauf für bestehende Pläne/Guthaben (2.5).
4. Neue Reservierungs-/Reconciliation-Logik: Vorab-Schätzung beim Senden, Nachbuchung nach der echten
   KI-Antwort anhand `usage.input_tokens`/`output_tokens` × Modellpreis aus `ai_model_pricing` (löst
   dabei die heutige Trigger-basierte Vorab-Prüfung ab bzw. baut sie zu einer zweistufigen Prüfung um).
   Thinking-Verbrauch wird in denselben Mechanismus integriert, `subscription_guard_chat_messages_before_insert` /
   `subscription_increment_used_tokens_after_insert` entsprechend ersetzt/erweitert.
5. Tages-Reset-Funktion (`subscription_usage_reset_if_new_day`) um den neuen `ai_credits`-Zweig
   erweitern, alte `used_tokens`/`token_balance`/`thinking_*`-Zweige entfernen.
6. `accountSubscriptionDisplay.ts`: `buildInstantCard` + `buildThinkingCard` durch eine gemeinsame
   `buildAiCreditsCard`-Funktion ersetzen; Terminologie in `BillingSettingsSection.tsx` /
   `AccountSubscriptionUsageGrid.tsx` sowie bei Bildern/Websuche auf „Credits“ vereinheitlichen.
7. `chatPageSubscriptionDisplay.ts` (Chat-interne Limit-Warnung) auf den neuen Credits-Wert umstellen —
   direkte Konsequenz aus 2.2, kein separater Schritt zum Aufschieben.
8. Admin-UI (`AdminPage.tsx`, `admin.service.ts`): Formularfelder „Tokens“/„Thinking“ durch „KI-Credits“-
   Felder ersetzen (mit Erklärtext zur Größenordnung, z. B. „≈ X Chat-Nachrichten mit Standardmodell“);
   optional Preistabellen-Pflege (`ai_model_pricing`) als neue Admin-Ansicht statt Code-Deploy.
9. Später, unabhängig: KI-Systemprompt-Text (`chatSubscriptionUsageContext.ts`) auf „Credits“-Wortwahl
   nachziehen (2.2, bewusst nicht Teil dieses ersten Durchgangs).

---

## 4. Risiken

- **Reservierung/Reconciliation ist ein echter Architektur-Umbau**: der heutige Trigger prüft synchron
  *vor* dem Insert; die Nachbuchung nach der echten KI-Antwort braucht einen neuen Schritt, der erst
  *nach* Rückkehr der Edge Function ausgeführt wird (aktuell existiert dafür keine Infrastruktur). Bis
  dahin muss die Vorab-Schätzung weiterhin konservativ genug sein, um Kostenexplosion zu verhindern.
- **Bestehende Fragilität der Reset-/Limit-Funktionen** (IST-Punkte 1.4.6/1.4.7): `user_increment_subscription_usage`
  und `subscription_usage_reset_if_new_day` wurden bereits mehrfach durch überlappende Migrationen
  nachträglich korrigiert (zuletzt `20260606120000`). Der Umbau auf `ai_credits_*` sollte mit
  entsprechenden Tests/Review abgesichert werden, nicht als weiterer inkrementeller Patch obendrauf.
- **Migration bestehender Guthabenstände** (2.5) muss sorgfältig geprüft werden, damit kein Nutzer durch
  die Umstellung Guthaben verliert oder unerwartet mehr/weniger als vorher zur Verfügung hat.
- **`ai_token_usage`-Lesezugriff bestätigt fehlend**: verifiziert (2.6) — RLS erlaubt normalen Nutzern
  aktuell keinen Lesezugriff, `sum_user_ai_estimated_cost_usd` ist nur an `service_role` vergeben. Muss
  vor der ersten Credits-Anzeige durch eine neue, eng gescopte RPC ergänzt werden (Schritt 2 in Abschnitt 3) —
  kein Blocker, aber notwendiger Schritt, nicht optional.
- **Drei-fache Preistabellen-Duplikation** (2.6): bis zur Konsolidierung in `ai_model_pricing` bestand
  bereits das Risiko, dass die drei Kopien (Frontend, `chat-completion`, `generate-chat-image`)
  auseinanderlaufen. Die Konsolidierung ist daher als erster Schritt eingeplant, nicht nachgelagert.

---

*Diese Datei ist der abgestimmte Zielzustand. Nächster Schritt: konkreter Implementierungs-Task auf
Basis von Abschnitt 3, beginnend mit Punkt 1 (Preistabelle verifizieren, `CREDITS_PRO_USD` festlegen).*
