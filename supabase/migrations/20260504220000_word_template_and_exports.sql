-- Globale Word-Vorlage (eine Zeile) + Storage für Vorlage & generierte DOCX

create table if not exists public.app_word_template (
  id smallint primary key default 1,
  storage_path text,
  file_display_name text not null default 'Vorlage.docx',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint app_word_template_singleton check (id = 1)
);

comment on table public.app_word_template is
  'Singleton: genau eine System-Word-Vorlage. storage_path = Pfad in bucket word-templates, NULL = noch kein Upload.';

alter table public.app_word_template enable row level security;

create policy "app_word_template_select_authenticated"
  on public.app_word_template
  for select
  to authenticated
  using (true);

create policy "app_word_template_write_superadmin"
  on public.app_word_template
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  );

insert into public.app_word_template (id, storage_path, file_display_name)
values (1, null, 'Vorlage.docx')
on conflict (id) do nothing;

-- Buckets
insert into storage.buckets (id, name, public)
values ('word-templates', 'word-templates', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('chat-word-exports', 'chat-word-exports', false)
on conflict (id) do nothing;

-- Vorlagen: nur Superadmin
create policy "word_templates_bucket_superadmin_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'word-templates'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  );

create policy "word_templates_bucket_superadmin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'word-templates'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  );

create policy "word_templates_bucket_superadmin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'word-templates'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  )
  with check (
    bucket_id = 'word-templates'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  );

create policy "word_templates_bucket_superadmin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'word-templates'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_superadmin = true
    )
  );

-- Exporte: wie Excel, Ordner = user_id
create policy "chat_word_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-word-exports'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "chat_word_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-word-exports'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "chat_word_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-word-exports'
    and (storage.foldername (name))[1] = auth.uid()::text
  );
