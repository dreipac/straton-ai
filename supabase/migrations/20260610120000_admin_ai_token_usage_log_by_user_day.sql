-- Admin-Protokoll: alle KI-Aufrufe eines Nutzers an einem UTC-Tag.

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
    (t.input_tokens + coalesce(t.cached_input_tokens, 0))::bigint as gross_input_tokens,
    coalesce(t.cached_input_tokens, 0)::bigint as cached_input_tokens,
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
  'Alle KI-Aufrufe eines Nutzers an einem UTC-Tag (neueste zuerst, max. 20000).';

grant execute on function public.list_admin_ai_token_usage_log_for_user_day(uuid, date, integer) to authenticated;
