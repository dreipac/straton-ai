-- Credits-System Schritt 3/5: Durchsetzung. Ersetzt das bisherige Muster "vor dem Insert eine
-- Zeichen-Schätzung gegen max_tokens/token_balance prüfen, danach used_tokens erhöhen" durch:
--   1) check_ai_credits_available(): Vorab-Veto (konservative Worst-Case-Schätzung) VOR dem KI-Aufruf,
--      aufgerufen aus der Edge Function chat-completion, bevor sie den Provider aufruft.
--   2) charge_ai_credits_usage(): einmalige, autoritative Belastung NACH der echten KI-Antwort, anhand
--      der tatsächlichen usage.input_tokens/output_tokens — kein Delta/Reconciliation nötig, weil vorher
--      nichts vorläufig gebucht wurde (siehe credits-system-plan.md 2.3, Vereinfachung gegenüber dem
--      ursprünglichen "Reservierung dann Korrektur"-Entwurf: weniger Fehlerfläche, kein Trust-Problem
--      mit clientseitig übermittelten Beträgen).
-- Bekannter, bewusst akzeptierter Trade-off: zwischen Vorab-Veto und echtem KI-Aufruf liegt ein kurzes
-- Zeitfenster ohne Reservierungssperre (kein Hard-Lock wie bei einer Kreditkarten-Autorisierung) — bei
-- diesem Nutzungsvolumen kein relevantes Risiko, aber hier dokumentiert.

create or replace function public.no_plan_ai_credits_daily_grant()
returns integer
language sql
immutable
as $$
  select 5;
$$;

comment on function public.no_plan_ai_credits_daily_grant() is
  'KI-Credits/Tag für Nutzer ohne zugewiesenes Abo — bewusst minimal (Pendant zum bisherigen 100-Token-Fallback), soll Admin-Zuweisung erzwingen, nicht nutzbaren Umfang bieten.';

create or replace function public.check_ai_credits_available(
  p_user_id uuid,
  p_estimated_credits integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_ok boolean;
  actor_is_superadmin boolean;
  plan_id uuid;
  daily_grant integer;
  balance integer;
  used_today integer;
begin
  caller_ok := auth.role() = 'service_role' or auth.uid() = p_user_id;
  if not caller_ok then
    raise exception 'Unauthorized ai credits check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles
  where id = p_user_id;

  if actor_is_superadmin then
    return true;
  end if;

  perform public.subscription_usage_reset_if_new_day(p_user_id);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = p_user_id;

  if plan_id is null then
    daily_grant := public.no_plan_ai_credits_daily_grant();
  else
    select sp.ai_credits_daily_grant into daily_grant
    from public.subscription_plans sp
    where sp.id = plan_id;
  end if;

  if daily_grant is null then
    return true;
  end if;

  select coalesce(su.used_ai_credits_today, 0), coalesce(su.ai_credits_balance, 0)
  into used_today, balance
  from public.subscription_usages su
  where su.user_id = p_user_id;

  used_today := coalesce(used_today, 0);
  balance := coalesce(balance, 0);

  return (used_today::bigint + greatest(0, coalesce(p_estimated_credits, 0))::bigint)
    <= (balance::bigint + daily_grant::bigint);
end;
$$;

comment on function public.check_ai_credits_available(uuid, integer) is
  'Vorab-Veto vor dem KI-Aufruf: prüft, ob eine konservativ geschätzte Anfrage noch ins Tagesbudget passt. Bucht nichts, reiner Read-Check.';

grant execute on function public.check_ai_credits_available(uuid, integer) to authenticated, service_role;

-- Bequemlichkeits-Wrapper für den Edge-Function-Aufrufer: schätzt die Vorab-Reservierung aus rohem
-- Anfrage-Text (Worst-Case-Tarif) und prüft in einem Aufruf statt zwei Roundtrips.
create or replace function public.check_ai_credits_available_for_content(
  p_user_id uuid,
  p_content text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.check_ai_credits_available(
    p_user_id,
    public.estimate_reservation_credits(p_content)
  );
$$;

comment on function public.check_ai_credits_available_for_content(uuid, text) is
  'Wrapper: estimate_reservation_credits(content) + check_ai_credits_available in einem Aufruf.';

grant execute on function public.check_ai_credits_available_for_content(uuid, text) to authenticated, service_role;

create or replace function public.charge_ai_credits_usage(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  credits_charged integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Unauthorized ai credits charge.';
  end if;

  perform public.subscription_usage_reset_if_new_day(p_user_id);

  credits_charged := public.estimate_ai_credits(p_provider, p_model, p_input_tokens, p_output_tokens);

  insert into public.subscription_usages (user_id, used_ai_credits_today, last_reset_date, updated_at)
  values (p_user_id, credits_charged, (now() at time zone 'utc')::date, now())
  on conflict (user_id) do update
  set
    used_ai_credits_today = public.subscription_usages.used_ai_credits_today + credits_charged,
    updated_at = now();

  return credits_charged;
end;
$$;

comment on function public.charge_ai_credits_usage(uuid, text, text, integer, integer) is
  'Einmalige, autoritative KI-Credits-Belastung nach der echten KI-Antwort (Provider/Modell/echte Token-Zahlen). Nur service_role (Edge Function).';

grant execute on function public.charge_ai_credits_usage(uuid, text, text, integer, integer) to service_role;

-- Alte Trigger-Funktionen: Zeichen-basierte Token-Prüfung/-Buchung entfernen, restliche Aufgaben
-- (Autorisierung, subscription_usages-Zeile sicherstellen) bleiben unverändert bestehen.

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
  is_participant boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_uid := auth.uid();
  if actor_uid is null then
    raise exception 'Unauthorized chat message insert.';
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
    raise exception 'Unauthorized chat message insert.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles
  where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  -- KI-Credits-Budget wird nicht mehr hier geprüft (Zeichen-Schätzung vor dem Insert) — siehe
  -- check_ai_credits_available(), aufgerufen aus chat-completion VOR dem eigentlichen KI-Aufruf.
  -- Diese Funktion bleibt ausschließlich für die Autorisierungsprüfung (Thread-Mitgliedschaft) zuständig.
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

  -- Chat-/Denk-Kosten werden nicht mehr hier gezählt (Zeichen-Schätzung) — siehe
  -- charge_ai_credits_usage(), aufgerufen aus chat-completion nach der echten KI-Antwort.
  -- Diese Funktion stellt weiterhin nur sicher, dass jeder Nutzer beim ersten Chat eine
  -- subscription_usages-Zeile bekommt (inkl. Bild-Guthaben-Start), falls admin_set_user_subscription_plan
  -- für ihn noch nie lief (z. B. Nutzer ohne zugewiesenes Abo).
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
    0,
    0,
    0,
    initial_balance,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
