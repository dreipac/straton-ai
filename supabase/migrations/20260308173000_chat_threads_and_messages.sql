-- Chat persistence for authenticated users
-- Creates:
--   public.chat_threads
--   public.chat_messages
-- with strict owner-based RLS policies.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Neuer Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_user_id
  on public.chat_threads (user_id);

create index if not exists idx_chat_threads_updated_at
  on public.chat_threads (updated_at desc);

create index if not exists idx_chat_messages_thread_id_created_at
  on public.chat_messages (thread_id, created_at);

-- Reuse existing helper if present from your schema pull.
drop trigger if exists set_chat_threads_updated_at on public.chat_threads;
create trigger set_chat_threads_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- Threads: only owner can read/write.
create policy "chat_threads_select_own"
on public.chat_threads
for select
to authenticated
using (auth.uid() = user_id);

create policy "chat_threads_insert_own"
on public.chat_threads
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "chat_threads_update_own"
on public.chat_threads
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "chat_threads_delete_own"
on public.chat_threads
for delete
to authenticated
using (auth.uid() = user_id);

-- Messages: access only through own thread ownership.
create policy "chat_messages_select_own"
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

create policy "chat_messages_insert_own"
on public.chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

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
