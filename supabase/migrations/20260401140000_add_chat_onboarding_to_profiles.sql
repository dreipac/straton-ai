-- Tour „Neuer Chat / Lernpfade“: Status pro Nutzer (Profil)
alter table public.profiles
  add column if not exists chat_onboarding_completed boolean not null default false;

comment on column public.profiles.chat_onboarding_completed is
  'Nutzer hat die Chat-Einstiegs-Tour abgeschlossen (false = Tour anzeigen).';

-- Bestehende Konten: nicht erneut die Tour zeigen
update public.profiles
set chat_onboarding_completed = true
where chat_onboarding_completed = false;
