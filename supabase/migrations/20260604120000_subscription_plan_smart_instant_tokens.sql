-- Smart Instant: Tages-Token (max_tokens), Start-Guthaben und Guthaben-Deckel pro Abo.
-- Ungenutzte Tages-Tokens werden beim UTC-Reset in token_balance gutgeschrieben.

alter table public.subscription_plans
  add column if not exists instant_token_start_balance bigint not null default 0,
  add column if not exists instant_token_balance_max bigint not null default 3000000;

comment on column public.subscription_plans.max_tokens is
  'Smart Instant: maximale Nutzungs-Tokens pro UTC-Tag (zusammen mit token_balance verfügbar).';
comment on column public.subscription_plans.instant_token_start_balance is
  'Smart Instant: Token-Guthaben bei Abo-Zuweisung (gecappt mit instant_token_balance_max).';
comment on column public.subscription_plans.instant_token_balance_max is
  'Smart Instant: maximal angespartes Token-Guthaben (token_balance) für dieses Abo.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_instant_token_start_balance_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_instant_token_start_balance_bounds
      check (
        instant_token_start_balance >= 0
        and instant_token_start_balance <= 10000000
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_instant_token_balance_max_bounds'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_instant_token_balance_max_bounds
      check (
        instant_token_balance_max >= 0
        and instant_token_balance_max <= 10000000
      );
  end if;
end;
$$;

alter table public.subscription_usages drop constraint if exists subscription_usages_token_balance_bounds;

alter table public.subscription_usages
  add constraint subscription_usages_token_balance_bounds
  check (token_balance >= 0 and token_balance <= 10000000);

comment on column public.subscription_usages.token_balance is
  'Smart Instant: Guthaben aus früheren Tagen; verfügbar = token_balance + max_tokens (pro Abo gedeckelt).';

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
    greatest(0, coalesce(sp.instant_token_balance_max, 3000000))
  into img_start, img_max, think_start, think_max, tok_start, tok_max
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  img_start := least(img_max, greatest(0, img_start));
  think_start := least(think_max, greatest(0, think_start));
  tok_start := least(tok_max, greatest(0, tok_start));

  insert into public.subscription_usages (
    user_id,
    used_tokens,
    used_images,
    used_files,
    image_credit_balance,
    thinking_credit_balance,
    token_balance,
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
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id) do update
  set
    image_credit_balance = img_start,
    thinking_credit_balance = think_start,
    token_balance = tok_start,
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
    v_tok_max := 3000000;
  else
    select
      sp.max_images,
      sp.max_tokens,
      coalesce(sp.web_search_daily_grant, 0),
      greatest(1, coalesce(sp.image_credit_max, 60)),
      coalesce(sp.thinking_daily_grant, 0),
      greatest(0, coalesce(sp.thinking_credit_max, 10)),
      greatest(0, coalesce(sp.instant_token_balance_max, 3000000))
    into m, daily_tokens, ws_daily, img_max, think_daily, think_max, v_tok_max
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
