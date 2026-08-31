create or replace function public.guard_superadmin_flag_on_profiles()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  actor_is_superadmin boolean;
begin
  -- service role may always write the flag
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_superadmin = true then
      select p.is_superadmin
      into actor_is_superadmin
      from public.profiles p
      where p.id = auth.uid();

      if coalesce(actor_is_superadmin, false) = false then
        raise exception 'Nur Superadmins duerfen is_superadmin setzen.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_superadmin is distinct from old.is_superadmin then
      select p.is_superadmin
      into actor_is_superadmin
      from public.profiles p
      where p.id = auth.uid();

      if coalesce(actor_is_superadmin, false) = false then
        raise exception 'Nur Superadmins duerfen is_superadmin aendern.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_is_superadmin_on_profiles on public.profiles;
create trigger guard_is_superadmin_on_profiles
before insert or update on public.profiles
for each row
execute function public.guard_superadmin_flag_on_profiles();
