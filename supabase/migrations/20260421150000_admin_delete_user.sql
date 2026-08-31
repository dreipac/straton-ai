-- Superadmin: Nutzer inkl. Auth-Konto und abhaengige Daten loeschen (FK CASCADE ab auth.users)

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_is_superadmin boolean;
  superadmin_count int;
begin
  if p_user_id = auth.uid() then
    raise exception 'Eigenes Konto kann nicht geloescht werden.';
  end if;

  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if caller_is_superadmin = false then
    raise exception 'Nur Superadmins duerfen Nutzer loeschen.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Nutzer nicht gefunden.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and is_superadmin) then
    select count(*)::int
    into superadmin_count
    from public.profiles
    where is_superadmin = true;

    if superadmin_count <= 1 then
      raise exception 'Der letzte Superadmin kann nicht geloescht werden.';
    end if;
  end if;

  -- updated_by zeigt auf profiles(id); vor Loeschen auf ausfuehrenden Admin umhaengen
  update public.subscription_assignment_drafts
  set updated_by = auth.uid()
  where updated_by = p_user_id;

  update public.subscription_plan_showcase_slots
  set updated_by = auth.uid()
  where updated_by = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
