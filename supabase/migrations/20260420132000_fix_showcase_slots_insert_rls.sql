-- Fix: Superadmins duerfen Showcase-Slots auch per INSERT (upsert) schreiben.

insert into public.subscription_plan_showcase_slots (slot_index)
values (1), (2), (3)
on conflict (slot_index) do nothing;

drop policy if exists "subscription_plan_showcase_slots_insert_superadmin" on public.subscription_plan_showcase_slots;
create policy "subscription_plan_showcase_slots_insert_superadmin"
  on public.subscription_plan_showcase_slots
  for insert
  to authenticated
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );
