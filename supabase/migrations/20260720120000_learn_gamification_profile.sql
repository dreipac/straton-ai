-- Lernpfad-Gamification: kontoweites Profil (XP, Level-Grundlage, Tages-Streak, Achievements)
-- Ziel:
-- - learn_gamification_profiles: 1 Zeile pro Nutzer, ueber alle Lernpfade hinweg (nicht pro Pfad,
--   analog zu Trailhead: Rang ist eine Identitaet des Lerners, kein Kurs-Artefakt)
-- - learn_gamification_events: Event-Ledger fuer atomare, idempotente XP-Vergabe (Dedupe-Key pro
--   Aktion verhindert Doppel-Gutschrift bei erneuter Auswertung/Re-Render)
-- - level wird bewusst NICHT gespeichert: reine Funktion von total_xp, client-seitig ueber
--   xpToLevel() aus total_xp abgeleitet (kein doppelter Zustand, keine Divergenz moeglich)

create table if not exists public.learn_gamification_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_xp integer not null default 0,
  current_streak_days integer not null default 0,
  longest_streak_days integer not null default 0,
  last_active_date date,
  earned_badge_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learn_gamification_profiles_total_xp_nonneg check (total_xp >= 0),
  constraint learn_gamification_profiles_streak_nonneg check (current_streak_days >= 0 and longest_streak_days >= 0)
);

alter table public.learn_gamification_profiles enable row level security;

drop policy if exists "learn_gamification_profiles_select_own" on public.learn_gamification_profiles;
create policy "learn_gamification_profiles_select_own"
  on public.learn_gamification_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.learn_gamification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dedupe_key text not null,
  event_type text not null,
  xp_amount integer not null default 0,
  source_path_id uuid,
  created_at timestamptz not null default now(),
  constraint learn_gamification_events_xp_nonneg check (xp_amount >= 0),
  constraint learn_gamification_events_user_dedupe_unique unique (user_id, dedupe_key)
);

alter table public.learn_gamification_events enable row level security;

drop policy if exists "learn_gamification_events_select_own" on public.learn_gamification_events;
create policy "learn_gamification_events_select_own"
  on public.learn_gamification_events
  for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists learn_gamification_events_user_id_idx
  on public.learn_gamification_events (user_id, created_at desc);

-- RPC: XP-Ereignis buchen (idempotent ueber dedupe_key) + Tages-Streak fortschreiben.
-- Streak-Logik (server-seitiges "heute", nicht client-seitig per setInterval):
--   last_active_date = heute       -> Streak unveraendert (heute schon gezaehlt)
--   last_active_date = gestern     -> Streak +1
--   sonst (Luecke oder erster Eintrag) -> Streak = 1
create or replace function public.learn_gamification_record_event(
  p_user_id uuid,
  p_dedupe_key text,
  p_event_type text,
  p_xp_amount integer,
  p_source_path_id uuid default null
)
returns table (
  total_xp integer,
  current_streak_days integer,
  longest_streak_days integer,
  awarded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_today date := current_date;
  v_prev_last_active date;
  v_prev_current_streak integer;
  v_prev_longest_streak integer;
  v_new_streak integer;
  v_new_longest integer;
  v_awarded boolean := false;
begin
  if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Unauthorized gamification event.';
  end if;

  if p_xp_amount < 0 then
    raise exception 'Negative XP amounts are not allowed.';
  end if;
  if coalesce(trim(p_dedupe_key), '') = '' then
    raise exception 'dedupe_key is required.';
  end if;

  insert into public.learn_gamification_events (user_id, dedupe_key, event_type, xp_amount, source_path_id)
  values (p_user_id, p_dedupe_key, p_event_type, p_xp_amount, p_source_path_id)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    v_awarded := true;

    select p.last_active_date, p.current_streak_days, p.longest_streak_days
    into v_prev_last_active, v_prev_current_streak, v_prev_longest_streak
    from public.learn_gamification_profiles p
    where p.user_id = p_user_id;

    v_prev_current_streak := coalesce(v_prev_current_streak, 0);
    v_prev_longest_streak := coalesce(v_prev_longest_streak, 0);

    if v_prev_last_active = v_today then
      v_new_streak := greatest(v_prev_current_streak, 1);
    elsif v_prev_last_active = v_today - 1 then
      v_new_streak := v_prev_current_streak + 1;
    else
      v_new_streak := 1;
    end if;
    v_new_longest := greatest(v_prev_longest_streak, v_new_streak);

    insert into public.learn_gamification_profiles (
      user_id, total_xp, current_streak_days, longest_streak_days, last_active_date, updated_at
    )
    values (p_user_id, p_xp_amount, v_new_streak, v_new_longest, v_today, now())
    on conflict (user_id) do update
    set
      total_xp = public.learn_gamification_profiles.total_xp + p_xp_amount,
      current_streak_days = v_new_streak,
      longest_streak_days = v_new_longest,
      last_active_date = v_today,
      updated_at = now();
  end if;

  return query
  select p.total_xp, p.current_streak_days, p.longest_streak_days, v_awarded
  from public.learn_gamification_profiles p
  where p.user_id = p_user_id;
end;
$$;

grant execute on function public.learn_gamification_record_event(uuid, text, text, integer, uuid) to authenticated;

-- RPC: Achievement/Badge vergeben (idempotent, keine Doppel-Freischaltung).
create or replace function public.learn_gamification_award_badge(
  p_user_id uuid,
  p_badge_id text
)
returns table (
  earned_badge_ids text[],
  newly_awarded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text[];
  v_newly_awarded boolean := false;
begin
  if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Unauthorized badge award.';
  end if;

  if coalesce(trim(p_badge_id), '') = '' then
    raise exception 'badge_id is required.';
  end if;

  insert into public.learn_gamification_profiles (user_id, earned_badge_ids, updated_at)
  values (p_user_id, array[p_badge_id], now())
  on conflict (user_id) do nothing;

  select p.earned_badge_ids into v_current
  from public.learn_gamification_profiles p
  where p.user_id = p_user_id;

  if v_current is null or not (p_badge_id = any(v_current)) then
    v_newly_awarded := true;
    update public.learn_gamification_profiles
    set earned_badge_ids = array(select distinct unnest(coalesce(earned_badge_ids, '{}') || array[p_badge_id])),
        updated_at = now()
    where user_id = p_user_id;
  end if;

  return query
  select p.earned_badge_ids, v_newly_awarded
  from public.learn_gamification_profiles p
  where p.user_id = p_user_id;
end;
$$;

grant execute on function public.learn_gamification_award_badge(uuid, text) to authenticated;
