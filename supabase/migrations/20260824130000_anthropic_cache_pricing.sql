-- Anthropic Prompt-Caching real bepreisen statt implizit als kostenlos zu behandeln.
--
-- Befund (straton-caching-fix-plan.md, Befund 3/4 Nachtrag): `estimate_ai_cost_usd` kannte bislang
-- nur einen einzigen Input-Tarif. Für OpenAI ist `input_tokens` in der API-Antwort der GESAMTWERT
-- inklusive gecachter Tokens — "gross minus cached = billable" war dort korrekt. Für Anthropic ist
-- `input_tokens` bereits NETTO (schliesst cache_read_input_tokens und cache_creation_input_tokens
-- explizit aus, siehe Anthropic-Doku), wurde in der Edge Function aber trotzdem nochmals um die
-- gecachten Tokens reduziert — ein Cache-Read wurde dadurch fälschlich mit 0 statt mit 0.1x des
-- Preises verrechnet, ein Cache-Write (teurer als ein normaler Token, 2x bei der jetzt genutzten
-- 1h-ttl) gar nicht erst erfasst. Betraf sowohl die Kostenschätzung als auch die tatsächlich an
-- Nutzer verrechneten Credits.

alter table public.ai_token_usage
  add column if not exists cache_write_input_tokens bigint not null default 0;

comment on column public.ai_token_usage.cache_write_input_tokens is
  'Nur Anthropic: neu in den Cache geschriebene Tokens dieser Anfrage (cache_creation_input_tokens) — teurer als ein normaler Input-Token, siehe estimate_ai_cost_usd.';

-- estimate_ai_cost_usd: zwei neue optionale Parameter, Default 0 (bestehende Aufrufe unverändert).
drop function if exists public.estimate_ai_cost_usd(text, text, integer, integer);

create or replace function public.estimate_ai_cost_usd(
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer default 0,
  p_cache_write_tokens integer default 0
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select
        (greatest(0, p_input_tokens) / 1000000.0) * r.input_usd_per_million
        + (greatest(0, p_cache_read_tokens) / 1000000.0) * r.input_usd_per_million * 0.1
        + (greatest(0, p_cache_write_tokens) / 1000000.0) * r.input_usd_per_million * 2.0
        + (greatest(0, p_output_tokens) / 1000000.0) * r.output_usd_per_million
      from public.ai_model_rates(p_provider, p_model) r
    ),
    0
  );
$$;

comment on function public.estimate_ai_cost_usd(text, text, integer, integer, integer, integer) is
  'Geschätzte USD-Kosten. p_input_tokens zum vollen Tarif; p_cache_read_tokens zu 0.1x (Anthropic Cache-Treffer); p_cache_write_tokens zu 2x (Anthropic Cache-Neuanlage, 1h-ttl). Bei anderen Anbietern bleiben die beiden Cache-Parameter 0 — deren "gecachte" Tokens sind dort schon vor dem Aufruf aus p_input_tokens herausgerechnet.';

grant execute on function public.estimate_ai_cost_usd(text, text, integer, integer, integer, integer) to authenticated, service_role;

-- estimate_ai_credits: dieselben zwei Parameter durchreichen.
drop function if exists public.estimate_ai_credits(text, text, integer, integer);

create or replace function public.estimate_ai_credits(
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer default 0,
  p_cache_write_tokens integer default 0
)
returns integer
language sql
stable
set search_path = public
as $$
  select ceil(
    public.estimate_ai_cost_usd(p_provider, p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens)
    * public.credits_per_usd()
  )::integer;
$$;

comment on function public.estimate_ai_credits(text, text, integer, integer, integer, integer) is
  'estimate_ai_cost_usd(...) inkl. Anthropic-Cache-Tarife in Credits umgerechnet (aufgerundet).';

grant execute on function public.estimate_ai_credits(text, text, integer, integer, integer, integer) to authenticated, service_role;

-- charge_ai_credits_usage: dieselben zwei Parameter durchreichen, sonst unveraendert.
drop function if exists public.charge_ai_credits_usage(uuid, text, text, integer, integer);

