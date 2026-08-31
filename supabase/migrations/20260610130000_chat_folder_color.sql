-- Ordner-Farbe (optional, null = Standard-Akzent)

alter table public.chat_folders
  add column if not exists color text;

alter table public.chat_folders
  drop constraint if exists chat_folders_color_check;

alter table public.chat_folders
  add constraint chat_folders_color_check
  check (
    color is null
    or color in ('blue', 'teal', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'slate')
  );
