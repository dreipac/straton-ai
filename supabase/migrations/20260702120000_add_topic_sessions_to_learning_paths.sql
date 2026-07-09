alter table public.learning_paths
add column if not exists topic_sessions jsonb not null default '[]'::jsonb;
