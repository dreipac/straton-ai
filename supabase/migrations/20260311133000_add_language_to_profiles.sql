alter table public.profiles
add column if not exists language text not null default 'de';

update public.profiles
set language = 'de'
where language is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_language_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_language_check
    check (language in ('de', 'en'));
  end if;
end;
$$;
