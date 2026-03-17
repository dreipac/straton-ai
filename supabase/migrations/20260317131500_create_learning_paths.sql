create table if not exists public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Neuer Lernpfad',
  topic text not null default '',
  setup_step smallint not null default 1 check (setup_step in (1, 2)),
  is_setup_complete boolean not null default false,
  materials jsonb not null default '[]'::jsonb,
  tutor_messages jsonb not null default '[]'::jsonb,
  entry_quiz jsonb,
  entry_quiz_answers jsonb not null default '{}'::jsonb,
  entry_quiz_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_paths_user_id on public.learning_paths (user_id);
create index if not exists idx_learning_paths_updated_at on public.learning_paths (updated_at desc);

drop trigger if exists set_learning_paths_updated_at on public.learning_paths;
create trigger set_learning_paths_updated_at
before update on public.learning_paths
for each row execute function public.set_updated_at();

alter table public.learning_paths enable row level security;

drop policy if exists "learning_paths_select_own" on public.learning_paths;
create policy "learning_paths_select_own"
on public.learning_paths
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "learning_paths_insert_own" on public.learning_paths;
create policy "learning_paths_insert_own"
on public.learning_paths
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "learning_paths_update_own" on public.learning_paths;
create policy "learning_paths_update_own"
on public.learning_paths
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "learning_paths_delete_own" on public.learning_paths;
create policy "learning_paths_delete_own"
on public.learning_paths
for delete
to authenticated
using (auth.uid() = user_id);
