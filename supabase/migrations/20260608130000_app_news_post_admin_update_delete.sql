-- Admin: News-Posts bearbeiten und löschen

create or replace function public.admin_update_news_post(
  p_post_id uuid,
  p_title text,
  p_body text,
  p_image_path text default null,
  p_image_url text default null,
  p_clear_image boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clipped_title text;
  clipped_body text;
begin
  if not public.is_superadmin() then
    raise exception 'Nur Superadmins duerfen News-Posts bearbeiten.';
  end if;

  clipped_title := left(trim(coalesce(p_title, '')), 160);
  clipped_body := left(trim(coalesce(p_body, '')), 8000);

  if clipped_title = '' then
    raise exception 'Titel darf nicht leer sein.';
  end if;
  if clipped_body = '' then
    raise exception 'Text darf nicht leer sein.';
  end if;

  if p_clear_image then
    update public.app_news_posts
    set
      title = clipped_title,
      body = clipped_body,
      image_path = null,
      image_url = null
    where id = p_post_id;
  else
    update public.app_news_posts
    set
      title = clipped_title,
      body = clipped_body,
      image_path = coalesce(nullif(trim(coalesce(p_image_path, '')), ''), image_path),
      image_url = coalesce(nullif(trim(coalesce(p_image_url, '')), ''), image_url)
    where id = p_post_id;
  end if;

  if not found then
    raise exception 'Post nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.admin_update_news_post(uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_delete_news_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Nur Superadmins duerfen News-Posts loeschen.';
  end if;

  delete from public.app_news_posts
  where id = p_post_id;

  if not found then
    raise exception 'Post nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.admin_delete_news_post(uuid) to authenticated;
