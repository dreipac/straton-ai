-- Admin-konfigurierbares Modell-Routing pro Intent-Kategorie+Action (Hauptantwort, Smart-Instant)
-- sowie fuer die Analyze-Stufen (Instant/Thinking) — siehe
-- src/features/chat/constants/chatIntentModelRouting.ts

create table if not exists public.chat_intent_model_routing (
  category text not null,
  action text not null,
  model_active text not null,
  model_draft text not null,
  updated_at timestamptz not null default now(),
  primary key (category, action)
);

alter table public.chat_intent_model_routing
  drop constraint if exists chat_intent_model_routing_model_active_check,
  drop constraint if exists chat_intent_model_routing_model_draft_check;

alter table public.chat_intent_model_routing
  add constraint chat_intent_model_routing_model_active_check
    check (model_active in ('gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini')),
  add constraint chat_intent_model_routing_model_draft_check
    check (model_draft in ('gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini'));

-- Seed: flache Actions -> gpt-5-mini, tiefere/generative Actions -> gpt-5.4-mini.
insert into public.chat_intent_model_routing (category, action, model_active, model_draft)
values
  ('chat', 'answer', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  ('chat', 'short_answer', 'gpt-5-mini', 'gpt-5-mini'),
  ('chat', 'clarify', 'gpt-5-mini', 'gpt-5-mini'),
  ('chat', 'one_step', 'gpt-5-mini', 'gpt-5-mini'),
  ('document', 'word_generate', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  ('document', 'pdf_generate', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  ('document', 'excel_generate', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  ('chart', 'chart_generate', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  ('diagram', 'diagram_generate', 'gpt-5.4-mini', 'gpt-5.4-mini')
on conflict (category, action) do nothing;

alter table public.chat_intent_model_routing enable row level security;

drop policy if exists "chat_intent_model_routing_select_authenticated" on public.chat_intent_model_routing;
create policy "chat_intent_model_routing_select_authenticated"
  on public.chat_intent_model_routing
  for select
  to authenticated
  using (true);

drop policy if exists "chat_intent_model_routing_write_superadmin" on public.chat_intent_model_routing;
create policy "chat_intent_model_routing_write_superadmin"
  on public.chat_intent_model_routing
  for all
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
      false
    ) = true
  );

create or replace function public.get_chat_intent_model_routing()
returns table (
  category text,
  action text,
  model_active text,
  model_draft text
)
language sql
security definer
set search_path = public
stable
as $$
  select category, action, model_active, model_draft
  from public.chat_intent_model_routing
  order by category, action;
$$;

grant execute on function public.get_chat_intent_model_routing() to authenticated;

create or replace function public.admin_set_chat_intent_model_routing_draft(
  p_category text,
  p_action text,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Modell-Routing aendern.';
  end if;

  if p_model not in ('gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini') then
    raise exception 'Ungueltiges Modell: %', p_model;
  end if;

  update public.chat_intent_model_routing
  set model_draft = p_model, updated_at = now()
  where category = p_category and action = p_action;

  if not found then
    raise exception 'Unbekannte Kategorie/Action-Kombination: %/%', p_category, p_action;
  end if;
end;
$$;

grant execute on function public.admin_set_chat_intent_model_routing_draft(text, text, text) to authenticated;

create or replace function public.admin_deploy_chat_intent_model_routing_draft()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Modell-Routing deployen.';
  end if;

  update public.chat_intent_model_routing
  set model_active = model_draft, updated_at = now();
end;
$$;

grant execute on function public.admin_deploy_chat_intent_model_routing_draft() to authenticated;

-- Analyze-Stufen-Modelle (Instant / Thinking) — gleiches Draft/Active-Muster wie thinking_gemini_model_*.
alter table public.app_feature_flags
  add column if not exists instant_analyze_model_active text not null default 'gemini-3.1-flash-lite',
  add column if not exists instant_analyze_model_draft text not null default 'gemini-3.1-flash-lite',
  add column if not exists thinking_analyze_model_active text not null default 'gemini-3.1-flash-lite',
  add column if not exists thinking_analyze_model_draft text not null default 'gemini-3.1-flash-lite';

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_instant_analyze_model_active_check,
  drop constraint if exists app_feature_flags_instant_analyze_model_draft_check,
  drop constraint if exists app_feature_flags_thinking_analyze_model_active_check,
  drop constraint if exists app_feature_flags_thinking_analyze_model_draft_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_instant_analyze_model_active_check
    check (instant_analyze_model_active in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    )),
  add constraint app_feature_flags_instant_analyze_model_draft_check
    check (instant_analyze_model_draft in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    )),
  add constraint app_feature_flags_thinking_analyze_model_active_check
    check (thinking_analyze_model_active in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    )),
  add constraint app_feature_flags_thinking_analyze_model_draft_check
    check (thinking_analyze_model_draft in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    ));

