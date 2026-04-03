-- Subscription-Limits + Verbrauch (Chats/Bilder/Dateien)
-- Ziel:
-- - subscription_plans enthält pro Plan Limits
-- - subscription_usages trackt pro Nutzer den Verbrauch
-- - chat_threads INSERT wird an max_chats gekoppelt (Guard + Automatik-Increment)
-- - Bilder/Dateien werden via security-definer RPC inkrementiert (inkl. Guard)

alter table public.subscription_plans
  add column if not exists max_chats integer,
  add column if not exists max_images integer,
  add column if not exists max_files integer;

-- Check constraints (optional, existieren evtl. schon durch vorherige Reruns)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_max_chats_nonneg'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_max_chats_nonneg check (max_chats is null or max_chats >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_max_images_nonneg'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_max_images_nonneg check (max_images is null or max_images >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_max_files_nonneg'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_max_files_nonneg check (max_files is null or max_files >= 0);
  end if;
end;
$$;

-- Verbrauch pro Nutzer (1:1 zu profiles)
create table if not exists public.subscription_usages (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  used_chats integer not null default 0,
  used_images integer not null default 0,
  used_files integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS fuer User: nur eigene Zeile lesen.
alter table public.subscription_usages enable row level security;

drop policy if exists "subscription_usages_select_own" on public.subscription_usages;
create policy "subscription_usages_select_own"
  on public.subscription_usages
  for select
  to authenticated
  using (user_id = auth.uid());

-- RPC: Images/Files (und optional auch Chats) inkrementieren mit Limits-Guard.
-- Falls kein Plan zugewiesen ist oder Limits = NULL => unlimited.
create or replace function public.user_increment_subscription_usage(
  p_user_id uuid,
  p_used_chats_delta integer default 0,
  p_used_images_delta integer default 0,
  p_used_files_delta integer default 0
)
returns table (
  used_chats integer,
  used_images integer,
  used_files integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_superadmin boolean;
  plan_id uuid;
  max_chats integer;
  max_images integer;
  max_files integer;
  cur_chats integer;
  cur_images integer;
  cur_files integer;
begin
  if auth.role() = 'service_role' then
    actor_is_superadmin := true;
  else
    if auth.uid() is null or auth.uid() != p_user_id then
      raise exception 'Unauthorized quota update.';
    end if;
    select coalesce(is_superadmin, false) into actor_is_superadmin
    from public.profiles where id = auth.uid();
  end if;

  if p_used_chats_delta < 0 or p_used_images_delta < 0 or p_used_files_delta < 0 then
    raise exception 'Negative deltas are not allowed.';
  end if;

  select subscription_plan_id into plan_id
  from public.profiles
  where id = p_user_id;

  select
    coalesce(used_chats, 0),
    coalesce(used_images, 0),
    coalesce(used_files, 0)
  into
    cur_chats, cur_images, cur_files
  from public.subscription_usages
  where user_id = p_user_id;

  cur_chats := coalesce(cur_chats, 0);
  cur_images := coalesce(cur_images, 0);
  cur_files := coalesce(cur_files, 0);

  if not actor_is_superadmin then
    if plan_id is null then
      max_chats := null;
      max_images := null;
      max_files := null;
    else
      select sp.max_chats, sp.max_images, sp.max_files
      into max_chats, max_images, max_files
      from public.subscription_plans sp
      where sp.id = plan_id;
    end if;

    if max_chats is not null and (cur_chats + p_used_chats_delta) > max_chats then
      raise exception 'Chat Limit Ueberschritten.';
    end if;
    if max_images is not null and (cur_images + p_used_images_delta) > max_images then
      raise exception 'Bilder Limit Ueberschritten.';
    end if;
    if max_files is not null and (cur_files + p_used_files_delta) > max_files then
      raise exception 'Datei Limit Ueberschritten.';
    end if;
  end if;

  -- Upsert
  insert into public.subscription_usages(user_id, used_chats, used_images, used_files, updated_at)
  values(
    p_user_id,
    cur_chats + p_used_chats_delta,
    cur_images + p_used_images_delta,
    cur_files + p_used_files_delta,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_chats = public.subscription_usages.used_chats + p_used_chats_delta,
    used_images = public.subscription_usages.used_images + p_used_images_delta,
    used_files = public.subscription_usages.used_files + p_used_files_delta,
    updated_at = now();

  return query
  select used_chats, used_images, used_files
  from public.subscription_usages
  where user_id = p_user_id;
end;
$$;

grant execute on function public.user_increment_subscription_usage(uuid, integer, integer, integer) to authenticated;

-- Trigger: Quota-Guard + Auto-Increment fuer Chat-Threads
create or replace function public.subscription_guard_chat_threads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid;
  actor_is_superadmin boolean;
  plan_id uuid;
  max_chats integer;
  used_chats integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_uid := auth.uid();
  if actor_uid is null or actor_uid != new.user_id then
    raise exception 'Unauthorized quota check (chat_threads).';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  select subscription_plan_id into plan_id
  from public.profiles where id = actor_uid;

  if plan_id is null then
    return new;
  end if;

  select sp.max_chats into max_chats
  from public.subscription_plans sp
  where sp.id = plan_id;

  if max_chats is null then
    return new;
  end if;

  select used_chats into used_chats
  from public.subscription_usages
  where user_id = actor_uid;

  used_chats := coalesce(used_chats, 0);

  if used_chats + 1 > max_chats then
    raise exception 'Chat Limit Ueberschritten.';
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_guard_chat_threads_before_insert_trigger on public.chat_threads;
create trigger subscription_guard_chat_threads_before_insert_trigger
before insert on public.chat_threads
for each row
execute function public.subscription_guard_chat_threads_before_insert();

create or replace function public.subscription_increment_used_chats_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Upsert-Increment (Zaehlung erfolgt immer, auch wenn Plan limits NULL sind)
  insert into public.subscription_usages(user_id, used_chats, used_images, used_files, updated_at)
  values(
    new.user_id,
    1,
    0,
    0,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_chats = public.subscription_usages.used_chats + 1,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists subscription_increment_used_chats_after_insert_trigger on public.chat_threads;
create trigger subscription_increment_used_chats_after_insert_trigger
after insert on public.chat_threads
for each row
execute function public.subscription_increment_used_chats_after_insert();

