-- Nutzer-Einführung (Freitext oder Fragebogen) — bearbeitbar in Einstellungen, Kontext für Hauptchat-KI.

alter table public.profiles
  add column if not exists introduction_completed boolean not null default false,
  add column if not exists introduction_mode text,
  add column if not exists introduction_text text,
  add column if not exists introduction_answers jsonb not null default '{}'::jsonb,
  add column if not exists introduction_updated_at timestamptz;

alter table public.profiles drop constraint if exists profiles_introduction_mode_check;
alter table public.profiles
  add constraint profiles_introduction_mode_check
  check (introduction_mode is null or introduction_mode in ('text', 'questionnaire'));

comment on column public.profiles.introduction_completed is
  'true = Einführungs-Modal abgeschlossen (Speichern); false = Modal erneut anzeigen.';
comment on column public.profiles.introduction_mode is
  'Zuletzt genutzter Modus in Einstellungen/Modal: text | questionnaire.';
comment on column public.profiles.introduction_text is
  'Freitext-Einführung (Hobbys, Beruf, Alter …); Name kommt aus first_name/last_name.';
comment on column public.profiles.introduction_answers is
  'Fragebogen-Antworten als JSON (age, role, hobbies, goals, other).';
comment on column public.profiles.introduction_updated_at is
  'Zeitpunkt der letzten Speicherung der Einführung.';
