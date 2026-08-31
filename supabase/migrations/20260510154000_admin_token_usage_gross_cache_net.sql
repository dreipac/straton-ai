-- Admin Token-Ansicht: brutto/cache/netto Input-Tokens sichtbar machen.

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
    sum((t.input_tokens + coalesce(t.cached_input_tokens, 0))::bigint)::bigint as gross_input_tokens,
    sum(coalesce(t.cached_input_tokens, 0)::bigint)::bigint as cached_input_tokens,
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
    (t.input_tokens + coalesce(t.cached_input_tokens, 0))::integer as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::integer as cached_input_tokens,
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
    (t.input_tokens + coalesce(t.cached_input_tokens, 0))::bigint as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::bigint as cached_input_tokens,
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
