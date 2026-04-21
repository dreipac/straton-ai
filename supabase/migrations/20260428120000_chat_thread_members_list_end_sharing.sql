-- Öffentliche Mitgliederliste für gemeinsame Chats (Profilfelder für UI-Avatare)
-- sowie Owner-RPC zum Beenden der Freigabe (Mitglied-Zeilen + ausstehende Einladungen).

create or replace function public.list_chat_thread_members_public(p_thread_id uuid)
returns table (
  user_id uuid,
  role text,
  first_name text,
  last_name text,
  avatar_url text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_thread_members(p_thread_id) then
    return;
  end if;

  return query
  select
    m.user_id,
    m.role,
    p.first_name,
    p.last_name,
    p.avatar_url,
    m.joined_at
  from public.chat_thread_members m
  left join public.profiles p on p.id = m.user_id
  where m.thread_id = p_thread_id
  order by
    case when m.role = 'owner' then 0 else 1 end,
    m.joined_at asc;
end;
$$;

grant execute on function public.list_chat_thread_members_public(uuid) to authenticated;

create or replace function public.end_chat_thread_sharing(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select t.user_id into v_owner from public.chat_threads t where t.id = p_thread_id;
  if v_owner is null then
    raise exception 'THREAD_NOT_FOUND';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.chat_thread_members
  where thread_id = p_thread_id and role = 'member';

  update public.chat_thread_invitations
  set status = 'declined'
  where thread_id = p_thread_id and status = 'pending';
end;
$$;

grant execute on function public.end_chat_thread_sharing(uuid) to authenticated;
