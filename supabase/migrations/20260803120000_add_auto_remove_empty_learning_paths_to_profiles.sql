alter table public.profiles
add column if not exists auto_remove_empty_learning_paths boolean not null default true;
