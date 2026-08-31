-- Admin-pushbare App-Version für Settings ergänzen

alter table public.app_feature_flags
  add column if not exists deployed_app_version text null;

drop function if exists public.get_app_feature_flags();

create or replace function public.get_app_feature_flags()
returns table (
  show_beta_notice_on_first_login boolean,
  deployed_app_version text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.show_beta_notice_on_first_login,
    f.deployed_app_version
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_deployed_app_version(
  p_version text
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
    raise exception 'Nur Superadmins duerfen die deployte App-Version setzen.';
  end if;

  insert into public.app_feature_flags(id, show_beta_notice_on_first_login, deployed_app_version, updated_at)
  values (
    1,
    true,
    nullif(trim(p_version), ''),
    now()
  )
  on conflict (id)
  do update set
    deployed_app_version = nullif(trim(excluded.deployed_app_version), ''),
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_deployed_app_version(text) to authenticated;
