-- Abo: Bild-Startguthaben + max. Bild-Guthaben pro Plan; Thinking-Guthaben (Start, täglich, max.)

alter table public.subscription_plans
  add column if not exists image_start_balance integer not null default 0,
  add column if not exists image_credit_max integer not null default 60,
  add column if not exists thinking_start_balance integer not null default 0,
  add column if not exists thinking_daily_grant integer not null default 0,
  add column if not exists thinking_credit_max integer not null default 10;

comment on column public.subscription_plans.image_start_balance is
  'Bild-Guthaben bei Abo-Zuweisung / erste Nutzungszeile (gecappt mit image_credit_max).';
comment on column public.subscription_plans.image_credit_max is
  'Maximal angespartes Bild-Guthaben für dieses Abo (ersetzt globalen Deckel 60).';
comment on column public.subscription_plans.thinking_start_balance is
  'Thinking-Anfragen-Guthaben bei Abo-Zuweisung.';
comment on column public.subscription_plans.thinking_daily_grant is
  'Täglich (UTC) zum Thinking-Guthaben dazu, gecappt mit thinking_credit_max.';
comment on column public.subscription_plans.thinking_credit_max is
  'Maximal gespeicherte Thinking-Anfragen für dieses Abo.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_image_start_balance_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_image_start_balance_bounds
      check (image_start_balance >= 0 and image_start_balance <= 10000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_image_credit_max_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_image_credit_max_bounds
      check (image_credit_max >= 0 and image_credit_max <= 10000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_thinking_start_balance_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_thinking_start_balance_bounds
      check (thinking_start_balance >= 0 and thinking_start_balance <= 10000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_thinking_daily_grant_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_thinking_daily_grant_bounds
      check (thinking_daily_grant >= 0 and thinking_daily_grant <= 10000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_thinking_credit_max_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_thinking_credit_max_bounds
      check (thinking_credit_max >= 0 and thinking_credit_max <= 10000);
  end if;
end;
$$;

update public.subscription_plans sp
set
  image_credit_max = 60,
  image_start_balance = greatest(0, coalesce(sp.max_images, 0))
where sp.image_credit_max = 60 and sp.image_start_balance = 0;

alter table public.subscription_usages
  add column if not exists thinking_credit_balance integer not null default 0,
  add column if not exists used_thinking_requests integer not null default 0;

alter table public.subscription_usages drop constraint if exists subscription_usages_image_credit_balance_bounds;

alter table public.subscription_usages
  add constraint subscription_usages_image_credit_balance_nonneg
  check (image_credit_balance >= 0);

alter table public.subscription_usages drop constraint if exists subscription_usages_thinking_credit_balance_bounds;

alter table public.subscription_usages
  add constraint subscription_usages_thinking_credit_balance_nonneg
  check (thinking_credit_balance >= 0);

alter table public.subscription_usages
  add constraint subscription_usages_used_thinking_requests_nonneg
  check (used_thinking_requests >= 0);

comment on column public.subscription_usages.thinking_credit_balance is
  'Verfügbare Thinking-Modus-Anfragen; täglich +thinking_daily_grant (UTC), gecappt pro Abo.';
comment on column public.subscription_usages.used_thinking_requests is
  'Statistik Thinking-Anfragen am laufenden UTC-Tag.';

update public.subscription_usages su
set
  thinking_credit_balance = least(
    coalesce(sp.thinking_credit_max, 10),
    greatest(coalesce(su.thinking_credit_balance, 0), coalesce(sp.thinking_start_balance, 0))
  ),
  image_credit_balance = least(
    greatest(1, coalesce(sp.image_credit_max, 60)),
    coalesce(su.image_credit_balance, 0)
  )
from public.profiles p
join public.subscription_plans sp on sp.id = p.subscription_plan_id
where p.id = su.user_id;

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
  img_start integer;
  img_max integer;
  think_start integer;
  think_max integer;
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

  if p_plan_id is null then
    return;
  end if;

  select
    coalesce(sp.image_start_balance, 0),
    greatest(1, coalesce(sp.image_credit_max, 60)),
    coalesce(sp.thinking_start_balance, 0),
    greatest(0, coalesce(sp.thinking_credit_max, 10))
  into img_start, img_max, think_start, think_max
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  img_start := least(img_max, greatest(0, img_start));
  think_start := least(think_max, greatest(0, think_start));

  insert into public.subscription_usages (
    user_id,
    used_tokens,
    used_images,
    used_files,
    image_credit_balance,
    thinking_credit_balance,
    last_reset_date,
    updated_at
  )
  values (
    p_user_id,
    0,
    0,
    0,
    img_start,
    think_start,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id) do update
  set
    image_credit_balance = img_start,
    thinking_credit_balance = think_start,
    updated_at = now();
end;
$$;

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
  ws_daily integer;
  img_max integer;
  think_daily integer;
  think_max integer;
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
    ws_daily := 0;
    img_max := 60;
    think_daily := 0;
    think_max := 10;
  else
    select
      sp.max_images,
      sp.max_tokens,
      coalesce(sp.web_search_daily_grant, 0),
      greatest(1, coalesce(sp.image_credit_max, 60)),
      coalesce(sp.thinking_daily_grant, 0),
      greatest(0, coalesce(sp.thinking_credit_max, 10))
    into m, daily_tokens, ws_daily, img_max, think_daily, think_max
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
      used_web_searches = 0,
      used_thinking_requests = 0,
      image_credit_balance = case
        when m is null then su.image_credit_balance
        else least(img_max, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
      end,
      web_search_credit_balance = least(
        50,
        coalesce(su.web_search_credit_balance, 0) + coalesce(ws_daily, 0)
      ),
      thinking_credit_balance = least(
        think_max,
        coalesce(su.thinking_credit_balance, 0) + coalesce(think_daily, 0)
      ),
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
    used_web_searches = 0,
    used_thinking_requests = 0,
    token_balance = v_new_bal,
    image_credit_balance = case
      when m is null then su.image_credit_balance
      else least(img_max, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
    end,
    web_search_credit_balance = least(
      50,
      coalesce(su.web_search_credit_balance, 0) + coalesce(ws_daily, 0)
    ),
    thinking_credit_balance = least(
      think_max,
      coalesce(su.thinking_credit_balance, 0) + coalesce(think_daily, 0)
    ),
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where su.user_id = p_user_id
    and su.last_reset_date < (now() at time zone 'utc')::date;
end;
$$;

grant execute on function public.subscription_usage_reset_if_new_day(uuid) to authenticated;

create or replace function public.consume_one_thinking_credit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  actor_superadmin boolean;
  bal integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(is_superadmin, false) into actor_superadmin from public.profiles where id = uid;

  if actor_superadmin then
    select coalesce(su.thinking_credit_balance, 0) into bal
    from public.subscription_usages su where su.user_id = uid;
    return coalesce(bal, 0);
  end if;

  perform public.subscription_usage_reset_if_new_day(uid);

  select coalesce(su.thinking_credit_balance, 0) into bal
  from public.subscription_usages su where su.user_id = uid;

  if bal is null or bal < 1 then
    raise exception 'THINKING_LIMIT';
  end if;

  update public.subscription_usages su
  set
    thinking_credit_balance = su.thinking_credit_balance - 1,
    used_thinking_requests = coalesce(su.used_thinking_requests, 0) + 1,
    updated_at = now()
  where su.user_id = uid
  returning su.thinking_credit_balance into bal;

  return coalesce(bal, 0);
end;
$$;

grant execute on function public.consume_one_thinking_credit() to authenticated;

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
  img_max integer;
  cur_tokens integer;
  cur_images integer;
  cur_files integer;
  cur_balance integer;
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
    coalesce(su.image_credit_balance, 0)
  into
    cur_tokens, cur_images, cur_files, cur_balance
  from public.subscription_usages su
  where su.user_id = p_user_id;

  cur_tokens := coalesce(cur_tokens, 0);
  cur_images := coalesce(cur_images, 0);
  cur_files := coalesce(cur_files, 0);
  cur_balance := coalesce(cur_balance, 0);

  if not actor_is_superadmin then
    if plan_id is null then
      max_tokens := 100;
      max_images := null;
      max_files := null;
      img_max := 60;
    else
      select sp.max_tokens, sp.max_images, sp.max_files, greatest(1, coalesce(sp.image_credit_max, 60))
      into max_tokens, max_images, max_files, img_max
      from public.subscription_plans sp
      where sp.id = plan_id;
    end if;

    if max_tokens is not null and (cur_tokens + p_used_tokens_delta) > max_tokens then
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

  select least(
    greatest(1, coalesce(sp.image_credit_max, 60)),
    greatest(0, coalesce(sp.image_start_balance, sp.max_images, 0))
  )
  into initial_balance
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
