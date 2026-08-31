-- Erstanmeldung: Passwortwechsel erzwingen (Admin-Flag) + RPC zum Zuruecksetzen nach Passwortaenderung

alter table public.profiles
  add column if not exists must_change_password_on_first_login boolean not null default false;

comment on column public.profiles.must_change_password_on_first_login is
  'Wenn true: Nutzer muss nach Login neues Passwort setzen (bis RPC user_clear...). Admin setzt nur solange last_sign_in_at null ist.';

create or replace function public.user_clear_must_change_password_on_first_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    must_change_password_on_first_login = false,
    updated_at = now()
  where id = auth.uid()
    and must_change_password_on_first_login = true;
end;
$$;

grant execute on function public.user_clear_must_change_password_on_first_login() to authenticated;

create or replace function public.admin_set_must_change_password_on_first_login(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_is_superadmin boolean;
  last_in timestamptz;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen diese Einstellung aendern.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unbekannter Nutzer.';
  end if;

  if p_enabled then
    select u.last_sign_in_at
    into last_in
    from auth.users u
    where u.id = p_user_id;

    if last_in is not null then
      raise exception 'Nur fuer Konten, die sich noch nicht angemeldet haben.';
    end if;
  end if;

  insert into public.profiles (id, must_change_password_on_first_login)
  values (p_user_id, p_enabled)
  on conflict (id) do update set
    must_change_password_on_first_login = excluded.must_change_password_on_first_login,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_must_change_password_on_first_login(uuid, boolean) to authenticated;

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
  has_profile boolean,
  last_sign_in_at timestamptz,
  must_change_password_on_first_login boolean
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
    (p.id is not null),
    u.last_sign_in_at,
    coalesce(p.must_change_password_on_first_login, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;

grant execute on function public.list_admin_profiles() to authenticated;
