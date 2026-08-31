-- Websuche-Guthaben: Pro Abo tägliche Aufladung (UTC), maximal 50 Kontostand.
-- Verbrauch über RPC consume_one_web_search_credit (Edge Function tavily-search).

alter table public.subscription_plans
  add column if not exists web_search_daily_grant integer;

comment on column public.subscription_plans.web_search_daily_grant is
  'Täglich zum Websuche-Guthaben dazu (UTC, lazy Reset); NULL wie 0; max. effektiv 50 Kontostand.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_web_search_daily_grant_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_web_search_daily_grant_bounds
      check (web_search_daily_grant is null or (web_search_daily_grant >= 0 and web_search_daily_grant <= 50));
  end if;
end;
$$;

alter table public.subscription_usages
  add column if not exists web_search_credit_balance integer not null default 0,
  add column if not exists used_web_searches integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_usages_web_search_credit_balance_bounds'
  ) then
    alter table public.subscription_usages
      add constraint subscription_usages_web_search_credit_balance_bounds
      check (web_search_credit_balance >= 0 and web_search_credit_balance <= 50);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscription_usages_used_web_searches_nonneg'
  ) then
    alter table public.subscription_usages
      add constraint subscription_usages_used_web_searches_nonneg
      check (used_web_searches >= 0);
  end if;
end;
$$;

comment on column public.subscription_usages.web_search_credit_balance is
  'Verfügbare Tavily-Websuchen; täglich +web_search_daily_grant (UTC), höchstens 50.';
comment on column public.subscription_usages.used_web_searches is
  'Statistik Websuchen am laufenden UTC-Tag (wird bei Tagesreset auf 0 gesetzt).';

update public.subscription_usages su
set web_search_credit_balance = least(
  50,
  coalesce(su.web_search_credit_balance, 0) + coalesce(sp.web_search_daily_grant, 0)
)
from public.profiles p
join public.subscription_plans sp on sp.id = p.subscription_plan_id
where p.id = su.user_id;

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
  else
    select sp.max_images, sp.max_tokens, coalesce(sp.web_search_daily_grant, 0)
    into m, daily_tokens, ws_daily
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
      image_credit_balance = case
        when m is null then su.image_credit_balance
        else least(60, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
      end,
      web_search_credit_balance = least(
        50,
        coalesce(su.web_search_credit_balance, 0) + coalesce(ws_daily, 0)
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
    token_balance = v_new_bal,
    image_credit_balance = case
      when m is null then su.image_credit_balance
      else least(60, coalesce(su.image_credit_balance, 0) + coalesce(m, 0))
    end,
    web_search_credit_balance = least(
      50,
      coalesce(su.web_search_credit_balance, 0) + coalesce(ws_daily, 0)
    ),
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where su.user_id = p_user_id
    and su.last_reset_date < (now() at time zone 'utc')::date;
end;
$$;

grant execute on function public.subscription_usage_reset_if_new_day(uuid) to authenticated;

create or replace function public.consume_one_web_search_credit()
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
    select coalesce(su.web_search_credit_balance, 0) into bal
    from public.subscription_usages su where su.user_id = uid;
    return coalesce(bal, 0);
  end if;

  perform public.subscription_usage_reset_if_new_day(uid);

  select coalesce(su.web_search_credit_balance, 0) into bal
  from public.subscription_usages su where su.user_id = uid;

  if bal is null or bal < 1 then
    raise exception 'WEB_SEARCH_LIMIT';
  end if;

  update public.subscription_usages su
  set
    web_search_credit_balance = su.web_search_credit_balance - 1,
    used_web_searches = coalesce(su.used_web_searches, 0) + 1,
    updated_at = now()
  where su.user_id = uid
  returning su.web_search_credit_balance into bal;

  return coalesce(bal, 0);
end;
$$;

grant execute on function public.consume_one_web_search_credit() to authenticated;

create or replace function public.refund_one_web_search_credit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Unauthorized';
  end if;

  update public.subscription_usages
  set
    web_search_credit_balance = least(50, coalesce(web_search_credit_balance, 0) + 1),
    used_web_searches = greatest(0, coalesce(used_web_searches, 0) - 1),
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

grant execute on function public.refund_one_web_search_credit(uuid) to service_role;
