create table if not exists public.subscription_plan_showcase_slots (
  slot_index integer primary key,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint subscription_plan_showcase_slots_slot_check check (slot_index between 1 and 3)
);

comment on table public.subscription_plan_showcase_slots is
  'Steuert, welche drei Abo-Modelle in den Einstellungen fuer Nutzer sichtbar sind.';

insert into public.subscription_plan_showcase_slots (slot_index)
values (1), (2), (3)
on conflict (slot_index) do nothing;

create or replace function public.touch_subscription_plan_showcase_slots()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists touch_subscription_plan_showcase_slots_trigger on public.subscription_plan_showcase_slots;
create trigger touch_subscription_plan_showcase_slots_trigger
before update on public.subscription_plan_showcase_slots
for each row
execute function public.touch_subscription_plan_showcase_slots();

alter table public.subscription_plan_showcase_slots enable row level security;

drop policy if exists "subscription_plan_showcase_slots_select_authenticated" on public.subscription_plan_showcase_slots;
create policy "subscription_plan_showcase_slots_select_authenticated"
  on public.subscription_plan_showcase_slots
  for select
  to authenticated
  using (true);

drop policy if exists "subscription_plan_showcase_slots_update_superadmin" on public.subscription_plan_showcase_slots;
create policy "subscription_plan_showcase_slots_update_superadmin"
  on public.subscription_plan_showcase_slots
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
