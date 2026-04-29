alter table "public"."subscription_plans" add column "badge_variant" text default 'indigo'::text;

alter table "public"."subscription_plans" add constraint "subscription_plans_badge_variant_check" CHECK ((badge_variant = ANY (ARRAY['slate'::text, 'indigo'::text, 'emerald'::text, 'amber'::text, 'rose'::text, 'violet'::text]))) not valid;

alter table "public"."subscription_plans" validate constraint "subscription_plans_badge_variant_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_chat_invitation(p_invitation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.chat_thread_invitations%rowtype;
begin
  select * into r
  from public.chat_thread_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;
  if r.invitee_user_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.chat_thread_members (thread_id, user_id, role)
  values (r.thread_id, auth.uid(), 'member')
  on conflict (thread_id, user_id) do nothing;

  update public.chat_thread_invitations
  set status = 'accepted'
  where id = p_invitation_id;

  return r.thread_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  caller_is_superadmin boolean;
  superadmin_count int;
begin
  if p_user_id = auth.uid() then
    raise exception 'Eigenes Konto kann nicht geloescht werden.';
  end if;

  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if caller_is_superadmin = false then
    raise exception 'Nur Superadmins duerfen Nutzer loeschen.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Nutzer nicht gefunden.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and is_superadmin) then
    select count(*)::int
    into superadmin_count
    from public.profiles
    where is_superadmin = true;

    if superadmin_count <= 1 then
      raise exception 'Der letzte Superadmin kann nicht geloescht werden.';
    end if;
  end if;

  -- updated_by zeigt auf profiles(id); vor Loeschen auf ausfuehrenden Admin umhaengen
  update public.subscription_assignment_drafts
  set updated_by = auth.uid()
  where updated_by = p_user_id;

  update public.subscription_plan_showcase_slots
  set updated_by = auth.uid()
  where updated_by = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_deploy_subscription_assignment_drafts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_is_superadmin boolean;
  affected_rows integer := 0;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen Abo-Entwuerfe deployen.';
  end if;

  update public.profiles p
  set subscription_plan_id = d.subscription_plan_id
  from public.subscription_assignment_drafts d
  where p.id = d.user_id;

  get diagnostics affected_rows = row_count;

  delete from public.subscription_assignment_drafts;

  return coalesce(affected_rows, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_beta_notice_enabled(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen den Beta-Hinweis umstellen.';
  end if;

  insert into public.app_feature_flags(id, show_beta_notice_on_first_login, updated_at)
  values (1, p_enabled, now())
  on conflict (id)
  do update set
    show_beta_notice_on_first_login = excluded.show_beta_notice_on_first_login,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_must_change_password_on_first_login(p_user_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  caller_is_superadmin boolean;
  last_in timestamptz;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen diese Einstellung aendern.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unbekannter Nutzer.';
  end if;

  if p_enabled then
    select u.last_sign_in_at
    into last_in
    from auth.users u
    where u.id = p_user_id;

    if last_in is not null then
      raise exception 'Nur fuer Konten, die sich noch nicht angemeldet haben.';
    end if;
  end if;

  insert into public.profiles (id, must_change_password_on_first_login)
  values (p_user_id, p_enabled)
  on conflict (id) do update set
    must_change_password_on_first_login = excluded.must_change_password_on_first_login,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_user_profile_names(p_user_id uuid, p_first_name text, p_last_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  caller_is_superadmin boolean;
  fn text;
  ln text;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Profilnamen setzen.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unbekannter Nutzer.';
  end if;

  fn := nullif(trim(coalesce(p_first_name, '')), '');
  ln := nullif(trim(coalesce(p_last_name, '')), '');

  insert into public.profiles (id, first_name, last_name)
  values (p_user_id, fn, ln)
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_user_subscription_plan(p_user_id uuid, p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen Abonnements zuweisen.';
  end if;

  if p_plan_id is not null and not exists (select 1 from public.subscription_plans s where s.id = p_plan_id) then
    raise exception 'Ungueltiges Abo.';
  end if;

  update public.profiles
  set subscription_plan_id = p_plan_id
  where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_chat_thread_updated_at_from_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_thread_members(p_thread uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1
      from public.chat_threads t
      where t.id = p_thread
        and t.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chat_thread_members m
      where m.thread_id = p_thread
        and m.user_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.decline_chat_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.chat_thread_invitations%rowtype;
begin
  select * into r
  from public.chat_thread_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;
  if r.invitee_user_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  update public.chat_thread_invitations
  set status = 'declined'
  where id = p_invitation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.end_chat_thread_sharing(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  select t.user_id into v_owner from public.chat_threads t where t.id = p_thread_id;
  if v_owner is null then
    raise exception 'THREAD_NOT_FOUND';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.chat_thread_members
  where thread_id = p_thread_id and role = 'member';

  update public.chat_thread_invitations
  set status = 'declined'
  where thread_id = p_thread_id and status = 'pending';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_chat_thread_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.chat_thread_members (thread_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (thread_id, user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.estimate_tokens_from_text(p_content text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select greatest(1, ceil(char_length(coalesce(p_content, '')) / 4.0)::integer);
$function$
;

CREATE OR REPLACE FUNCTION public.get_app_feature_flags()
 RETURNS TABLE(show_beta_notice_on_first_login boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select f.show_beta_notice_on_first_login
  from public.app_feature_flags f
  where f.id = 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_superadmin_flag_on_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_is_superadmin boolean;
begin
  -- service role may always write the flag
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_superadmin = true then
      select p.is_superadmin
      into actor_is_superadmin
      from public.profiles p
      where p.id = auth.uid();

      if coalesce(actor_is_superadmin, false) = false then
        raise exception 'Nur Superadmins duerfen is_superadmin setzen.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_superadmin is distinct from old.is_superadmin then
      select p.is_superadmin
      into actor_is_superadmin
      from public.profiles p
      where p.id = auth.uid();

      if coalesce(actor_is_superadmin, false) = false then
        raise exception 'Nur Superadmins duerfen is_superadmin aendern.';
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_user_to_chat_thread(p_thread_id uuid, p_invitee_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_email text;
  v_invitee uuid;
  v_inv_id uuid;
begin
  select t.user_id into v_owner from public.chat_threads t where t.id = p_thread_id;
  if v_owner is null then
    raise exception 'THREAD_NOT_FOUND';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  v_email := lower(trim(p_invitee_email));
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  select u.id into v_invitee from auth.users u where lower(u.email::text) = v_email limit 1;
  if v_invitee is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_invitee = auth.uid() then
    raise exception 'SELF_INVITE';
  end if;

  if exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = p_thread_id and m.user_id = v_invitee
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.chat_thread_invitations (
    thread_id,
    inviter_id,
    invitee_email,
    invitee_user_id,
    status
  )
  values (p_thread_id, auth.uid(), v_email, v_invitee, 'pending')
  returning id into v_inv_id;

  return v_inv_id;
exception
  when unique_violation then
    raise exception 'INVITE_PENDING';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_admin_ai_token_usage_summary()
 RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, provider text, model text, input_tokens bigint, output_tokens bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Statistiken abrufen.';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    t.provider,
    t.model,
    sum(t.input_tokens)::bigint as input_tokens,
    sum(t.output_tokens)::bigint as output_tokens
  from public.profiles p
  left join auth.users u on u.id = p.id
  inner join public.ai_token_usage t on t.user_id = p.id
  group by p.id, u.email, p.first_name, p.last_name, t.provider, t.model
  order by u.email nulls last, t.provider, t.model;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, is_superadmin boolean, created_at timestamp with time zone, subscription_plan_id uuid, subscription_plan_name text, has_profile boolean, last_sign_in_at timestamp with time zone, must_change_password_on_first_login boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Nutzerlisten abrufen.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.first_name,
    p.last_name,
    coalesce(p.is_superadmin, false),
    coalesce(p.created_at, u.created_at) as created_at,
    p.subscription_plan_id,
    sp.name::text,
    (p.id is not null),
    u.last_sign_in_at,
    coalesce(p.must_change_password_on_first_login, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscription_plans sp on sp.id = p.subscription_plan_id
  order by coalesce(p.created_at, u.created_at) desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_admin_user_last_ai_usage()
 RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, provider text, model text, mode text, input_tokens integer, output_tokens integer, last_used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Statistiken abrufen.';
  end if;

  return query
  select distinct on (t.user_id)
    p.id as user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    t.provider,
    t.model,
    t.mode,
    t.input_tokens,
    t.output_tokens,
    t.created_at as last_used_at
  from public.ai_token_usage t
  inner join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = p.id
  where t.mode <> 'generate_title'
  order by t.user_id, t.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_chat_thread_members_public(p_thread_id uuid)
 RETURNS TABLE(user_id uuid, role text, first_name text, last_name text, avatar_url text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_view_thread_members(p_thread_id) then
    return;
  end if;

  return query
  select
    m.user_id,
    m.role,
    p.first_name,
    p.last_name,
    p.avatar_url,
    m.joined_at
  from public.chat_thread_members m
  left join public.profiles p on p.id = m.user_id
  where m.thread_id = p_thread_id
  order by
    case when m.role = 'owner' then 0 else 1 end,
    m.joined_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_non_superadmin_toggle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_is_superadmin boolean;
begin
  -- service role may always write the flag
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- for regular users, block changes to is_superadmin unless caller is already superadmin
  if new.is_superadmin is distinct from old.is_superadmin then
    select p.is_superadmin
    into actor_is_superadmin
    from public.profiles p
    where p.id = auth.uid();

    if coalesce(actor_is_superadmin, false) = false then
      raise exception 'Nur Superadmins duerfen is_superadmin aendern.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.profiles_guard_subscription_plan()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  actor_superadmin boolean;
begin
  if tg_op = 'UPDATE' and new.subscription_plan_id is not distinct from old.subscription_plan_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.subscription_plan_id is null then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  select coalesce(p.is_superadmin, false)
  into actor_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if actor_superadmin then
    return new;
  end if;

  raise exception 'Nur Administratoren duerfen das Abonnement zuweisen.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_admin_ai_provider_keys_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_chat_message_owner_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t_first_name text;
  t_last_name text;
begin
  select t.owner_first_name, t.owner_last_name
  into t_first_name, t_last_name
  from public.chat_threads t
  where t.id = new.thread_id;

  new.owner_first_name := t_first_name;
  new.owner_last_name := t_last_name;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_chat_thread_owner_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p_first_name text;
  p_last_name text;
begin
  select p.first_name, p.last_name
  into p_first_name, p_last_name
  from public.profiles p
  where p.id = new.user_id;

  new.owner_first_name := p_first_name;
  new.owner_last_name := p_last_name;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_guard_chat_messages_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_guard_chat_threads_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_uid uuid;
  actor_is_superadmin boolean;
  plan_id uuid;
  max_chats integer;
  used_chats integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_uid := auth.uid();
  if actor_uid is null or actor_uid != new.user_id then
    raise exception 'Unauthorized quota check (chat_threads).';
  end if;

  select coalesce(is_superadmin, false) into actor_is_superadmin
  from public.profiles where id = actor_uid;

  if actor_is_superadmin then
    return new;
  end if;

  select subscription_plan_id into plan_id
  from public.profiles where id = actor_uid;

  if plan_id is null then
    return new;
  end if;

  select sp.max_chats into max_chats
  from public.subscription_plans sp
  where sp.id = plan_id;

  if max_chats is null then
    return new;
  end if;

  select used_chats into used_chats
  from public.subscription_usages
  where user_id = actor_uid;

  used_chats := coalesce(used_chats, 0);

  if used_chats + 1 > max_chats then
    raise exception 'Chat Limit Ueberschritten.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_increment_used_chats_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Upsert-Increment (Zaehlung erfolgt immer, auch wenn Plan limits NULL sind)
  insert into public.subscription_usages(user_id, used_chats, used_images, used_files, updated_at)
  values(
    new.user_id,
    1,
    0,
    0,
    now()
  )
  on conflict (user_id)
  do update
  set
    used_chats = public.subscription_usages.used_chats + 1,
    updated_at = now();

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_increment_used_tokens_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_usage_reset_if_new_day(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.subscription_usages
  set
    used_tokens = 0,
    used_images = 0,
    used_files = 0,
    used_chats = 0,
    last_reset_date = (now() at time zone 'utc')::date,
    updated_at = now()
  where user_id = p_user_id
    and last_reset_date < (now() at time zone 'utc')::date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sum_user_ai_estimated_cost_usd(p_user_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(estimated_cost_usd), 0)::numeric
  from public.ai_token_usage
  where user_id = p_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_chat_owner_names_from_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name then
    update public.chat_threads t
    set
      owner_first_name = new.first_name,
      owner_last_name = new.last_name
    where t.user_id = new.id;

    update public.chat_messages m
    set
      owner_first_name = new.first_name,
      owner_last_name = new.last_name
    from public.chat_threads t
    where t.id = m.thread_id
      and t.user_id = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_subscription_assignment_drafts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_subscription_plan_showcase_slots()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.user_clear_must_change_password_on_first_login()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
  set
    must_change_password_on_first_login = false,
    updated_at = now()
  where id = auth.uid()
    and must_change_password_on_first_login = true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.user_increment_subscription_usage(p_user_id uuid, p_used_tokens_delta integer DEFAULT 0, p_used_images_delta integer DEFAULT 0, p_used_files_delta integer DEFAULT 0)
 RETURNS TABLE(used_tokens integer, used_images integer, used_files integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    coalesce(su.used_tokens, 0),
    coalesce(su.used_images, 0),
    coalesce(su.used_files, 0)
  into
    cur_tokens, cur_images, cur_files
  from public.subscription_usages su
  where su.user_id = p_user_id;

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
$function$
;

drop policy "avatars_delete_own" on "storage"."objects";

drop policy "avatars_insert_own" on "storage"."objects";

drop policy "avatars_select_public" on "storage"."objects";

drop policy "avatars_update_own" on "storage"."objects";