create or replace function public.charge_ai_credits_usage(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer default 0,
  p_cache_write_tokens integer default 0
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

  credits_charged := public.estimate_ai_credits(
    p_provider, p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens
  );

  insert into public.subscription_usages (user_id, used_ai_credits_today, last_reset_date, updated_at)
  values (p_user_id, credits_charged, (now() at time zone 'utc')::date, now())
  on conflict (user_id) do update
  set
    used_ai_credits_today = public.subscription_usages.used_ai_credits_today + credits_charged,
    updated_at = now();

  return credits_charged;
end;
$$;

comment on function public.charge_ai_credits_usage(uuid, text, text, integer, integer, integer, integer) is
  'Einmalige, autoritative KI-Credits-Belastung nach der echten KI-Antwort, inkl. Anthropic Cache-Tarife. Nur service_role (Edge Function).';

grant execute on function public.charge_ai_credits_usage(uuid, text, text, integer, integer, integer, integer) to service_role;

-- Admin-Protokoll-Funktionen: cache_write_input_tokens mit ausgeben, gross_input_tokens korrigiert
-- (bisher input_tokens + cached_input_tokens — liess den Cache-Write-Anteil unter den Tisch fallen).

drop function if exists public.list_admin_ai_token_usage_summary();

create or replace function public.list_admin_ai_token_usage_summary()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  gross_input_tokens bigint,
  cached_input_tokens bigint,
  cache_write_input_tokens bigint,
  input_tokens bigint,
  output_tokens bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Statistiken abrufen.';
  end if;

  return query
  select
    t.user_id,
    u.email::text,
    pr.first_name,
    pr.last_name,
    t.provider,
    t.model,
    sum((t.input_tokens + coalesce(t.cached_input_tokens, 0) + coalesce(t.cache_write_input_tokens, 0))::bigint)::bigint as gross_input_tokens,
    sum(coalesce(t.cached_input_tokens, 0)::bigint)::bigint as cached_input_tokens,
    sum(coalesce(t.cache_write_input_tokens, 0)::bigint)::bigint as cache_write_input_tokens,
    sum(t.input_tokens::bigint)::bigint as input_tokens,
    sum(t.output_tokens::bigint)::bigint as output_tokens
  from public.ai_token_usage t
  left join public.profiles pr on pr.id = t.user_id
  left join auth.users u on u.id = t.user_id
  group by t.user_id, u.email, pr.first_name, pr.last_name, t.provider, t.model
  order by u.email nulls last, t.provider, t.model;
end;
$$;

grant execute on function public.list_admin_ai_token_usage_summary() to authenticated;

drop function if exists public.list_admin_user_last_ai_usage();

create or replace function public.list_admin_user_last_ai_usage()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  mode text,
  gross_input_tokens integer,
  cached_input_tokens integer,
  cache_write_input_tokens integer,
  input_tokens integer,
  output_tokens integer,
  last_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Statistiken abrufen.';
  end if;

  return query
  select distinct on (t.user_id)
    t.user_id,
    u.email::text,
    pr.first_name,
    pr.last_name,
    t.provider,
    t.model,
    t.mode,
    (t.input_tokens + coalesce(t.cached_input_tokens, 0) + coalesce(t.cache_write_input_tokens, 0))::integer as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::integer as cached_input_tokens,
    coalesce(t.cache_write_input_tokens, 0)::integer as cache_write_input_tokens,
    t.input_tokens,
    t.output_tokens,
    t.created_at as last_used_at
  from public.ai_token_usage t
  left join public.profiles pr on pr.id = t.user_id
  left join auth.users u on u.id = t.user_id
  where t.mode <> 'generate_title'
  order by t.user_id, t.created_at desc;
end;
$$;

grant execute on function public.list_admin_user_last_ai_usage() to authenticated;

drop function if exists public.list_admin_ai_token_usage_log(integer);

create or replace function public.list_admin_ai_token_usage_log(p_limit integer default 8000)
returns table (
  id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  mode text,
  gross_input_tokens bigint,
  cached_input_tokens bigint,
  cache_write_input_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  lim integer;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Protokolle abrufen.';
  end if;

  lim := least(greatest(coalesce(p_limit, 8000), 1), 20000);

  return query
  select
    t.id,
    t.user_id,
    u.email::text,
    pr.first_name,
    pr.last_name,
    t.provider,
    t.model,
    t.mode,
    (t.input_tokens + coalesce(t.cached_input_tokens, 0) + coalesce(t.cache_write_input_tokens, 0))::bigint as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::bigint as cached_input_tokens,
    coalesce(t.cache_write_input_tokens, 0)::bigint as cache_write_input_tokens,
    t.input_tokens::bigint,
    t.output_tokens::bigint,
    t.estimated_cost_usd,
    t.created_at
  from public.ai_token_usage t
  left join public.profiles pr on pr.id = t.user_id
  left join auth.users u on u.id = t.user_id
  order by t.created_at desc
  limit lim;
end;
$$;

grant execute on function public.list_admin_ai_token_usage_log(integer) to authenticated;

drop function if exists public.list_admin_ai_token_usage_log_for_user_day(uuid, date, integer);

create or replace function public.list_admin_ai_token_usage_log_for_user_day(
  p_user_id uuid,
  p_day date,
  p_limit integer default 10000
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  mode text,
  gross_input_tokens bigint,
  cached_input_tokens bigint,
  cache_write_input_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  lim integer;
begin
  if p_user_id is null then
    raise exception 'Nutzer-ID fehlt.';
  end if;

  if p_day is null then
    raise exception 'Tag fehlt.';
  end if;

  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Protokolle abrufen.';
  end if;

  lim := least(greatest(coalesce(p_limit, 10000), 1), 20000);

  return query
  select
    t.id,
    t.user_id,
    u.email::text,
    pr.first_name,
    pr.last_name,
    t.provider,
    t.model,
    t.mode,
    (t.input_tokens + coalesce(t.cached_input_tokens, 0) + coalesce(t.cache_write_input_tokens, 0))::bigint as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::bigint as cached_input_tokens,
    coalesce(t.cache_write_input_tokens, 0)::bigint as cache_write_input_tokens,
    t.input_tokens::bigint,
    t.output_tokens::bigint,
    t.estimated_cost_usd,
    t.created_at
  from public.ai_token_usage t
  left join public.profiles pr on pr.id = t.user_id
  left join auth.users u on u.id = t.user_id
  where t.user_id = p_user_id
    and timezone('UTC', t.created_at)::date = p_day
  order by t.created_at desc
  limit lim;
end;
$$;

comment on function public.list_admin_ai_token_usage_log_for_user_day(uuid, date, integer) is
  'Alle KI-Aufrufe eines Nutzers an einem UTC-Tag (neueste zuerst, max. 20000), inkl. Anthropic Cache-Write-Anteil.';

grant execute on function public.list_admin_ai_token_usage_log_for_user_day(uuid, date, integer) to authenticated;
