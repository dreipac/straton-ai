-- Freundschaftsanfragen: E-Mail-basiert senden, annehmen/ablehnen; Chat-Sharing nur zwischen Freunden.

create table if not exists public.user_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_friend_requests_no_self check (requester_id <> addressee_id),
  constraint user_friend_requests_pair_unique unique (requester_id, addressee_id)
);

create index if not exists user_friend_requests_addressee_pending_idx
  on public.user_friend_requests (addressee_id)
  where status = 'pending';

create index if not exists user_friend_requests_requester_pending_idx
  on public.user_friend_requests (requester_id)
  where status = 'pending';

create index if not exists user_friend_requests_accepted_idx
  on public.user_friend_requests (requester_id, addressee_id)
  where status = 'accepted';

alter table public.user_friend_requests enable row level security;

drop policy if exists "user_friend_requests_select_own" on public.user_friend_requests;
create policy "user_friend_requests_select_own"
on public.user_friend_requests
for select
to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Profile von Freunden lesbar (Anzeige in Freunde-Liste)
drop policy if exists "profiles_select_friends" on public.profiles;
create policy "profiles_select_friends"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.user_friend_requests f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
        or (f.requester_id = profiles.id and f.addressee_id = auth.uid())
      )
  )
);

create or replace function public.users_are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_friend_requests f
    where f.status = 'accepted'
      and (
        (f.requester_id = p_user_a and f.addressee_id = p_user_b)
        or (f.requester_id = p_user_b and f.addressee_id = p_user_a)
      )
  );
$$;

create or replace function public.send_friend_request(p_invitee_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invitee uuid;
  v_existing public.user_friend_requests%rowtype;
  v_id uuid;
begin
  v_email := lower(trim(p_invitee_email));
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  select u.id into v_invitee from auth.users u where lower(u.email::text) = v_email limit 1;
  if v_invitee is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_invitee = auth.uid() then
    raise exception 'SELF_REQUEST';
  end if;

  if public.users_are_friends(auth.uid(), v_invitee) then
    raise exception 'ALREADY_FRIENDS';
  end if;

  select * into v_existing
  from public.user_friend_requests f
  where (f.requester_id = auth.uid() and f.addressee_id = v_invitee)
     or (f.requester_id = v_invitee and f.addressee_id = auth.uid())
  order by f.created_at desc
  limit 1;

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_FRIENDS';
    end if;
    if v_existing.status = 'pending' then
      if v_existing.requester_id = auth.uid() then
        raise exception 'REQUEST_PENDING';
      end if;
      raise exception 'REQUEST_PENDING_INCOMING';
    end if;
  end if;

  insert into public.user_friend_requests (requester_id, addressee_id, status)
  values (auth.uid(), v_invitee, 'pending')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'REQUEST_PENDING';
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_friend_requests%rowtype;
begin
  select * into v_row
  from public.user_friend_requests f
  where f.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_row.addressee_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.user_friend_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_friend_requests%rowtype;
begin
  select * into v_row
  from public.user_friend_requests f
  where f.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_row.addressee_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.user_friend_requests
  set status = 'declined', updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.decline_friend_request(uuid) to authenticated;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_friend_requests%rowtype;
begin
  select * into v_row
  from public.user_friend_requests f
  where f.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_row.requester_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.user_friend_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.cancel_friend_request(uuid) to authenticated;

create or replace function public.count_incoming_friend_requests()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.user_friend_requests f
  where f.addressee_id = auth.uid()
    and f.status = 'pending';
$$;

grant execute on function public.count_incoming_friend_requests() to authenticated;

create or replace function public.list_user_friends()
returns table (
  friend_user_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  friends_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when f.requester_id = auth.uid() then f.addressee_id
      else f.requester_id
    end as friend_user_id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    f.updated_at as friends_since
  from public.user_friend_requests f
  join public.profiles p on p.id = case
    when f.requester_id = auth.uid() then f.addressee_id
    else f.requester_id
  end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.updated_at desc;
$$;

grant execute on function public.list_user_friends() to authenticated;

create or replace function public.list_incoming_friend_requests()
returns table (
  id uuid,
  requester_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.requester_id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    f.created_at
  from public.user_friend_requests f
  join public.profiles p on p.id = f.requester_id
  where f.addressee_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

grant execute on function public.list_incoming_friend_requests() to authenticated;

create or replace function public.list_outgoing_friend_requests()
returns table (
  id uuid,
  addressee_id uuid,
  invitee_email text,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.addressee_id,
    lower(u.email::text) as invitee_email,
    p.first_name,
    p.last_name,
    p.avatar_url,
    f.created_at
  from public.user_friend_requests f
  join public.profiles p on p.id = f.addressee_id
  join auth.users u on u.id = f.addressee_id
  where f.requester_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

grant execute on function public.list_outgoing_friend_requests() to authenticated;

-- Chat-Einladung nur an registrierte Freunde
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

  if not public.users_are_friends(auth.uid(), v_invitee) then
    raise exception 'NOT_FRIENDS';
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
