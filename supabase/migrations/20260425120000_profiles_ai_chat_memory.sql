-- Persoenlicher KI-Speicher ueber alle Hauptchat-Unterhaltungen (ChatGPT-aehnlich).
alter table public.profiles
  add column if not exists ai_chat_memory text,
  add column if not exists ai_chat_memory_enabled boolean not null default true;

comment on column public.profiles.ai_chat_memory is
  'Vom Server gepflegte Kurznotizen zur Person (Interessen, Schwächen, Name, …) für den Hauptchat-Kontext.';

comment on column public.profiles.ai_chat_memory_enabled is
  'false: kein automatisches Einlesen/Aktualisieren des KI-Speichers für diesen Nutzer.';
