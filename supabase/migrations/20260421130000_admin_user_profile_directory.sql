-- Vollstaendige Nutzerliste aus auth.users (inkl. ohne profiles-Zeile) + Admin-RPC fuer Vor-/Nachname

create or replace function public.admin_set_user_profile_names(
  p_user_id uuid,
  p_first_name text,
  p_last_name text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_is_superadmin boolean;
  fn text;
  ln text;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Profilnamen setzen.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unbekannter Nutzer.';
  end if;

  fn := nullif(trim(coalesce(p_first_name, '')), '');
  ln := nullif(trim(coalesce(p_last_name, '')), '');

  insert into public.profiles (id, first_name, last_name)
  values (p_user_id, fn, ln)
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_user_profile_names(uuid, text, text) to authenticated;

drop function if exists public.list_admin_profiles();

create function public.list_admin_profiles()
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  is_superadmin boolean,
  created_at timestamptz,
  subscription_plan_id uuid,
  subscription_plan_name text,
  has_profile boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Nutzerlisten abrufen.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.first_name,
    p.last_name,
    coalesce(p.is_superadmin, false),
    coalesce(p.created_at, u.created_at) as created_at,
    p.subscription_plan_id,
    sp.name::text,
    (p.id is not null)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;

grant execute on function public.list_admin_profiles() to authenticated;
