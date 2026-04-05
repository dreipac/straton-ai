-- Nachziehen für Remotes ohne Spalte ui_settings (idempotent).
-- Ergänzt public.profiles um JSON-Konfiguration für die Web-UI (Theme, Paletten, Emoji, …).

alter table public.profiles
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

comment on column public.profiles.ui_settings is
  'Client-UI-Einstellungen (JSON), z. B. theme, Paletten, assistantEmojis. Leeres Objekt = Defaults.';
