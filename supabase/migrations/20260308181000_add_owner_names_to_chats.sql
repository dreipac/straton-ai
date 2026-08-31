-- Store profile name snapshot on chats/messages for easier ownership visibility in DB.

alter table public.chat_threads
  add column if not exists owner_first_name text,
  add column if not exists owner_last_name text;

alter table public.chat_messages
  add column if not exists owner_first_name text,
  add column if not exists owner_last_name text;

-- Fill owner names on thread insert/update from profiles.
create or replace function public.set_chat_thread_owner_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_first_name text;
  p_last_name text;
begin
  select p.first_name, p.last_name
  into p_first_name, p_last_name
  from public.profiles p
  where p.id = new.user_id;

  new.owner_first_name := p_first_name;
  new.owner_last_name := p_last_name;
  return new;
end;
$$;

drop trigger if exists set_chat_thread_owner_names on public.chat_threads;
create trigger set_chat_thread_owner_names
before insert or update of user_id
on public.chat_threads
for each row execute function public.set_chat_thread_owner_names();

-- Fill owner names on message insert/update from parent thread.
create or replace function public.set_chat_message_owner_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_first_name text;
  t_last_name text;
begin
  select t.owner_first_name, t.owner_last_name
  into t_first_name, t_last_name
  from public.chat_threads t
  where t.id = new.thread_id;

  new.owner_first_name := t_first_name;
  new.owner_last_name := t_last_name;
  return new;
end;
$$;

drop trigger if exists set_chat_message_owner_names on public.chat_messages;
create trigger set_chat_message_owner_names
before insert or update of thread_id
on public.chat_messages
for each row execute function public.set_chat_message_owner_names();

-- Backfill existing rows.
update public.chat_threads t
set
  owner_first_name = p.first_name,
  owner_last_name = p.last_name
from public.profiles p
where p.id = t.user_id;

update public.chat_messages m
set
  owner_first_name = t.owner_first_name,
  owner_last_name = t.owner_last_name
from public.chat_threads t
where t.id = m.thread_id;

-- Keep snapshots in sync when profile name changes.
create or replace function public.sync_chat_owner_names_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name then
    update public.chat_threads t
    set
      owner_first_name = new.first_name,
      owner_last_name = new.last_name
    where t.user_id = new.id;

    update public.chat_messages m
    set
      owner_first_name = new.first_name,
      owner_last_name = new.last_name
    from public.chat_threads t
    where t.id = m.thread_id
      and t.user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_chat_owner_names_from_profile on public.profiles;
create trigger sync_chat_owner_names_from_profile
after update of first_name, last_name
on public.profiles
for each row execute function public.sync_chat_owner_names_from_profile();
