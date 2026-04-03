-- Daily reset + token limits
-- - statt max_chats / used_chats wird max_tokens / used_tokens genutzt
-- - Verbrauch wird taeglich automatisch zurueckgesetzt (lazy reset bei Zugriff)

alter table public.subscription_plans
  add column if not exists max_tokens integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_max_tokens_nonneg'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_max_tokens_nonneg check (max_tokens is null or max_tokens >= 0);
  end if;
end;
$$;

alter table public.subscription_usages
  add column if not exists used_tokens integer not null default 0,
  add column if not exists last_reset_date date not null default ((now() at time zone 'utc')::date);

create or replace function public.subscription_usage_reset_if_new_day(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.subscription_usages
  set
    used_tokens = 0,
    used_images = 0,
    used_files = 0,
    used_chats = 0,
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where user_id = p_user_id
    and last_reset_date < (now() at time zone 'utc')::date;
end;
$$;

-- Ueberschreibt die vorherige Version aus der letzten Migration:
-- addiert nun Tokens/Bilder/Dateien mit Tagesreset.
drop function if exists public.user_increment_subscription_usage(uuid, integer, integer, integer);

create function public.user_increment_subscription_usage(
  p_user_id uuid,
  p_used_tokens_delta integer default 0,
  p_used_images_delta integer default 0,
  p_used_files_delta integer default 0
)
returns table (
  used_tokens integer,
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
  max_tokens integer;
  max_images integer;
  max_files integer;
  cur_tokens integer;
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

  if p_used_tokens_delta < 0 or p_used_images_delta < 0 or p_used_files_delta < 0 then
    raise exception 'Negative deltas are not allowed.';
  end if;

  perform public.subscription_usage_reset_if_new_day(p_user_id);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = p_user_id;

  select
    coalesce(used_tokens, 0),
    coalesce(used_images, 0),
    coalesce(used_files, 0)
  into
    cur_tokens, cur_images, cur_files
  from public.subscription_usages
  where user_id = p_user_id;

  cur_tokens := coalesce(cur_tokens, 0);
  cur_images := coalesce(cur_images, 0);
  cur_files := coalesce(cur_files, 0);

  if not actor_is_superadmin then
    if plan_id is null then
      max_tokens := null;
      max_images := null;
      max_files := null;
    else
      select sp.max_tokens, sp.max_images, sp.max_files
      into max_tokens, max_images, max_files
      from public.subscription_plans sp
      where sp.id = plan_id;
    end if;

    if max_tokens is not null and (cur_tokens + p_used_tokens_delta) > max_tokens then
      raise exception 'Token Limit Ueberschritten.';
    end if;
    if max_images is not null and (cur_images + p_used_images_delta) > max_images then
      raise exception 'Bilder Limit Ueberschritten.';
    end if;
    if max_files is not null and (cur_files + p_used_files_delta) > max_files then
      raise exception 'Datei Limit Ueberschritten.';
    end if;
  end if;

  insert into public.subscription_usages(
    user_id,
    used_tokens,
    used_images,
    used_files,
    last_reset_date,
    updated_at
  )
  values(
    p_user_id,
    cur_tokens + p_used_tokens_delta,
    cur_images + p_used_images_delta,
    cur_files + p_used_files_delta,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_tokens = public.subscription_usages.used_tokens + p_used_tokens_delta,
    used_images = public.subscription_usages.used_images + p_used_images_delta,
    used_files = public.subscription_usages.used_files + p_used_files_delta,
    updated_at = now();

  return query
  select u.used_tokens, u.used_images, u.used_files
  from public.subscription_usages u
  where u.user_id = p_user_id;
end;
$$;

grant execute on function public.user_increment_subscription_usage(uuid, integer, integer, integer) to authenticated;

create or replace function public.estimate_tokens_from_text(p_content text)
returns integer
language sql
immutable
as $$
  select greatest(1, ceil(char_length(coalesce(p_content, '')) / 4.0)::integer);
$$;

create or replace function public.subscription_guard_chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid;
  actor_is_superadmin boolean;
  owner_user_id uuid;
  plan_id uuid;
  max_tokens integer;
  used_tokens integer;
  msg_tokens integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_uid := auth.uid();
  if actor_uid is null then
    raise exception 'Unauthorized token quota check.';
  end if;

  select t.user_id into owner_user_id
  from public.chat_threads t
  where t.id = new.thread_id;

  if owner_user_id is null then
    raise exception 'Chat thread not found.';
  end if;
  if owner_user_id != actor_uid then
    raise exception 'Unauthorized token quota check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(actor_uid);

  select subscription_plan_id into plan_id
  from public.profiles where id = actor_uid;

  if plan_id is null then
    return new;
  end if;

  select sp.max_tokens into max_tokens
  from public.subscription_plans sp
  where sp.id = plan_id;

  if max_tokens is null then
    return new;
  end if;

  select coalesce(u.used_tokens, 0) into used_tokens
  from public.subscription_usages u
  where u.user_id = actor_uid;

  msg_tokens := public.estimate_tokens_from_text(new.content);
  if used_tokens + msg_tokens > max_tokens then
    raise exception 'Token Limit Ueberschritten.';
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_guard_chat_messages_before_insert_trigger on public.chat_messages;
create trigger subscription_guard_chat_messages_before_insert_trigger
before insert on public.chat_messages
for each row
execute function public.subscription_guard_chat_messages_before_insert();

create or replace function public.subscription_increment_used_tokens_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_user_id uuid;
  msg_tokens integer;
begin
  select t.user_id into owner_user_id
  from public.chat_threads t
  where t.id = new.thread_id;

  if owner_user_id is null then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(owner_user_id);

  msg_tokens := public.estimate_tokens_from_text(new.content);

  insert into public.subscription_usages(
    user_id,
    used_tokens,
    used_images,
    used_files,
    last_reset_date,
    updated_at
  )
  values(
    owner_user_id,
    msg_tokens,
    0,
    0,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_tokens = public.subscription_usages.used_tokens + msg_tokens,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists subscription_increment_used_tokens_after_insert_trigger on public.chat_messages;
create trigger subscription_increment_used_tokens_after_insert_trigger
after insert on public.chat_messages
for each row
execute function public.subscription_increment_used_tokens_after_insert();

-- Alte Chat-Thread-basierten Quoten deaktivieren (ersetzt durch token-basierte Message-Logik)
drop trigger if exists subscription_guard_chat_threads_before_insert_trigger on public.chat_threads;
drop trigger if exists subscription_increment_used_chats_after_insert_trigger on public.chat_threads;

