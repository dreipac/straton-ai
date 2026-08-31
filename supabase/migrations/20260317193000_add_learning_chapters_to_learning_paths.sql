alter table public.learning_paths
add column if not exists learning_chapters jsonb not null default '[]'::jsonb;
