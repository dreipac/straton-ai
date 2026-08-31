alter table public.profiles
add column if not exists is_superadmin boolean not null default false;

create or replace function public.prevent_non_superadmin_toggle()
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

  -- for regular users, block changes to is_superadmin unless caller is already superadmin
  if new.is_superadmin is distinct from old.is_superadmin then
    select p.is_superadmin
    into actor_is_superadmin
    from public.profiles p
    where p.id = auth.uid();

    if coalesce(actor_is_superadmin, false) = false then
      raise exception 'Nur Superadmins duerfen is_superadmin aendern.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_is_superadmin_on_profiles on public.profiles;
create trigger guard_is_superadmin_on_profiles
before update on public.profiles
for each row
execute function public.prevent_non_superadmin_toggle();
