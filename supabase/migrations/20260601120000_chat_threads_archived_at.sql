alter table public.chat_threads
  add column if not exists archived_at timestamptz;

comment on column public.chat_threads.archived_at is
  'Gesetzt wenn der Owner den Chat archiviert hat; null = aktiv in der Sidebar.';

create index if not exists idx_chat_threads_user_archived
  on public.chat_threads (user_id, archived_at desc nulls last);
