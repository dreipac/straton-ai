-- Nutzer ohne zugewiesenes Abo erhalten ein hartes Tageslimit von 100 Tokens.

create or replace function public.user_increment_subscription_usage(
  p_user_id uuid,
  p_used_tokens_delta integer default 0,
  p_used_images_delta integer default 0,
  p_used_files_delta integer default 0
)
returns table (
  used_tokens integer,
  used_images integer,
  used_files integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_superadmin boolean;
  plan_id uuid;
  max_tokens integer;
  max_images integer;
  max_files integer;
  cur_tokens integer;
  cur_images integer;
  cur_files integer;
begin
  if auth.role() = 'service_role' then
    actor_is_superadmin := true;
  else
    if auth.uid() is null or auth.uid() != p_user_id then
      raise exception 'Unauthorized quota update.';
    end if;
    select coalesce(is_superadmin, false) into actor_is_superadmin
    from public.profiles where id = auth.uid();
  end if;

  if p_used_tokens_delta < 0 or p_used_images_delta < 0 or p_used_files_delta < 0 then
    raise exception 'Negative deltas are not allowed.';
  end if;

  perform public.subscription_usage_reset_if_new_day(p_user_id);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = p_user_id;

  select
    coalesce(used_tokens, 0),
    coalesce(used_images, 0),
    coalesce(used_files, 0)
  into
    cur_tokens, cur_images, cur_files
  from public.subscription_usages
  where user_id = p_user_id;

  cur_tokens := coalesce(cur_tokens, 0);
  cur_images := coalesce(cur_images, 0);
  cur_files := coalesce(cur_files, 0);

  if not actor_is_superadmin then
    if plan_id is null then
      max_tokens := 100;
      max_images := null;
      max_files := null;
    else
      select sp.max_tokens, sp.max_images, sp.max_files
      into max_tokens, max_images, max_files
      from public.subscription_plans sp
      where sp.id = plan_id;
    end if;

    if max_tokens is not null and (cur_tokens + p_used_tokens_delta) > max_tokens then
      raise exception 'Token Limit Ueberschritten.';
    end if;
    if max_images is not null and (cur_images + p_used_images_delta) > max_images then
      raise exception 'Bilder Limit Ueberschritten.';
    end if;
    if max_files is not null and (cur_files + p_used_files_delta) > max_files then
      raise exception 'Datei Limit Ueberschritten.';
    end if;
  end if;

  insert into public.subscription_usages(
    user_id,
    used_tokens,
    used_images,
    used_files,
    last_reset_date,
    updated_at
  )
  values(
    p_user_id,
    cur_tokens + p_used_tokens_delta,
    cur_images + p_used_images_delta,
    cur_files + p_used_files_delta,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_tokens = public.subscription_usages.used_tokens + p_used_tokens_delta,
    used_images = public.subscription_usages.used_images + p_used_images_delta,
    used_files = public.subscription_usages.used_files + p_used_files_delta,
    updated_at = now();

  return query
  select u.used_tokens, u.used_images, u.used_files
  from public.subscription_usages u
  where u.user_id = p_user_id;
end;
$$;

create or replace function public.subscription_guard_chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid;
  actor_is_superadmin boolean;
  owner_user_id uuid;
  plan_id uuid;
  max_tokens integer;
  used_tokens integer;
  msg_tokens integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_uid := auth.uid();
  if actor_uid is null then
    raise exception 'Unauthorized token quota check.';
  end if;

  select t.user_id into owner_user_id
  from public.chat_threads t
  where t.id = new.thread_id;

  if owner_user_id is null then
    raise exception 'Chat thread not found.';
  end if;
  if owner_user_id != actor_uid then
    raise exception 'Unauthorized token quota check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(actor_uid);

  select subscription_plan_id into plan_id
  from public.profiles where id = actor_uid;

  if plan_id is null then
    max_tokens := 100;
  else
    select sp.max_tokens into max_tokens
    from public.subscription_plans sp
    where sp.id = plan_id;
  end if;

  if max_tokens is null then
    return new;
  end if;

  select coalesce(u.used_tokens, 0) into used_tokens
  from public.subscription_usages u
  where u.user_id = actor_uid;

  msg_tokens := public.estimate_tokens_from_text(new.content);
  if used_tokens + msg_tokens > max_tokens then
    raise exception 'Token Limit Ueberschritten.';
  end if;

  return new;
end;
$$;
