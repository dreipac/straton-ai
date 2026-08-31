alter table public.learning_paths
add column if not exists topic_suggestions jsonb not null default '[]'::jsonb;

alter table public.learning_paths
add column if not exists selected_topic text not null default '';
