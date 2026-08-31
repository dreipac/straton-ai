-- Lernbereich-KI: explizites Modell als Entwurf + aktives Modell

alter table public.app_feature_flags
  add column if not exists learn_ai_model_active text not null default 'gpt-5.4-mini'
    check (learn_ai_model_active in ('gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini', 'claude-sonnet-4-6', 'claude-3-5-haiku-latest')),
  add column if not exists learn_ai_model_draft text not null default 'gpt-5.4-mini'
    check (learn_ai_model_draft in ('gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini', 'claude-sonnet-4-6', 'claude-3-5-haiku-latest'));

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
  learn_ai_model_draft text
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
    f.learn_ai_model_draft
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

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

  next_model := case
    when lower(coalesce(p_model, '')) = 'gpt-5.4' then 'gpt-5.4'
    when lower(coalesce(p_model, '')) = 'gpt-5.4-mini' then 'gpt-5.4-mini'
    when lower(coalesce(p_model, '')) = 'gpt-5-mini' then 'gpt-5-mini'
    when lower(coalesce(p_model, '')) = 'gpt-4o-mini' then 'gpt-4o-mini'
    when lower(coalesce(p_model, '')) = 'claude-sonnet-4-6' then 'claude-sonnet-4-6'
    when lower(coalesce(p_model, '')) = 'claude-3-5-haiku-latest' then 'claude-3-5-haiku-latest'
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

grant execute on function public.admin_set_learn_ai_model_draft(text) to authenticated;

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
  values (1, true, null, true, true, 'openai', 'openai', 'gpt-5.4-mini', 'gpt-5.4-mini', now())
  on conflict (id)
  do update set
    learn_ai_model_active = app_feature_flags.learn_ai_model_draft,
    updated_at = now();
end;
$$;

grant execute on function public.admin_deploy_learn_ai_model_draft() to authenticated;
