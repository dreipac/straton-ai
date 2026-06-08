-- Ordner-Dateien: persistente Anhänge pro Chat-Ordner (Storage unter {user_id}/folders/{folder_id}/…).

create table if not exists public.chat_folder_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.chat_folders(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_bucket text not null default 'chat-media',
  storage_path text not null,
  excerpt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_folder_files_folder_sort
  on public.chat_folder_files (folder_id, sort_order, created_at);

create index if not exists idx_chat_folder_files_user
  on public.chat_folder_files (user_id);

drop trigger if exists set_chat_folder_files_updated_at on public.chat_folder_files;
create trigger set_chat_folder_files_updated_at
before update on public.chat_folder_files
for each row execute function public.set_updated_at();

alter table public.chat_folder_files enable row level security;

create policy "chat_folder_files_select_own"
on public.chat_folder_files for select to authenticated
using (auth.uid() = user_id);

create policy "chat_folder_files_insert_own"
on public.chat_folder_files for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_folders f
    where f.id = chat_folder_files.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "chat_folder_files_update_own"
on public.chat_folder_files for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_folders f
    where f.id = chat_folder_files.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "chat_folder_files_delete_own"
on public.chat_folder_files for delete to authenticated
using (auth.uid() = user_id);
