create table if not exists public.subscription_assignment_drafts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  subscription_plan_id uuid references public.subscription_plans (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id)
);

comment on table public.subscription_assignment_drafts is
  'Zwischengespeicherte Abo-Zuweisungen, die erst nach Admin-Deployment live gehen.';

create or replace function public.touch_subscription_assignment_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists touch_subscription_assignment_drafts_trigger on public.subscription_assignment_drafts;
create trigger touch_subscription_assignment_drafts_trigger
before insert or update on public.subscription_assignment_drafts
for each row
execute function public.touch_subscription_assignment_drafts_updated_at();

alter table public.subscription_assignment_drafts enable row level security;

create policy "subscription_assignment_drafts_select_superadmin"
  on public.subscription_assignment_drafts
  for select
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "subscription_assignment_drafts_insert_superadmin"
  on public.subscription_assignment_drafts
  for insert
  to authenticated
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "subscription_assignment_drafts_update_superadmin"
  on public.subscription_assignment_drafts
  for update
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "subscription_assignment_drafts_delete_superadmin"
  on public.subscription_assignment_drafts
  for delete
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create or replace function public.admin_deploy_subscription_assignment_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  affected_rows integer := 0;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen Abo-Entwuerfe deployen.';
  end if;

  update public.profiles p
  set subscription_plan_id = d.subscription_plan_id
  from public.subscription_assignment_drafts d
  where p.id = d.user_id;

  get diagnostics affected_rows = row_count;

  delete from public.subscription_assignment_drafts;

  return coalesce(affected_rows, 0);
end;
$$;

grant execute on function public.admin_deploy_subscription_assignment_drafts() to authenticated;
