-- chat-media: Lesen und Hochladen nur im eigenen Prefix {auth.uid()}/…
-- (vorher: jede authenticated Session konnte den ganzen Bucket lesen/schreiben)

drop policy if exists "read chat media" on storage.objects;
drop policy if exists "upload chat media" on storage.objects;

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
