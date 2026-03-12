alter table public.profiles
add column if not exists auto_remove_empty_chats boolean not null default true;
