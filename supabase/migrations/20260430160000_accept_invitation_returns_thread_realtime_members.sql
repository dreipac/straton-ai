-- accept_chat_invitation gibt thread_id zurück (Client kann Chat direkt öffnen).
-- Realtime: Mitgliedszeilen, damit Owner/Teilnehmer UI ohne Reload aktualisieren kann.

drop function if exists public.accept_chat_invitation(uuid);

create or replace function public.accept_chat_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.chat_thread_invitations%rowtype;
begin
  select * into r
  from public.chat_thread_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;
  if r.invitee_user_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.chat_thread_members (thread_id, user_id, role)
  values (r.thread_id, auth.uid(), 'member')
  on conflict (thread_id, user_id) do nothing;

  update public.chat_thread_invitations
  set status = 'accepted'
  where id = p_invitation_id;

  return r.thread_id;
end;
$$;

grant execute on function public.accept_chat_invitation(uuid) to authenticated;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_thread_members;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$pub$;
