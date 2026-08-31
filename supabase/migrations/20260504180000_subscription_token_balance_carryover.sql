-- Token-Guthaben: ungenutztes Kontingent (Guthaben + Tageslimit − Verbrauch) wird zum naechsten UTC-Tag
-- als token_balance uebernommen, maximal 3_000_000.
-- Verfuegbar pro Tag: token_balance + max_tokens (bzw. 100 ohne Plan).

alter table public.subscription_usages
  add column if not exists token_balance bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_usages_token_balance_bounds'
  ) then
    alter table public.subscription_usages
      add constraint subscription_usages_token_balance_bounds
      check (token_balance >= 0 and token_balance <= 3000000);
  end if;
end;
$$;

comment on column public.subscription_usages.token_balance is
  'Uegerrag aus frueheren Tagen; max. 3 Mio. Taegliches Limit = token_balance + subscription_plans.max_tokens.';

create or replace function public.subscription_usage_reset_if_new_day(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m integer;
  pid uuid;
  daily_tokens integer;
  v_used bigint;
  v_old_bal bigint;
  v_allow bigint;
  v_unused bigint;
  v_new_bal bigint;
  su_exists boolean;
begin
  select exists(select 1 from public.subscription_usages su where su.user_id = p_user_id)
  into su_exists;

  if not su_exists then
    return;
  end if;

  select p.subscription_plan_id into pid
  from public.profiles p
  where p.id = p_user_id;

  if pid is null then
    m := null;
    daily_tokens := 100;
  else
    select sp.max_images, sp.max_tokens into m, daily_tokens
    from public.subscription_plans sp
    where sp.id = pid;
  end if;

  select coalesce(su.used_tokens, 0), coalesce(su.token_balance, 0)
  into v_used, v_old_bal
  from public.subscription_usages su
  where su.user_id = p_user_id;

  if daily_tokens is null then
    update public.subscription_usages su
    set
      used_tokens = 0,
      used_images = 0,
      used_files = 0,
      used_chats = 0,
      image_credit_balance = case
        when m is null then su.image_credit_balance
        else least(60, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
      end,
      last_reset_date = (now() at time zone 'utc')::date,
      updated_at = now()
    where su.user_id = p_user_id
      and su.last_reset_date < (now() at time zone 'utc')::date;
    return;
  end if;

  v_allow := v_old_bal + daily_tokens::bigint;
  v_unused := greatest(0, v_allow - v_used);
  v_new_bal := least(3000000::bigint, v_unused);

  update public.subscription_usages su
  set
    used_tokens = 0,
    used_images = 0,
    used_files = 0,
    used_chats = 0,
    token_balance = v_new_bal,
    image_credit_balance = case
      when m is null then su.image_credit_balance
      else least(60, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
    end,
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where su.user_id = p_user_id
    and su.last_reset_date < (now() at time zone 'utc')::date;
end;
$$;

grant execute on function public.subscription_usage_reset_if_new_day(uuid) to authenticated;

create or replace function public.user_increment_subscription_usage(
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
  cur_balance integer;
  cur_token_balance bigint;
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
    coalesce(su.used_tokens, 0),
    coalesce(su.used_images, 0),
    coalesce(su.used_files, 0),
    coalesce(su.image_credit_balance, 0),
    coalesce(su.token_balance, 0)
  into
    cur_tokens, cur_images, cur_files, cur_balance, cur_token_balance
  from public.subscription_usages su
  where su.user_id = p_user_id;

  cur_tokens := coalesce(cur_tokens, 0);
  cur_images := coalesce(cur_images, 0);
  cur_files := coalesce(cur_files, 0);
  cur_balance := coalesce(cur_balance, 0);
  cur_token_balance := coalesce(cur_token_balance, 0);

  if not actor_is_superadmin then
    if plan_id is null then
      max_tokens := 100;
      max_images := null;
      max_files := null;
    else
      select sp.max_tokens, sp.max_images, sp.max_files
      into max_tokens, max_images, max_files
      from public.subscription_plans sp
      where sp.id = plan_id;
    end if;

    if max_tokens is not null
       and (cur_tokens + p_used_tokens_delta) > (cur_token_balance + max_tokens) then
      raise exception 'Token Limit Ueberschritten.';
    end if;
    if max_images is not null and p_used_images_delta > 0 then
      if cur_balance < p_used_images_delta then
        raise exception 'Bilder Limit Ueberschritten.';
      end if;
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
    image_credit_balance,
    last_reset_date,
    updated_at
  )
  values(
    p_user_id,
    cur_tokens + p_used_tokens_delta,
    cur_images + p_used_images_delta,
    cur_files + p_used_files_delta,
    case
      when max_images is null then cur_balance
      else cur_balance - p_used_images_delta
    end,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_tokens = public.subscription_usages.used_tokens + p_used_tokens_delta,
    used_images = public.subscription_usages.used_images + p_used_images_delta,
    used_files = public.subscription_usages.used_files + p_used_files_delta,
    image_credit_balance = case
      when max_images is null then public.subscription_usages.image_credit_balance
      else public.subscription_usages.image_credit_balance - p_used_images_delta
    end,
    updated_at = now();

  return query
  select u.used_tokens, u.used_images, u.used_files
  from public.subscription_usages u
  where u.user_id = p_user_id;
end;
$$;

grant execute on function public.user_increment_subscription_usage(uuid, integer, integer, integer) to authenticated;

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
  token_bal bigint;
  msg_tokens integer;
  is_participant boolean;
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

  is_participant := (owner_user_id = actor_uid) or exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = new.thread_id
      and m.user_id = actor_uid
  );

  if not is_participant then
    raise exception 'Unauthorized token quota check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles
  where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(actor_uid);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = actor_uid;

  if plan_id is null then
    max_tokens := 100;
  else
    select sp.max_tokens into max_tokens
    from public.subscription_plans sp
    where sp.id = plan_id;
  end if;

  if max_tokens is null then
    return new;
  end if;

  select coalesce(u.used_tokens, 0), coalesce(u.token_balance, 0)
  into used_tokens, token_bal
  from public.subscription_usages u
  where u.user_id = actor_uid;

  msg_tokens := public.estimate_tokens_from_text(new.content);
  if used_tokens + msg_tokens > token_bal + max_tokens then
    raise exception 'Token Limit Ueberschritten.';
  end if;

  return new;
end;
$$;

create or replace function public.subscription_increment_used_tokens_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  billing_user_id uuid;
  msg_tokens integer;
  initial_balance integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  billing_user_id := auth.uid();
  if billing_user_id is null then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(billing_user_id);

  msg_tokens := public.estimate_tokens_from_text(new.content);

  select least(60, coalesce(sp.max_images, 0)) into initial_balance
  from public.profiles p
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  where p.id = billing_user_id;

  initial_balance := coalesce(initial_balance, 0);

  insert into public.subscription_usages(
    user_id,
    used_tokens,
    used_images,
    used_files,
    image_credit_balance,
    last_reset_date,
    updated_at
  )
  values(
    billing_user_id,
    msg_tokens,
    0,
    0,
    initial_balance,
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
