-- Admin-konfigurierbares Tier+Modell-Routing pro Thinking-task_type (Draft + Reply).
-- Ersetzt die bisherige hardcodierte task_type+complexity-Tier-Logik fuer diese beiden Stufen.
-- Review bleibt unveraendert auf den bestehenden thinking_gemini_model_standard/rich-Dropdowns.
-- Siehe src/features/chat/constants/thinkingTaskTypeModelRouting.ts

create table if not exists public.thinking_task_type_model_routing (
  task_type text primary key,
  tier_active text not null default 'standard',
  tier_draft text not null default 'standard',
  model_active text not null,
  model_draft text not null,
  updated_at timestamptz not null default now()
);

alter table public.thinking_task_type_model_routing
  drop constraint if exists thinking_task_type_model_routing_tier_active_check,
  drop constraint if exists thinking_task_type_model_routing_tier_draft_check,
  drop constraint if exists thinking_task_type_model_routing_model_active_check,
  drop constraint if exists thinking_task_type_model_routing_model_draft_check;

alter table public.thinking_task_type_model_routing
  add constraint thinking_task_type_model_routing_tier_active_check
    check (tier_active in ('standard', 'rich')),
  add constraint thinking_task_type_model_routing_tier_draft_check
    check (tier_draft in ('standard', 'rich')),
  add constraint thinking_task_type_model_routing_model_active_check
    check (model_active in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    )),
  add constraint thinking_task_type_model_routing_model_draft_check
    check (model_draft in (
      'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
      'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
    ));

-- Seed: Annaeherung an heutiges effektives Verhalten (task_type+complexity-Heuristik kollabiert
-- hier auf eine einzige task_type-Dimension) -- rich fuer die Aufgabentypen, die heute ab
-- mittlerer Komplexitaet eskalieren konnten, standard fuer die uebrigen.
insert into public.thinking_task_type_model_routing (task_type, tier_active, tier_draft, model_active, model_draft)
values
  ('document_summary', 'rich', 'rich', 'gemini-3-flash-preview', 'gemini-3-flash-preview'),
  ('server_setup', 'rich', 'rich', 'gemini-3-flash-preview', 'gemini-3-flash-preview'),
  ('software_setup', 'rich', 'rich', 'gemini-3-flash-preview', 'gemini-3-flash-preview'),
  ('troubleshooting', 'rich', 'rich', 'gemini-3-flash-preview', 'gemini-3-flash-preview'),
  ('decision_planning', 'rich', 'rich', 'gemini-3-flash-preview', 'gemini-3-flash-preview'),
  ('process_howto', 'standard', 'standard', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite'),
  ('general_howto', 'standard', 'standard', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite'),
  ('other', 'standard', 'standard', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite')
on conflict (task_type) do nothing;

alter table public.thinking_task_type_model_routing enable row level security;

drop policy if exists "thinking_task_type_model_routing_select_authenticated" on public.thinking_task_type_model_routing;
create policy "thinking_task_type_model_routing_select_authenticated"
  on public.thinking_task_type_model_routing
  for select
  to authenticated
  using (true);

drop policy if exists "thinking_task_type_model_routing_write_superadmin" on public.thinking_task_type_model_routing;
create policy "thinking_task_type_model_routing_write_superadmin"
  on public.thinking_task_type_model_routing
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

create or replace function public.get_thinking_task_type_model_routing()
returns table (
  task_type text,
  tier_active text,
  tier_draft text,
  model_active text,
  model_draft text
)
language sql
security definer
set search_path = public
stable
as $$
  select task_type, tier_active, tier_draft, model_active, model_draft
  from public.thinking_task_type_model_routing
  order by task_type;
$$;

grant execute on function public.get_thinking_task_type_model_routing() to authenticated;

create or replace function public.admin_set_thinking_task_type_model_routing_draft(
  p_task_type text,
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
    raise exception 'Nur Superadmins duerfen das Thinking-Task-Type-Modell-Routing aendern.';
  end if;

  if p_model not in (
    'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview',
    'gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4'
  ) then
    raise exception 'Ungueltiges Modell: %', p_model;
  end if;

  update public.thinking_task_type_model_routing
  set model_draft = p_model, updated_at = now()
  where task_type = p_task_type;

  if not found then
    raise exception 'Unbekannter task_type: %', p_task_type;
  end if;
end;
$$;

grant execute on function public.admin_set_thinking_task_type_model_routing_draft(text, text) to authenticated;

create or replace function public.admin_set_thinking_task_type_tier_draft(
  p_task_type text,
  p_tier text
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
    raise exception 'Nur Superadmins duerfen das Thinking-Task-Type-Tier-Routing aendern.';
  end if;

  if p_tier not in ('standard', 'rich') then
    raise exception 'Ungueltiges Tier: %', p_tier;
  end if;

  update public.thinking_task_type_model_routing
  set tier_draft = p_tier, updated_at = now()
  where task_type = p_task_type;

  if not found then
    raise exception 'Unbekannter task_type: %', p_task_type;
  end if;
end;
$$;

grant execute on function public.admin_set_thinking_task_type_tier_draft(text, text) to authenticated;

create or replace function public.admin_deploy_thinking_task_type_model_routing_draft()
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
    raise exception 'Nur Superadmins duerfen das Thinking-Task-Type-Modell-Routing deployen.';
  end if;

  update public.thinking_task_type_model_routing
  set model_active = model_draft, tier_active = tier_draft, updated_at = now()
  where true;
end;
$$;

grant execute on function public.admin_deploy_thinking_task_type_model_routing_draft() to authenticated;
