-- Fix: Admin-Tokenansicht muss alle geloggten Nutzer zeigen, auch ohne profiles-Zeile.
-- Bisherige Funktionen nutzten `profiles` als Primärquelle und blendeten dadurch Einträge aus.

create or replace function public.list_admin_ai_token_usage_summary()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
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
    sum(t.input_tokens)::bigint as input_tokens,
    sum(t.output_tokens)::bigint as output_tokens
  from public.ai_token_usage t
  left join public.profiles pr on pr.id = t.user_id
  left join auth.users u on u.id = t.user_id
  group by t.user_id, u.email, pr.first_name, pr.last_name, t.provider, t.model
  order by u.email nulls last, t.provider, t.model;
end;
$$;

create or replace function public.list_admin_user_last_ai_usage()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  mode text,
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
