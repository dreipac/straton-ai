-- Smart Instant: Gemini ein/aus — zentrale Quelle für Client (RPC) und Edge (app_feature_flags).

alter table public.app_feature_flags
  add column if not exists gemini_instant_enabled boolean not null default false;

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
  gemini_instant_enabled boolean
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
    f.gemini_instant_enabled
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_gemini_instant_enabled(p_enabled boolean)
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
    raise exception 'Nur Superadmins duerfen Gemini Instant global schalten.';
  end if;

  update public.app_feature_flags
  set
    gemini_instant_enabled = coalesce(p_enabled, false),
    updated_at = now()
  where id = 1;

  if not found then
    insert into public.app_feature_flags (
      id,
      show_beta_notice_on_first_login,
      gemini_instant_enabled,
      updated_at
    )
    values (1, true, coalesce(p_enabled, false), now());
  end if;
end;
$$;

grant execute on function public.admin_set_gemini_instant_enabled(boolean) to authenticated;
