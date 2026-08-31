-- Excel-Exporte: Metadaten an Nachrichten + privater Storage-Bucket

alter table public.chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Bucket (privat): Pfad-Schema {user_id}/{message_id}.xlsx
insert into storage.buckets (id, name, public)
values ('chat-excel-exports', 'chat-excel-exports', false)
on conflict (id) do nothing;

create policy "chat_excel_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-excel-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_excel_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-excel-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_excel_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-excel-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