drop function if exists public.get_app_feature_flags();

create or replace function public.get_app_feature_flags()
returns table (
  show_beta_notice_on_first_login boolean,
  deployed_app_version text,
  learn_paths_enabled boolean,
  learn_path_create_enabled boolean,
  learn_ai_provider_active text,
  learn_ai_provider_draft text,
  learn_ai_model_active text,
  learn_ai_model_draft text,
  learn_area_banner_enabled boolean,
  learn_area_banner_text text,
  instant_analyze_debug_enabled boolean,
  chat_folders_enabled boolean,
  gemini_instant_enabled boolean,
  thinking_gemini_model_standard_active text,
  thinking_gemini_model_standard_draft text,
  thinking_gemini_model_rich_active text,
  thinking_gemini_model_rich_draft text,
  instant_analyze_model_active text,
  instant_analyze_model_draft text,
  thinking_analyze_model_active text,
  thinking_analyze_model_draft text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.show_beta_notice_on_first_login,
    f.deployed_app_version,
    f.learn_paths_enabled,
    f.learn_path_create_enabled,
    f.learn_ai_provider_active,
    f.learn_ai_provider_draft,
    f.learn_ai_model_active,
    f.learn_ai_model_draft,
    f.learn_area_banner_enabled,
    f.learn_area_banner_text,
    f.instant_analyze_debug_enabled,
    f.chat_folders_enabled,
    f.gemini_instant_enabled,
    f.thinking_gemini_model_standard_active,
    f.thinking_gemini_model_standard_draft,
    f.thinking_gemini_model_rich_active,
    f.thinking_gemini_model_rich_draft,
    f.instant_analyze_model_active,
    f.instant_analyze_model_draft,
    f.thinking_analyze_model_active,
    f.thinking_analyze_model_draft
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_instant_analyze_model_draft(p_model text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Instant-Analyze-Modell aendern.';
  end if;

  if p_model not in (
    'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
    'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
  ) then
    raise exception 'Ungueltiges Modell: %', p_model;
  end if;

  update public.app_feature_flags
  set instant_analyze_model_draft = p_model, updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.admin_set_instant_analyze_model_draft(text) to authenticated;

create or replace function public.admin_deploy_instant_analyze_model_draft()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Instant-Analyze-Modell deployen.';
  end if;

  update public.app_feature_flags
  set instant_analyze_model_active = instant_analyze_model_draft, updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.admin_deploy_instant_analyze_model_draft() to authenticated;

create or replace function public.admin_set_thinking_analyze_model_draft(p_model text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Thinking-Analyze-Modell aendern.';
  end if;

  if p_model not in (
    'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
    'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
  ) then
    raise exception 'Ungueltiges Modell: %', p_model;
  end if;

  update public.app_feature_flags
  set thinking_analyze_model_draft = p_model, updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.admin_set_thinking_analyze_model_draft(text) to authenticated;

create or replace function public.admin_deploy_thinking_analyze_model_draft()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Thinking-Analyze-Modell deployen.';
  end if;

  update public.app_feature_flags
  set thinking_analyze_model_active = thinking_analyze_model_draft, updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.admin_deploy_thinking_analyze_model_draft() to authenticated;
