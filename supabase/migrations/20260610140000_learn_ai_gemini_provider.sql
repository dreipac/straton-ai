-- Lernbereich: Gemini als KI-Provider + Gemini-3.1-Flash-Lite als Modell

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_learn_ai_provider_active_check,
  drop constraint if exists app_feature_flags_learn_ai_provider_draft_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_learn_ai_provider_active_check
    check (learn_ai_provider_active in ('openai', 'anthropic', 'gemini')),
  add constraint app_feature_flags_learn_ai_provider_draft_check
    check (learn_ai_provider_draft in ('openai', 'anthropic', 'gemini'));

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_learn_ai_model_active_check,
  drop constraint if exists app_feature_flags_learn_ai_model_draft_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_learn_ai_model_active_check
    check (
      learn_ai_model_active in (
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5-mini',
        'gpt-4o-mini',
        'claude-sonnet-4-6',
        'claude-3-5-haiku-latest',
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview'
      )
    ),
  add constraint app_feature_flags_learn_ai_model_draft_check
    check (
      learn_ai_model_draft in (
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5-mini',
        'gpt-4o-mini',
        'claude-sonnet-4-6',
        'claude-3-5-haiku-latest',
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview'
      )
    );

create or replace function public.admin_set_learn_ai_provider_draft(
  p_provider text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  next_provider text;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen den Lern-KI-Entwurf aendern.';
  end if;

  next_provider := case lower(coalesce(p_provider, ''))
    when 'anthropic' then 'anthropic'
    when 'gemini' then 'gemini'
    else 'openai'
  end;

  insert into public.app_feature_flags(
    id,
    show_beta_notice_on_first_login,
    deployed_app_version,
    learn_paths_enabled,
    learn_path_create_enabled,
    learn_ai_provider_active,
    learn_ai_provider_draft,
    updated_at
  )
  values (1, true, null, true, true, 'openai', next_provider, now())
  on conflict (id)
  do update set
    learn_ai_provider_draft = excluded.learn_ai_provider_draft,
    updated_at = now();
end;
$$;

create or replace function public.admin_set_learn_ai_model_draft(
  p_model text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  next_model text;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Lern-KI-Modell aendern.';
  end if;

  next_model := case lower(coalesce(p_model, ''))
    when 'gpt-5.4' then 'gpt-5.4'
    when 'gpt-5.4-mini' then 'gpt-5.4-mini'
    when 'gpt-5-mini' then 'gpt-5-mini'
    when 'gpt-4o-mini' then 'gpt-4o-mini'
    when 'claude-sonnet-4-6' then 'claude-sonnet-4-6'
    when 'claude-3-5-haiku-latest' then 'claude-3-5-haiku-latest'
    when 'gemini-3.1-flash-lite' then 'gemini-3.1-flash-lite'
    when 'gemini-3.1-flash-lite-preview' then 'gemini-3.1-flash-lite-preview'
    else 'gpt-5.4-mini'
  end;

  insert into public.app_feature_flags(
    id,
    show_beta_notice_on_first_login,
    deployed_app_version,
    learn_paths_enabled,
    learn_path_create_enabled,
    learn_ai_provider_active,
    learn_ai_provider_draft,
    learn_ai_model_active,
    learn_ai_model_draft,
    updated_at
  )
  values (1, true, null, true, true, 'openai', 'openai', 'gpt-5.4-mini', next_model, now())
  on conflict (id)
  do update set
    learn_ai_model_draft = excluded.learn_ai_model_draft,
    updated_at = now();
end;
$$;
