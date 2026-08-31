-- Thinking-Modus: zwei admin-konfigurierbare Gemini-Modelle (Standard vs. Rich/Summary).

alter table public.app_feature_flags
  add column if not exists thinking_gemini_model_standard_active text not null default 'gemini-3.1-flash-lite',
  add column if not exists thinking_gemini_model_standard_draft text not null default 'gemini-3.1-flash-lite',
  add column if not exists thinking_gemini_model_rich_active text not null default 'gemini-3-flash-preview',
  add column if not exists thinking_gemini_model_rich_draft text not null default 'gemini-3-flash-preview';

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_thinking_gemini_model_standard_active_check,
  drop constraint if exists app_feature_flags_thinking_gemini_model_standard_draft_check,
  drop constraint if exists app_feature_flags_thinking_gemini_model_rich_active_check,
  drop constraint if exists app_feature_flags_thinking_gemini_model_rich_draft_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_thinking_gemini_model_standard_active_check
    check (
      thinking_gemini_model_standard_active in (
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-3-flash-preview'
      )
    ),
  add constraint app_feature_flags_thinking_gemini_model_standard_draft_check
    check (
      thinking_gemini_model_standard_draft in (
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-3-flash-preview'
      )
    ),
  add constraint app_feature_flags_thinking_gemini_model_rich_active_check
    check (
      thinking_gemini_model_rich_active in (
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-3-flash-preview'
      )
    ),
  add constraint app_feature_flags_thinking_gemini_model_rich_draft_check
    check (
      thinking_gemini_model_rich_draft in (
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-3-flash-preview'
      )
    );

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
  thinking_gemini_model_rich_draft text
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
    f.thinking_gemini_model_rich_draft
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.sanitize_thinking_gemini_model_id(p_model text, p_fallback text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_model), ''))
    when 'gemini-3.1-flash-lite' then 'gemini-3.1-flash-lite'
    when 'gemini-2.5-flash' then 'gemini-2.5-flash'
    when 'gemini-3-flash-preview' then 'gemini-3-flash-preview'
    else p_fallback
  end;
$$;

create or replace function public.admin_set_thinking_gemini_models_draft(
  p_standard_model text,
  p_rich_model text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  next_standard text;
  next_rich text;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen Thinking-Gemini-Modelle aendern.';
  end if;

  next_standard := public.sanitize_thinking_gemini_model_id(
    p_standard_model,
    'gemini-3.1-flash-lite'
  );
  next_rich := public.sanitize_thinking_gemini_model_id(
    p_rich_model,
    'gemini-3-flash-preview'
  );

  insert into public.app_feature_flags (id, show_beta_notice_on_first_login, updated_at)
  values (1, true, now())
  on conflict (id)
  do update set
    thinking_gemini_model_standard_draft = next_standard,
    thinking_gemini_model_rich_draft = next_rich,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_thinking_gemini_models_draft(text, text) to authenticated;

create or replace function public.admin_deploy_thinking_gemini_models_draft()
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
    raise exception 'Nur Superadmins duerfen Thinking-Gemini-Modelle deployen.';
  end if;

  update public.app_feature_flags
  set
    thinking_gemini_model_standard_active = thinking_gemini_model_standard_draft,
    thinking_gemini_model_rich_active = thinking_gemini_model_rich_draft,
    updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.admin_deploy_thinking_gemini_models_draft() to authenticated;
