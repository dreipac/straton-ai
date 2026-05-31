-- Vision-Fotos im Chat: Bucket + Upsert-Policy (upload nutzt upsert: true)

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "update chat media" on storage.objects;

create policy "update chat media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
