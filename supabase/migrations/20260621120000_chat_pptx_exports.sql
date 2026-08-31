-- PowerPoint-Exporte: privater Storage-Bucket (Pfad {user_id}/{message_id}.pptx)

insert into storage.buckets (id, name, public)
values ('chat-pptx-exports', 'chat-pptx-exports', false)
on conflict (id) do nothing;

create policy "chat_pptx_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-pptx-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_pptx_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-pptx-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_pptx_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-pptx-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
