-- Öffentlicher Bucket für Profilbilder: URL in profiles.avatar_url, Lesen für alle (img-Tags).
-- Schreiben nur im eigenen Ordner auth.uid()/…
--
-- Anwenden auf das Remote-Projekt: einmal `npm run db:login`, `npm run db:link`, dann `npm run db:push`
-- (oder SQL hier im Dashboard → SQL Editor einfügen und ausführen).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "avatars_select_public" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_select_public"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
