alter table public.learning_paths
add column if not exists chapter_blueprints jsonb not null default '[]'::jsonb;

alter table public.learning_paths
add column if not exists chapter_session jsonb not null default '{}'::jsonb;
