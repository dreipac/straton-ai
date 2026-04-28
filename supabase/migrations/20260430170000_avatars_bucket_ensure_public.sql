-- Nach der letzten Remote-Migration datiert, damit `db push` ohne --include-all läuft.
-- Für bestehende Projekte: Bucket „avatars“ anlegen bzw. öffentlich setzen (idempotent).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set
  name = excluded.name,
  public = true;
