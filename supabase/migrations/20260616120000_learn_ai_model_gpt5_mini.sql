-- Lernbereich: Standard-OpenAI-Modell von gpt-5.4-mini auf gpt-5-mini umstellen.

update public.app_feature_flags
set
  learn_ai_model_active = 'gpt-5-mini',
  updated_at = now()
where id = 1
  and learn_ai_provider_active = 'openai'
  and learn_ai_model_active = 'gpt-5.4-mini';

update public.app_feature_flags
set
  learn_ai_model_draft = 'gpt-5-mini',
  updated_at = now()
where id = 1
  and learn_ai_provider_draft = 'openai'
  and learn_ai_model_draft = 'gpt-5.4-mini';

alter table public.app_feature_flags
  alter column learn_ai_model_active set default 'gpt-5-mini',
  alter column learn_ai_model_draft set default 'gpt-5-mini';

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
    else 'gpt-5-mini'
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
  values (1, true, null, true, true, 'openai', 'openai', 'gpt-5-mini', next_model, now())
  on conflict (id)
  do update set
    learn_ai_model_draft = excluded.learn_ai_model_draft,
    updated_at = now();
end;
$$;

create or replace function public.admin_deploy_learn_ai_model_draft()
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
    raise exception 'Nur Superadmins duerfen das Lern-KI-Modell deployen.';
  end if;

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
  values (1, true, null, true, true, 'openai', 'openai', 'gpt-5-mini', 'gpt-5-mini', now())
  on conflict (id)
  do update set
    learn_ai_model_active = app_feature_flags.learn_ai_model_draft,
    updated_at = now();
end;
$$;
