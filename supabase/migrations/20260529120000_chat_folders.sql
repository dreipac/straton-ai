-- Pro-Nutzer Chat-Ordner (flach: ein Ordner, viele Chats; ein Chat max. ein Ordner pro Nutzer).

create table if not exists public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_thread_folder_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  folder_id uuid not null references public.chat_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists idx_chat_folders_user_sort
  on public.chat_folders (user_id, sort_order, created_at);

create index if not exists idx_chat_thread_folder_links_folder
  on public.chat_thread_folder_links (folder_id);

create index if not exists idx_chat_thread_folder_links_thread
  on public.chat_thread_folder_links (thread_id);

drop trigger if exists set_chat_folders_updated_at on public.chat_folders;
create trigger set_chat_folders_updated_at
before update on public.chat_folders
for each row execute function public.set_updated_at();

alter table public.chat_folders enable row level security;
alter table public.chat_thread_folder_links enable row level security;

create policy "chat_folders_select_own"
on public.chat_folders for select to authenticated
using (auth.uid() = user_id);

create policy "chat_folders_insert_own"
on public.chat_folders for insert to authenticated
with check (auth.uid() = user_id);

create policy "chat_folders_update_own"
on public.chat_folders for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "chat_folders_delete_own"
on public.chat_folders for delete to authenticated
using (auth.uid() = user_id);

create policy "chat_thread_folder_links_select_own"
on public.chat_thread_folder_links for select to authenticated
using (auth.uid() = user_id);

create policy "chat_thread_folder_links_insert_own"
on public.chat_thread_folder_links for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = chat_thread_folder_links.thread_id
      and m.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.chat_folders f
    where f.id = chat_thread_folder_links.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "chat_thread_folder_links_update_own"
on public.chat_thread_folder_links for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = chat_thread_folder_links.thread_id
      and m.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.chat_folders f
    where f.id = chat_thread_folder_links.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "chat_thread_folder_links_delete_own"
on public.chat_thread_folder_links for delete to authenticated
using (auth.uid() = user_id);
