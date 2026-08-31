-- Credits-System Schritt 4/5: täglicher Reset/Carryover und Abo-Zuweisung auf den neuen
-- ai_credits-Pool umstellen. token_balance/thinking_credit_balance/used_tokens/used_thinking_requests
-- werden ab hier nicht mehr aktiv gepflegt (Spalten bleiben zu Referenzzwecken bestehen, siehe
-- credits-system-plan.md 2.3/2.5) — Bilder und Websuche bleiben unverändert eigene Pools.

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
  ws_start integer;
  ws_max integer;
  ai_start integer;
  ai_max integer;
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
    coalesce(sp.web_search_start_balance, 0),
    greatest(0, coalesce(sp.web_search_credit_max, 50)),
    coalesce(sp.ai_credits_start_balance, 0),
    greatest(0, coalesce(sp.ai_credits_balance_max, 0))
  into img_start, img_max, ws_start, ws_max, ai_start, ai_max
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  img_start := least(img_max, greatest(0, img_start));
  ws_start := least(ws_max, greatest(0, ws_start));
  ai_start := least(ai_max, greatest(0, ai_start));

  insert into public.subscription_usages (
    user_id,
    used_tokens,
    used_images,
    used_files,
    image_credit_balance,
    web_search_credit_balance,
    used_ai_credits_today,
    ai_credits_balance,
    last_reset_date,
    updated_at
  )
  values (
    p_user_id,
    0,
    0,
    0,
    img_start,
    ws_start,
    0,
    ai_start,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id) do update
  set
    image_credit_balance = img_start,
    web_search_credit_balance = ws_start,
    used_ai_credits_today = 0,
    ai_credits_balance = ai_start,
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
  pid uuid;
  su_exists boolean;
  img_daily_grant integer;
  img_credit_max integer;
  ws_daily integer;
  ws_max integer;
  ai_daily integer;
  ai_max integer;
  v_used bigint;
  v_old_bal bigint;
  v_allow bigint;
  v_unused bigint;
  v_new_bal bigint;
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
    img_daily_grant := null;
    img_credit_max := 60;
    ws_daily := 0;
    ws_max := 50;
    ai_daily := public.no_plan_ai_credits_daily_grant();
    ai_max := public.no_plan_ai_credits_daily_grant();
  else
    select
      sp.max_images,
      greatest(1, coalesce(sp.image_credit_max, 60)),
      coalesce(sp.web_search_daily_grant, 0),
      greatest(0, coalesce(sp.web_search_credit_max, 50)),
      sp.ai_credits_daily_grant,
      greatest(0, coalesce(sp.ai_credits_balance_max, 0))
    into img_daily_grant, img_credit_max, ws_daily, ws_max, ai_daily, ai_max
    from public.subscription_plans sp
    where sp.id = pid;
  end if;

  select coalesce(su.used_ai_credits_today, 0), coalesce(su.ai_credits_balance, 0)
  into v_used, v_old_bal
  from public.subscription_usages su
  where su.user_id = p_user_id;

  if ai_daily is null then
    -- Unbegrenztes KI-Credits-Kontingent: Balance unverändert, nur Tageszähler zurücksetzen.
    v_new_bal := v_old_bal;
  else
    v_allow := v_old_bal + ai_daily::bigint;
    v_unused := greatest(0, v_allow - v_used);
    v_new_bal := least(ai_max::bigint, v_unused);
  end if;

  update public.subscription_usages su
  set
    used_images = 0,
    used_files = 0,
    used_chats = 0,
    used_web_searches = 0,
    used_ai_credits_today = 0,
    ai_credits_balance = v_new_bal,
    image_credit_balance = case
      when img_daily_grant is null then su.image_credit_balance
      else least(img_credit_max, coalesce(su.image_credit_balance, 0) + img_daily_grant)
    end,
    web_search_credit_balance = least(
      ws_max,
      coalesce(su.web_search_credit_balance, 0) + coalesce(ws_daily, 0)
    ),
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where su.user_id = p_user_id
    and su.last_reset_date < (now() at time zone 'utc')::date;
end;
$$;

grant execute on function public.subscription_usage_reset_if_new_day(uuid) to authenticated, service_role;
