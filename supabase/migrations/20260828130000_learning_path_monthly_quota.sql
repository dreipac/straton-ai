-- Lernpfade: eigenes monatliches Kontingent pro Abo statt Kopplung an das taegliche KI-Credits-
-- Guthaben des Hauptchats. Erzeugen eines NEUEN Lernpfads verbraucht 1 vom Monatskontingent;
-- alles INNERHALB eines bestehenden Lernpfads (Kapitel, Fragen, Sitzungen) ist davon unberuehrt --
-- die zugehoerigen KI-Modi sind bereits ueber AI_CREDITS_EXCLUDED_MODES vom taeglichen
-- Chat-Guthaben ausgenommen (siehe chat-completion Edge Function).

alter table public.subscription_plans
  add column if not exists learning_paths_monthly_limit integer;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_learning_paths_monthly_limit_check;

alter table public.subscription_plans
  add constraint subscription_plans_learning_paths_monthly_limit_check
  check (learning_paths_monthly_limit is null or learning_paths_monthly_limit >= 0);

comment on column public.subscription_plans.learning_paths_monthly_limit is
  'Max. neu erzeugte Lernpfade pro Kalendermonat (UTC). NULL = unbegrenzt.';

alter table public.subscription_usages
  add column if not exists used_learning_paths_this_month integer not null default 0;

alter table public.subscription_usages
  add column if not exists learning_paths_usage_month date;

comment on column public.subscription_usages.used_learning_paths_this_month is
  'Anzahl neu erzeugter Lernpfade im Monat aus learning_paths_usage_month (UTC). Lazy reset bei Monatswechsel.';

comment on column public.subscription_usages.learning_paths_usage_month is
  'Monatserster (UTC) des Monats, fuer den used_learning_paths_this_month zaehlt.';

-- Kein Plan zugewiesen: konservativer Fallback (Pendant zu no_plan_ai_credits_daily_grant()).
create or replace function public.no_plan_learning_paths_monthly_limit()
returns integer
language sql
immutable
as $$
  select 1;
$$;

comment on function public.no_plan_learning_paths_monthly_limit() is
  'Lernpfade/Monat fuer Nutzer ohne zugewiesenes Abo -- bewusst minimal, soll Admin-Zuweisung erzwingen.';

create or replace function public.subscription_learning_paths_reset_if_new_month(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now() at time zone 'utc')::date;
  stored_month date;
  su_exists boolean;
begin
  select exists(select 1 from public.subscription_usages su where su.user_id = p_user_id)
  into su_exists;

  if not su_exists then
    return;
  end if;

  select learning_paths_usage_month into stored_month
  from public.subscription_usages
  where user_id = p_user_id;

  if stored_month is not distinct from current_month then
    return;
  end if;

  update public.subscription_usages
  set used_learning_paths_this_month = 0,
      learning_paths_usage_month = current_month
  where user_id = p_user_id;
end;
$$;

grant execute on function public.subscription_learning_paths_reset_if_new_month(uuid) to authenticated, service_role;

-- Vorab-Pruefung: darf p_user_id jetzt einen NEUEN Lernpfad erzeugen? Superadmins immer ja,
-- reiner Read-Check (bucht nichts) -- analog zu check_ai_credits_available.
create or replace function public.check_learning_path_creation_allowed(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_ok boolean;
  actor_is_superadmin boolean;
  plan_id uuid;
  monthly_limit integer;
  used_this_month integer;
begin
  caller_ok := auth.role() = 'service_role' or auth.uid() = p_user_id;
  if not caller_ok then
    raise exception 'Unauthorized learning path quota check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles
  where id = p_user_id;

  if actor_is_superadmin then
    return true;
  end if;

  perform public.subscription_learning_paths_reset_if_new_month(p_user_id);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = p_user_id;

  if plan_id is null then
    monthly_limit := public.no_plan_learning_paths_monthly_limit();
  else
    select sp.learning_paths_monthly_limit into monthly_limit
    from public.subscription_plans sp
    where sp.id = plan_id;
  end if;

  if monthly_limit is null then
    return true;
  end if;

  select coalesce(su.used_learning_paths_this_month, 0) into used_this_month
  from public.subscription_usages su
  where su.user_id = p_user_id;

  return coalesce(used_this_month, 0) < monthly_limit;
end;
$$;

comment on function public.check_learning_path_creation_allowed(uuid) is
  'Vorab-Veto vor dem Erzeugen eines neuen Lernpfads: prueft das monatliche Lernpfad-Kontingent des Abos.';

grant execute on function public.check_learning_path_creation_allowed(uuid) to authenticated, service_role;

-- Autoritative Buchung: EIN neuer Lernpfad wurde erzeugt. Client ruft das direkt nach
-- erfolgreichem Anlegen (siehe createLearningPathByUserId in learn.persistence.ts).
create or replace function public.charge_learning_path_creation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized learning path charge.';
  end if;

  perform public.subscription_learning_paths_reset_if_new_month(p_user_id);

  insert into public.subscription_usages (
    user_id, used_learning_paths_this_month, learning_paths_usage_month, updated_at
  )
  values (
    p_user_id, 1, date_trunc('month', now() at time zone 'utc')::date, now()
  )
  on conflict (user_id) do update
  set
    used_learning_paths_this_month = public.subscription_usages.used_learning_paths_this_month + 1,
    learning_paths_usage_month = date_trunc('month', now() at time zone 'utc')::date,
    updated_at = now();
end;
$$;

comment on function public.charge_learning_path_creation(uuid) is
  'Bucht die Erzeugung eines neuen Lernpfads gegen das monatliche Kontingent.';

grant execute on function public.charge_learning_path_creation(uuid) to authenticated;
