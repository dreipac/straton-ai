-- Updates & Neuigkeiten: Feed-Posts, Gelesen-Status, Storage, Admin-RPCs

create table if not exists public.app_news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_path text,
  image_url text,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists app_news_posts_created_at_idx
  on public.app_news_posts (created_at desc);

create table if not exists public.app_news_post_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.app_news_posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists app_news_post_reads_user_id_idx
  on public.app_news_post_reads (user_id);

alter table public.app_news_posts enable row level security;
alter table public.app_news_post_reads enable row level security;

drop policy if exists app_news_posts_select_authenticated on public.app_news_posts;
create policy app_news_posts_select_authenticated
  on public.app_news_posts
  for select
  to authenticated
  using (true);

drop policy if exists app_news_post_reads_select_own on public.app_news_post_reads;
create policy app_news_post_reads_select_own
  on public.app_news_post_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists app_news_post_reads_insert_own on public.app_news_post_reads;
create policy app_news_post_reads_insert_own
  on public.app_news_post_reads
  for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

create or replace function public.count_unread_news_posts()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.app_news_posts p
  where p.author_id <> auth.uid()
    and not exists (
      select 1
      from public.app_news_post_reads r
      where r.user_id = auth.uid()
        and r.post_id = p.id
    );
$$;

grant execute on function public.count_unread_news_posts() to authenticated;

create or replace function public.mark_all_news_posts_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  insert into public.app_news_post_reads (user_id, post_id)
  select auth.uid(), p.id
  from public.app_news_posts p
  where not exists (
    select 1
    from public.app_news_post_reads r
    where r.user_id = auth.uid()
      and r.post_id = p.id
  )
  on conflict (user_id, post_id) do nothing;
end;
$$;

grant execute on function public.mark_all_news_posts_read() to authenticated;

create or replace function public.admin_create_news_post(
  p_title text,
  p_body text,
  p_image_path text default null,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  clipped_title text;
  clipped_body text;
  new_id uuid;
begin
  select public.is_superadmin() into caller_is_superadmin;
  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen News-Posts erstellen.';
  end if;

  clipped_title := left(trim(coalesce(p_title, '')), 160);
  clipped_body := left(trim(coalesce(p_body, '')), 8000);

  if clipped_title = '' then
    raise exception 'Titel darf nicht leer sein.';
  end if;
  if clipped_body = '' then
    raise exception 'Text darf nicht leer sein.';
  end if;

  insert into public.app_news_posts (title, body, image_path, image_url, author_id)
  values (
    clipped_title,
    clipped_body,
    nullif(trim(coalesce(p_image_path, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    auth.uid()
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.admin_create_news_post(text, text, text, text) to authenticated;

create or replace function public.admin_update_news_post_image(
  p_post_id uuid,
  p_image_path text,
  p_image_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Nur Superadmins duerfen News-Posts bearbeiten.';
  end if;

  update public.app_news_posts
  set
    image_path = nullif(trim(coalesce(p_image_path, '')), ''),
    image_url = nullif(trim(coalesce(p_image_url, '')), '')
  where id = p_post_id;

  if not found then
    raise exception 'Post nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.admin_update_news_post_image(uuid, text, text) to authenticated;

-- Realtime für neue Posts
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.app_news_posts;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

-- Storage: öffentliche Bilder, Schreiben nur Superadmin
insert into storage.buckets (id, name, public)
values ('app-news', 'app-news', true)
on conflict (id) do update set
  name = excluded.name,
  public = true;

drop policy if exists app_news_storage_select_public on storage.objects;
drop policy if exists app_news_storage_insert_admin on storage.objects;
drop policy if exists app_news_storage_update_admin on storage.objects;
drop policy if exists app_news_storage_delete_admin on storage.objects;

create policy app_news_storage_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'app-news');

create policy app_news_storage_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'app-news'
    and public.is_superadmin()
  );

create policy app_news_storage_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'app-news'
    and public.is_superadmin()
  )
  with check (
    bucket_id = 'app-news'
    and public.is_superadmin()
  );

create policy app_news_storage_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'app-news'
    and public.is_superadmin()
  );

comment on table public.app_news_posts is 'Updates & Neuigkeiten Feed (Sidebar).';
comment on table public.app_news_post_reads is 'Gelesen-Markierungen pro Nutzer und Post.';
