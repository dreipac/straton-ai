-- Eingeladene Nutzer dürfen Vor-/Nachname des Einladenden lesen, wenn eine ausstehende Chat-Einladung besteht (Toast, Einstellungen).

drop policy if exists "profiles_select_chat_inviter_pending_invitee" on public.profiles;

create policy "profiles_select_chat_inviter_pending_invitee"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_thread_invitations i
    where i.invitee_user_id = (select auth.uid())
      and i.inviter_id = profiles.id
      and i.status = 'pending'
  )
);
