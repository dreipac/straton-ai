-- Gelber Hinweisbalken im Lernbereich (Text + Sichtbarkeit via Admin Center)

alter table public.app_feature_flags
  add column if not exists learn_area_banner_enabled boolean not null default false,
  add column if not exists learn_area_banner_text text not null default '';

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
  learn_area_banner_text text
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
    f.learn_area_banner_text
  from public.app_feature_flags f
  where f.id = 1;
end;
$$;

grant execute on function public.get_app_feature_flags() to authenticated;

create or replace function public.admin_set_learn_area_banner(
  p_enabled boolean,
  p_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  clipped_text text;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen den Lernbereich-Hinweis aendern.';
  end if;

  clipped_text := left(trim(coalesce(p_text, '')), 500);

  update public.app_feature_flags
  set
    learn_area_banner_enabled = coalesce(p_enabled, false),
    learn_area_banner_text = clipped_text,
    updated_at = now()
  where id = 1;

  if not found then
    insert into public.app_feature_flags (
      id,
      show_beta_notice_on_first_login,
      learn_area_banner_enabled,
      learn_area_banner_text,
      updated_at
    )
    values (1, true, coalesce(p_enabled, false), clipped_text, now());
  end if;
end;
$$;

grant execute on function public.admin_set_learn_area_banner(boolean, text) to authenticated;
