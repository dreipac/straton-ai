-- Beta-Hinweis nach erstem Login/Onboarding steuerbar machen

alter table public.profiles
  add column if not exists beta_notice_seen boolean not null default false;

create table if not exists public.app_feature_flags (
  id integer primary key,
  show_beta_notice_on_first_login boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint app_feature_flags_singleton check (id = 1)
);

insert into public.app_feature_flags (id, show_beta_notice_on_first_login)
values (1, true)
on conflict (id) do nothing;

alter table public.app_feature_flags enable row level security;

drop policy if exists "app_feature_flags_select_authenticated" on public.app_feature_flags;
create policy "app_feature_flags_select_authenticated"
  on public.app_feature_flags
  for select
  to authenticated
  using (true);

drop policy if exists "app_feature_flags_write_superadmin" on public.app_feature_flags;
create policy "app_feature_flags_write_superadmin"
  on public.app_feature_flags
  for all
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
      false
    ) = true
  );

create or replace function public.get_app_feature_flags()
returns table (
  show_beta_notice_on_first_login boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select f.show_beta_notice_on_first_login
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_beta_notice_enabled(
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen den Beta-Hinweis umstellen.';
  end if;

  insert into public.app_feature_flags(id, show_beta_notice_on_first_login, updated_at)
  values (1, p_enabled, now())
  on conflict (id)
  do update set
    show_beta_notice_on_first_login = excluded.show_beta_notice_on_first_login,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_beta_notice_enabled(boolean) to authenticated;

