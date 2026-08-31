-- Oberflächen-Einstellungen (Theme, Paletten, Emoji, …) pro Nutzer; synchron mit der Web-App.
alter table public.profiles
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

comment on column public.profiles.ui_settings is
  'Client-UI-Einstellungen (JSON), z. B. theme, Paletten, assistantEmojis. Leeres Objekt = Defaults.';
