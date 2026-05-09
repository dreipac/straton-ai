-- Lernbereich-KI: Entwurf + aktiver Provider mit Deployment-Schritt

alter table public.app_feature_flags
  add column if not exists learn_ai_provider_active text not null default 'openai'
    check (learn_ai_provider_active in ('openai', 'anthropic')),
  add column if not exists learn_ai_provider_draft text not null default 'openai'
    check (learn_ai_provider_draft in ('openai', 'anthropic'));

drop function if exists public.get_app_feature_flags();

create or replace function public.get_app_feature_flags()
returns table (
  show_beta_notice_on_first_login boolean,
  deployed_app_version text,
  learn_paths_enabled boolean,
  learn_path_create_enabled boolean,
  learn_ai_provider_active text,
  learn_ai_provider_draft text
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
    f.learn_ai_provider_draft
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

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

  next_provider := case when lower(coalesce(p_provider, '')) = 'anthropic' then 'anthropic' else 'openai' end;

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

grant execute on function public.admin_set_learn_ai_provider_draft(text) to authenticated;

create or replace function public.admin_deploy_learn_ai_provider_draft()
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
    raise exception 'Nur Superadmins duerfen den Lern-KI-Entwurf deployen.';
  end if;

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
  values (1, true, null, true, true, 'openai', 'openai', now())
  on conflict (id)
  do update set
    learn_ai_provider_active = app_feature_flags.learn_ai_provider_draft,
    updated_at = now();
end;
$$;

grant execute on function public.admin_deploy_learn_ai_provider_draft() to authenticated;

