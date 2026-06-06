-- Websuche: Start-Guthaben und Guthaben-Deckel pro Abo (wie KI-Bildgenerierung / Thinking).

alter table public.subscription_plans
  add column if not exists web_search_start_balance integer not null default 0,
  add column if not exists web_search_credit_max integer not null default 50;

comment on column public.subscription_plans.web_search_daily_grant is
  'Websuche: tägliche Aufladung (UTC) auf web_search_credit_balance; NULL wie 0.';
comment on column public.subscription_plans.web_search_start_balance is
  'Websuche: Start-Guthaben bei Abo-Zuweisung (gecappt mit web_search_credit_max).';
comment on column public.subscription_plans.web_search_credit_max is
  'Websuche: maximal angespartes Guthaben (web_search_credit_balance).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_web_search_start_balance_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_web_search_start_balance_bounds
      check (web_search_start_balance >= 0 and web_search_start_balance <= 10000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_web_search_credit_max_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_web_search_credit_max_bounds
      check (web_search_credit_max >= 0 and web_search_credit_max <= 10000);
  end if;
end;
$$;

alter table public.subscription_plans drop constraint if exists subscription_plans_web_search_daily_grant_bounds;
alter table public.subscription_plans
  add constraint subscription_plans_web_search_daily_grant_bounds
  check (web_search_daily_grant is null or (web_search_daily_grant >= 0 and web_search_daily_grant <= 10000));

alter table public.subscription_usages drop constraint if exists subscription_usages_web_search_credit_balance_bounds;
alter table public.subscription_usages
  add constraint subscription_usages_web_search_credit_balance_bounds
  check (web_search_credit_balance >= 0 and web_search_credit_balance <= 10000);

comment on column public.subscription_usages.web_search_credit_balance is
  'Verfügbare Tavily-Websuchen; täglich +web_search_daily_grant (UTC), gedeckelt mit web_search_credit_max des Abos.';

-- Bestehende Pläne: Start aus Tages-Aufladung, falls noch 0
update public.subscription_plans sp
set web_search_start_balance = coalesce(sp.web_search_daily_grant, 0)
where sp.web_search_start_balance = 0
  and coalesce(sp.web_search_daily_grant, 0) > 0;

update public.subscription_usages su
set web_search_credit_balance = least(
  greatest(0, coalesce(sp.web_search_credit_max, 50)),
  coalesce(su.web_search_credit_balance, 0)
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
  tok_start bigint;
  tok_max bigint;
  ws_start integer;
  ws_max integer;
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
    greatest(0, coalesce(sp.thinking_credit_max, 10)),
    greatest(0, coalesce(sp.instant_token_start_balance, 0)),
    greatest(0, coalesce(sp.instant_token_balance_max, 3000000)),
    coalesce(sp.web_search_start_balance, 0),
    greatest(0, coalesce(sp.web_search_credit_max, 50))
  into img_start, img_max, think_start, think_max, tok_start, tok_max, ws_start, ws_max
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  img_start := least(img_max, greatest(0, img_start));
  think_start := least(think_max, greatest(0, think_start));
  tok_start := least(tok_max, greatest(0, tok_start));
  ws_start := least(ws_max, greatest(0, ws_start));

  insert into public.subscription_usages (
    user_id,
    used_tokens,
    used_images,
    used_files,
    image_credit_balance,
    thinking_credit_balance,
    token_balance,
    web_search_credit_balance,
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
    tok_start,
    ws_start,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id) do update
  set
    image_credit_balance = img_start,
    thinking_credit_balance = think_start,
    token_balance = tok_start,
    web_search_credit_balance = ws_start,
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
  v_tok_max bigint;
  su_exists boolean;
  ws_daily integer;
  ws_max integer;
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
    ws_max := 50;
    img_max := 60;
    think_daily := 0;
    think_max := 10;
    v_tok_max := 3000000;
  else
    select
      sp.max_images,
      sp.max_tokens,
      coalesce(sp.web_search_daily_grant, 0),
      greatest(0, coalesce(sp.web_search_credit_max, 50)),
      greatest(1, coalesce(sp.image_credit_max, 60)),
      coalesce(sp.thinking_daily_grant, 0),
      greatest(0, coalesce(sp.thinking_credit_max, 10)),
      greatest(0, coalesce(sp.instant_token_balance_max, 3000000))
    into m, daily_tokens, ws_daily, ws_max, img_max, think_daily, think_max, v_tok_max
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
        ws_max,
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
  v_new_bal := least(v_tok_max, v_unused);

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
      ws_max,
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

create or replace function public.refund_one_web_search_credit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_max integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select greatest(0, coalesce(sp.web_search_credit_max, 50))
  into ws_max
  from public.profiles p
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  where p.id = p_user_id;

  ws_max := coalesce(ws_max, 50);

  update public.subscription_usages
  set
    web_search_credit_balance = least(
      ws_max,
      coalesce(web_search_credit_balance, 0) + 1
    ),
    used_web_searches = greatest(0, coalesce(used_web_searches, 0) - 1),
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

grant execute on function public.subscription_usage_reset_if_new_day(uuid) to authenticated;
