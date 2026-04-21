-- Mitgliedszeilen müssen beim Löschen eines Threads per FK-CASCADE entfernt werden.
-- Ohne DELETE-Policy auf chat_thread_members schlagen diese CASCADE-Deletes an RLS fehl
-- → Löschen von chat_threads scheitert (betrifft u. a. eingeladene Nutzer mit persönlichen Chats).

drop policy if exists "chat_thread_members_delete" on public.chat_thread_members;

create policy "chat_thread_members_delete"
on public.chat_thread_members
for delete
to authenticated
using (
  -- eigene Mitgliedschaft entfernen (z. B. später «Chat verlassen»)
  user_id = auth.uid()
  or exists (
    select 1
    from public.chat_threads t
    where t.id = chat_thread_members.thread_id
      and t.user_id = auth.uid()
  )
);
