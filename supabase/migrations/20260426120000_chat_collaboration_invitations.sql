-- Gemeinsame Chats: Mitgliedschaft, Einladungen, erweiterte RLS, RPCs

-- ---------------------------------------------------------------------------
-- 1) Mitgliedschaft (Owner ist immer auch als Zeile vorhanden)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_thread_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists idx_chat_thread_members_user_id
  on public.chat_thread_members (user_id);

insert into public.chat_thread_members (thread_id, user_id, role)
select id, user_id, 'owner'::text
from public.chat_threads
on conflict do nothing;

create or replace function public.ensure_chat_thread_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_thread_members (thread_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (thread_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_chat_thread_owner_membership_trigger on public.chat_threads;
create trigger ensure_chat_thread_owner_membership_trigger
after insert on public.chat_threads
for each row execute function public.ensure_chat_thread_owner_membership();

-- Hilfsfunktion: RLS ohne Rekursion (SECURITY DEFINER liest Tabellen ohne RLS-Effekt)
create or replace function public.can_view_thread_members(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.chat_threads t
      where t.id = p_thread
        and t.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chat_thread_members m
      where m.thread_id = p_thread
        and m.user_id = auth.uid()
    );
$$;

grant execute on function public.can_view_thread_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Einladungen
-- ---------------------------------------------------------------------------
create table if not exists public.chat_thread_invitations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_email text not null,
  invitee_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_thread_invitations_invitee_user
  on public.chat_thread_invitations (invitee_user_id)
  where status = 'pending';

create unique index if not exists chat_thread_invitations_one_pending_per_email
  on public.chat_thread_invitations (thread_id, invitee_email)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 3) RLS chat_thread_members
-- ---------------------------------------------------------------------------
alter table public.chat_thread_members enable row level security;

drop policy if exists "chat_thread_members_select" on public.chat_thread_members;
create policy "chat_thread_members_select"
on public.chat_thread_members
for select
to authenticated
using (public.can_view_thread_members(thread_id));

-- Keine direkten Inserts durch Clients (nur Trigger + SECURITY DEFINER-RPCs)

-- ---------------------------------------------------------------------------
-- 4) RLS chat_thread_invitations
-- ---------------------------------------------------------------------------
alter table public.chat_thread_invitations enable row level security;

drop policy if exists "chat_thread_invitations_select" on public.chat_thread_invitations;
create policy "chat_thread_invitations_select"
on public.chat_thread_invitations
for select
to authenticated
using (inviter_id = auth.uid() or invitee_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Chat-Threads: Owner oder Mitglied darf lesen
-- ---------------------------------------------------------------------------
drop policy if exists "chat_threads_select_own" on public.chat_threads;
create policy "chat_threads_select_own"
on public.chat_threads
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = chat_threads.id
      and m.user_id = auth.uid()
  )
);

-- Insert/Update/Delete unverändert nur Owner (bestehende Policies ersetzen falls nötig)
-- chat_threads_insert_own, update_own, delete_own bleiben — nur Namen prüfen

-- ---------------------------------------------------------------------------
-- 6) Chat-Nachrichten: Owner oder Mitglied
-- ---------------------------------------------------------------------------
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and (
        t.user_id = auth.uid()
        or exists (
          select 1
          from public.chat_thread_members m
          where m.thread_id = t.id
            and m.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and (
        t.user_id = auth.uid()
        or exists (
          select 1
          from public.chat_thread_members m
          where m.thread_id = t.id
            and m.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
on public.chat_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

-- Nur Owner löscht Nachrichten (wie bisher implizit nur Owner-Threads — hier explizit Owner)

-- ---------------------------------------------------------------------------
-- 7) RPCs
-- ---------------------------------------------------------------------------
create or replace function public.invite_user_to_chat_thread(p_thread_id uuid, p_invitee_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_email text;
  v_invitee uuid;
  v_inv_id uuid;
begin
  select t.user_id into v_owner from public.chat_threads t where t.id = p_thread_id;
  if v_owner is null then
    raise exception 'THREAD_NOT_FOUND';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  v_email := lower(trim(p_invitee_email));
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  select u.id into v_invitee from auth.users u where lower(u.email::text) = v_email limit 1;
  if v_invitee is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_invitee = auth.uid() then
    raise exception 'SELF_INVITE';
  end if;

  if exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = p_thread_id and m.user_id = v_invitee
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.chat_thread_invitations (
    thread_id,
    inviter_id,
    invitee_email,
    invitee_user_id,
    status
  )
  values (p_thread_id, auth.uid(), v_email, v_invitee, 'pending')
  returning id into v_inv_id;

  return v_inv_id;
exception
  when unique_violation then
    raise exception 'INVITE_PENDING';
end;
$$;

grant execute on function public.invite_user_to_chat_thread(uuid, text) to authenticated;

create or replace function public.accept_chat_invitation(p_invitation_id uuid)
returns void
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
end;
$$;

grant execute on function public.accept_chat_invitation(uuid) to authenticated;

create or replace function public.decline_chat_invitation(p_invitation_id uuid)
returns void
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

  update public.chat_thread_invitations
  set status = 'declined'
  where id = p_invitation_id;
end;
$$;

grant execute on function public.decline_chat_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Thread-Zeitstempel bei neuer Nachricht (Mitglieder dürfen Thread nicht updaten)
-- ---------------------------------------------------------------------------
create or replace function public.bump_chat_thread_updated_at_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists bump_thread_on_message on public.chat_messages;
create trigger bump_thread_on_message
after insert on public.chat_messages
for each row execute function public.bump_chat_thread_updated_at_from_message();

-- ---------------------------------------------------------------------------
-- 9) Realtime (falls Publication existiert)
-- ---------------------------------------------------------------------------
do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_messages;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.chat_thread_invitations;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$pub$;
