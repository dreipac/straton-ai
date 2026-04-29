-- Superadmin: Einzelprotokoll je KI-Aufruf (fuer Admin «KI-Tokens» Aufklapp-Ansicht)

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
  'Neueste KI-Aufrufe aus ai_token_usage fuer Admin-Ansicht (max. 20000 Zeilen).';

grant execute on function public.list_admin_ai_token_usage_log(integer) to authenticated;
