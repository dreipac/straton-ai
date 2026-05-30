-- PDF-Exporte: privater Storage-Bucket (Pfad {user_id}/{message_id}.pdf)

insert into storage.buckets (id, name, public)
values ('chat-pdf-exports', 'chat-pdf-exports', false)
on conflict (id) do nothing;

create policy "chat_pdf_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-pdf-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_pdf_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-pdf-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_pdf_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-pdf-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
