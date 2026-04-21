-- Eingeladene Chat-Mitglieder: alter Token-Guard verweigerte jede Nachricht, weil nur
-- der Thread-Owner (t.user_id) senden durfte. Anpassung: Owner ODER Teilnehmer in
-- chat_thread_members. Tokenabrechnung: dem tatsächlich sendenden auth.uid() (nicht dem Owner).

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
  is_participant boolean;
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

  is_participant := (owner_user_id = actor_uid) or exists (
    select 1
    from public.chat_thread_members m
    where m.thread_id = new.thread_id
      and m.user_id = actor_uid
  );

  if not is_participant then
    raise exception 'Unauthorized token quota check.';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles
  where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(actor_uid);

  select subscription_plan_id into plan_id
  from public.profiles
  where id = actor_uid;

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

create or replace function public.subscription_increment_used_tokens_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  billing_user_id uuid;
  msg_tokens integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  billing_user_id := auth.uid();
  if billing_user_id is null then
    return new;
  end if;

  perform public.subscription_usage_reset_if_new_day(billing_user_id);

  msg_tokens := public.estimate_tokens_from_text(new.content);

  insert into public.subscription_usages(
    user_id,
    used_tokens,
    used_images,
    used_files,
    last_reset_date,
    updated_at
  )
  values(
    billing_user_id,
    msg_tokens,
    0,
    0,
    (now() at time zone 'utc')::date,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_tokens = public.subscription_usages.used_tokens + msg_tokens,
    updated_at = now();

  return new;
end;
$$;
