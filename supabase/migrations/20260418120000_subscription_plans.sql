-- Abo-Plaene (Admin verwaltet Namen); Zuweisung pro Nutzer in profiles.subscription_plan_id

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint subscription_plans_name_nonempty check (char_length(trim(name)) >= 1),
  constraint subscription_plans_name_unique unique (name)
);

comment on table public.subscription_plans is
  'Von Superadmins definierte Abo-Namen; Zuweisung ueber profiles.subscription_plan_id.';

alter table public.profiles
  add column if not exists subscription_plan_id uuid references public.subscription_plans (id) on delete set null;

create index if not exists profiles_subscription_plan_id_idx on public.profiles (subscription_plan_id);

alter table public.subscription_plans enable row level security;

-- Katalog fuer alle angemeldeten Nutzer lesbar (Anzeige im Konto)
create policy "subscription_plans_select_authenticated"
  on public.subscription_plans
  for select
  to authenticated
  using (true);

create policy "subscription_plans_insert_superadmin"
  on public.subscription_plans
  for insert
  to authenticated
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "subscription_plans_update_superadmin"
  on public.subscription_plans
  for update
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "subscription_plans_delete_superadmin"
  on public.subscription_plans
  for delete
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

-- Nur Superadmins duerfen subscription_plan_id setzen/aendern (Nutzer nicht selbst)
create or replace function public.profiles_guard_subscription_plan()
returns trigger
language plpgsql
as $$
declare
  actor_superadmin boolean;
begin
  if tg_op = 'UPDATE' and new.subscription_plan_id is not distinct from old.subscription_plan_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.subscription_plan_id is null then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  select coalesce(p.is_superadmin, false)
  into actor_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if actor_superadmin then
    return new;
  end if;

  raise exception 'Nur Administratoren duerfen das Abonnement zuweisen.';
end;
$$;

drop trigger if exists profiles_guard_subscription_plan_trigger on public.profiles;
create trigger profiles_guard_subscription_plan_trigger
before insert or update on public.profiles
for each row
execute function public.profiles_guard_subscription_plan();

create or replace function public.admin_set_user_subscription_plan(
  p_user_id uuid,
  p_plan_id uuid
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
    raise exception 'Nur Superadmins duerfen Abonnements zuweisen.';
  end if;

  if p_plan_id is not null and not exists (select 1 from public.subscription_plans s where s.id = p_plan_id) then
    raise exception 'Ungueltiges Abo.';
  end if;

  update public.profiles
  set subscription_plan_id = p_plan_id
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_subscription_plan(uuid, uuid) to authenticated;

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
  subscription_plan_name text
)
language plpgsql
security definer
set search_path = public
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
    p.id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.is_superadmin,
    p.created_at,
    p.subscription_plan_id,
    sp.name
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  order by p.created_at desc;
end;
$$;

grant execute on function public.list_admin_profiles() to authenticated;
