-- chat-media: Bucket sicherstellen + RLS (Upload/Lesen/Upsert/Löschen nur im eigenen Prefix).
-- Idempotent — für Self-Hosted, auch wenn der Bucket manuell in Studio angelegt wurde.

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "delete own chat media" on storage.objects;
drop policy if exists "read chat media" on storage.objects;
drop policy if exists "upload chat media" on storage.objects;
drop policy if exists "update chat media" on storage.objects;

create policy "read chat media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "upload chat media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "delete own chat media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
