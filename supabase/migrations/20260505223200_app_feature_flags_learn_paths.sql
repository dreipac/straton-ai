-- Lernpfad-Schalter für globale UI-Deaktivierung ergänzen

alter table public.app_feature_flags
  add column if not exists learn_paths_enabled boolean not null default true,
  add column if not exists learn_path_create_enabled boolean not null default true;

drop function if exists public.get_app_feature_flags();

create or replace function public.get_app_feature_flags()
returns table (
  show_beta_notice_on_first_login boolean,
  deployed_app_version text,
  learn_paths_enabled boolean,
  learn_path_create_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.show_beta_notice_on_first_login,
    f.deployed_app_version,
    f.learn_paths_enabled,
    f.learn_path_create_enabled
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_learn_paths_enabled(
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
    raise exception 'Nur Superadmins duerfen Lernpfade aktivieren/deaktivieren.';
  end if;

  insert into public.app_feature_flags(
    id,
    show_beta_notice_on_first_login,
    deployed_app_version,
    learn_paths_enabled,
    learn_path_create_enabled,
    updated_at
  )
  values (1, true, null, p_enabled, true, now())
  on conflict (id)
  do update set
    learn_paths_enabled = excluded.learn_paths_enabled,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_learn_paths_enabled(boolean) to authenticated;

create or replace function public.admin_set_learn_path_create_enabled(
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
    raise exception 'Nur Superadmins duerfen das Erstellen von Lernpfaden umstellen.';
  end if;

  insert into public.app_feature_flags(
    id,
    show_beta_notice_on_first_login,
    deployed_app_version,
    learn_paths_enabled,
    learn_path_create_enabled,
    updated_at
  )
  values (1, true, null, true, p_enabled, now())
  on conflict (id)
  do update set
    learn_path_create_enabled = excluded.learn_path_create_enabled,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_learn_path_create_enabled(boolean) to authenticated;

