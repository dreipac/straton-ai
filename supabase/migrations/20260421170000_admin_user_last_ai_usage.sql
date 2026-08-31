-- Superadmin: letzte echte ai_token_usage-Zeile pro Nutzer (Modell-String wie von der API geloggt).

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
    p.id as user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    t.provider,
    t.model,
    t.mode,
    t.input_tokens,
    t.output_tokens,
    t.created_at as last_used_at
  from public.ai_token_usage t
  inner join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = p.id
  order by t.user_id, t.created_at desc;
end;
$$;

comment on function public.list_admin_user_last_ai_usage() is 'Neuester ai_token_usage-Eintrag pro Nutzer (exakter model-Text aus der API).';

grant execute on function public.list_admin_user_last_ai_usage() to authenticated;
