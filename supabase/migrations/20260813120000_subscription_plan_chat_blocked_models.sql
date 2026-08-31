-- Modellwahl im Hauptchat: Statt einer Erlaubnis pro Abo stehen jetzt grundsätzlich alle Modelle
-- offen. Die Kosten regelt der KI-Credit-Verbrauch, der pro Modell unterschiedlich hoch ausfällt
-- (siehe public.ai_model_pricing). Ein Abo kann einzelne Modelle sperren; die bleiben im Composer
-- sichtbar, aber nicht anwählbar, und werden zusätzlich in der Edge Function abgewiesen.
--
-- Damit entfallen drei Spalten:
--   chat_allow_custom_mode  — der Custom-Modus ist als eigener Modus verschwunden; ein gewähltes
--                             Modell läuft jetzt über denselben Weg wie Smart Instant.
--   chat_allow_model_choice — die Wahl ist immer erlaubt.
--   default_chat_model_id   — ohne erzwungenes Modell gibt es keinen Standard zu setzen.
--
-- ACHTUNG: Die drei DROP-Anweisungen sind nicht umkehrbar; die bisherigen Einstellungen gehen
-- verloren. Bewusst so entschieden.

alter table public.subscription_plans
  add column if not exists chat_blocked_model_ids text[] not null default '{}'::text[];

comment on column public.subscription_plans.chat_blocked_model_ids is
  'Im Chat-Composer gesperrte Modell-IDs (CHAT_COMPOSER_MODELS). Leer = alle Modelle wählbar. '
  'Durchgesetzt im Client (ausgegraut) und in der Edge Function chat-completion (Fallback auf die '
  'automatische Modellkette).';

alter table public.subscription_plans
  drop column if exists chat_allow_custom_mode;

alter table public.subscription_plans
  drop column if exists chat_allow_model_choice;

alter table public.subscription_plans
  drop column if exists default_chat_model_id;
