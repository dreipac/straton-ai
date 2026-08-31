-- Feedback-Anhänge: User kann ein Foto hochladen und/oder einen eigenen Chat referenzieren,
-- damit der Admin beides direkt aus der Feedback-Karte öffnen kann.

alter table public.user_feedback
  add column if not exists attachment_photo_path text,
  add column if not exists attachment_chat_thread_id uuid references public.chat_threads (id) on delete set null;

comment on column public.user_feedback.attachment_photo_path is
  'Pfad im Storage-Bucket feedback-media (Ordner: {user_id}/…), vom User beim Absenden hochgeladen.';
comment on column public.user_feedback.attachment_chat_thread_id is
  'Vom User ausgewählter eigener Chat-Thread als Kontext-Anhang; on delete set null falls der Thread später gelöscht wird.';

-- ---------------------------------------------------------------------------
-- Storage: feedback-media (privat, eigener Ordner pro User)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('feedback-media', 'feedback-media', false)
on conflict (id) do nothing;

drop policy if exists "feedback_media_upload_own" on storage.objects;
create policy "feedback_media_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feedback-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "feedback_media_read_own" on storage.objects;
create policy "feedback_media_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'feedback-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "feedback_media_read_superadmin" on storage.objects;
create policy "feedback_media_read_superadmin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'feedback-media'
  and coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false) = true
);

-- ---------------------------------------------------------------------------
-- chat_threads / chat_messages: Superadmin darf lesen (um angehängte Chats zu öffnen).
-- Additiv zu den bestehenden Owner/Mitglied-Policies — RLS-SELECT-Policies werden ge-ODER-t.
-- ---------------------------------------------------------------------------
drop policy if exists "chat_threads_select_superadmin" on public.chat_threads;
create policy "chat_threads_select_superadmin"
on public.chat_threads
for select
to authenticated
using (
  coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false) = true
);

drop policy if exists "chat_messages_select_superadmin" on public.chat_messages;
create policy "chat_messages_select_superadmin"
on public.chat_messages
for select
to authenticated
using (
  coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false) = true
);
