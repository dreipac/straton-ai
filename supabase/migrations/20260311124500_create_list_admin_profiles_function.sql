create or replace function public.list_admin_profiles()
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  is_superadmin boolean,
  created_at timestamptz
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
    raise exception 'Nur Superadmins duerfen Nutzerlisten abrufen.';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.is_superadmin,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

grant execute on function public.list_admin_profiles() to authenticated;
