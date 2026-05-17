-- Admin-Protokoll: fest die neuesten 500 KI-Aufrufe (global).

create or replace function public.list_admin_ai_token_usage_log(p_limit integer default 500)
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

  lim := least(greatest(coalesce(p_limit, 500), 1), 500);

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

comment on function public.list_admin_ai_token_usage_log(integer) is
  'Neueste KI-Aufrufe aus ai_token_usage fuer Admin (max. 500 Zeilen, neueste zuerst).';

grant execute on function public.list_admin_ai_token_usage_log(integer) to authenticated;
