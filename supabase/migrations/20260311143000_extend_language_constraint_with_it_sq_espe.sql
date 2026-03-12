alter table public.profiles
drop constraint if exists profiles_language_check;

alter table public.profiles
add constraint profiles_language_check
check (language in ('de', 'en', 'hr', 'it', 'sq', 'es-PE'));
